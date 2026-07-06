const express = require('express');
const axios = require('axios');
const supabase = require('../config/supabase');
const { authenticateUser } = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();

const BACKEND_PUBLIC_URL = process.env.BACKEND_PUBLIC_URL;
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

// 1. Fetch all connected repositories for the authenticated user
router.get('/connections', authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('connected_repositories')
      .select('*')
      .eq('github_user_id', req.user.github_user_id);

    if (error) throw error;
    res.json({ connections: data });
  } catch (err) {
    console.error('Error fetching connections:', err.message);
    res.status(500).json({ error: 'Failed to retrieve connected repositories from database' });
  }
});

// 2. Connect a Repository (Create webhook on GitHub and save record to Supabase)
router.post('/connect', authenticateUser, async (req, res) => {
  const { repository_full_name } = req.body;
  const accessToken = req.user.github_access_token;
  const githubUserId = req.user.github_user_id;

  if (!repository_full_name) {
    return res.status(400).json({ error: 'repository_full_name is required' });
  }

  if (!BACKEND_PUBLIC_URL || !GITHUB_WEBHOOK_SECRET) {
    return res.status(500).json({ error: 'Server webhook configuration (BACKEND_PUBLIC_URL or GITHUB_WEBHOOK_SECRET) is missing' });
  }

  try {
    // 1. Register Webhook on GitHub Repository
    const [owner, repo] = repository_full_name.split('/');
    if (!owner || !repo) {
      return res.status(400).json({ error: 'Invalid repository name format. Use owner/repo.' });
    }

    try {
      await axios.post(
        `https://api.github.com/repos/${owner}/${repo}/hooks`,
        {
          name: 'web',
          active: true,
          events: ['issues', 'pull_request'],
          config: {
            url: `${BACKEND_PUBLIC_URL}/api/webhooks/github`,
            content_type: 'json',
            secret: GITHUB_WEBHOOK_SECRET,
            insecure_ssl: '0',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'github-automation-bot-backend',
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );
      console.log(`Successfully created webhook for repository: ${repository_full_name}`);
    } catch (ghErr) {
      // If hook already exists, GitHub API returns 422 with a specific error message.
      // We should check if the error is "Hook already exists on this repository" and handle it gracefully.
      const isAlreadyExists = ghErr.response?.data?.errors?.some(
        (e) => e.message && e.message.includes('already exists')
      );

      if (isAlreadyExists) {
        console.log(`Webhook already exists for: ${repository_full_name}, proceeding with db registration.`);
      } else {
        console.error('Failed to create webhook on GitHub:', ghErr.response?.data || ghErr.message);
        return res.status(ghErr.response?.status || 500).json({
          error: 'Failed to create webhook on GitHub repository',
          details: ghErr.response?.data?.message || ghErr.message,
        });
      }
    }

    // 2. Persist Connection into Supabase (upsert based on unique repository name)
    const { data, error } = await supabase
      .from('connected_repositories')
      .upsert({
        github_user_id: githubUserId,
        repository_full_name,
        github_access_token: accessToken,
      }, { onConflict: 'repository_full_name' })
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Repository connected successfully', connection: data });
  } catch (err) {
    console.error('Database connection error:', err.message);
    res.status(500).json({ error: 'Failed to save repository connection details' });
  }
});

// 3. Update Slack Webhook for a Connected Repository
router.put('/connect/slack', authenticateUser, async (req, res) => {
  const { repository_id, slack_webhook_endpoint } = req.body;

  if (!repository_id || !slack_webhook_endpoint) {
    return res.status(400).json({ error: 'repository_id and slack_webhook_endpoint are required' });
  }

  try {
    const { data, error } = await supabase
      .from('connected_repositories')
      .update({ slack_webhook_endpoint })
      .eq('id', repository_id)
      .eq('github_user_id', req.user.github_user_id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Connected repository not found or unauthorized' });
    }

    res.json({ message: 'Slack webhook configured successfully', connection: data });
  } catch (err) {
    console.error('Slack integration error:', err.message);
    res.status(500).json({ error: 'Failed to update Slack webhook endpoint' });
  }
});

// 4. Disconnect a Repository (Cascades and deletes webhooks if possible - we do best-effort webhook deletion on GitHub)
router.delete('/connections/:id', authenticateUser, async (req, res) => {
  const connectionId = req.params.id;

  try {
    // Fetch connection detail first
    const { data: connection, error: getError } = await supabase
      .from('connected_repositories')
      .select('*')
      .eq('id', connectionId)
      .eq('github_user_id', req.user.github_user_id)
      .single();

    if (getError || !connection) {
      return res.status(404).json({ error: 'Connection not found or unauthorized' });
    }

    // Best-effort webhook cleanup on GitHub
    const [owner, repo] = connection.repository_full_name.split('/');
    if (owner && repo && connection.github_access_token) {
      try {
        // Fetch all hooks to find the one we registered
        const listResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
          headers: {
            Authorization: `Bearer ${connection.github_access_token}`,
            'User-Agent': 'github-automation-bot-backend',
            Accept: 'application/vnd.github.v3+json',
          },
        });

        const targetHook = listResponse.data.find(
          (hook) => hook.config && hook.config.url === `${BACKEND_PUBLIC_URL}/api/webhooks/github`
        );

        if (targetHook) {
          await axios.delete(`https://api.github.com/repos/${owner}/${repo}/hooks/${targetHook.id}`, {
            headers: {
              Authorization: `Bearer ${connection.github_access_token}`,
              'User-Agent': 'github-automation-bot-backend',
              Accept: 'application/vnd.github.v3+json',
            },
          });
          console.log(`Successfully deleted webhook from GitHub: ${connection.repository_full_name}`);
        }
      } catch (ghErr) {
        console.warn('Webhook cleanup failed on GitHub:', ghErr.message);
        // Continue and delete from local DB even if GitHub deletes fail (e.g. token expired, permissions revoked)
      }
    }

    // Delete connection from local DB (Cascade handles rules)
    const { error: deleteError } = await supabase
      .from('connected_repositories')
      .delete()
      .eq('id', connectionId);

    if (deleteError) throw deleteError;

    res.json({ message: 'Repository disconnected and webhook removed successfully' });
  } catch (err) {
    console.error('Error disconnecting repository:', err.message);
    res.status(500).json({ error: 'Failed to disconnect repository' });
  }
});

