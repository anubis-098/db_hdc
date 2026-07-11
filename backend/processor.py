import pandas as pd
import random
import uuid
from datetime import datetime, timedelta

INBOUND_SHEET_NAME = "inbound"
INBOUND_PUTAWAY_SHEET_NAME = "put 15"
PICK_SHEET_NAME = "Resuft"
OUTBOUND_SHEET_NAME = "HLE"
OUTBOUND_1PX_SHEET_NAME = "1 PX"
OUTBOUND_SUMMARY_SHEET_NAME = "Summary"

def _to_int(value) -> int:
    if pd.isna(value):
        return 0
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0

def _to_text(value) -> str:
    if pd.isna(value):
        return ""
    text = str(value).strip()
    return "" if text == "\xa0" else text

def parse_inbound_progress_sheet(df: pd.DataFrame) -> dict:
    """
    Parse sheet 'Inbound Progress อันใหม่'.

    Expected layout:
    - Row 1: title/date
    - Row 2: headers
    - Rows 3-7: detail rows
    - Row 8: TOTAL row
    """
    if df.empty or len(df.index) < 2:
        return {"summary_list": [], "total": None, "last_update": None}

    last_update_value = df.iat[0, 6] if df.shape[1] > 6 else None
    if pd.isna(last_update_value):
        last_update = ""
    elif isinstance(last_update_value, (int, float)):
        last_update = (datetime(1899, 12, 30) + timedelta(days=float(last_update_value))).strftime("%Y-%m-%d %H:%M:%S")
    else:
        last_update = _to_text(last_update_value)

    rows = []
    total_row = None

    for row_idx in range(2, len(df.index)):
        row = df.iloc[row_idx]
        wh = _to_text(row.iloc[0]) if len(row) > 0 else ""
        bu = _to_text(row.iloc[1]) if len(row) > 1 else ""

        if not wh and not bu:
            continue

        item = {
            "wh": wh,
            "bu": bu,
            "total_po": _to_int(row.iloc[2]) if len(row) > 2 else 0,
            "gr_complete": _to_int(row.iloc[3]) if len(row) > 3 else 0,
            "gr_in_progress": _to_int(row.iloc[4]) if len(row) > 4 else 0,
            "not_started": _to_int(row.iloc[5]) if len(row) > 5 else 0,
            "expected_qty": _to_int(row.iloc[6]) if len(row) > 6 else 0,
            "received_qty": _to_int(row.iloc[7]) if len(row) > 7 else 0,
            "pending_qty": _to_int(row.iloc[8]) if len(row) > 8 else 0,
            "remark": _to_text(row.iloc[9]) if len(row) > 9 else "",
        }

        if wh.upper() == "TOTAL":
            item["is_total"] = True
            total_row = item
            break

        rows.append(item)

    if total_row is None and rows:
        total_row = {
            "wh": "TOTAL",
            "bu": "",
            "total_po": sum(row["total_po"] for row in rows),
            "gr_complete": sum(row["gr_complete"] for row in rows),
            "gr_in_progress": sum(row["gr_in_progress"] for row in rows),
            "not_started": sum(row["not_started"] for row in rows),
            "expected_qty": sum(row["expected_qty"] for row in rows),
            "received_qty": sum(row["received_qty"] for row in rows),
            "pending_qty": sum(row["pending_qty"] for row in rows),
            "remark": "",
            "is_total": True,
        }

    page = {
        "key": "receive",
        "title": "Receive",
        "type": "receive",
        "summary_list": rows,
        "total": total_row,
        "last_update": last_update,
    }

    return {
        "summary_list": rows,
        "total": total_row,
        "last_update": last_update,
        "pages": [page],
    }

