#!/usr/bin/env bash
# ติดตั้ง / อัปเกรด KIT Delivery Due Control บน Cloudflare Workers
#
# เวอร์ชันก่อนหน้าเรียก db:upgrade:v23 และ db:upgrade:v27 ซึ่งชี้ไปที่ไฟล์ SQL
# ที่ไม่มีอยู่ในรีโป พอเจอ `set -e` สคริปต์จึงหยุดกลางคัน ก่อนถึงขั้นตอน deploy
# และก่อนตั้ง INITIAL_ADMIN_PIN ทำให้ติดตั้งใหม่จากศูนย์ไม่เคยสำเร็จ
#
# ตอนนี้ทุกอย่างรวมอยู่ใน migrations/ ชุดเดียว และรัน migration ก่อน deploy เสมอ
# เพราะโค้ดรุ่นใหม่ต้องการตาราง app_login_attempts และคอลัมน์ must_change_pin

set -euo pipefail

if [[ ! -f wrangler.jsonc && ! -f wrangler.json && ! -f wrangler.toml ]]; then
  echo "ไม่พบไฟล์ตั้งค่า wrangler กรุณารันสคริปต์นี้ในโฟลเดอร์โปรเจกต์"
  exit 1
fi

echo "==> [1/6] ติดตั้ง dependency"
npm install

echo "==> [2/6] เข้าสู่ระบบ Cloudflare"
npx wrangler login

cat <<'NOTE'

==> [3/6] ขั้นตอนฐานข้อมูล

ถ้านี่คือฐานข้อมูลที่ "ใช้งานอยู่แล้ว" (เคยรัน database-upgrade-*.sql ด้วยมือ)
ต้องรัน db:baseline ครั้งเดียวก่อน เพื่อบอก wrangler ว่า migration 0000-0009
มีอยู่ในฐานแล้ว ไม่ต้องรันซ้ำ

ถ้าเป็นฐานข้อมูลใหม่ที่ยังว่างเปล่า ให้ตอบ N แล้วข้ามไปได้เลย

NOTE

read -r -p "รัน db:baseline ตอนนี้เลยไหม (สำหรับฐานที่ใช้งานอยู่แล้ว) [y/N] " baseline
if [[ "${baseline:-N}" =~ ^[Yy]$ ]]; then
  npm run db:baseline
fi

echo "==> [4/6] รัน migration"
npm run db:migrate

echo "==> [5/6] ตรวจสอบโค้ดก่อน deploy"
npm run typecheck
npm run lint

echo "==> [6/6] Deploy"
npm run deploy

echo
echo "==> ตั้ง PIN ตั้งต้นของผู้ดูแลระบบ"
echo "    ระบบจะบังคับให้เปลี่ยน PIN ทันทีที่ล็อกอินครั้งแรก และเก็บเป็นค่าที่เข้ารหัสแล้ว"
npx wrangler secret put INITIAL_ADMIN_PIN --config dist/server/wrangler.json

echo
echo "เสร็จสิ้น — เข้าสู่ระบบด้วยรหัสพนักงาน ADMIN แล้วตั้ง PIN ใหม่ของคุณ"
