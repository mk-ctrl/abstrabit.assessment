# AI Notes — Honest Reflection

## Tools and Models

I used **Antigravity IDE** (a Google DeepMind agentic coding assistant) throughout the project. The models shifted during development — primarily Gemini variants early on, then Claude Sonnet 4 for the later debugging sessions when I needed stronger diagnostic reasoning on the webhook failure.

I did not use any external context files (.cursorrules, CLAUDE.md, AGENTS.md, system prompts, or pre-seeded instructions). All prompting happened conversationally inline. The AI had full access to read and write files and run terminal commands in a sandboxed environment on my machine.

### How I actually split the work

The AI handled the majority of implementation — scaffolding, boilerplate, translating requirements into working code. Where I actively drove:

- **Deciding what to build and in what order.** I set the scope (queue-based webhook ingestion, AI triage, rules engine, Slack dispatch, audit log) and kept the AI from over-engineering early.
- **Catching when something was wrong.** The AI would often declare something "working" when it wasn't. I had to push back repeatedly — "the logs are useless," "push events are not being notified," "why are you talking about dotenv loading on Render, the env vars are set in the dashboard." The AI course-corrects when you're specific; it doesn't self-catch.
- **Reviewing every Supabase schema change before applying it.** The AI initially designed `github_event_scope` as a plain `TEXT` column. I flagged that rules need to match multiple event types per rule, which forced a redesign to `TEXT[]` with a `CHECK` constraint. That decision changed how the rules engine queried data downstream.
- **Deployment wiring.** Connecting Render, Vercel, Redis Cloud, Supabase, and GitHub webhooks into a working system required me to go back and forth between dashboards. The AI could draft the config but couldn't see what was actually set on Render.

---

## 2–3 Key Decisions I Made

### 1. BullMQ queue between webhook receipt and processing

The AI's first draft processed everything synchronously inside the webhook handler — AI call, GitHub API write, Slack dispatch, all in sequence before responding. I rejected this immediately. GitHub's delivery timeout is 10 seconds. OpenRouter alone can take 3–5 seconds on free tier. A slow Slack endpoint or a GitHub API rate limit would cause GitHub to mark the delivery as failed and retry, creating a loop.

I specified the decoupled architecture: the webhook handler does exactly three things (verify signature, enqueue, return 202), and a persistent BullMQ worker handles everything else. This also gave us idempotency almost for free — we write the `delivery_id` to Postgres with a UNIQUE constraint before doing anything, so retries are a no-op.

### 2. Supabase over a custom Express+Postgres setup

I chose Supabase over a raw Postgres setup on Render because it gave me a free-hosted database, a JavaScript client that handles connection pooling, and a web SQL editor I could use to inspect and modify the schema during debugging without needing psql or a separate DB client. That SQL editor turned out to be critical — when the `github_event_scope` column type was wrong, I was able to run `ALTER TABLE` and test queries directly. A raw Postgres instance on Render would have required me to set up a tunnel or use the Render shell.

### 3. Keeping the GitHub access token inside the JWT rather than in the database

The AI initially suggested storing GitHub access tokens in a `users` table and doing a DB lookup on every authenticated request. I chose instead to embed the access token in the signed JWT. The backend stays stateless — no DB read needed to authenticate a request, which matters on a free Render instance that spins down and has cold start latency. The trade-off is that a revoked token remains valid until JWT expiry (7 days), but for an assessment-scope project this was the right call over adding token refresh complexity.

---

## The Hardest Bug — and the Wrong Turn the AI Led Me Into

**The bug:** Push events were not triggering Slack notifications or appearing in the dashboard. Issues were working fine.

**What the AI got wrong, in sequence:**

