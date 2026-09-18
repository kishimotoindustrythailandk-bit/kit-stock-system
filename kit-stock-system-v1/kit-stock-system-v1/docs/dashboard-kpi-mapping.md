# Dashboard KPI mapping

Dashboard อ่านจากตารางงานเดิมโดยตรงและไม่มีตารางสรุปยอดแยก

| ตัวเลข | แหล่งข้อมูล/เงื่อนไข |
|---|---|
| Due ทั้งหมด | `delivery_due_lines` ตาม `delivery_date` ที่เลือก |
| ส่งออกแล้ว | Due ที่ `SUM(delivery_tag_scans.qty) >= delivery_due_lines.req_qty` |
| ค้างส่ง | Due ที่ยอดส่งสะสมน้อยกว่า `req_qty` |
| เกินคิว | ค้างส่งและ `delivery_date + delivery_time` น้อยกว่าเวลาปัจจุบันในกรุงเทพฯ |
| Stock พร้อมใช้ | `stock_tags.remaining_qty - stock_picks(staged/partial คงเหลือ) - stock_allocations(reserved)` โดยไม่ติดลบ |
| ถูกจัดงานแล้ว | `SUM(stock_picks.picked_qty - dispatched_qty)` เฉพาะ `staged/partial` รวม legacy reserved |
| งานทดแทน | `replacement_requests.requested_qty - issued_qty` เฉพาะ `pending/partial` |
| ผิดปกติ | Tag สถานะ `ng` หรือ `remaining_qty < 0` หรือมากกว่า `qty` |
| แผน | `SUM(delivery_due_lines.req_qty)` ของวันที่เลือก |
| พิมพ์ Tag | `SUM(stock_tags.qty)` |
| รับเข้า Stock | ยอดรับล่าสุดต่อ Tag จาก `stock_receipt_adjustments.received_qty` |
| ตรวจสอบ | `SUM(stock_dispatch_links.qty)` เนื่องจากระบบเดิมตรวจและขายออกในธุรกรรมเดียวกัน |
| ส่งออก | `SUM(delivery_tag_scans.qty)` |
| Forecast | `forecast_lines` ของ `forecast_imports.status = active` เทียบ Stock พร้อมใช้สูตรเดียวกับด้านบน |
| กิจกรรมล่าสุด | `audit_logs` ของแผน, Tag, Stock, จัดงาน, ทดแทน, ตรวจขายออก และรายงาน |

กฎป้องกัน Double Count: สินค้าที่มี Pick ค้างใน `staged/partial` ถือว่าออกจากพื้นที่ Stock แล้ว จึงอยู่ใน “ถูกจัดงานแล้ว” และไม่รวมใน “Stock พร้อมใช้”