// 5. Fetch Rules for Connected Repositories
router.get('/', authenticateUser, async (req, res) => {
  try {
    // Sub-query or join connected_repositories to fetch rules for the authenticated user
    const { data: userConnections, error: connError } = await supabase
      .from('connected_repositories')
      .select('id')
      .eq('github_user_id', req.user.github_user_id);

    if (connError) throw connError;

    const connectionIds = userConnections.map((c) => c.id);
    if (connectionIds.length === 0) {
      return res.json({ rules: [] });
    }

    const { data: rules, error: rulesError } = await supabase
      .from('custom_automation_rules')
      .select('*, connected_repositories(repository_full_name)')
      .in('repository_id', connectionIds);

    if (rulesError) throw rulesError;

    res.json({ rules });
  } catch (err) {
    console.error('Error fetching rules:', err.message);
    res.status(500).json({ error: 'Failed to retrieve custom rules' });
  }
});

// 6. Create a Custom Rule
router.post('/', authenticateUser, async (req, res) => {
  const { repository_id, github_event_scope, matching_keyword, assigned_label, comment_template } = req.body;

  if (!repository_id || !github_event_scope || !matching_keyword) {
    return res.status(400).json({ error: 'repository_id, github_event_scope, and matching_keyword are required' });
  }

  if (!['issues', 'pull_request'].includes(github_event_scope)) {
    return res.status(400).json({ error: 'github_event_scope must be either "issues" or "pull_request"' });
  }

  try {
    // Verify repository is owned by user
    const { data: connection, error: connError } = await supabase
      .from('connected_repositories')
      .select('id')
      .eq('id', repository_id)
      .eq('github_user_id', req.user.github_user_id)
      .single();

    if (connError || !connection) {
      return res.status(404).json({ error: 'Repository not found or unauthorized' });
    }

    const { data: rule, error: ruleError } = await supabase
      .from('custom_automation_rules')
      .insert({
        repository_id,
        github_event_scope,
        matching_keyword,
        assigned_label: assigned_label || null,
        comment_template: comment_template || null,
        is_enabled: true,
      })
      .select()
      .single();

    if (ruleError) throw ruleError;

    res.json({ message: 'Automation rule created successfully', rule });
  } catch (err) {
    console.error('Error creating rule:', err.message);
    res.status(500).json({ error: 'Failed to create automation rule' });
  }
});

