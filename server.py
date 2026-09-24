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

    GET  /api/sheetmusic?dir=<relpath>
                                -> JSON {"folders": [...], "files": [...]}
                                   listing that subfolder of sheetmusic/
                                   (top level if dir is omitted); folders can
                                   be nested arbitrarily deep, songs can live
                                   at any level
    GET  /api/sheetmusic/<relpath> -> raw binary content of that Guitar
                                    Pro/MusicXML file, e.g.
                                    /api/sheetmusic/Album/song.gp5
                                    (read-only -- drop songs into sheetmusic/
                                    yourself; there's no save endpoint)

    GET  /api/sheetmusic/<relpath>/audio
                                -> raw MP3 bytes of the official song audio,
                                   if it's already been downloaded. 404 with
                                   {"hasUrl": bool} otherwise -- hasUrl tells
                                   the frontend whether a download is even
                                   possible (see below).
    POST /api/sheetmusic/<relpath>/audio
                                -> downloads the audio (via yt-dlp) if it
                                   isn't already cached, using the URL found
                                   in a file named "url" (one URL, first
                                   non-empty line, no file extension) in the
                                   *same folder* as the song, e.g.
                                   Artist/Song/song.gp5 reads its URL from
                                   Artist/Song/url. You create that file
                                   yourself. Requires yt-dlp and ffmpeg on
                                   the server (see README); returns a clear
                                   JSON error instead of crashing if either
                                   is missing or the download fails.
"""

import argparse
import glob
import json
import mimetypes
import os
import re
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROUTINES_DIR = os.path.join(SCRIPT_DIR, "routines")
ROUTINES_PREFIX = "/api/routines/"
SHEETMUSIC_DIR = os.path.join(SCRIPT_DIR, "sheetmusic")
SHEETMUSIC_PREFIX = "/api/sheetmusic/"
SHEETMUSIC_EXTENSIONS = (".gp3", ".gp4", ".gp5", ".gpx", ".gp", ".musicxml", ".mxl")

# Python's mimetypes module doesn't know these by default; alphaTab (the
# Sheet Music tab's rendering library) fetches them as plain static assets,
# and some browsers are picky about serving fonts with an unrecognized type.
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("application/octet-stream", ".sf3")
mimetypes.add_type("application/octet-stream", ".sf2")

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


# sheetmusic/ supports arbitrary nested folders (albums, etc.), so it needs
# real "/"-separated relative-path resolution rather than the flat filename
# regex routines/ uses. Each segment is checked individually -- "..", ".", a
# literal backslash, or a null byte anywhere rejects the whole path -- and
# the final resolved path must still land inside SHEETMUSIC_DIR, so a
# crafted path can never escape it even if some segment check is fooled.
def safe_sheetmusic_relpath(rel_path):
    parts = [p for p in (rel_path or "").split("/") if p != ""]
    for part in parts:
        if part in (".", "..") or "\\" in part or "\x00" in part:
            return None
    root = os.path.realpath(SHEETMUSIC_DIR)
    candidate = os.path.realpath(os.path.join(root, *parts)) if parts else root
    if candidate != root and not candidate.startswith(root + os.sep):
        return None
    return candidate


AUDIO_SUFFIX = "/audio"


# A song's audio source is a plain-text file named "url" (one URL, no
# extension) sitting in the *same folder* as the tab file -- so each song
# gets its own folder containing the tab plus a "url" file, e.g.
# sheetmusic/Artist/Song Name/song.gp5 + sheetmusic/Artist/Song Name/url.
# The downloaded audio is cached as "audio.mp3" in that same folder.
def sibling_audio_paths(song_abspath):
    folder = os.path.dirname(song_abspath)
    return os.path.join(folder, "url"), os.path.join(folder, "audio.mp3")


def download_audio(url, mp3_path):
    # Imported lazily: everything else in this file is pure standard library
    # by design, and yt-dlp is only needed by people actually using this one
    # feature -- the rest of the app still works fine without it installed.
    try:
        import yt_dlp
    except ImportError:
        raise RuntimeError("yt-dlp isn't installed on the server (pip install yt-dlp), so audio can't be downloaded.")

    base, _ext = os.path.splitext(mp3_path)

    # Clean up any raw (pre-conversion) file left behind by an earlier
    # failed attempt -- otherwise yt-dlp sees it as "already downloaded" and
    # skips re-fetching, which would silently keep using stale/wrong audio
    # after e.g. the url file was edited to point at a different video.
    for stray in glob.glob(base + ".*"):
        if stray != mp3_path:
            os.remove(stray)

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": base + ".%(ext)s",
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }],
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        if not os.path.isfile(mp3_path):
            raise RuntimeError("Download finished but no MP3 came out of it -- is ffmpeg installed on the server?")
    except Exception:
        for stray in glob.glob(base + ".*"):
            if stray != mp3_path:
                os.remove(stray)
        raise


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

        if parsed.path == "/api/sheetmusic":
            os.makedirs(SHEETMUSIC_DIR, exist_ok=True)
            rel_dir = urllib.parse.parse_qs(parsed.query).get("dir", [""])[0]
            dir_path = safe_sheetmusic_relpath(rel_dir)
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
                if e.lower().endswith(SHEETMUSIC_EXTENSIONS) and os.path.isfile(os.path.join(dir_path, e))
            )
            self._send_json({"folders": folders, "files": files})
            return

        if self.path.startswith(SHEETMUSIC_PREFIX):
            raw = urllib.parse.unquote(self.path[len(SHEETMUSIC_PREFIX):])

            if raw.endswith(AUDIO_SUFFIX):
                path = safe_sheetmusic_relpath(raw[:-len(AUDIO_SUFFIX)])
                if not path or not os.path.isfile(path) or not path.lower().endswith(SHEETMUSIC_EXTENSIONS):
                    self.send_error(404, "Song not found")
                    return
                url_path, mp3_path = sibling_audio_paths(path)
                if os.path.isfile(mp3_path):
                    with open(mp3_path, "rb") as fh:
                        content = fh.read()
                    self._send_binary(content, "audio/mpeg")
                    return
                self._send_json({"hasUrl": os.path.isfile(url_path)}, status=404)
                return

            path = safe_sheetmusic_relpath(raw)
            if not path or not os.path.isfile(path) or not path.lower().endswith(SHEETMUSIC_EXTENSIONS):
                self.send_error(404, "Song not found")
                return
            with open(path, "rb") as fh:
                content = fh.read()
            self._send_binary(content, "application/octet-stream")
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

        if self.path.startswith(SHEETMUSIC_PREFIX):
            raw = urllib.parse.unquote(self.path[len(SHEETMUSIC_PREFIX):])
            if raw.endswith(AUDIO_SUFFIX):
                path = safe_sheetmusic_relpath(raw[:-len(AUDIO_SUFFIX)])
                if not path or not os.path.isfile(path) or not path.lower().endswith(SHEETMUSIC_EXTENSIONS):
                    self.send_error(404, "Song not found")
                    return
                url_path, mp3_path = sibling_audio_paths(path)
                if os.path.isfile(mp3_path):
                    self._send_json({"ok": True})
                    return
                if not os.path.isfile(url_path):
                    self._send_json(
                        {"ok": False, "error": "No audio URL configured -- create " + os.path.basename(url_path)},
                        status=404,
                    )
                    return
                with open(url_path, "r", encoding="utf-8") as fh:
                    lines = [ln.strip() for ln in fh if ln.strip()]
                url = lines[0] if lines else ""
                if not url:
                    self._send_json({"ok": False, "error": os.path.basename(url_path) + " is empty"}, status=400)
                    return
                try:
                    download_audio(url, mp3_path)
                except Exception as e:
                    self._send_json({"ok": False, "error": str(e)}, status=502)
                    return
                self._send_json({"ok": True})
                return

        self.send_error(404)

    def _send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
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

    def _send_binary(self, body, content_type):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
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
    os.makedirs(SHEETMUSIC_DIR, exist_ok=True)

    server = ThreadingHTTPServer((args.bind, args.port), Handler)
    print("Serving http://{}:{}  (Ctrl+C to stop)".format(args.bind, args.port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
