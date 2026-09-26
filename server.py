#!/usr/bin/env python3
"""Static file server for the drum-notation app, plus a tiny JSON/text API
for managing practice-routine .txt files under ./routines/.

Usage:
    python3 server.py                    # http://127.0.0.1:8000, local only
    python3 server.py --port 8080
    python3 server.py --bind 0.0.0.0     # reachable from other devices on
                                          # your LAN (e.g. a tablet) -- there
                                          # is no authentication, so anyone on
                                          # the network could overwrite your
                                          # routine files; only do this on a
                                          # network you trust.

API:
    GET  /api/routines          -> JSON array of routine filenames
    GET  /api/routines/<name>   -> raw text content of that file
    POST /api/routines/<name>   -> request body replaces that file's content
                                    (name must already exist as a .txt file
                                    in routines/ -- create new ones by just
                                    adding a .txt file to that folder)

    GET  /api/books?dir=<relpath>
                                -> JSON {"folders": [...], "files": [...]}
                                   listing that subfolder of books/ (top
                                   level if dir is omitted); folders can be
                                   nested arbitrarily deep, PDFs can live at
                                   any level
    GET  /api/books/<relpath>  -> raw PDF bytes of that file, e.g.
                                   /api/books/Method Books/stick_control.pdf
                                   (read-only -- drop PDFs into books/
                                   yourself; there's no save endpoint)
"""

import argparse
import json
import os
import re
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROUTINES_DIR = os.path.join(SCRIPT_DIR, "routines")
ROUTINES_PREFIX = "/api/routines/"
BOOKS_DIR = os.path.join(SCRIPT_DIR, "books")
BOOKS_PREFIX = "/api/books/"
PDF_MAGIC = b"%PDF-"

# Deliberately strict: letters, digits, dot, underscore, hyphen, must end in
# .txt. No slashes, no "..", so a crafted name can never escape ROUTINES_DIR.
VALID_NAME = re.compile(r"^[A-Za-z0-9._-]+\.txt$")


def safe_path(base_dir, name, valid_name_re):
    if not valid_name_re.match(name):
        return None
    candidate = os.path.realpath(os.path.join(base_dir, name))
    root = os.path.realpath(base_dir) + os.sep
    if not candidate.startswith(root):
        return None
    return candidate


def safe_routine_path(name):
    return safe_path(ROUTINES_DIR, name, VALID_NAME)


# books/ supports arbitrary nested folders, so it needs real
# "/"-separated relative-path resolution rather than the flat filename
# regex routines/ uses. Each segment is checked individually -- "..", ".", a
# literal backslash, or a null byte anywhere rejects the whole path -- and
# the final resolved path must still land inside BOOKS_DIR, so a crafted
# path can never escape it even if some segment check is fooled.
def safe_books_relpath(rel_path):
    parts = [p for p in (rel_path or "").split("/") if p != ""]
    for part in parts:
        if part in (".", "..") or "\\" in part or "\x00" in part:
            return None
    root = os.path.realpath(BOOKS_DIR)
    candidate = os.path.realpath(os.path.join(root, *parts)) if parts else root
    if candidate != root and not candidate.startswith(root + os.sep):
        return None
    return candidate


# Identifies books by content (the standard %PDF-x.y magic bytes at the
# very start of the file) rather than by ".pdf" extension -- so renaming a
# file to drop the extension (e.g. for a cleaner name in the dropdown)
# doesn't make it disappear from the listing.
def is_pdf_file(abspath):
    try:
        with open(abspath, "rb") as fh:
            return fh.read(len(PDF_MAGIC)) == PDF_MAGIC
    except OSError:
        return False


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/routines":
            os.makedirs(ROUTINES_DIR, exist_ok=True)
            names = sorted(f for f in os.listdir(ROUTINES_DIR) if f.endswith(".txt"))
            self._send_json(names)
            return

        if self.path.startswith(ROUTINES_PREFIX):
            name = self.path[len(ROUTINES_PREFIX):]
            path = safe_routine_path(name)
            if not path or not os.path.isfile(path):
                self.send_error(404, "Routine not found")
                return
            with open(path, "r", encoding="utf-8") as fh:
                content = fh.read()
            self._send_text(content)
            return

        parsed = urllib.parse.urlsplit(self.path)

        if parsed.path == "/api/books":
            os.makedirs(BOOKS_DIR, exist_ok=True)
            rel_dir = urllib.parse.parse_qs(parsed.query).get("dir", [""])[0]
            dir_path = safe_books_relpath(rel_dir)
            if not dir_path or not os.path.isdir(dir_path):
                self.send_error(404, "Folder not found")
                return
            entries = os.listdir(dir_path)
            folders = sorted(
                e for e in entries
                if not e.startswith(".") and os.path.isdir(os.path.join(dir_path, e))
            )
            files = sorted(
                e for e in entries
                if not e.startswith(".") and is_pdf_file(os.path.join(dir_path, e))
            )
            self._send_json({"folders": folders, "files": files})
            return

        if self.path.startswith(BOOKS_PREFIX):
            raw = urllib.parse.unquote(self.path[len(BOOKS_PREFIX):])
            path = safe_books_relpath(raw)
            if not path or not is_pdf_file(path):
                self.send_error(404, "Book not found")
                return
            with open(path, "rb") as fh:
                content = fh.read()
            self._send_binary(content, "application/pdf")
            return

        super().do_GET()

    def do_POST(self):
        if self.path.startswith(ROUTINES_PREFIX):
            name = self.path[len(ROUTINES_PREFIX):]
            path = safe_routine_path(name)
            if not path:
                self.send_error(400, "Invalid routine name")
                return
            if not os.path.isfile(path):
                self.send_error(404, "Routine not found (create it as a .txt file in routines/ first)")
                return

            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(body)
            self._send_json({"ok": True})
            return

        self.send_error(404)

    # Every API response is generated fresh from disk on each request (e.g.
    # /api/books re-lists the folder, doesn't cache it), so nothing here
    # should ever be served from a cached copy either -- otherwise a browser
    # can keep showing a stale books/ listing or a stale PDF (by URL) after
    # you've added/renamed/replaced files on disk, surviving even a hard
    # refresh since these are fetch()/iframe subresource loads, not the
    # top-level navigation a hard refresh forces revalidation for.
    NO_STORE = "no-store, must-revalidate"

    def _send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", self.NO_STORE)
        self.end_headers()
        self.wfile.write(body)

    def _send_text(self, text):
        body = text.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", self.NO_STORE)
        self.end_headers()
        self.wfile.write(body)

    def _send_binary(self, body, content_type):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", self.NO_STORE)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass  # quiet by default; comment out to see each request while debugging


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--bind", default="127.0.0.1")
    args = parser.parse_args()

    os.chdir(SCRIPT_DIR)
    os.makedirs(ROUTINES_DIR, exist_ok=True)
    os.makedirs(BOOKS_DIR, exist_ok=True)

    server = ThreadingHTTPServer((args.bind, args.port), Handler)
    print("Serving http://{}:{}  (Ctrl+C to stop)".format(args.bind, args.port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
