const { Worker } = require('bullmq');
const axios = require('axios');
const supabase = require('../config/supabase');
const { connection } = require('../config/redis');
const openRouterClient = require('../config/openrouter');
require('dotenv').config();

// Define fallback keyword matching helper
function evaluateKeywordFallback(text, keyword) {
  if (!text || !keyword) return false;
  return text.toLowerCase().includes(keyword.toLowerCase());
}

// Clean markdown brackets off JSON responses from OpenRouter LLM
function cleanLlmJsonResponse(rawString) {
  if (!rawString) return null;
  // Regex to match markdown code blocks (e.g. ```json { ... } ``` or ``` { ... } ```)
  const jsonRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
  const match = rawString.match(jsonRegex);
  const jsonString = match ? match[1] : rawString;
  
  try {
    return JSON.parse(jsonString.trim());
  } catch (err) {
    console.error('Failed to parse LLM JSON:', err.message, 'Raw response:', rawString);
    return null;
  }
}

// OpenRouter AI Triage API Call
async function performAiTriage(title, body) {
  const promptText = `
Analyze the following GitHub issue/pull request and classify it.
Title: "${title || 'No Title'}"
Description: "${body || 'No Description'}"

You must respond with ONLY a raw JSON block containing exactly these three fields:
{
  "category": "bug" | "feature" | "documentation" | "refactoring" | "support",
  "summary": "Short 1-2 sentence description",
  "priority": "low" | "medium" | "high"
}
Do not include any chat prefix, markdown decorators (like \`\`\`json), or trailing notes. Output raw JSON structure.
`;

  try {
    // Call OpenRouter with a free model fallback chain
    // Default model is meta-llama/llama-3-8b-instruct:free
    const response = await openRouterClient.post('/chat/completions', {
      model: 'meta-llama/llama-3-8b-instruct:free',
      messages: [{ role: 'user', content: promptText }],
      temperature: 0.1
    });

    const content = response.data?.choices?.[0]?.message?.content;
    const parsed = cleanLlmJsonResponse(content);
    if (!parsed) throw new Error('Returned response was not valid JSON format');
    return parsed;
  } catch (err) {
    // Gracefully handle rate limit (429) or other OpenRouter connection issues
    if (err.response?.status === 429 || err.response?.status === 402) {
      console.warn('OpenRouter API limit reached (429/402). Falling back to keyword heuristics.');
    } else {
      console.error('OpenRouter integration error:', err.message);
    }
    return null; // Return null so caller falls back to keyword matching
  }
}

// Helper to write error logs to database
async function writeExecutionAudit(eventId, actionDescription, isSuccessful, errorDetails = null) {
  try {
    await supabase.from('execution_logs').insert({
      associated_event_id: eventId,
      action_description: actionDescription,
      is_successful: isSuccessful,
      captured_error_details: errorDetails ? String(errorDetails) : null
    });
  } catch (dbErr) {
    console.error('Failed to write execution log to database:', dbErr.message);
  }
}

