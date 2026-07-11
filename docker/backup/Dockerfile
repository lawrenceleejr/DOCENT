# Same major version as the db service, so pg_dump/pg_restore always match.
FROM postgres:16

COPY backup.sh restore.sh run.sh /
RUN chmod +x /backup.sh /restore.sh /run.sh

ENTRYPOINT ["/run.sh"]