def parse_inbound_putaway_sheet(df: pd.DataFrame) -> dict:
    """
    Parse Inbound putaway sheet, e.g. 'put 15'.

    Expected layout:
    - Row 1: title / update time
    - Row 3: WH, BU, Backlog, New Receipt, Workload, Putaway, Balance, Progress %
    - Rows 4+: detail rows until TOTAL
    """
    if df.empty or len(df.index) < 3:
        return {"page": {"key": "putaway", "title": "Putaway", "type": "putaway", "rows": [], "total": None, "last_update": ""}}

    last_update_value = df.iat[0, 5] if df.shape[1] > 5 else None
    if pd.isna(last_update_value):
        last_update = ""
    elif isinstance(last_update_value, (int, float)):
        last_update = (datetime(1899, 12, 30) + timedelta(days=float(last_update_value))).strftime("%Y-%m-%d %H:%M:%S")
    else:
        last_update = _to_text(last_update_value)

    rows = []
    total_row = None

    for row_idx in range(3, len(df.index)):
        row = df.iloc[row_idx]
        wh = _to_text(row.iloc[0]) if len(row) > 0 else ""
        bu = _to_text(row.iloc[1]) if len(row) > 1 else ""

        if not wh and not bu:
            continue

        item = {
            "wh": wh,
            "bu": bu,
            "backlog": _to_int(row.iloc[2]) if len(row) > 2 else 0,
            "new_receipt": _to_int(row.iloc[3]) if len(row) > 3 else 0,
            "workload": _to_int(row.iloc[4]) if len(row) > 4 else 0,
            "putaway": _to_int(row.iloc[5]) if len(row) > 5 else 0,
            "balance": _to_int(row.iloc[6]) if len(row) > 6 else 0,
            "progress": float(row.iloc[7]) if len(row) > 7 and not pd.isna(row.iloc[7]) else 0,
        }

        if wh.upper() == "TOTAL":
            item["is_total"] = True
            total_row = item
            break

        rows.append(item)

    if total_row is None and rows:
        workload = sum(row["workload"] for row in rows)
        putaway = sum(row["putaway"] for row in rows)
        total_row = {
            "wh": "TOTAL",
            "bu": "",
            "backlog": sum(row["backlog"] for row in rows),
            "new_receipt": sum(row["new_receipt"] for row in rows),
            "workload": workload,
            "putaway": putaway,
            "balance": sum(row["balance"] for row in rows),
            "progress": putaway / workload if workload > 0 else 0,
            "is_total": True,
        }

    return {
        "page": {
            "key": "putaway",
            "title": "Putaway",
            "type": "putaway",
            "rows": rows,
            "total": total_row,
            "last_update": last_update,
        }
    }

def _format_excel_date(value) -> str:
    if pd.isna(value):
        return ""
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y")
    try:
        return (datetime(1899, 12, 30) + timedelta(days=float(value))).strftime("%d/%m/%Y")
    except (TypeError, ValueError):
        return str(value).strip()

def parse_pick_progress_sheet(df: pd.DataFrame) -> dict:
    """
    Parse HLE pick progress sheet 'Resuft'.

    Expected layout:
    - B3:F3: Group, Loading date2, Group HDC, Status, Sum of Total MU
    - H14:K22: Product size HLE summary
    """
    rows = []
    current_group = ""
    current_loading_date = ""
    current_group_hdc = ""

    for row_idx in range(3, len(df.index)):
        row = df.iloc[row_idx]
        group = _to_text(row.iloc[1]) if len(row) > 1 else ""
        loading_date = _format_excel_date(row.iloc[2]) if len(row) > 2 else ""
        group_hdc = _to_text(row.iloc[3]) if len(row) > 3 else ""
        status = _to_text(row.iloc[4]) if len(row) > 4 else ""
        total_mu = _to_int(row.iloc[5]) if len(row) > 5 else 0

        if group.lower() == "grand total":
            break

        if group:
            current_group = group
        if loading_date:
            current_loading_date = loading_date
        if group_hdc:
            current_group_hdc = group_hdc

        if status not in {"Completed", "Pending"}:
            continue

        rows.append({
            "group": current_group,
            "loading_date": current_loading_date,
            "group_hdc": current_group_hdc,
            "status": status,
            "sum_total_mu": total_mu,
        })

    completed = sum(row["sum_total_mu"] for row in rows if row["status"] == "Completed")
    pending = sum(row["sum_total_mu"] for row in rows if row["status"] == "Pending")
    plan = completed + pending

    size_summary = []
    for row_idx in range(13, len(df.index)):
        row = df.iloc[row_idx]
        size = _to_text(row.iloc[7]) if len(row) > 7 else ""
        picked = _to_text(row.iloc[8]) if len(row) > 8 else ""
        total_mu = _to_int(row.iloc[9]) if len(row) > 9 else 0
        total_mu2 = row.iloc[10] if len(row) > 10 else 0

        if not size:
            continue
        if "total" in size.lower():
            continue
        if picked not in {"Completed", "Pending"}:
            continue

        try:
            total_mu2_value = float(total_mu2)
        except (TypeError, ValueError):
            total_mu2_value = 0

        size_summary.append({
            "size": size,
            "picked": picked,
            "totalMu": total_mu,
            "percent": total_mu2_value,
        })

    return {
        "chart": {
            "completed": completed,
            "pending": pending,
            "plan": plan,
        },
        "table": rows,
        "size_summary": size_summary,
    }

