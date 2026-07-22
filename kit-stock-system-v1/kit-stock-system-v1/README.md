# KIT Delivery Due Control — ชุดอัปเกรดทับระบบเก่า

ชุดนี้ทำสำหรับ Worker เดิมชื่อ `kit-stock-system` โดยเฉพาะ

URL เดิม:

```text
https://kit-stock-system.kishimoto-th.workers.dev
```

## สิ่งที่ชุดอัปเกรดจะทำ

- เปลี่ยนหน้าเว็บเก่าเป็นระบบ Delivery Due Control ใหม่
- ใช้ Binding เดิมชื่อ `DB` และ `BUCKET`
- เก็บ D1 Database และ R2 Bucket เดิมไว้
- ไม่ลบตารางหรือข้อมูลของระบบ Stock เก่า
- เพิ่มตาราง Due, QR Tag, ผู้ใช้งาน และ Session ที่ระบบใหม่ต้องใช้
- เพิ่ม Due 706 รายการ รวม 69,385 ชิ้น โดยป้องกันข้อมูลซ้ำ

## สำคัญก่อนวางไฟล์ทับ

เก็บไฟล์ Cloudflare เดิมต่อไปนี้ไว้ ห้ามลบ:

- `wrangler.jsonc` หรือ `wrangler.json` หรือ `wrangler.toml`
- `.git` หากทำงานผ่าน GitHub บนเครื่อง

ไฟล์ `wrangler.overlay.example.jsonc` เป็นเพียงตัวอย่าง ไม่ต้องนำไปแทนไฟล์ Wrangler เดิม เพราะไฟล์เดิมมีรหัสเชื่อม D1/R2 ของบริษัทอยู่แล้ว

## ถ้าอัปโหลดผ่าน GitHub ตามภาพ

Repository ของคุณคือ `kishimotoindustrythailandk-bit/kit-stock-system`

1. แตก ZIP นี้บนคอมพิวเตอร์
2. เข้าโฟลเดอร์ชั้นในสุดของระบบเก่าที่มี `app`, `db`, `public`, `worker` และ `package.json`
3. วางไฟล์จาก ZIP ทับโฟลเดอร์นั้น และเลือก **Replace files**
4. อย่าสร้างโฟลเดอร์ `kit-stock-system-v1` ซ้อนเพิ่มอีกชั้น
5. Upload/Commit ไฟล์ที่แก้ไขกลับไปยังตำแหน่งเดิมใน GitHub
6. Cloudflare จะ Build และ Deploy ทับ Worker `kit-stock-system` โดย URL เดิมไม่เปลี่ยน

หลังโค้ด Deploy แล้ว ต้องอัปเกรด D1 หนึ่งครั้งด้วยไฟล์ `database-upgrade-due.sql` ผ่าน D1 Console หรือใช้วิธีติดตั้งบนเครื่องด้านล่าง

## วิธีแนะนำ: อัปเกรดจากคอมพิวเตอร์ Windows

วิธีนี้จะอัปเกรด D1 และ Deploy ให้ครบอัตโนมัติ

1. สำรองโฟลเดอร์ระบบเก่าไว้หนึ่งชุด
2. วางไฟล์จาก ZIP ทับโฟลเดอร์ระบบเก่า
3. ดับเบิลคลิก `INSTALL-WINDOWS.bat`
4. Login Cloudflare เมื่อเบราว์เซอร์เปิด
5. ตั้ง PIN ใหม่สำหรับรหัสพนักงาน `ADMIN`

ตัวติดตั้งจะใช้ Binding เดิม ไม่สร้าง D1 หรือ R2 ใหม่

## อัปเกรดด้วยคำสั่งเอง

```bash
npm install
npx wrangler login
npm run db:upgrade
npm run deploy
npx wrangler secret put INITIAL_ADMIN_PIN --config dist/server/wrangler.json
```

## เข้าสู่ระบบใหม่

- รหัสพนักงาน: `ADMIN`
- PIN: ค่าที่ตั้งตอนใช้คำสั่ง `INITIAL_ADMIN_PIN`

## สำรองข้อมูลก่อนอัปเกรด

แนะนำให้เปิด Cloudflare > Storage & databases > D1 > ฐานข้อมูลเดิม > Backups และสร้าง Backup ก่อน แม้ไฟล์อัปเกรดนี้ไม่มีคำสั่งลบข้อมูล

## ไฟล์ข้อมูลต้นฉบับ

โฟลเดอร์ `source-files` มี Excel ต้นทางสองไฟล์และ PDF Tag ตัวอย่าง ไฟล์ PDF ไม่ถูกนำไปตัดยอดอัตโนมัติ

Deployment refresh 22/07/2026
