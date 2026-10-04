"""WSGI application: static partner portal + JSON API, served with no dependencies.

`serve()` runs it under wsgiref for local development. The same `application` object
is a valid WSGI app for gunicorn/uwsgi, and a FastAPI shim can mount the same
handlers — the handlers never import from this module, so nothing has to be rewritten
when the transport changes.
"""
from __future__ import annotations

import json
import mimetypes
import os
import socketserver
import sys
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from wsgiref.simple_server import WSGIRequestHandler, WSGIServer

from .api import handle
from .config import Config, load
from .support import ServiceError

PORTAL = Path(__file__).resolve().parent / "portal"


def _web_root() -> Path | None:
    """Where a built partner-web client lives, or None when none is mounted.

    Deliberately unset locally: `python run.py` keeps serving the dispatcher portal
    in PORTAL, so this only takes effect in a container that points it at a build.
    """
    configured = os.environ.get("PULSE_WEB_ROOT", "").strip()
    if not configured:
        return None
    root = Path(configured).expanduser()
    return root if root.is_dir() else None


def _config() -> Config:
    # Reloaded per request so a .env edit shows up after a refresh, which is how
    # local verification should behave; a deployment restarts anyway.
    return load()


def _json(start_response, status: int, body) -> list[bytes]:
    payload = json.dumps(body, default=str).encode("utf-8")
    headers = [
        ("Content-Type", "application/json; charset=utf-8"),
        ("Content-Length", str(len(payload))),
        ("Cache-Control", "no-store"),
        ("Access-Control-Allow-Origin", "*"),
    ]
    start_response(f"{status} {_reason(status)}", headers)
    return [payload]


def _reason(status: int) -> str:
    return {
        200: "OK",
        201: "Created",
        204: "No Content",
        400: "Bad Request",
        401: "Unauthorized",
        403: "Forbidden",
        404: "Not Found",
        405: "Method Not Allowed",
        429: "Too Many Requests",
        500: "Internal Server Error",
        501: "Not Implemented",
        502: "Bad Gateway",
        503: "Service Unavailable",
    }.get(status, "Status")


def _static(path: str, start_response, *, root: Path | None = None, fallback: Path | None = None):
    base = (root or PORTAL).resolve()
    candidate = (base / path.lstrip("/")).resolve()
    # is_relative_to compares path segments. A plain str.startswith() would accept a
    # sibling directory whose name merely begins with "portal" (../portal-backup/...),
    # which is a real way to read files outside the portal.
    if not candidate.is_relative_to(base) or not candidate.is_file():
        if fallback is None:
            return _json(
                start_response,
                404,
                {"error": {"message": "Not found", "status": 404, "source": "pulse-local"}},
            )
        candidate = fallback
    body = candidate.read_bytes()
    ctype = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
    if ctype.startswith("text") or ctype in ("application/javascript", "application/json"):
        ctype = f"{ctype}; charset=utf-8"
    # Vite fingerprints the filenames under assets/, so those bytes cannot change under
    # a name that is already published. index.html must never be pinned, or a deploy
    # would keep handing out references to a bundle it no longer has.
    immutable = f"/{candidate.relative_to(base).as_posix()}".startswith("/assets/")
    start_response(
        "200 OK",
        [
            ("Content-Type", ctype),
            ("Content-Length", str(len(body))),
            ("Cache-Control", "public, max-age=31536000, immutable" if immutable else "no-store"),
        ],
    )
    return [body]


