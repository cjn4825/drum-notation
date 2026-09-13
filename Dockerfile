# Minimal, single-purpose image: run the drum-notation app and nothing else.
# No build step needed -- server.py is pure standard library, the frontend
# is plain static files.

FROM python:3.14-slim

WORKDIR /app
COPY . .

# server.py writes into routines/ (that's the whole point of the Save
# button), so the non-root user needs to actually own it, not just read it.
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
