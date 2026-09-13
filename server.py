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
"""

import argparse
import json
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROUTINES_DIR = os.path.join(SCRIPT_DIR, "routines")
ROUTINES_PREFIX = "/api/routines/"

# Deliberately strict: letters, digits, dot, underscore, hyphen, must end in
# .txt. No slashes, no "..", so a crafted name can never escape ROUTINES_DIR.
VALID_NAME = re.compile(r"^[A-Za-z0-9._-]+\.txt$")


def safe_routine_path(name):
    if not VALID_NAME.match(name):
        return None
    candidate = os.path.realpath(os.path.join(ROUTINES_DIR, name))
    routines_root = os.path.realpath(ROUTINES_DIR) + os.sep
    if not candidate.startswith(routines_root):
        return None
    return candidate


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

    def _send_json(self, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_text(self, text):
        body = text.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
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

    server = ThreadingHTTPServer((args.bind, args.port), Handler)
    print("Serving http://{}:{}  (Ctrl+C to stop)".format(args.bind, args.port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
