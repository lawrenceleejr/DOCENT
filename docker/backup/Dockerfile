# Same major version as the db service, so pg_dump/pg_restore always match.
FROM postgres:16

# Dumps are written as this unprivileged user (same uid as the API container,
# which lists and serves them), never as root.
RUN useradd --system --uid 10001 --user-group --no-create-home --shell /usr/sbin/nologin docent

COPY common.sh backup.sh restore.sh run.sh /
RUN chmod +x /backup.sh /restore.sh /run.sh

ENTRYPOINT ["/run.sh"]