// 7. Toggle (Enable/Disable) a Custom Rule
router.put('/:id', authenticateUser, async (req, res) => {
  const ruleId = req.params.id;
  const { is_enabled, matching_keyword, assigned_label, comment_template } = req.body;

  try {
    // Verify the rule belongs to a connected repository owned by the user
    const { data: rule, error: ruleFetchError } = await supabase
      .from('custom_automation_rules')
      .select('*, connected_repositories(github_user_id)')
      .eq('id', ruleId)
      .single();

    if (ruleFetchError || !rule || rule.connected_repositories.github_user_id !== req.user.github_user_id) {
      return res.status(404).json({ error: 'Rule not found or unauthorized' });
    }

    const updatePayload = {};
    if (is_enabled !== undefined) updatePayload.is_enabled = is_enabled;
    if (matching_keyword !== undefined) updatePayload.matching_keyword = matching_keyword;
    if (assigned_label !== undefined) updatePayload.assigned_label = assigned_label;
    if (comment_template !== undefined) updatePayload.comment_template = comment_template;

    const { data: updatedRule, error: updateError } = await supabase
      .from('custom_automation_rules')
      .update(updatePayload)
      .eq('id', ruleId)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({ message: 'Rule updated successfully', rule: updatedRule });
  } catch (err) {
    console.error('Error updating rule:', err.message);
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

// 8. Delete a Custom Rule
router.delete('/:id', authenticateUser, async (req, res) => {
  const ruleId = req.params.id;

  try {
    const { data: rule, error: ruleFetchError } = await supabase
      .from('custom_automation_rules')
      .select('*, connected_repositories(github_user_id)')
      .eq('id', ruleId)
      .single();

    if (ruleFetchError || !rule || rule.connected_repositories.github_user_id !== req.user.github_user_id) {
      return res.status(404).json({ error: 'Rule not found or unauthorized' });
    }

    const { error: deleteError } = await supabase
      .from('custom_automation_rules')
      .delete()
      .eq('id', ruleId);

    if (deleteError) throw deleteError;

    res.json({ message: 'Rule deleted successfully' });
  } catch (err) {
    console.error('Error deleting rule:', err.message);
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

// 9. Fetch execution logs for user's connected repositories
router.get('/logs', authenticateUser, async (req, res) => {
  try {
    const { data: connections, error: connError } = await supabase
      .from('connected_repositories')
      .select('repository_full_name')
      .eq('github_user_id', req.user.github_user_id);

    if (connError) throw connError;

    const repoNames = connections.map(c => c.repository_full_name);
    if (repoNames.length === 0) {
      return res.json({ logs: [] });
    }

    const { data: logs, error: logsError } = await supabase
      .from('execution_logs')
      .select('*, webhook_events!inner(*)')
      .in('webhook_events.target_repository', repoNames)
      .order('logged_at', { ascending: false })
      .limit(100);

    if (logsError) throw logsError;

    res.json({ logs });
  } catch (err) {
    console.error('Error fetching logs:', err.message);
    res.status(500).json({ error: 'Failed to retrieve execution audit logs' });
  }
});

module.exports = router;