// Instantiate standalone background worker loop
const worker = new Worker(
  'webhook-events-queue',
  async (job) => {
    const { deliveryId, eventType, targetRepository, payload } = job.data;
    console.log(`[Worker] Processing Job ${job.id} | Delivery: ${deliveryId} | Event: ${eventType}`);

    // --- EDGE CASE: Prevent infinite loop if triggered by a Bot ---
    const senderType = payload.sender?.type;
    const isBot = senderType === 'Bot' || payload.sender?.login?.includes('[bot]');
    if (isBot) {
      console.log(`[Worker] Terminating job. Event triggered by Bot account: ${payload.sender?.login}`);
      return { skipped: true, reason: 'Sender is bot' };
    }

    // --- IDEMPOTENCY GUARD ---
    // Try to record webhook event into Postgres Supabase ledger
    let eventRecord;
    try {
      const { data, error } = await supabase
        .from('webhook_events')
        .insert({
          delivery_id: deliveryId,
          event_type: eventType,
          target_repository: targetRepository,
          raw_payload: payload,
          processing_status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;
      eventRecord = data;
    } catch (err) {
      // Postgres unique constraint violation is standard code "23505"
      const isDuplicate = err.code === '23505' || err.message?.includes('duplicate key value');
      if (isDuplicate) {
        console.warn(`[Worker] Event delivery_id ${deliveryId} already exists in database. Terminating job safely.`);
        return { skipped: true, reason: 'Duplicate event (Idempotent)' };
      }
      console.error('[Worker] Ledger insertion failed:', err.message);
      throw err; // Retry later
    }

    const eventId = eventRecord.id;

    try {
      // Extract issue or pull request titles and details
      const isIssue = eventType === 'issues';
      const isPR = eventType === 'pull_request';
      
      let title = '';
      let body = '';
      let targetNumber = null;
      let htmlUrl = '';

      if (isIssue) {
        title = payload.issue?.title || '';
        body = payload.issue?.body || '';
        targetNumber = payload.issue?.number;
        htmlUrl = payload.issue?.html_url || '';
      } else if (isPR) {
        title = payload.pull_request?.title || '';
        body = payload.pull_request?.body || '';
        targetNumber = payload.pull_request?.number;
        htmlUrl = payload.pull_request?.html_url || '';
      }

      if (!targetNumber) {
        console.log(`[Worker] Unhandled event action type or missing target details.`);
        await supabase.from('webhook_events').update({ processing_status: 'processed' }).eq('id', eventId);
        return { success: true, message: 'Unprocessed scope action' };
      }

      // --- OPENROUTER AI INFERENCE ---
      console.log(`[Worker] Triggering OpenRouter AI assessment...`);
      const aiResult = await performAiTriage(title, body);
      
      let category = 'unknown';
      let summary = 'AI Triage unavailable (Fallback mode active)';
      let priority = 'medium';
      let isAiFallback = true;

      if (aiResult) {
        category = aiResult.category || 'unknown';
        summary = aiResult.summary || 'Summary unavailable';
        priority = aiResult.priority || 'medium';
        isAiFallback = false;
        console.log(`[Worker] AI Classification: [Category: ${category}] [Priority: ${priority}]`);
      }

      // Update event with AI results
      await supabase
        .from('webhook_events')
        .update({
          ai_generated_summary: summary,
          calculated_priority: priority,
          processing_status: 'processed'
        })
        .eq('id', eventId);

      // --- CUSTOM AUTOMATION RULES EVALUATION & DISPATCH ---
      // Fetch connection details and access token
      const { data: connectionData, error: connErr } = await supabase
        .from('connected_repositories')
        .select('*')
        .eq('repository_full_name', targetRepository)
        .single();

      if (connErr || !connectionData) {
        console.warn(`[Worker] No active database connections found for repository: ${targetRepository}`);
        return { success: false, reason: 'Disconnected repository' };
      }

      // Fetch enabled rules matching current event scope
      const { data: rules, error: rulesErr } = await supabase
        .from('custom_automation_rules')
        .select('*')
        .eq('repository_id', connectionData.id)
        .eq('github_event_scope', eventType)
        .eq('is_enabled', true);

      if (rulesErr) {
        console.error('[Worker] Error fetching rules:', rulesErr.message);
        return { success: false, reason: 'Database rules fetch failed' };
      }

      const textToScan = `${title} ${body}`.toLowerCase();

      // Iterate through matches and perform dispatches
      for (const rule of rules) {
        // Evaluate keyword match (using AI summary/category if available or standard string search)
        const isMatched = 
          evaluateKeywordFallback(textToScan, rule.matching_keyword) ||
          (!isAiFallback && evaluateKeywordFallback(category, rule.matching_keyword)) ||
          (!isAiFallback && evaluateKeywordFallback(summary, rule.matching_keyword));

        if (!isMatched) continue;

        console.log(`[Worker] Found match for rule ID: ${rule.id} (Keyword: "${rule.matching_keyword}")`);

        const githubToken = connectionData.github_access_token;
        const [owner, repoName] = targetRepository.split('/');

        // 1. Assign GitHub Label Action
        if (rule.assigned_label) {
          try {
            await axios.post(
              `https://api.github.com/repos/${owner}/${repoName}/issues/${targetNumber}/labels`,
              { labels: [rule.assigned_label] },
              {
                headers: {
                  Authorization: `Bearer ${githubToken}`,
                  'User-Agent': 'github-automation-bot-worker',
                  Accept: 'application/vnd.github.v3+json'
                }
              }
            );
            await writeExecutionAudit(
              eventId,
              `Successfully added label "${rule.assigned_label}" to GitHub Issue #${targetNumber}`,
              true
            );
          } catch (ghErr) {
            const errDetail = ghErr.response?.data?.message || ghErr.message;
            console.error(`[Worker] GitHub label assign failed for #${targetNumber}:`, errDetail);
            await writeExecutionAudit(
              eventId,
              `Failed to assign label "${rule.assigned_label}" to GitHub Issue #${targetNumber}`,
              false,
              errDetail
            );
          }
        }

        // 2. Post Comment Action
        if (rule.comment_template) {
          try {
            // Replace simple variable markers if they exist
            let formattedComment = rule.comment_template
              .replace(/{keyword}/g, rule.matching_keyword)
              .replace(/{category}/g, category)
              .replace(/{priority}/g, priority)
              .replace(/{summary}/g, summary);

            await axios.post(
              `https://api.github.com/repos/${owner}/${repoName}/issues/${targetNumber}/comments`,
              { body: formattedComment },
              {
                headers: {
                  Authorization: `Bearer ${githubToken}`,
                  'User-Agent': 'github-automation-bot-worker',
                  Accept: 'application/vnd.github.v3+json'
                }
              }
            );
            await writeExecutionAudit(
              eventId,
              `Successfully posted automation comment on GitHub Issue #${targetNumber}`,
              true
            );
          } catch (ghErr) {
            const errDetail = ghErr.response?.data?.message || ghErr.message;
            console.error(`[Worker] GitHub comment post failed for #${targetNumber}:`, errDetail);
            await writeExecutionAudit(
              eventId,
              `Failed to post automation comment on GitHub Issue #${targetNumber}`,
              false,
              errDetail
            );
          }
        }
      }

      // 3. Dispatch to Slack Webhook (if configured)
      if (connectionData.slack_webhook_endpoint) {
        try {
          // Construct an elegant Slack Card block payload
          const slackPayload = {
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*🤖 Antigravity Bot Telemetry: ${eventType === 'issues' ? 'New Issue Opened' : 'New Pull Request Submitted'}*`
                }
              },
              {
                type: 'section',
                fields: [
                  {
                    type: 'mrkdwn',
                    text: `*Repository:*\n${targetRepository}`
                  },
                  {
                    type: 'mrkdwn',
                    text: `*Title:*\n<${htmlUrl}|#${targetNumber} - ${title}>`
                  },
                  {
                    type: 'mrkdwn',
                    text: `*AI Classification:*\n\`${category.toUpperCase()}\``
                  },
                  {
                    type: 'mrkdwn',
                    text: `*Estimated Priority:*\n\`${priority.toUpperCase()}\``
                  }
                ]
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*AI Text Summary:*\n_${summary}_`
                }
              },
              {
                type: 'divider'
              }
            ]
          };

          await axios.post(connectionData.slack_webhook_endpoint, slackPayload);
          await writeExecutionAudit(
            eventId,
            `Successfully dispatched alert payload to Slack Incoming Webhook`,
            true
          );
        } catch (slackErr) {
          const errDetail = slackErr.response?.data || slackErr.message;
          console.error(`[Worker] Slack alert dispatch failed:`, errDetail);
          await writeExecutionAudit(
            eventId,
            `Failed to dispatch alert payload to Slack Incoming Webhook`,
            false,
            errDetail
          );
        }
      }

      return { success: true };
    } catch (err) {
      console.error('[Worker] Unexpected job exception:', err.message);
      // Mark as failed in Supabase
      await supabase
        .from('webhook_events')
        .update({ processing_status: 'failed' })
        .eq('id', eventId);
      
      throw err; // Rethrow to let BullMQ handle retries
    }
  },
  { connection }
);

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully.`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});

module.exports = worker;
