# wrong-notebook-telemetry

[简体中文](README.md)

An independent anonymous telemetry collector for wrong-notebook, based on `doc/TELEMETRY_DESIGN.md` v4. **Source code is public; data is visible only to the maintainer.** MIT licensed. No user or instance identifiers, raw errors, questions, or AI conversations are stored.

## Implemented

- Server-to-server JSON batches: 64KB / 100 items, partial rejection, date windows and in-memory rate limits.
- Next.js 16, Prisma 5.22 and Turso/libSQL: daily aggregates, transactional counters and out-of-order error metadata.
- Daily maintenance, 400-day retention, storage snapshots, optional quota-based backoff, pause and disabled versions.
- Password-protected dashboard: approximate active instances, installations, versions/platforms, feature dimensions, AI success/latency, error trends, statuses and notes.
- Versioned migrations, public privacy information, documentation, public-file checks, gitleaks CI and production HTTP smoke tests.

This is a local server implementation. No Vercel/Turso deployment, remote repository, DNS configuration or instance-side integration has been performed.

## Run locally

Use Node.js 22.12+ (22 LTS at least 22.12, or 24 LTS at least 24.0).

```bash
npm ci --registry=https://registry.npmjs.org
cp .env.example .env.local
npm run password:hash
```

Edit `.env.local`: set TURSO_DATABASE_URL to an **absolute path** for the local database, paste the generated bcrypt hash, and configure independent secrets of at least 32 characters for DASHBOARD_SESSION_SECRET and CRON_SECRET. The password utility prints an escaped form for `.env.local`: Next.js expands dollar signs, so a raw bcrypt hash must not be pasted there directly. Use the raw hash for Vercel environment variables.

```bash
npm run db:migrate
npm run dev
```

Open `http://127.0.0.1:3000/dashboard` and sign in. Development permits an HTTP session cookie; production requires HTTPS with a Secure cookie. Missing credentials fail closed. Migrations use libSQL write transactions and immutable checksums, preserve existing data, and are never run automatically during builds. Keep Production and Preview databases separate.

## Endpoints

| Path | Method | Access |
| --- | --- | --- |
| `/api/v1/ingest` | POST | Anonymous server-to-server; Origin rejected |
| `/api/v1/health` | GET | Database readiness |
| `/api/cron/maintain` | GET | CRON_SECRET Bearer token |
| `/api/dashboard/login`, `logout` | POST | Same origin |
| `/api/dashboard/settings` | PATCH | Session + same origin |
| `/api/dashboard/errors/:fingerprint` | PATCH | Session + same origin |
| `/dashboard`, `/dashboard/settings` | Pages | Session |
| `/privacy` | Page | Public |

Ingest returns accepted/rejected item counts, including 200 for partially invalid batches. Extra fields are rejected. Pause acknowledges and discards a batch; disabled versions or schemas return 410. Without a trusted proxy address, callers share one ten-request-per-minute bucket. See the [design](doc/SERVER_DESIGN.md) for compatibility decisions and limitations. [Contract vectors](tests/fixtures/contract-v1.json) are synthetic and must not be sent to production.

## Maintenance and limits

Maintenance runs daily at 03:17 UTC and retains today plus 399 prior days. Hobby execution may occur within that hour; self-hosted deployments need an external scheduler. Old daily rows and stale fingerprints are removed, and storage snapshots are recorded without resetting ingest counters.

Optional monthly batch, stored-row and database-byte budgets trigger minimum sending intervals of 12/24 hours at 70%/90%. No plan allowance is fabricated. Application counters and allocated database pages are not platform billing metrics; enable provider usage notifications.

Anonymous reports may be duplicated, missing or forged. Active-instance counts are approximate; sums across multiple days represent instance-days, not distinct instances.

## Validation

Run `npm run lint`, `npm run test:unit`, `npm run test:integration`, or the complete `npm run ci`. CI includes 43 unit tests, 22 real-database integration tests, a production build, type checks and a real HTTP smoke test. Smoke tests start the production server with temporary credentials and a disposable database, validate persisted counts and protected routes, and remove their process and data afterward. They do not access external services. Use `npm run test:smoke` when a production build already exists.

Before publication, run `python3 scripts/check-public-files.py` and gitleaks; both are included in repository CI. Enable local hooks with `git config core.hooksPath .githooks`.

Read the [server design](doc/SERVER_DESIGN.md), [deployment and Firewall guide](doc/DEPLOYMENT.md), and [Privacy](PRIVACY.en.md). Do not commit credentials, local databases, real statistics, screenshots or exports.