The AI's first diagnosis was that push events weren't being handled by the worker. It modified the worker code to skip AI triage for push events (which was correct — you can't run an "issue classifier" on a commit), but push events still didn't appear. The AI then declared the fix "should work now" and suggested I wait for a Render redeploy.

Nothing worked. I pushed another file to the test repo. Still nothing.

The AI's second diagnosis was that the Render logs "only showed HTTP access logs because the webhook wasn't reaching the worker." It added some `console.log` statements and committed them. This was noise — it didn't address why the webhook was failing.

At this point I asked it to actually **check GitHub's delivery history** rather than theorise. That single question unlocked the real problem: the GitHub deliveries page showed `401` and `502` status codes for every push event. The AI had been looking at the wrong layer entirely — it was analysing the worker code when the webhook wasn't even making it past the Express middleware.

The AI then traced backwards: it sent a hand-crafted signed request to the live Render URL and got `200 pong` back. That proved Render's `GITHUB_WEBHOOK_SECRET` env var was correct. So the mismatch was on the GitHub side — the webhook's registered secret was wrong.

**Root cause:** Earlier in the debugging session, the AI had run a repair script that included:
```js
secret: process.env.GITHUB_WEBHOOK_SECRET || '********'
```
Because `dotenv` wasn't loaded in that script, the env var was `undefined` and the fallback string `"********"` was written to GitHub as the actual webhook secret. Every subsequent delivery from GitHub was signed with `"********"`, but Render verified against the real secret — guaranteed 401 every time.

**How I caught it:** I pushed back when the AI said "the issue is dotenv not loading on Render." I said: *"wait, loading dotenv on Render?? the env should be given in the render page right not in dotenv code."* That challenge made the AI re-examine its assumptions and actually inspect the GitHub webhook configuration rather than the application code.

**The fix:** Patch the GitHub webhook via the API with the correct secret (read from the actual local `.env` this time). One `axios.patch` call, confirmed by re-running the ping delivery which returned `200 OK`.

**What this taught me about working with AI:** The AI is good at implementing things you describe and at searching code for specific patterns. It is bad at knowing when it has caused the problem. It will keep looking at application code, worker logic, and queue configuration long after the real issue is something it did in a diagnostic script three steps ago. You have to be the one to say "stop, check the infrastructure layer, not the application layer" — and you have to be specific about what to check. Vague prompts ("why is push not working") generate vague diagnoses. Precise prompts ("check GitHub's delivery history and tell me the status codes") get real answers.

---

## What I'd Improve or Add With More Time

**Immediate / low effort:**
- Replace the `service_role` key with proper Supabase Row Level Security so users can only read their own repositories and rules. Right now the database is wide open at the API level, protected only by JWT auth in Express.
- Add a `GITHUB_WEBHOOK_SECRET` existence check at server startup — fail loudly with a clear error instead of silently accepting the mismatched-secret state we hit in production.
- Write an explicit error to the `execution_logs` table when the worker skips a push event — right now it silently exits and leaves no audit trail.

**Medium effort:**
- Switch from user OAuth tokens to a proper **GitHub App** model. Right now I store a user's personal access token in the JWT and in `connected_repositories`. If the user revokes it, all webhook actions silently fail. A GitHub App uses short-lived installation tokens with fine-grained repo permissions and a refresh mechanism — dramatically more secure and more user-friendly.
- Add **BullMQ exponential backoff** on job retries. Currently a failed Slack dispatch or GitHub API call is retried immediately with no delay. Under Slack rate limits or OpenRouter outages this creates a burst that makes the situation worse.

**Longer term:**
- A proper **multi-model fallback chain** in the AI triage step. OpenRouter's free tier returns inconsistent JSON — sometimes wrapped in markdown code fences, sometimes not. I added a `cleanLlmJsonResponse` helper as a band-aid. The real fix is a structured output constraint (if the model supports it) or a fallback to a second model, not string-cleaning.
- **Real-time dashboard** using Supabase's Postgres CDC (Change Data Capture) subscriptions instead of polling every 15 seconds. The current polling approach means a fresh event can sit invisible in the UI for up to 15 seconds and generates constant unnecessary API calls.

---

## One Prompt Excerpt Worth Including

The moment things turned around on the webhook debugging was when I stopped asking "why isn't this working" and asked something specific:

> **Me:** identify the cause — I already pushed a pdf into the repo but no response

The AI ran scripts and described the worker code. Still generic. Then:

> **Me:** wait loading dotenv on Render?? the env should be given in the render page right not in dotenv code

That one correction — pointing out a faulty assumption in the AI's mental model of how Render works — made it stop looking at application code and start looking at the actual deployed infrastructure. Within two queries after that it had identified the 401s in GitHub's delivery history and traced them back to the corrupted webhook secret.

The lesson isn't that the AI was useless — it wrote the fix correctly once it understood the problem. The lesson is that the human has to stay close enough to the system to catch when the AI is solving the wrong problem. The AI optimises for answering your question. You have to make sure you're asking the right question.
