# KIT Delivery Due Control v2.2 — ผู้ใช้งานหลายคนและ Scan Workflow

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
- Admin เพิ่มผู้ใช้งานได้หลายคนจากหน้า **ผู้ใช้งาน**
- กำหนดบทบาท **ผู้จัดงาน** (สแกนรับเข้า) หรือ **ผู้ตรวจงาน** (สแกนส่งออกและตัด Due)
- ตั้ง/รีเซ็ต PIN 6 หลัก เปิดใช้หรือระงับบัญชีได้จากหน้าเว็บ
- PIN ของผู้ใช้ใหม่จัดเก็บแบบ PBKDF2 Hash ไม่เก็บเป็นข้อความปกติ
- สแกนแล้วบันทึกและแสดงข้อมูลทันที ไม่ต้องกดปุ่มตรวจสอบ Tag

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

หลังโค้ด Deploy แล้ว ต้องอัปเกรด D1 ด้วย `database-upgrade-v2.2-users-scan.sql` หนึ่งครั้ง เพื่อเพิ่มตารางรับเข้า Tag (ไฟล์ใช้ `IF NOT EXISTS` และไม่ลบข้อมูลเดิม)

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
npm run db:upgrade:v22
npm run deploy
npx wrangler secret put INITIAL_ADMIN_PIN --config dist/server/wrangler.json
```

## เข้าสู่ระบบใหม่

- รหัสพนักงาน: `ADMIN`
- PIN: ค่าที่ตั้งตอนใช้คำสั่ง `INITIAL_ADMIN_PIN`

จากนั้นเข้าเมนู **ผู้ใช้งาน** แล้วกด **เพิ่มผู้ใช้งาน**:

1. ระบุรหัสพนักงาน ชื่อ และ PIN 6 หลัก
2. เลือก `ผู้จัดงาน — สแกนรับเข้า` หรือ `ผู้ตรวจงาน — สแกนส่งออก/ตัด Due`
3. ผู้ใช้เข้าสู่ระบบด้วยรหัสพนักงานและ PIN ของตัวเองได้ทันที
4. หากต้องหยุดสิทธิ์ ให้ Admin กด **ระงับ** ระบบจะยกเลิก Session ของคนนั้นทันที

## สำรองข้อมูลก่อนอัปเกรด

แนะนำให้เปิด Cloudflare > Storage & databases > D1 > ฐานข้อมูลเดิม > Backups และสร้าง Backup ก่อน แม้ไฟล์อัปเกรดนี้ไม่มีคำสั่งลบข้อมูล

## ไฟล์ข้อมูลต้นฉบับ

โฟลเดอร์ `source-files` มี Excel ต้นทางสองไฟล์และ PDF Tag ตัวอย่าง ไฟล์ PDF ไม่ถูกนำไปตัดยอดอัตโนมัติ
