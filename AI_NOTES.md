# AI Collaboration & System Engineering Notes

## 🛠️ Tooling & Architecture Profile
*   **AI Models Utilized:** Gemini 1.5 Pro, Gemini 3.5 Flash (via Antigravity IDE)
*   **Work Allocation:** 
    *   **Human:** System design, core requirements, environment setup, and verification criteria.
    *   **AI:** Project scaffolding, schema creation, code implementation, webhook signature verification logic, BullMQ integration, and edge-case error handling.

## 🧠 Core Engineering Decisions
*   **Decision 1 (Decoupled Background Queue):** 
    Implementing BullMQ with Redis Cloud ensures that the webhook ingestion endpoint (`/api/webhooks/github`) can verify the signature, dispatch the job to the queue, and respond to GitHub with `202 Accepted` in under 50ms. This prevents timeouts from slow downstream tasks (such as OpenRouter AI processing or Slack dispatches) and guarantees webhook ingestion reliability.
*   **Decision 2 (Database-Level Idempotency Guard):** 
    We enforce a unique constraint on the `delivery_id` (representing the `X-GitHub-Delivery` header) within the Supabase PostgreSQL database. This serves as a primary fence against duplicate execution storms (e.g., from network retries by GitHub), ensuring each event is processed exactly once.

## ⚡ The Toughest Technical Fault Isolation
*   **The Bug Encountered:** *[TBD during development - will be updated when a specific integration bug or setup issue is encountered]*
*   **The Detection Method:** *[TBD - log/error tracing details]*
*   **The Resolution Strategy:** *[TBD - fix details]*

## 📈 Future Scalability Enhancements
*   **Token-Refresh Management:** Moving from static user OAuth tokens to a formal GitHub App model with dynamic, short-lived Installation Access Tokens (using JWTs to authenticate).
*   **Automatic Retry & Exponential Backoff:** Leverage BullMQ's built-in retry options with backoff rules to handle downstream failures (e.g., Slack rate limits or OpenRouter API outages) gracefully.
*   **Multi-Model Fallbacks:** Implementing a routing model chain where if OpenRouter free tiers are down or rate-limited (HTTP 429), it automatically falls back to secondary open-source models or standard keyword heuristics.