def application(environ, start_response):  # noqa: N802 - WSGI signature
    method = environ.get("REQUEST_METHOD", "GET").upper()
    path = environ.get("PATH_INFO", "/") or "/"

    if method == "OPTIONS":
        start_response(
            "204 No Content",
            [
                ("Access-Control-Allow-Origin", "*"),
                ("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, OPTIONS"),
                ("Access-Control-Allow-Headers", "Authorization, Content-Type"),
                ("Access-Control-Max-Age", "600"),
            ],
        )
        return [b""]

    if not path.startswith("/api/"):
        web = _web_root()
        if web is None:
            return _static("index.html" if path == "/" else path, start_response)
        # A BrowserRouter client owns real URLs, so /shipments is a request for the
        # page that renders it, not for a file literally named "shipments". Only
        # extensionless GETs are rewritten: a miss that *does* carry an extension is
        # a missing asset, and answering it with HTML turns a typo into a parse error
        # far from the actual cause.
        deep_link = method == "GET" and not PurePosixPath(path).suffix
        return _static(
            path,
            start_response,
            root=web,
            fallback=(web / "index.html") if deep_link else None,
        )

    length = int(environ.get("CONTENT_LENGTH") or 0)
    raw = environ["wsgi.input"].read(length) if length else b""
    try:
        body = json.loads(raw.decode("utf-8")) if raw else {}
    except json.JSONDecodeError:
        return _json(
            start_response,
            400,
            {"error": {"message": "Request body is not valid JSON.", "status": 400}},
        )

    try:
        status, payload = handle(
            _config(),
            method,
            path,
            query=environ.get("QUERY_STRING", ""),
            body=body if isinstance(body, dict) else {},
            raw=raw,
            token=(environ.get("HTTP_AUTHORIZATION") or "").removeprefix("Bearer ").strip() or None,
            headers={key: value for key, value in environ.items() if key.startswith("HTTP_")},
            user_agent=environ.get("HTTP_USER_AGENT", ""),
        )
    except ServiceError as error:
        return _json(start_response, error.status, error.to_body())
    except Exception as error:  # noqa: BLE001 - a browser must never see a traceback
        return _json(
            start_response,
            500,
            {
                "error": {
                    "message": f"The service failed unexpectedly: {type(error).__name__}: {error}",
                    "status": 500,
                    "source": "pulse-local",
                    "at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )

    if status == 204:
        start_response("204 No Content", [("Access-Control-Allow-Origin", "*")])
        return [b""]
    return _json(start_response, status, payload)


class _Handler(WSGIRequestHandler):
    def log_message(self, fmt: str, *args) -> None:  # one line per request
        sys.stdout.write(
            f"{datetime.now():%H:%M:%S}  {self.command} {self.path}\n"
        )
        sys.stdout.flush()


class _ThreadingServer(socketserver.ThreadingMixIn, WSGIServer):
    daemon_threads = True


def serve() -> None:
    # Config first: load() is what pulls .env into os.environ, and PULSE_HOST /
    # PULSE_PORT are read from the environment below.
    status = _config().public_status()
    host = os.environ.get("PULSE_HOST", "127.0.0.1")
    # PORT is what Fly, Render, Railway and Cloud Run set; PULSE_PORT stays the local
    # spelling. Neither wins over the other on purpose: the platform's own value is
    # what the platform's router is already pointing at, so it is the one that must.
    raw_port = os.environ.get("PULSE_PORT") or os.environ.get("PORT") or "8000"
    try:
        port = int(raw_port)
    except ValueError:
        sys.exit(f"PULSE_PORT must be a number, not {raw_port!r}")

    print("Pulse local service")
    print(f"  portal     http://{host}:{port}/")
    print(f"  status     http://{host}:{port}/api/status")
    print(
        "  supabase   "
        + ("configured"
           if status["supabase_configured"]
           else "NOT configured — the portal will show an empty board, not sample data")
    )
    for provider in status["providers"]:
        mark = "live " if provider["configured"] else "off  "
        extra = (
            f"  needs {', '.join(provider['missing_env'])}"
            if provider["missing_env"]
            else ""
        )
        print(f"  [{mark}] {provider['title']}{extra}")
    print()

    try:
        server = _ThreadingServer((host, port), _Handler)
    except OSError as error:
        sys.exit(
            f"Cannot listen on {host}:{port} — {error}. "
            "Close the other process or set PULSE_PORT to a free port."
        )
    with server:
        server.set_app(application)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")
