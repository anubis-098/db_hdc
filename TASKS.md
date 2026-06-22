# Project Tasks & Roadmap

- [ ] **Phase 1: Backend & Data Extraction**
  - [x] ~~ตั้งค่า App Registration บน Microsoft Entra ID เพื่อเอา ID/Credentials~~ (ยกเลิก: เปลี่ยนใช้ Shared Link)
  - [ ] เตรียม "Direct Download Link" ของไฟล์ Excel จาก SharePoint
  - [ ] เขียนสคริปต์ `sharepoint.py` เพื่อดึงไฟล์ .xlsx ผ่าน URL
  - [x] ออกแบบระบบรองรับการรวมไฟล์หลายแหล่ง (Multi-file merging) ตาม ADR-002
  - [ ] เขียนสคริปต์ `processor.py` ใช้ Pandas รวมโครงสร้าง Excel และ Clean ข้อมูล
  - [ ] ทำ API Endpoint ส่งข้อมูลออกเป็น JSON
  - [x] เขียน `Dockerfile` สำหรับ Backend

- [ ] **Phase 2: Frontend & Dashboard**
  - [ ] สตาร์ทโปรเจกต์ React + Vite และติดตั้ง ApexCharts
  - [ ] เขียนตัวดึงข้อมูลจาก API (Fetch/Axios) พร้อมระบบเลเยอร์เวลา `setInterval` ทุก 5 นาที
  - [ ] ออกแบบหน้าหน้าจอ Kiosk Mode (ซ่อน Scrollbar, ธีมมืด)
  - [ ] ประกอบกราฟ ApexCharts เข้ากับข้อมูล JSON
  - [ ] เขียน `Dockerfile` (Multi-stage build) ร่วมกับ Nginx

- [ ] **Phase 3: Orchestration & Deployment**
  - [x] เขียนไฟล์ `docker-compose.yml` เพื่อผูกระบบเข้าด้วยกัน
  - [ ] ทดสอบรันผ่าน Docker CLI ด้วยคำสั่ง `docker compose up --build -d`
