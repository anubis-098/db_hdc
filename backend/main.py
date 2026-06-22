from fastapi import FastAPI, BackgroundTasks, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel
from sharepoint import download_excel_from_link, get_excel_sheet_names_from_source, get_source_info, read_excel_sheet_from_source
from processor import (
    OUTBOUND_1PX_SHEET_NAME,
    INBOUND_PUTAWAY_SHEET_NAME,
    INBOUND_SHEET_NAME,
    PICK_SHEET_NAME,
    OUTBOUND_SHEET_NAME,
    parse_inbound_progress_sheet,
    parse_inbound_putaway_sheet,
    parse_outbound_1px_sheet,
    parse_outbound_hle_sheet,
    parse_pick_progress_sheet,
    process_data,
    generate_mock_data,
    merge_multiple_dfs,
)
import os
import json
import re
from pathlib import Path
from datetime import datetime
import uuid

app = FastAPI(title="DB-HDC Backend API")

# สร้าง Unique ID ทุกครั้งที่รัน Backend ใหม่
SYSTEM_ID = str(uuid.uuid4())

# รับค่าเป็น Comma Separated URLs (เช่น url1,url2,url3)
EXCEL_URLS = os.getenv("EXCEL_URLS", "")
USE_MOCK = os.getenv("USE_MOCK", "false").lower() == "true"
SETTINGS_PATH = Path(os.getenv("SETTINGS_PATH", "data_sources.json"))
UPLOAD_ROOT = Path(os.getenv("UPLOAD_ROOT", "/uploads"))
DEFAULT_DATA_SOURCES = {
    "inbound": os.getenv("INBOUND_SOURCE", "example/Inbound.xlsx"),
    "pick": os.getenv("PICK_SOURCE", "example/HLE-13-06-26.xlsx"),
    "outbound": os.getenv("OUTBOUND_SOURCE", "example/Dispatch Report.xlsx"),
}
SOURCE_FILE_NAMES = {
    "inbound": "Inbound.xlsx",
    "pick": "Pick.xlsx",
    "outbound": "Outbound.xlsx",
}

class DataSourceSettings(BaseModel):
    inbound: str = ""
    pick: str = ""
    outbound: str = ""

class ActiveUploadClient(BaseModel):
    client_id: str

# Cache แบบง่าย
cached_data = {"status": "waiting", "data": [], "system_id": SYSTEM_ID}

def load_data_sources() -> dict:
    if not SETTINGS_PATH.exists():
        return DEFAULT_DATA_SOURCES.copy()

    try:
        with SETTINGS_PATH.open("r", encoding="utf-8") as file:
            data = json.load(file)
        return {
            "inbound": str(data.get("inbound") or DEFAULT_DATA_SOURCES["inbound"]).strip(),
            "pick": str(data.get("pick") or DEFAULT_DATA_SOURCES["pick"]).strip(),
            "outbound": str(data.get("outbound") or DEFAULT_DATA_SOURCES["outbound"]).strip(),
        }
    except (OSError, json.JSONDecodeError):
        return DEFAULT_DATA_SOURCES.copy()

def save_data_sources(settings: DataSourceSettings) -> dict:
    data = settings.dict()
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with SETTINGS_PATH.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
    return data

def normalize_client_id(client_id: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9_-]+", "-", client_id.strip()).strip("-").lower()
    if not normalized:
        raise HTTPException(status_code=400, detail="client_id is required")
    if len(normalized) > 64:
        raise HTTPException(status_code=400, detail="client_id is too long")
    return normalized

def get_upload_client_dir(client_id: str) -> Path:
    safe_client_id = normalize_client_id(client_id)
    return UPLOAD_ROOT / safe_client_id

def get_upload_client_sources(client_id: str) -> dict:
    client_dir = get_upload_client_dir(client_id)
    return {
        key: str(client_dir / filename)
        for key, filename in SOURCE_FILE_NAMES.items()
    }

def set_active_upload_client(client_id: str) -> dict:
    sources = get_upload_client_sources(client_id)
    save_data_sources(DataSourceSettings(**sources))
    return sources

def get_file_info(path: Path) -> dict:
    if not path.exists() or not path.is_file():
        return {"exists": False}
    stat = path.stat()
    return {
        "exists": True,
        "size": stat.st_size,
        "modified_at": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
    }

