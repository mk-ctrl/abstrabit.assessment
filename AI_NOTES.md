# AI Collaboration & Engineering Notes

## Tools Used

**IDE / Agent:** Antigravity IDE (Google DeepMind)
**Models:**
- Gemini 2.5 Pro — primary, used for architecture, schema design, and backend implementation
- Gemini 2.5 Flash — fast iteration on frontend components
- Claude Sonnet 4 — diagnostic reasoning during the webhook failure debugging

No external context files (CLAUDE.md, AGENTS.md, .cursorrules, system prompts) were used. All collaboration happened conversationally inline. The AI had sandboxed access to read/write files and run terminal commands on my machine.

---

## Human vs AI Work Split

| Task | Owner |
|---|---|
| System requirements & architecture scope | Human |
| Project scaffolding & folder layout | AI |
| Supabase schema design (tables, constraints) | AI + Human review |
| `github_event_scopes TEXT[]` redesign (caught wrong column type) | Human decision |
| GitHub OAuth flow | AI |
| HMAC-SHA256 webhook signature verification | AI |
| BullMQ + Redis decoupled queue architecture | Human decision → AI implemented |
| Background worker (AI triage, label assign, Slack dispatch) | AI |
| JWT-as-stateless-session design | Human decision → AI implemented |
| Custom rules REST API | AI |
| React dashboard (Dashboard, RuleForm, LogsTable) | AI |
| Deployment wiring (Render, Vercel, Redis Cloud, Supabase) | Human + AI assist |
| Catching & diagnosing 401 webhook failures | Human prompted → AI diagnosed |
| Documentation (README, .env.example, AI_NOTES) | AI |

---

## 3 Key Decisions I Made

### 1. Decoupled BullMQ queue between webhook receipt and processing
The AI's first draft processed everything synchronously in the webhook handler — AI call, GitHub API write, Slack dispatch — before responding. I rejected this. GitHub's delivery timeout is 10 seconds; OpenRouter alone can take 3–5s on free tier. A slow Slack endpoint would cause GitHub to mark the delivery failed and retry, creating a loop.

I specified the decoupled model: the handler does only three things (verify HMAC, enqueue job, return `202 Accepted`). Idempotency came almost for free from this — writing `delivery_id` to Postgres with a UNIQUE constraint before doing any work means retries are a safe no-op.

### 2. Supabase over raw Postgres on Render
Supabase gave me a free-hosted database, a JS client with built-in connection pooling, and — critically — a web SQL editor I could use mid-session to inspect schema and run `ALTER TABLE` without needing psql or a Render shell. When the column type bug hit (see below), this was the difference between a 2-minute fix and a 20-minute detour.

### 3. Access token embedded in JWT (stateless backend)
The AI suggested a `users` table with a DB lookup on every authenticated request. I chose to embed the GitHub access token inside the signed JWT instead. No DB read on auth, which matters on a free Render instance with cold-start latency. Trade-off: a revoked token stays valid until the 7-day expiry. Acceptable for assessment scope; a GitHub App model would be the production fix.

---

## The Hardest Bug — What the AI Got Wrong

**Symptom:** Push events weren't triggering Slack notifications or appearing in the dashboard. Issues worked fine.

**What the AI got wrong, in sequence:**

First diagnosis: the worker wasn't handling push events. It modified the worker to skip AI triage for pushes (correct change — you can't run an issue classifier on a commit message), then declared "should work now, wait for redeploy." Nothing changed.

Second diagnosis: "Render logs only show HTTP access logs because the webhook isn't reaching the worker." It added `console.log` statements and committed them. Pure noise — it was looking at the application layer when the webhook wasn't even passing authentication.

I forced the right question: **check GitHub's actual delivery history.** That surfaced `401` and `502` status codes on every push delivery — the webhook wasn't failing inside the worker, it was being rejected by Express middleware before the queue was ever touched.

**Root cause:** Earlier in the session, the AI ran a repair script containing:
```js
secret: process.env.GITHUB_WEBHOOK_SECRET || '********'
```
Because `dotenv` hadn't been loaded in that script, the env var was `undefined`, so the literal string `"********"` was written to GitHub as the registered webhook secret. Every subsequent GitHub delivery was HMAC-signed with `"********"`, but Render verified against the real secret — guaranteed 401 on every request.

**How I caught it:** The AI kept referencing dotenv loading as part of its explanation. I pushed back: *"wait — loading dotenv on Render? the env vars are set in the Render dashboard, not in dotenv."* That correction forced it to stop looking at application code and inspect the actual webhook configuration on GitHub's side.

**The fix:** One `axios.patch` call to the GitHub API with the correct secret (loaded properly this time). GitHub ping returned `200 OK`. Done.

**What this revealed about working with AI:** The AI will not tell you when it caused the problem. It keeps looking at code when the issue is infrastructure, and at infrastructure when the issue is code. You have to stay close enough to the system to know which layer to look at — and be specific. *"Why is push not working"* generated three wrong answers. *"Check GitHub's delivery history and tell me the status codes"* got the real answer in one query.

---

## What I'd Improve With More Time

**Quick wins:**
- Add a `GITHUB_WEBHOOK_SECRET` existence check at server startup — fail loudly instead of silently accepting a misconfigured state
- Supabase Row Level Security — currently the `service_role` key bypasses RLS entirely; users are separated only by JWT auth in Express
- Log a record to `execution_logs` when the worker skips a push event — right now it exits silently with no audit trail

**Medium effort:**
- **GitHub App model** instead of user OAuth — installation tokens are short-lived, scoped per repo, and auto-refresh. Current approach fails silently if a user revokes their token
- **BullMQ exponential backoff** on retries — a failed Slack call is retried immediately right now, which under rate limits makes things worse not better

**Longer term:**
- **Multi-model fallback chain** for AI triage — OpenRouter free tier returns inconsistent JSON (sometimes in markdown code fences). Current fix is a regex cleaner (`cleanLlmJsonResponse`). Real fix is structured output constraints or a fallback model
- **Supabase CDC real-time subscriptions** instead of polling the dashboard every 15 seconds — reduces unnecessary API calls and makes events appear instantly

---

## Prompt Excerpt — The Turning Point

The debugging turned around on two specific exchanges:

> **Me:** identify the cause — I already pushed a pdf into the repo but no response

The AI ran scripts, described worker code, still generic. Then:

> **Me:** wait loading dotenv on Render?? the env should be given in the render page right not in dotenv code

That single correction changed the entire diagnostic direction. The AI stopped looking at application code and checked the GitHub webhook configuration. Two queries later it had the 401s, the root cause, and the fix.

The lesson: the AI optimises for answering your question. You have to make sure you're asking the right one.
