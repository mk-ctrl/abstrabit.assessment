# AI Collaboration Notes

## Tools Used

**IDE / Agent:** Antigravity IDE (powered by Google DeepMind)
**Models used during development:**
- Gemini 2.5 Pro (primary — architecture, schema design, backend logic)
- Gemini 2.5 Flash (secondary — fast iteration on frontend components)
- Claude Sonnet 4.5 (diagnostic reasoning — root cause analysis for webhook failures)

No external AI context files (CLAUDE.md, AGENTS.md, .cursorrules, system prompts) were used or committed to this repository. All AI collaboration occurred live inside the Antigravity IDE's conversation context.

---

## Human vs AI Work Split

| Task | Owner |
|---|---|
| System requirements & scope definition | Human |
| Initial project structure & folder layout | AI |
| Supabase schema design (tables, constraints, RLS) | AI + Human review |
| GitHub OAuth flow (auth.js) | AI |
| Webhook signature verification (HMAC-SHA256) | AI |
| BullMQ + Redis queue setup | AI |
| Background worker (AI triage, label assign, Slack dispatch) | AI |
| Custom rules REST API | AI |
| React dashboard (Dashboard, RuleForm, LogsTable components) | AI |
| Deployment configuration (Render, Vercel) | Human + AI assist |
| Root cause analysis of 401 webhook failures | AI (Claude Sonnet) |
| Final documentation (README, .env.example) | AI |

---

## Key Engineering Decisions

### 1. Decoupled Queue Architecture (BullMQ + Redis)
The webhook endpoint (`POST /api/webhooks/github`) does only three things: verify the HMAC signature, push a job to BullMQ, and return `202 Accepted`. This entire path completes in under 50ms — well within GitHub's 10-second timeout. All heavy work (OpenRouter AI calls, GitHub API writes, Slack HTTP calls) happens asynchronously in the background worker. This design makes the system resilient to slow downstream services.

### 2. Postgres Idempotency Guard
GitHub retries webhooks on failures. Without protection, a single GitHub event could trigger duplicate label assignments or Slack messages. We enforce a `UNIQUE` constraint on the `delivery_id` column in `webhook_events`. Any duplicate delivery silently exits with `skipped: Duplicate event`, guaranteeing exactly-once processing.

### 3. AI Category Matching Instead of Pure Keyword Matching
Early prototype used only keyword-based rule matching (e.g. "contains bug"). The problem: titles like "app crashes on load" don't contain the word "bug" but should match a `bug` rule. We added OpenRouter AI classification as the primary matching signal, with keywords as a secondary filter. This dramatically improves recall on rules without sacrificing precision.

### 4. JWT Carries the GitHub Access Token (Stateless Backend)
Rather than storing GitHub access tokens in the database (which requires a secure lookup on every request), the access token is embedded inside the signed JWT that the frontend stores in `localStorage`. The backend verifies the JWT signature and reads the token from the payload. This keeps the backend fully stateless. Trade-off: token rotation requires re-login after 7 days.

---

## Hardest Bug Found and Fixed

**The Bug:** All webhook deliveries returning `401 Signature verification failed` after a debugging session, despite the `GITHUB_WEBHOOK_SECRET` being correctly set on Render.

**Root Cause:** During a diagnostic script run locally, an `axios.patch` call was made to update the GitHub webhook URL. That script was written as:
```js
secret: process.env.GITHUB_WEBHOOK_SECRET || '********'
```
Because `dotenv` hadn't loaded at that point in the script, `process.env.GITHUB_WEBHOOK_SECRET` was `undefined`, so the literal string `"********"` was stored as the GitHub webhook secret. From that point on, GitHub computed HMAC signatures with `"********"` while Render verified them with the real secret — every delivery returned 401.

**Detection:** Compared the GitHub webhook's `last_response` (`401`) against a manual test that signed a request with the local secret (returned `200 pong`). This proved Render's env var was correct and the mismatch was on the GitHub side.

**Fix:** Re-patched the webhook via the GitHub API using a script that explicitly called `require('dotenv').config()` before reading env vars. Confirmed with a GitHub ping delivery returning `200 OK`.

**Lesson:** Never use `|| 'fallback'` for secrets in scripts. Fail loudly instead: `if (!secret) throw new Error('GITHUB_WEBHOOK_SECRET not set')`.

---

## Future Improvements

- **GitHub App model** instead of user OAuth — installation access tokens are short-lived and scoped per repo, eliminating long-lived token storage risk
- **BullMQ retry with exponential backoff** — currently a failed job is retried immediately; better to back off on Slack rate limits or OpenRouter outages
- **Multi-model fallback chain** — if OpenRouter returns a non-JSON response or times out, fall back to secondary model or pure keyword matching rather than silently degrading
- **Row Level Security on Supabase** — currently the service_role key bypasses RLS; proper production setup should use RLS policies so users can only query their own rows
- **Webhook re-registration on token rotation** — if a user's GitHub token expires and they re-authenticate, the webhook access token stored in `connected_repositories` should be updated automatically
