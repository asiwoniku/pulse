# One image serves both halves of Pulse on one origin: the built partner-web client
# at / and the JSON API at /api. That is not a convenience — partner-web calls
# relative /api paths and uses BrowserRouter (partner-web/src/lib/api.ts, vite.config.ts),
# so serving them from separate hosts would mean inventing an API base URL and then
# debugging CORS. The client needs no build-time configuration at all.
#
# Build:  docker build -t pulse .
# Run:    docker run -p 8000:8000 -e PORT=8000 \
#           -e SUPABASE_URL=https://<ref>.supabase.co \
#           -e SUPABASE_ANON_KEY=<anon key> pulse
#
# PULSE_HOST must be 0.0.0.0 in a container; the default 127.0.0.1 would bind the
# loopback interface inside the network namespace and answer connection refused to
# everything outside, which looks like a broken deploy rather than a misconfiguration.

# ---- Stage 1: build the partner-web client -------------------------------------
FROM node:22-alpine AS web
WORKDIR /build

# package-lock.json is committed, so this is reproducible. Copying the manifests
# before the sources keeps this layer cached until a dependency actually changes.
COPY partner-web/package.json partner-web/package-lock.json ./
RUN npm ci

COPY partner-web/ ./
# `npm run build` is `tsc -b && vite build`. Failing here fails the image build,
# which is the right time to discover a type error.
RUN npm run build

# ---- Stage 2: the stdlib-only service ------------------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PULSE_HOST=0.0.0.0 \
    PULSE_WEB_ROOT=/srv/web \
    PORT=8000

WORKDIR /srv/services

# No pip install step exists because there is nothing to install: pulse_service is
# written against the standard library only (see pulse_service/__init__.py). Keeping
# that property in the image is the point — it is what lets local verification run
# on a bare machine, and it keeps the runtime surface small.
COPY services/ ./
COPY --from=web /build/dist /srv/web

# Run unprivileged. Nothing here writes to the image.
RUN useradd --create-home --uid 10001 pulse \
    && chown -R pulse:pulse /srv
USER pulse

EXPOSE 8000

# /api/health exists precisely to answer this without touching Postgres, so a failing
# probe reports "the process is up but unhealthy" instead of "the deploy is broken".
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2).status==200 else 1)"

# exec form, no shell: the process becomes PID 1 and receives SIGTERM directly, so a
# platform can stop it without the container waiting out a timeout and being SIGKILLed.
CMD ["python", "run.py"]