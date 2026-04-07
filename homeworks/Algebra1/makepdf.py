from pathlib import Path
import functools
import http.server
import re
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading

from pypdf import PdfWriter


# ============================================================
# MANUAL SETTINGS
# ============================================================

START = "hw_1_1"
END   = "hw_1_rev"

OUTPUT_PDF = "stitched_homework.pdf"

# Increase if JS or MathJax needs more time before printing
VIRTUAL_TIME_BUDGET_MS = 12000

# Repo folder name to detect automatically while climbing upward
REPO_FOLDER_NAME = "math-homework"


# ============================================================
# NAME PARSING
# ============================================================

HTML_RE = re.compile(r"^hw_(\d+)_(\d+|rev)\.html$", re.IGNORECASE)
NAME_RE = re.compile(r"^hw_(\d+)_(\d+|rev)$", re.IGNORECASE)


def parse_range_name(name: str):
    m = NAME_RE.fullmatch(name.strip())
    if not m:
        raise ValueError(f"Invalid range name: {name!r}")

    chapter = int(m.group(1))
    second = m.group(2).lower()
    order = 10**9 if second == "rev" else int(second)
    return (chapter, order)


def parse_html_file(path: Path):
    m = HTML_RE.fullmatch(path.name)
    if not m:
        return None

    chapter = int(m.group(1))
    second = m.group(2).lower()
    order = 10**9 if second == "rev" else int(second)
    return (chapter, order)


def sort_key(path: Path):
    parsed = parse_html_file(path)
    if parsed is None:
        raise ValueError(f"Unexpected filename format: {path.name}")
    return parsed


# ============================================================
# FILE SELECTION
# ============================================================

def get_files_in_range(folder: Path, start_name: str, end_name: str):
    start_key = parse_range_name(start_name)
    end_key = parse_range_name(end_name)

    if start_key > end_key:
        raise ValueError(f"START ({start_name}) comes after END ({end_name}).")

    html_files = []
    for p in folder.iterdir():
        if p.is_file() and p.suffix.lower() == ".html":
            if parse_html_file(p) is not None:
                html_files.append(p)

    html_files.sort(key=sort_key)

    selected = []
    for p in html_files:
        k = sort_key(p)
        if start_key <= k <= end_key:
            selected.append(p)

    return selected


# ============================================================
# REPO / SERVER ROOT DETECTION
# ============================================================

def find_repo_root(start: Path, repo_folder_name: str):
    for p in [start, *start.parents]:
        if p.name.lower() == repo_folder_name.lower():
            return p
    raise FileNotFoundError(
        f"Could not find a parent folder named {repo_folder_name!r} "
        f"starting from {start}"
    )


def relative_url_path(file_path: Path, server_root: Path):
    rel = file_path.resolve().relative_to(server_root.resolve())
    return "/" + rel.as_posix()


# ============================================================
# LOCAL HTTP SERVER
# ============================================================

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def start_http_server(directory: Path):
    handler = functools.partial(QuietHandler, directory=str(directory))

    class ReusableTCPServer(socketserver.TCPServer):
        allow_reuse_address = True

    httpd = ReusableTCPServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]

    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()

    return httpd, port


# ============================================================
# BROWSER DETECTION
# ============================================================

def find_browser():
    candidates = [
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]

    for c in candidates:
        p = Path(c)
        if p.exists():
            return p

    for cmd in ["msedge", "msedge.exe", "chrome", "chrome.exe"]:
        found = shutil.which(cmd)
        if found:
            return Path(found)

    raise FileNotFoundError(
        "Could not find Microsoft Edge or Google Chrome."
    )


# ============================================================
# PDF RENDERING
# ============================================================

def render_url_to_pdf(browser_exe: Path, url: str, pdf_file: Path):
    cmd = [
        str(browser_exe),
        "--headless=new",
        "--disable-gpu",
        "--run-all-compositor-stages-before-draw",
        f"--virtual-time-budget={VIRTUAL_TIME_BUDGET_MS}",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_file}",
        url,
    ]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"Failed while rendering {url}\n\n"
            f"STDOUT:\n{result.stdout}\n\n"
            f"STDERR:\n{result.stderr}"
        )

    if not pdf_file.exists():
        raise RuntimeError(f"Browser did not create expected PDF: {pdf_file}")


def merge_pdfs(pdf_paths, output_path: Path):
    writer = PdfWriter()
    for pdf in pdf_paths:
        writer.append(str(pdf))
    with open(output_path, "wb") as f:
        writer.write(f)


# ============================================================
# MAIN
# ============================================================

def main():
    cwd = Path.cwd()
    browser = find_browser()
    selected = get_files_in_range(cwd, START, END)

    if not selected:
        print("No matching HTML files found in the requested range.")
        sys.exit(1)

    repo_root = find_repo_root(cwd, REPO_FOLDER_NAME)
    server_root = repo_root.parent

    print("Browser:", browser)
    print("Current folder:", cwd)
    print("Repo root:", repo_root)
    print("Server root:", server_root)
    print()
    print("Files to include, in order:")
    for p in selected:
        print("  ", p.name)

    httpd, port = start_http_server(server_root)
    print()
    print(f"Local server started on port {port}")

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir = Path(tmpdir)
            temp_pdfs = []

            for i, html in enumerate(selected, start=1):
                rel_url = relative_url_path(html, server_root)
                url = f"http://127.0.0.1:{port}{rel_url}"
                pdf_part = tmpdir / f"part_{i:03d}.pdf"

                print(f"Rendering {html.name}")
                print("   ", url)

                render_url_to_pdf(browser, url, pdf_part)
                temp_pdfs.append(pdf_part)

            output = cwd / OUTPUT_PDF
            merge_pdfs(temp_pdfs, output)

        print()
        print("Done.")
        print("Output:", output)

    finally:
        httpd.shutdown()
        httpd.server_close()
        print("Local server stopped.")


if __name__ == "__main__":
    main()