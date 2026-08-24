FROM python:3.12-slim

WORKDIR /app

# The user-facing version stamped into PDF reports — the same value the
# frontend bakes into its footer. The build context has no .git, so it must be
# passed in; app/version.py falls back to "dev" when it's empty.
ARG APP_VERSION=""
ENV APP_VERSION=$APP_VERSION

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
ENTRYPOINT ["/entrypoint.sh"]