def _build_outbound_summary(rows: list[dict]) -> list[dict]:
    actual_order = {
        "label": "Actual Order",
        "total": sum(row["planLoadDo"] for row in rows),
        "pending": sum(row["pendingDo"] for row in rows),
        "completed": sum(row["completedDo"] for row in rows),
    }
    receive = {
        "label": "Receive",
        "total": sum(row["pendingMu"] + row["completedMu"] for row in rows),
        "pending": sum(row["pendingMu"] for row in rows),
        "completed": sum(row["completedMu"] for row in rows),
    }
    return [actual_order, receive]

def parse_outbound_summary_sheet(df: pd.DataFrame) -> dict:
    """Parse the consolidated outbound table from the ``Summary`` sheet (C:I)."""
    rows = []
    start_row = None

    for row_idx in range(len(df.index)):
        row = df.iloc[row_idx]
        if _to_text(row.iloc[2]) == "Group HDC" and _to_text(row.iloc[3]) == "DO":
            start_row = row_idx + 1
            break

    if start_row is None:
        raise ValueError("Summary sheet does not contain the Group HDC outbound table")

    for row_idx in range(start_row, len(df.index)):
        row = df.iloc[row_idx]
        group_name = _to_text(row.iloc[2]) if len(row) > 2 else ""
        if not group_name:
            if rows:
                break
            continue
        if group_name.lower() == "total":
            break

        rows.append({
            "site": "HDC",
            "planLoad": group_name,
            "planLoadDo": _to_int(row.iloc[3]) if len(row) > 3 else 0,
            "pendingDo": _to_int(row.iloc[5]) if len(row) > 5 else 0,
            "pendingMu": _to_int(row.iloc[6]) if len(row) > 6 else 0,
            "completedDo": _to_int(row.iloc[7]) if len(row) > 7 else 0,
            "completedMu": _to_int(row.iloc[8]) if len(row) > 8 else 0,
        })

    if not rows:
        raise ValueError("Summary sheet outbound table has no data rows")

    summary = _build_outbound_summary(rows)
    return {
        "plan_rows": rows,
        "summary": summary,
        "page": {
            "key": "summary",
            "title": "Summary",
            "plan_rows": rows,
            "summary": summary,
        },
    }

def parse_outbound_hle_sheet(df: pd.DataFrame) -> dict:
    """
    Parse Dispatch Report sheet 'HLE'.

    Expected summary table layout:
    - M:S, rows 8-18
    - M: Type/Site, N: Plan Load, O: Plan Load DO
    - P/Q: Pending DO/MU, R/S: Completed DO/MU
    """
    rows = []
    current_type = ""

    for row_idx in range(7, len(df.index)):
        row = df.iloc[row_idx]
        site = _to_text(row.iloc[12]) if len(row) > 12 else ""
        plan_load = _to_text(row.iloc[13]) if len(row) > 13 else ""

        if site:
            current_type = site

        if plan_load.startswith("•") or "outbound progress" in plan_load.lower():
            break

        if plan_load.startswith("•"):
            break
        if not plan_load:
            continue

        item = {
            "site": current_type,
            "planLoad": plan_load,
            "planLoadDo": _to_int(row.iloc[14]) if len(row) > 14 else 0,
            "pendingDo": _to_int(row.iloc[15]) if len(row) > 15 else 0,
            "pendingMu": _to_int(row.iloc[16]) if len(row) > 16 else 0,
            "completedDo": _to_int(row.iloc[17]) if len(row) > 17 else 0,
            "completedMu": _to_int(row.iloc[18]) if len(row) > 18 else 0,
        }
        rows.append(item)

    summary = _build_outbound_summary(rows)

    return {
        "plan_rows": rows,
        "summary": summary,
        "page": {
            "key": "hle",
            "title": "HLE",
            "plan_rows": rows,
            "summary": summary,
        },
    }

