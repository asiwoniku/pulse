"""Pulse local integration service and partner portal.

Stdlib-only by design: `python run.py` must work on a machine with nothing but
Python 3.10+, because "install 14 packages first" is how local verification stops
happening. The same module layout deploys unchanged behind any WSGI server, and a
FastAPI/ASGI shim can mount `pulse_service.api` later without touching handlers.
"""

__version__ = "0.1.0"
