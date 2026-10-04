"""WSGI entrypoint for a serverless host, named for `vercel.json`'s
`"entrypoint": "wsgi:application"`.

This file contains no logic on purpose. The callable re-exported here is the same
object `python run.py` already serves, so a deployed function and a laptop run
identical code — there is no second implementation to drift.

`serve()` is deliberately not called. A serverless host invokes the WSGI callable
once per request, so `wsgiref`'s socket and threading model are never involved;
only `application` is. What the callable sees is also unchanged: Vercel hands the
service the *original* request path, so `PATH_INFO` is still `/api/…` and the
existing routing in `app.application` works without an adapter.
"""
from pulse_service.app import application

__all__ = ["application"]