def parse_outbound_1px_sheet(df: pd.DataFrame) -> dict:
    """
    Parse Dispatch Report sheet '1 PX'.

    Expected summary table layout:
    - M:R
    - M: Plan Load, N: Plan Load DO
    - O/P: Pending DO/MU, Q/R: Completed DO/MU
    """
    rows = []
    start_row = 6

    for row_idx in range(len(df.index)):
        row = df.iloc[row_idx]
        first_cell = _to_text(row.iloc[12]) if len(row) > 12 else ""
        if first_cell == "Plan Load":
            start_row = row_idx + 2
            break

    for row_idx in range(start_row, len(df.index)):
        row = df.iloc[row_idx]
        plan_load = _to_text(row.iloc[12]) if len(row) > 12 else ""

        if plan_load.startswith("•") or plan_load.startswith("โ€ข") or "outbound progress" in plan_load.lower():
            break
        if not plan_load:
            if rows:
                break
            continue

        rows.append({
            "site": "1PX",
            "planLoad": plan_load,
            "planLoadDo": _to_int(row.iloc[13]) if len(row) > 13 else 0,
            "pendingDo": _to_int(row.iloc[14]) if len(row) > 14 else 0,
            "pendingMu": _to_int(row.iloc[15]) if len(row) > 15 else 0,
            "completedDo": _to_int(row.iloc[16]) if len(row) > 16 else 0,
            "completedMu": _to_int(row.iloc[17]) if len(row) > 17 else 0,
        })

    summary = _build_outbound_summary(rows)

    return {
        "plan_rows": rows,
        "summary": summary,
        "page": {
            "key": "1px",
            "title": "1PX",
            "plan_rows": rows,
            "summary": summary,
        },
    }

