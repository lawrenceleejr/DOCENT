FROM python:3.15-slim

WORKDIR /app

# The user-facing version stamped into PDF reports — the same value the
# frontend bakes into its footer. The build context has no .git, so it must be
# passed in; app/version.py falls back to "dev" when it's empty.
ARG APP_VERSION=""
ENV APP_VERSION=$APP_VERSION \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# The API runs as this unprivileged user, never as root. The uid is fixed so
# the backup sidecar (which shares the /backups folder) can use the same one.
RUN useradd --system --uid 10001 --user-group --home-dir /app --shell /usr/sbin/nologin docent

# Install dependencies first for layer caching. Building behind a
# TLS-inspecting proxy? Drop its PEM bundle at backend/extra-ca.crt
# (gitignored) and it will be trusted during the build.
COPY pyproject.toml extra-ca.crt* ./
RUN if [ -f extra-ca.crt ]; then pip config set global.cert /app/extra-ca.crt; fi \
    && pip install --no-cache-dir .

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=120s --retries=6 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"
ENTRYPOINT ["/entrypoint.sh"]
