@echo off
setlocal
title KIT Delivery Due Control - Upgrade Existing Worker

echo ======================================================
echo  Upgrade existing Cloudflare Worker: kit-stock-system
echo ======================================================
echo.
echo This installer keeps the existing DB and BUCKET bindings.
echo Run it inside the OLD project folder after copying these files over it.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Install Node.js 22 or newer from https://nodejs.org/
  pause
  exit /b 1
)

if not exist wrangler.jsonc if not exist wrangler.toml if not exist wrangler.json (
  echo [ERROR] Existing wrangler config was not found.
  echo Keep the old wrangler.jsonc, wrangler.json, or wrangler.toml in this folder.
  pause
  exit /b 1
)

echo [1/6] Installing packages...
call npm install
if errorlevel 1 goto :failed

echo [2/6] Login to Cloudflare...
call npx wrangler login
if errorlevel 1 goto :failed

echo [3/6] Upgrading the existing D1 database without deleting old data...
call npm run db:upgrade
if errorlevel 1 goto :failed
call npm run db:upgrade:v22
if errorlevel 1 goto :failed
call npm run db:upgrade:v23
if errorlevel 1 goto :failed
call npm run db:upgrade:v27
if errorlevel 1 goto :failed
call npm run db:upgrade:v28
if errorlevel 1 goto :failed
call npm run db:upgrade:v288
if errorlevel 1 goto :failed
call npm run db:upgrade:v289
if errorlevel 1 goto :failed

echo [4/6] Building and deploying over kit-stock-system...
call npm run deploy
if errorlevel 1 goto :failed

echo [5/6] Set the new ADMIN PIN. The PIN will not be displayed.
call npx wrangler secret put INITIAL_ADMIN_PIN --config dist/server/wrangler.json
if errorlevel 1 goto :failed

echo [6/6] Complete.
echo.
echo URL remains: https://kit-stock-system.kishimoto-th.workers.dev
echo Employee code: ADMIN
echo PIN: the value entered in step 5
pause
exit /b 0

:failed
echo.
echo [ERROR] Upgrade stopped. Existing D1 and R2 data were not deleted.
echo Read README.md and retry the failed step.
pause
exit /b 1
