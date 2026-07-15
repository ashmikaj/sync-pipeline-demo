# Resilient Multi-Source Sync Pipeline

An Express/Node.js service that ingests CRM contacts, payment transactions, and calendar events into a single normalized SQLite schema. It is designed to demonstrate safe incremental synchronization: no duplicate rows on retries, recovery from expired cursors, and source-level failure isolation.

> **Submission links — replace these before publishing:**
>
> - Live service: `https://<your-render-service>.onrender.com`
> - Demo video (5 minutes or less): `<add video URL>`
> - AI chat/export: `<add shared Codex/ChatGPT conversation URL or exported transcript>`

## Live endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Returns `Server running` when the service is available. |
| `POST` | `/sync` | Runs all sources concurrently and returns one result per source. Returns `200` when all succeed and `207 Multi-Status` when any source fails but others complete. |

Example:

```bash
curl https://<your-render-service>.onrender.com/health
curl -X POST https://<your-render-service>.onrender.com/sync
```

## Problem requirements and implementation

| Requirement | Implementation |
| --- | --- |
| Different source shapes | `normalize.js` maps HubSpot contacts, payment transactions, and Google Calendar events into one `records` table. Each row keeps the source-specific payload in `raw_data` for traceability. |
| Full and incremental syncs | The first successful run calls each connector's `fetchAll`; later runs persist and use a per-source checkpoint in `sync_checkpoints`. HubSpot uses `hs_lastmodifieddate`; Calendar uses Google's `nextSyncToken`; payments use `updated_since`. |
| Stale cursor safety | A rejected/expired cursor (including Google Calendar `410 Gone`) causes a source-level full backfill. The pipeline only saves a checkpoint after processing the complete batch. |
| Idempotency | SQLite enforces `UNIQUE(source, source_id)`. Ingestion uses `INSERT ... ON CONFLICT DO UPDATE`, so retries, back-to-back jobs, and duplicate webhook deliveries update the same row instead of inserting another one. |
| One bad source must not wedge the run | Every source is run independently. A connector failure is captured in `sync_runs`; valid sources still finish. Individual malformed records are rejected and counted without abandoning their batch. |
| Auditability | `sync_runs` stores mode, status, received/written/rejected counts, timing, and failure message. |

### Normalized record shape

```text
source, source_id, record_type, name, email, amount, currency,
event_start, event_end, updated_at, deleted, raw_data, ingested_at
```

`source + source_id` is the stable idempotency key. Contacts populate identity fields, payments populate amount/currency, and calendar events populate start/end times. Fields that do not apply remain `NULL`.

## Sources and sample data

- **HubSpot CRM:** Uses the HubSpot Contacts API. The connected developer/test account has 10 contacts, including three `Sync Pipeline Sample` contacts created for this project.
- **Google Calendar:** Uses the Calendar API with an existing OAuth grant. The connected calendar contained 125 events and was successfully backfilled. The current token has read-only scope, so the service deliberately does not create or modify calendar data.
- **Payments:** A provider-agnostic sandbox adapter expects `GET /payments`, returning either an array or `{ data: [...] }`, and accepts `?updated_since=<cursor>`. Set a sandbox URL to activate it. This is intentionally an adapter rather than a claim of a particular payment-provider integration.

## Run locally

### Prerequisites

- Node.js 18+
- A HubSpot developer/test account and a private-app token with contact read access
- A Google Cloud project with the Google Calendar API enabled and a Desktop OAuth client
- Optional: a payments sandbox implementing the adapter contract above

### Setup

```bash
npm install
cp .env.example .env # or create .env yourself
npm test
npm start
```

Create `.env` locally (never commit it):

```dotenv
HUBSPOT_TOKEN=your_hubspot_private_app_token
PAYMENTS_API_URL=https://your-payments-sandbox.example
PAYMENTS_API_TOKEN=optional_bearer_token
```

Save the Google OAuth client download as `credentials.json`. On the first local Calendar run, Google opens a consent flow and a refresh token is written to `token.json`. Both files are ignored by Git.

Then trigger a sync:

```bash
curl -X POST http://localhost:3000/sync
```

## Tests

```bash
npm test
```

The automated test uses in-memory fixture connectors and verifies:

1. normalization from all three source shapes;
2. idempotent re-runs (three source records remain three rows);
3. an expired cursor causing full-backfill fallback;
4. a malformed payment record being rejected without stopping its source; and
5. a down HubSpot connector not preventing payments and Calendar from completing.

## Deploy on Render (free tier)

1. Push this repository to GitHub **without** `.env`, `credentials.json`, `token.json`, databases, or service-account keys.
2. In Render, create **New → Web Service**, connect the GitHub repository, select Node, and choose the **Free** instance type.
3. Configure:

   | Setting | Value |
   | --- | --- |
   | Build command | `npm install` |
   | Start command | `npm start` |
   | Health check path | `/health` |
4. Add `HUBSPOT_TOKEN`, `PAYMENTS_API_URL`, and (if needed) `PAYMENTS_API_TOKEN` in Render’s Environment page. Do not commit them.
5. Deploy, open `/health`, then call `POST /sync` using the generated `onrender.com` URL. Replace the live-service placeholder at the top of this README with that URL.

### Deployment caveats / tradeoffs

- Render Free web services spin down after 15 minutes of inactivity and their local filesystem is ephemeral. Therefore the bundled SQLite checkpoint database is appropriate for the live demo but **not durable across a Render restart/redeploy**. A production version should use managed Postgres (and replace `sqlite3` with a Postgres client) so checkpoints and records survive.
- Google OAuth requires `credentials.json` and `token.json`. Those files must not be committed. For a public Render deployment, use a secure secret-delivery approach or change the connector to read JSON secrets from encrypted environment variables; this repository currently supports local OAuth files only.
- A Render free service can cold-start, so allow roughly a minute for the first request after it has idled.
- The payment connector is an adapter contract, not a Stripe/PayPal-specific client. A real sandbox endpoint is still required to demonstrate the third live source.

## Suggested 5-minute demo

1. **0:00–0:30:** Open this README, identify the three sources and normalized schema.
2. **0:30–1:15:** Visit `GET /health` on Render.
3. **1:15–2:15:** Call `POST /sync` and show HubSpot and Calendar returning `success` with record counts.
4. **2:15–3:00:** Call `POST /sync` again. Explain that stable `(source, source_id)` upserts prevent duplicates.
5. **3:00–4:00:** Demonstrate isolation by temporarily removing `PAYMENTS_API_URL` from Render and redeploying, or point it at an unavailable URL. Call `/sync`: it returns `207`, payments fails, and the other sources still succeed.
6. **4:00–4:40:** Run `npm test` or show the stale-cursor test. Explain that a Calendar `410` retries with a full backfill.
7. **4:40–5:00:** Show `sync_runs`/the code and call out the SQLite-on-Render tradeoff.

## Design tradeoffs

- **SQLite over a managed database:** fastest local setup and demonstrates transactional upserts, but unsuitable for persistent Render Free storage. Postgres is the next production step.
- **Polling trigger over webhooks:** `POST /sync` is simple and auditable. Webhooks can safely call the same idempotent ingestion path, but require provider-specific signature validation and public callback configuration.
- **Full backfill after a stale cursor:** this costs more API calls but favors correctness over silently missing changes.
- **Per-record rejection:** preserves availability for valid data, but requires monitoring `sync_runs.rejected` so bad upstream data is investigated.

## AI usage disclosure

I used OpenAI Codex/ChatGPT as a development assistant for implementation planning, code review, test design, and README drafting. I reviewed the generated code, ran the automated tests, and executed a live sync myself. The shared conversation/export link is listed at the top of this README. No secrets or credential values are included in the public repository.

## Sources and references

- [Render: Deploy a Node Express app](https://render.com/docs/deploy-node-express-app)
- [Render: Free instance limits](https://render.com/docs/free)
- [Render: Environment variables and secrets](https://render.com/docs/configure-environment-variables)
- [Google Calendar API: incremental synchronization and `410` recovery](https://developers.google.com/workspace/calendar/api/guides/sync)
- [HubSpot CRM API: search CRM objects](https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm)
- Libraries used: [Express](https://expressjs.com/), [Axios](https://axios-http.com/), [Google APIs Node.js client](https://github.com/googleapis/google-api-nodejs-client), and [sqlite3](https://www.npmjs.com/package/sqlite3).
