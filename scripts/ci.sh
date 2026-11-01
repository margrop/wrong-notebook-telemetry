#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { process.stderr.write("CI 需要 Node.js 22 或以上。\n"); process.exit(1); }'
python3 scripts/check-public-files.py
npm run db:generate
npm run lint
npm run test:unit
npm run test:integration
npm run build
npm run typecheck
npm run test:smoke
