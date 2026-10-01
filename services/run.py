#!/usr/bin/env python3
"""Start the Pulse local service + partner portal.

    python run.py                    # http://127.0.0.1:8000
    PULSE_PORT=3000 python run.py    # different port
    PULSE_HOST=0.0.0.0 python run.py # reachable from a phone on the same wifi

Reads `.env` from this directory, then from the repository root. Nothing is
required: with no configuration the portal still runs and shows exactly which
credentials are missing, and the offline features (WhatsApp order parsing, the
status-transition mirror) work fully without any key.
"""
from __future__ import annotations

import sys

from pulse_service.app import serve

if sys.version_info < (3, 10):
    raise SystemExit("Pulse service needs Python 3.10 or newer.")

if __name__ == "__main__":
    serve()
