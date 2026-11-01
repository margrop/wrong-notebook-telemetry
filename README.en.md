# wrong-notebook-telemetry

[简体中文](README.md)

An independent anonymous telemetry collector for wrong-notebook, based on `doc/TELEMETRY_DESIGN.md` v4. **Source code is public; data is visible only to the maintainer.** MIT licensed. No user or instance identifiers, raw errors, questions, or AI conversations are stored.

## Implementation status

This commit provides the service foundation, batch ingest, transactional libSQL aggregation, versioned migrations, health checks, privacy information, tests and CI. Scheduled maintenance and the private dashboard follow the [server design](doc/SERVER_DESIGN.md) in later commits. No deployment or public publication has been performed.

## Local development

Use Node.js 22.12+ (22 LTS at least 22.12, or 24 LTS at least 24.0).

```bash
npm ci --registry=https://registry.npmjs.org
cp .env.example .env.local
# Set TURSO_DATABASE_URL to an absolute local database path.
npm run db:migrate
npm run dev
```

Open `http://127.0.0.1:3000`. Migrations use libSQL write transactions and immutable checksums, preserve existing data, and are not run automatically during builds. Production and Preview must use separate databases.

## Collector API

`POST /api/v1/ingest` accepts unauthenticated server-to-server JSON batches up to 64KB and 100 items. Requests with Origin are rejected. Extra fields and invalid items are rejected; valid items are aggregated by UTC day. A partially valid batch still returns 200 with accepted/rejected/minIntervalSec. Without a trusted proxy address, callers share one ten-request-per-minute bucket.

`GET /api/v1/health` checks the actual database table. See the [design](doc/SERVER_DESIGN.md) for protocol details, compatibility decisions and anonymous-data limitations. [Contract vectors](tests/fixtures/contract-v1.json) are synthetic and must not be sent to production.

## Validation

Run `npm run lint`, `npm run test:unit`, `npm run test:integration`, or the complete `npm run ci`, which includes a production build. Integration tests use real libSQL databases in disposable system temporary directories. Public-file checks run locally and gitleaks runs in GitHub CI.

Read [Privacy](PRIVACY.en.md) and the [deployment plan](doc/DEPLOYMENT.md). External Turso/Vercel resources, domains and public repositories remain separate deployment work.