def generate_mock_data() -> dict:
    """
    Generate rich fake data for Inbound, Pick, and Outbound tables.
    """
    return {
        "inbound": {
            "chart": [],
            "table": [],
            "summary_list": [],
            "total": None,
            "last_update": "",
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
        "system_id": str(uuid.uuid4()),
    }

    # 1. Inbound (Chart + Table)
    inbound_summary_list = [
        { "wh": "894", "bu": "1PX", "total_po": 0, "gr_complete": 0, "gr_in_progress": 0, "not_started": 0, "expected_qty": 0, "received_qty": 0, "pending_qty": 0, "remark": "" },
        { "wh": "894", "bu": "HLE", "total_po": 8, "gr_complete": 8, "gr_in_progress": 0, "not_started": 0, "expected_qty": 2223, "received_qty": 2023, "pending_qty": 200, "remark": "ตัดDA=10CS , Not Inv=190CS" },
        { "wh": "894", "bu": "Donation", "total_po": 0, "gr_complete": 0, "gr_in_progress": 0, "not_started": 0, "expected_qty": 0, "received_qty": 0, "pending_qty": 0, "remark": "" },
        { "wh": "895", "bu": "Export - KH", "total_po": 12, "gr_complete": 12, "gr_in_progress": 0, "not_started": 0, "expected_qty": 883, "received_qty": 883, "pending_qty": 0, "remark": "" },
        { "wh": "895", "bu": "Export - CN", "total_po": 0, "gr_complete": 0, "gr_in_progress": 0, "not_started": 0, "expected_qty": 0, "received_qty": 0, "pending_qty": 0, "remark": "" },
    ]
    inbound_total = {
        "wh": "TOTAL",
        "bu": "",
        "total_po": sum(row["total_po"] for row in inbound_summary_list),
        "gr_complete": sum(row["gr_complete"] for row in inbound_summary_list),
        "gr_in_progress": sum(row["gr_in_progress"] for row in inbound_summary_list),
        "not_started": sum(row["not_started"] for row in inbound_summary_list),
        "expected_qty": sum(row["expected_qty"] for row in inbound_summary_list),
        "received_qty": sum(row["received_qty"] for row in inbound_summary_list),
        "pending_qty": sum(row["pending_qty"] for row in inbound_summary_list),
        "remark": "",
        "is_total": True,
    }
    inbound_chart = [
        {"name": "GR Complete", "value": inbound_total["gr_complete"]},
        {"name": "GR In Progress", "value": inbound_total["gr_in_progress"]},
        {"name": "Not Started", "value": inbound_total["not_started"]},
    ]
    inbound_table = []
    suppliers = ["CJ Logistics", "ABC Global", "TH Express", "Fast Cargo"]
    for i in range(5):
        inbound_table.append({
            "date": (datetime.now()).strftime("%d/%m"),
            "po_no": f"PO-{random.randint(10000, 99999)}",
            "supplier": random.choice(suppliers),
            "status": random.choice(["Unloading", "Received", "Finished"])
        })

    # 2. Pick (Chart + Table)
    # Aggregate data for a single horizontal bar chart
    total_completed = random.randint(1500, 2500)
    total_pending = random.randint(300, 800)
    
    pick_chart = {
        "completed": total_completed,
        "pending": total_pending,
        "plan": total_completed + total_pending,
    }
    
    pick_table = []
    hdc_groups = ["HDC-East", "HDC-West", "HDC-South", "HDC-North", "HDC-Main"]
    groups = ["A-01", "B-02", "C-03", "D-04", "E-05"]
    for i in range(5):
        pick_table.append({
            "group": random.choice(groups),
            "loading_date": (datetime.now() + timedelta(days=1)).strftime("%d/%m/%Y"),
            "group_hdc": hdc_groups[i],
            "status": random.choice(["Completed", "Pending"]),
            "sum_total_mu": random.randint(100, 500)
        })

    # 3. Outbound (Progress + Table)
    outbound_chart = [
        {"route": "BKK-North", "progress": random.randint(60, 95), "total": 1000},
        {"route": "BKK-South", "progress": random.randint(40, 85), "total": 850},
        {"route": "Upcountry", "progress": random.randint(20, 70), "total": 1200}
    ]
    outbound_table = []
    couriers = ["Flash", "Kerry", "J&T", "DHL"]
    for i in range(5):
        outbound_table.append({
            "order_id": f"ORD-{random.randint(1000, 9999)}",
            "dest": random.choice(["Bangkok", "Nonthaburi", "Pathum Thani", "Chonburi"]),
            "courier": random.choice(couriers),
            "status": random.choice(["Loading", "Departed", "Pending"])
        })

    return {
        "inbound": {"chart": inbound_chart, "table": inbound_table, "summary_list": inbound_summary_list, "total": inbound_total},
        "pick": {"chart": pick_chart, "table": pick_table},
        "outbound": {"chart": outbound_chart, "table": outbound_table},
        "summary": {
            "total_records": random.randint(1500, 3000),
            "total_value": random.randint(50000, 150000),
            "active_sources": 3
        },
        "system_id": str(uuid.uuid4()) if 'uuid' in globals() else "dev-id"
    }

def merge_multiple_dfs(df_list: list) -> pd.DataFrame:
    """
    Combine multiple DataFrames into one using pandas.concat.
    As per ADR-002.
    """
    if not df_list:
        return pd.DataFrame()
    
    # รวมไฟล์ทั้งหมดเข้าด้วยกัน
    combined_df = pd.concat(df_list, ignore_index=True)
    return combined_df

def process_data(df: pd.DataFrame) -> list:
    """
    Clean and transform the Excel data for the dashboard.
    """
    if df.empty:
        return []
    
    # 1. Basic Cleaning (Example: Remove empty rows/cols)
    df = df.dropna(how='all').reset_index(drop=True)
    
    # 2. Data Transformation (Example: Convert to JSON-friendly format)
    # Add your specific business logic here (e.g., filtering, aggregation)
    
    return df.to_dict(orient='records')
