# Minimal, single-purpose image: run the drum-notation app and nothing else.
# No build step needed -- server.py is pure standard library except for the
# Sheet Music tab's official-audio download feature, which needs yt-dlp
# (Python package) and ffmpeg (system binary, for yt-dlp's audio-extraction
# postprocessor) -- both installed below. The rest of the app works fine
# even if this feature were ever removed.

FROM python:3.14-slim

WORKDIR /app
COPY . .

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir yt-dlp

# server.py writes into routines/ (Save button) and sheetmusic/ (downloaded
# official audio), so the non-root user needs to actually own them, not
# just read them.
RUN useradd --no-create-home --shell /usr/sbin/nologin appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# --bind 0.0.0.0 is required here (not the 127.0.0.1 default): inside a
# container, binding to loopback only accepts connections from within the
# container's own network namespace, so Docker's -p port mapping would have
# nothing to forward to. The container boundary is what actually confines
# this now, not the bind address.
CMD ["python3", "server.py", "--bind", "0.0.0.0", "--port", "8000"]