def list_upload_clients() -> list[dict]:
    if not UPLOAD_ROOT.exists():
        return []

    clients = []
    for client_dir in sorted(path for path in UPLOAD_ROOT.iterdir() if path.is_dir()):
        clients.append({
            "client_id": client_dir.name,
            "files": {
                key: get_file_info(client_dir / filename)
                for key, filename in SOURCE_FILE_NAMES.items()
            },
        })
    return clients

def empty_dashboard_data() -> dict:
    return {
        "inbound": {
            "chart": [],
            "table": [],
            "summary_list": [],
            "total": None,
            "last_update": "",
            "pages": [],
        },
        "pick": {
            "chart": {"completed": 0, "pending": 0, "plan": 0},
            "table": [],
            "size_summary": [],
        },
        "outbound": {
            "chart": [],
            "table": [],
            "plan_rows": [],
            "summary": [],
            "pages": [],
        },
        "summary": {
            "total_records": 0,
            "total_value": 0,
            "active_sources": 0,
        },
        "system_id": SYSTEM_ID,
    }

def update_cache():
    global cached_data

    data_sources = load_data_sources()
    has_configured_source = any(data_sources.values())

    if USE_MOCK and not has_configured_source:
        mock_res = generate_mock_data()
        cached_data = {
            "status": "success", 
            "mode": "mock", 
            "data": mock_res,
            "system_id": SYSTEM_ID,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        return

    if has_configured_source:
        dashboard_data = empty_dashboard_data()
        source_errors = {}
        source_status = {}

        for source_key, source_value in data_sources.items():
            if not source_value:
                continue

            try:
                source_status[source_key] = {
                    "status": "available",
                    "sheets": get_excel_sheet_names_from_source(source_value),
                    "source_info": get_source_info(source_value),
                }
            except Exception as exc:
                source_errors[source_key] = str(exc)
                source_status[source_key] = {
                    "status": "error",
                    "message": str(exc),
                    "source_info": get_source_info(source_value),
                }

        if data_sources["inbound"]:
            try:
                inbound_df = read_excel_sheet_from_source(data_sources["inbound"], INBOUND_SHEET_NAME, header=None)
                inbound_receive = parse_inbound_progress_sheet(inbound_df)
                dashboard_data["inbound"].update(inbound_receive)

                inbound_putaway_df = read_excel_sheet_from_source(data_sources["inbound"], INBOUND_PUTAWAY_SHEET_NAME, header=None)
                inbound_putaway = parse_inbound_putaway_sheet(inbound_putaway_df)
                dashboard_data["inbound"]["pages"] = [
                    inbound_receive["pages"][0],
                    inbound_putaway["page"],
                ]
                source_status.setdefault("inbound", {})["mapped"] = True
                source_status.setdefault("inbound", {})["mapped_sheets"] = [INBOUND_SHEET_NAME, INBOUND_PUTAWAY_SHEET_NAME]
            except Exception as exc:
                source_errors["inbound"] = str(exc)
                source_status["inbound"] = {
                    "status": "error",
                    "message": str(exc),
                }

        if data_sources["pick"]:
            try:
                pick_df = read_excel_sheet_from_source(data_sources["pick"], PICK_SHEET_NAME, header=None)
                dashboard_data["pick"].update(parse_pick_progress_sheet(pick_df))
                source_status.setdefault("pick", {})["mapped"] = True
            except Exception as exc:
                source_errors["pick"] = str(exc)
                source_status["pick"] = {
                    "status": "error",
                    "message": str(exc),
                }

        if data_sources["outbound"]:
            try:
                outbound_df = read_excel_sheet_from_source(data_sources["outbound"], OUTBOUND_SHEET_NAME, header=None)
                outbound_hle = parse_outbound_hle_sheet(outbound_df)
                dashboard_data["outbound"].update(outbound_hle)
                dashboard_data["outbound"]["pages"] = [outbound_hle["page"]]

                outbound_1px_df = read_excel_sheet_from_source(data_sources["outbound"], OUTBOUND_1PX_SHEET_NAME, header=None)
                outbound_1px = parse_outbound_1px_sheet(outbound_1px_df)
                dashboard_data["outbound"]["pages"].append(outbound_1px["page"])
                source_status.setdefault("outbound", {})["mapped"] = True
                source_status.setdefault("outbound", {})["mapped_sheets"] = [OUTBOUND_SHEET_NAME, OUTBOUND_1PX_SHEET_NAME]
            except Exception as exc:
                source_errors["outbound"] = str(exc)
                source_status["outbound"] = {
                    "status": "error",
                    "message": str(exc),
                }

        cached_data = {
            "status": "success" if not source_errors else "partial_success",
            "mode": "configured_sources",
            "data": dashboard_data,
            "data_sources": data_sources,
            "source_status": source_status,
            "source_errors": source_errors,
            "system_id": SYSTEM_ID,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        return

    if not EXCEL_URLS:
        cached_data = {"status": "error", "message": "No EXCEL_URLS provided and USE_MOCK is false", "system_id": SYSTEM_ID}
        return

    urls = [url.strip() for url in EXCEL_URLS.split(",") if url.strip()]
    df_list = []

    for url in urls:
        df = download_excel_from_link(url)
        if not df.empty:
            df_list.append(df)

    if df_list:
        combined_df = merge_multiple_dfs(df_list)
        processed_json = process_data(combined_df)
        cached_data = {
            "status": "success", 
            "mode": "live", 
            "data": processed_json,
            "system_id": SYSTEM_ID,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
    else:
        cached_data = {"status": "error", "message": "Failed to fetch or process any data", "system_id": SYSTEM_ID}

@app.on_event("startup")
async def startup_event():
    # ดึงข้อมูลทันทีที่สตาร์ทระบบ
    update_cache()

@app.get("/")
def read_root():
    return {"message": "DB-HDC API is running", "mode": "Shared Link"}

@app.get("/data")
def get_data(response: Response):
    # ทุกครั้งที่มีคนเรียก หรือตั้งเวลา เราสามารถสั่งให้ update cache ใน background ได้
    # background_tasks.add_task(update_cache) 
    update_cache()
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return cached_data

@app.get("/settings/data-sources")
def get_data_sources():
    return {"status": "success", "data": load_data_sources()}

@app.post("/settings/data-sources")
def set_data_sources(settings: DataSourceSettings):
    data = save_data_sources(settings)
    update_cache()
    return {"status": "success", "data": data}

@app.get("/settings/upload-clients")
def get_upload_clients():
    active_sources = load_data_sources()
    active_client = ""
    upload_root_text = str(UPLOAD_ROOT)

    for source in active_sources.values():
        try:
            source_path = Path(source)
            if UPLOAD_ROOT in source_path.parents:
                active_client = source_path.relative_to(UPLOAD_ROOT).parts[0]
                break
        except (ValueError, IndexError):
            continue

    return {
        "status": "success",
        "upload_root": upload_root_text,
        "active_client": active_client,
        "clients": list_upload_clients(),
    }

@app.post("/settings/upload-client")
def set_upload_client(payload: ActiveUploadClient):
    sources = set_active_upload_client(payload.client_id)
    update_cache()
    return {
        "status": "success",
        "client_id": normalize_client_id(payload.client_id),
        "data_sources": sources,
        "clients": list_upload_clients(),
    }

@app.post("/upload/{source_key}")
async def upload_excel_source(source_key: str, client_id: str = Form(...), file: UploadFile = File(...)):
    source_key = source_key.lower().strip()
    if source_key not in SOURCE_FILE_NAMES:
        raise HTTPException(status_code=400, detail="source_key must be inbound, pick, or outbound")

    filename = file.filename or ""
    if not filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are supported")

    client_dir = get_upload_client_dir(client_id)
    client_dir.mkdir(parents=True, exist_ok=True)
    target_path = client_dir / SOURCE_FILE_NAMES[source_key]
    temp_path = target_path.with_suffix(".xlsx.tmp")

    total_size = 0
    max_size = 50 * 1024 * 1024
    try:
        with temp_path.open("wb") as output:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > max_size:
                    raise HTTPException(status_code=413, detail="File is larger than 50MB")
                output.write(chunk)

        temp_path.replace(target_path)
    finally:
        await file.close()
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)

    sources = set_active_upload_client(client_id)
    update_cache()
    return {
        "status": "success",
        "client_id": normalize_client_id(client_id),
        "source_key": source_key,
        "filename": target_path.name,
        "file_info": get_file_info(target_path),
        "data_sources": sources,
        "clients": list_upload_clients(),
    }

@app.post("/refresh")
def refresh_data(background_tasks: BackgroundTasks):
    background_tasks.add_task(update_cache)
    return {"message": "Refresh task started in background"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
