from __future__ import annotations

import io
import os
from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime

PROJECT_ROOT = Path(os.getenv("PROJECT_ROOT", "/workspace"))
HOST_DASHBOARD_PATH = os.getenv(
    "HOST_DASHBOARD_PATH",
    "D:/OneDrive/OneDrive - CJWorld/HDC_IT/DashBoard",
).replace("\\", "/").rstrip("/")
CONTAINER_DASHBOARD_PATH = Path(os.getenv("CONTAINER_DASHBOARD_PATH", "/onedrive-dashboard"))

def _is_url(source: str) -> bool:
    return source.startswith(("http://", "https://"))

def _candidate_paths(source: str) -> list[Path]:
    normalized_source = source.replace("\\", "/")
    source_path = Path(normalized_source)
    candidates = [source_path]

    if normalized_source.lower().startswith(HOST_DASHBOARD_PATH.lower()):
        relative_path = normalized_source[len(HOST_DASHBOARD_PATH):].lstrip("/")
        candidates.insert(0, CONTAINER_DASHBOARD_PATH / relative_path)

    if not source_path.is_absolute():
        candidates.extend([
            Path.cwd() / source_path,
            Path.cwd().parent / source_path,
            PROJECT_ROOT / source_path,
        ])

        marker = "DB-HDC/"
        if marker in normalized_source:
            project_relative = normalized_source.split(marker, 1)[1]
            candidates.append(PROJECT_ROOT / project_relative)

    return candidates

def read_excel_bytes_from_source(source: str) -> bytes:
    """
    Read an Excel file from either a local/server-accessible path or an HTTP(S) link.
    """
    source = source.strip()
    if not source:
        raise ValueError("Empty Excel source")

    if _is_url(source):
        import requests

        download_url = source
        if "download=1" not in source:
            separator = "&" if "?" in source else "?"
            download_url = f"{source}{separator}download=1"

        response = requests.get(download_url, timeout=60)
        response.raise_for_status()

        content_type = response.headers.get("content-type", "")
        if "text/html" in content_type.lower():
            raise ValueError("Excel link returned HTML. Check sharing permissions or use a direct download link.")

        return response.content

    for path in _candidate_paths(source):
        if path.exists() and path.is_file():
            return path.read_bytes()

    raise FileNotFoundError(f"Excel source not found: {source}")

def get_source_info(source: str) -> dict:
    source = source.strip()
    if not source:
        return {"type": "empty"}

    if _is_url(source):
        return {"type": "url", "source": source}

    for path in _candidate_paths(source):
        if path.exists() and path.is_file():
            stat = path.stat()
            return {
                "type": "file",
                "path": str(path),
                "size": stat.st_size,
                "modified_at": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
            }

    return {"type": "missing", "source": source}

def read_excel_sheet_from_source(source: str, sheet_name: str, header=0) -> pd.DataFrame:
    import pandas as pd

    content = read_excel_bytes_from_source(source)
    return pd.read_excel(io.BytesIO(content), sheet_name=sheet_name, engine="openpyxl", header=header)

def get_excel_sheet_names_from_source(source: str) -> list[str]:
    content = read_excel_bytes_from_source(source)
    namespace = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

    with zipfile.ZipFile(io.BytesIO(content)) as workbook_zip:
        workbook_root = ET.fromstring(workbook_zip.read("xl/workbook.xml"))

    return [
        sheet.attrib["name"]
        for sheet in workbook_root.findall("m:sheets/m:sheet", namespace)
    ]

def download_excel_from_link(shared_url: str) -> pd.DataFrame:
    """
    Download an Excel file from a SharePoint/OneDrive shared link and return a Pandas DataFrame.
    Note: The URL must be a 'Direct Download' link.
    """
    import pandas as pd

    try:
        # If it's a standard SharePoint sharing link, we might need to append ?download=1
        # or transform it depending on the source.
        # For simple 'Anyone' links, adding ?download=1 often works.
        download_url = shared_url
        if "download=1" not in shared_url:
            separator = "&" if "?" in shared_url else "?"
            download_url = f"{shared_url}{separator}download=1"
        
        import requests
        response = requests.get(download_url)
        response.raise_for_status() # Check for errors
        
        # Read the Excel content into Pandas
        df = pd.read_excel(io.BytesIO(response.content), engine='openpyxl')
        return df
    except Exception as e:
        print(f"Error downloading or reading Excel: {e}")
        return pd.DataFrame()

if __name__ == "__main__":
    # Test block (Replace with a real direct link for testing)
    # SAMPLE_URL = "https://your-sharepoint-link-here?download=1"
    # df = download_excel_from_link(SAMPLE_URL)
    # print(df.head())
    pass
