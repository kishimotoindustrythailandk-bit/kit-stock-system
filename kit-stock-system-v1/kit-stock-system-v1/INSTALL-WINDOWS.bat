@echo off
setlocal
title KIT Delivery Due Control - ติดตั้ง / อัปเกรด

REM เวอร์ชันก่อนหน้าเรียก db:upgrade:v23 และ db:upgrade:v27 ที่ชี้ไปยังไฟล์ SQL
REM ซึ่งไม่มีอยู่ในรีโป ตัวติดตั้งจึงหยุดกลางคันก่อนถึง deploy เสมอ
REM ตอนนี้ migration รวมเป็นชุดเดียวใน migrations\ และรันก่อน deploy

echo ======================================================
echo  KIT Delivery Due Control - ติดตั้ง / อัปเกรด
echo ======================================================
echo.
echo ตัวติดตั้งนี้ใช้ binding DB และ BUCKET เดิม ไม่ลบข้อมูลใดๆ
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] กรุณาติดตั้ง Node.js 22 ขึ้นไปจาก https://nodejs.org/
  pause
  exit /b 1
)

if not exist wrangler.jsonc if not exist wrangler.toml if not exist wrangler.json (
  echo [ERROR] ไม่พบไฟล์ตั้งค่า wrangler ในโฟลเดอร์นี้
  pause
  exit /b 1
)

echo [1/6] ติดตั้ง dependency...
call npm install
if errorlevel 1 goto :failed

echo [2/6] เข้าสู่ระบบ Cloudflare...
call npx wrangler login
if errorlevel 1 goto :failed

echo.
echo [3/6] ขั้นตอนฐานข้อมูล
echo.
echo   ถ้านี่คือฐานข้อมูลที่ใช้งานอยู่แล้ว (เคยรัน database-upgrade-*.sql ด้วยมือ)
echo   ต้องรัน db:baseline ครั้งเดียวก่อน เพื่อบอก wrangler ว่า migration 0000-0009
echo   มีอยู่ในฐานแล้ว
echo.
echo   ถ้าเป็นฐานข้อมูลใหม่ที่ยังว่างเปล่า ให้ตอบ N
echo.
set /p BASELINE="รัน db:baseline ตอนนี้เลยไหม [y/N] "
if /i "%BASELINE%"=="y" (
  call npm run db:baseline
  if errorlevel 1 goto :failed
)

echo [4/6] รัน migration...
call npm run db:migrate
if errorlevel 1 goto :failed

echo [5/6] ตรวจสอบโค้ดก่อน deploy...
call npm run typecheck
if errorlevel 1 goto :failed
call npm run lint
if errorlevel 1 goto :failed

echo [6/6] Build และ deploy...
call npm run deploy
if errorlevel 1 goto :failed

echo.
echo ตั้ง PIN ตั้งต้นของผู้ดูแลระบบ (จะไม่แสดงบนหน้าจอ)
echo ระบบจะบังคับให้เปลี่ยน PIN ทันทีที่ล็อกอินครั้งแรก
call npx wrangler secret put INITIAL_ADMIN_PIN --config dist/server/wrangler.json
if errorlevel 1 goto :failed

echo.
echo เสร็จสิ้น
echo รหัสพนักงาน: ADMIN
echo PIN: ค่าที่กรอกในขั้นตอนสุดท้าย (ต้องเปลี่ยนทันทีที่เข้าสู่ระบบ)
pause
exit /b 0

:failed
echo.
echo [ERROR] การติดตั้งหยุดลง ข้อมูลใน D1 และ R2 เดิมไม่ถูกลบ
echo อ่าน README.md แล้วรันขั้นตอนที่ล้มเหลวซ้ำอีกครั้ง
pause
exit /b 1
