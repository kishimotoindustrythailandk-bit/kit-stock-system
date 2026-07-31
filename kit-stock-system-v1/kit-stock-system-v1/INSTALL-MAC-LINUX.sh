#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f wrangler.jsonc && ! -f wrangler.json && ! -f wrangler.toml ]]; then
  echo "Existing wrangler config not found. Keep the old config in this folder."
  exit 1
fi

npm install
npx wrangler login
npm run db:upgrade
npm run db:upgrade:v22
npm run db:upgrade:v23
npm run db:upgrade:v27
npm run db:upgrade:v28
npm run db:upgrade:v288
npm run db:upgrade:v289
npm run deploy
npx wrangler secret put INITIAL_ADMIN_PIN --config dist/server/wrangler.json
echo "Upgrade complete: https://kit-stock-system.kishimoto-th.workers.dev"
