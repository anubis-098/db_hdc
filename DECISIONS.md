# Architectural Decisions (ADR)

ไฟล์นี้ใช้บันทึกเหตุผลว่าทำไมเราถึงเลือกใช้วิธีต่าง ๆ ในโปรเจกต์นี้

## [ADR-001] การเลือกสถาปัตยกรรม Web App แทน Power BI Free
- **วันที่:** 2026-06-11
- **การตัดสินใจ:** เลือกเขียนเว็บเอง (Python + React) เพราะ Power BI แบบฟรีติดข้อจำกัดเรื่องการ Auto-Refresh บน Cloud และการจัดหน้าจอ Kiosk Mode แบบสาธารณะ

## [ADR-002] การจัดการโครงสร้างไฟล์ Excel ด้วย Pandas
- **การตัดสินใจ:** ใช้ `pandas.concat()` ในการ Append รวมไฟล์ โดย Backend จะประมวลผลให้เสร็จ แล้วส่งเป็น Clean JSON ไปให้หน้าบ้าน เพื่อลดภาระการคำนวณบนเบราว์เซอร์ของทีวี

## [ADR-003] การใช้ Docker และ Docker Compose ในการ Deploy
- **วันที่:** 2026-06-11
- **การตัดสินใจ:** ม้วนระบบเป็น 2 Containers (Backend: Python, Frontend: Nginx) ควบคุมด้วย Docker Compose
- **เหตุผล:** เพื่อให้ง่ายต่อการนำไปเปิดใช้งานกับอุปกรณ์อื่น หรือกล่องคอมพิวเตอร์ที่ต่อเข้ากับจอทีวีหน้าร้าน/หน้าออฟฟิศ โดยไม่ต้องติดตั้ง Environment ซ้ำซ้อน

## [ADR-004] การเปลี่ยนจาก Microsoft Graph API เป็น Shared Link
- **วันที่:** 2026-06-11
- **การตัดสินใจ:** ยกเลิกการใช้ Microsoft Entra ID (Graph API) และเปลี่ยนมาใช้การดึงข้อมูลผ่าน "Direct Download Link" จากการแชร์ไฟล์ SharePoint/OneDrive แบบ Public/Organization Link
- **เหตุผล:** เพื่อลดความซับซ้อนในการตั้งค่า (No Auth Configuration), ลดค่าใช้จ่าย และทำให้การพัฒนาเริ่มต้นได้รวดเร็วขึ้น โดยยังคงความสามารถในการดึงข้อมูลแบบ Real-time ได้ผ่าน `pandas.read_excel()`
