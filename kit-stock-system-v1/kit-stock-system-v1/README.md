# KIT Stock Verification

ระบบตรวจสอบ Tag และจำนวนงานสำหรับ Kishimoto Industry (Thailand)

## ความสามารถหลัก

- เข้าสู่ระบบด้วยรหัสพนักงานและ PIN 6 หลัก
- แยกสิทธิ์ Admin, ผู้ส่งงาน, ผู้ตรวจ, ผู้รับงาน และผู้ดูข้อมูล
- Part Master พร้อมรูปสินค้าและจำนวนมาตรฐานต่อบ๊อค
- ใบงานมี Customer, Part No., Part Name, Delivery Qty/Date/Time, Sender และข้อมูล Packing
- ตรวจ Tag ว่าตรงกับ Part และใบงานหรือไม่
- แยกบ๊อคเต็ม/บ๊อคเศษและตรวจยอดรวมให้ตรงใบงาน
- บังคับถ่ายรูปหลักฐานทุกบ๊อคและเก็บรูปใน Cloudflare R2
- บันทึกชื่อผู้ตรวจและผู้รับงานจากบัญชีที่ Login
- ประวัติการตรวจย้อนหลัง

## Cloudflare ที่ต้องมี

- Workers subdomain: `kishimot0-th.workers.dev`
- D1 database: `kit-stock-db`
- R2 bucket: `kit-stock-images`

## ตั้งค่าก่อน Deploy

1. เปิด Cloudflare > Storage & databases > D1 > `kit-stock-db`
2. คัดลอกค่า **Database ID**
3. เปิดไฟล์ `wrangler.jsonc` และแทนที่ `REPLACE_WITH_D1_DATABASE_ID`
4. เปิดหน้า Console ของ D1 แล้วรันไฟล์ `database-setup.sql` หนึ่งครั้ง
5. เชื่อม repository นี้ใน Cloudflare Workers & Pages
6. ใช้ Build/Deploy command: `npm run deploy`
7. เพิ่ม Secret ชื่อ `SETUP_KEY` โดยตั้งเป็นข้อความสุ่มอย่างน้อย 16 ตัวอักษร ห้ามบันทึก Secret ลง GitHub
8. Deploy แล้วเปิด `https://kit-stock.kishimot0-th.workers.dev/setup`
9. กรอก Setup Key เพื่อสร้าง Admin คนแรก แล้วเข้าสู่ระบบที่ `/login`

## ข้อมูลจาก KIT-QR.xlsx

ไฟล์ที่ได้รับเป็นแบบฟอร์ม `DELIVERY QR CODE LABEL` ซึ่งอ้างอิงข้อมูลจากชีตภายนอก ไม่ใช่รายการ Part Master จริง ระบบจึงรองรับและแสดงช่องทั้งหมดตามแบบฟอร์ม ได้แก่ Customer, Part No., Part Name, Delivery Qty/Date/Time, Sender, Inspector, Packing Standard/Count, Full packing Qty, Partial Qty และ Total packing Qty ส่วนรายการ Part จริงเพิ่มได้ในหน้า Part Master หลัง Login

## ความปลอดภัย

- PIN ไม่เก็บเป็นข้อความธรรมดา แต่เก็บค่า hash พร้อม salt
- ใส่ PIN ผิดครบ 5 ครั้งจะล็อกบัญชี 15 นาที
- Session หมดอายุภายใน 12 ชั่วโมง
- รูปใน R2 เปิดผ่านระบบเฉพาะผู้ที่ Login แล้ว
- ห้าม commit `.env`, `.dev.vars`, PIN หรือ `SETUP_KEY`

## ตรวจระบบสำหรับผู้พัฒนา

```bash
npm ci
npm run lint
npm run build
```

พัฒนาในเครื่องด้วย `npm run dev` และใช้ `.dev.vars` สำหรับ `SETUP_KEY` เท่านั้น
