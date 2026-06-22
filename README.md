# SharePoint/OneDrive Excel Dashboard (Dockerized)

โปรเจกต์ระบบดึงข้อมูลจากไฟล์ Excel (.xlsx) หลายไฟล์บน SharePoint/OneDrive มารวมกันเพื่อแสดงผลเป็น Dashboard บนหน้าเว็บ สำหรับเปิดค้างไว้บนจอทีวี (Kiosk Mode)

## Tech Stack
- **Backend:** Python (FastAPI/Flask), Pandas, OpenPyXL, Microsoft Graph API
- **Frontend:** React + Vite, ApexCharts, TailwindCSS
- **Containerization:** Docker & Docker Compose
- **Target Display:** จอทีวี Smart TV (ต้องรองรับ Auto-Refresh ทุกๆ 5 นาที)

## สภาพแวดล้อมเฉพาะ (Hardware/Environment Details)
- พอร์ตเฉพาะของอุปกรณ์/ฮาร์ดแวร์ (ถ้ามี): `/dev/ttyAMA0` 
*(ระบุเผื่อไว้กรณีที่โปรเจกต์นี้ต้องเชื่อมต่อกับบอร์ดควบคุมหรืออุปกรณ์อื่นในอนาคต)*
