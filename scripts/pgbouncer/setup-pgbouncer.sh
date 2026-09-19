#!/usr/bin/env bash
# Install + configure PgBouncer in front of the local Postgres 17 on the EC2 box.
# Idempotent — safe to re-run. Does NOT touch the apps; see cutover-apps.sh.
#
#   sudo bash setup-pgbouncer.sh
#
# What it does:
#   1. apt installs pgbouncer (PGDG repo is already configured for Postgres 17)
#   2. builds /etc/pgbouncer/userlist.txt from the SCRAM verifiers already in
#      pg_authid (no plaintext passwords are written anywhere)
#   3. writes /etc/pgbouncer/pgbouncer.ini (transaction pooling, 127.0.0.1:6432)
#   4. raises Postgres max_connections 30 -> 100 (needs a ~1s postgres restart)
#   5. enables + starts pgbouncer and smoke-tests both databases through it
set -euo pipefail

if [[ $EUID -ne 0 ]]; then echo "run with sudo"; exit 1; fi

echo "== 1. install"
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq pgbouncer >/dev/null
echo "   $(pgbouncer --version | head -1)"
systemctl stop pgbouncer 2>/dev/null || true

echo "== 2. userlist from pg_authid (SCRAM verifiers)"
sudo -u postgres psql -tAc \
  "select '\"' || rolname || '\" \"' || rolpassword || '\"' from pg_authid where rolname in ('partfind_prod','partfind_dev')" \
  > /etc/pgbouncer/userlist.txt
chown postgres:postgres /etc/pgbouncer/userlist.txt
chmod 640 /etc/pgbouncer/userlist.txt
echo "   $(wc -l < /etc/pgbouncer/userlist.txt) role(s)"

echo "== 3. pgbouncer.ini"
[[ -f /etc/pgbouncer/pgbouncer.ini.orig ]] || cp /etc/pgbouncer/pgbouncer.ini /etc/pgbouncer/pgbouncer.ini.orig
cat > /etc/pgbouncer/pgbouncer.ini <<'INI'
;; PgBouncer in front of the local Postgres 17 (max_connections=100).
;; Both apps (pm2 part-find on :3000, part-find-dev on :4000) connect here on
;; 127.0.0.1:6432 in transaction pooling mode. `prisma migrate` uses DIRECT_URL
;; (port 5432) because transaction pooling cannot run the migration engine.
;; Managed by part-find/scripts/pgbouncer/setup-pgbouncer.sh
[databases]
partfind_prod = host=127.0.0.1 port=5432 dbname=partfind_prod pool_size=15
partfind_dev  = host=127.0.0.1 port=5432 dbname=partfind_dev  pool_size=6

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
unix_socket_dir = /var/run/postgresql
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
admin_users = postgres
stats_users = postgres

pool_mode = transaction
max_client_conn = 500
default_pool_size = 10
min_pool_size = 1
reserve_pool_size = 3
reserve_pool_timeout = 3
server_idle_timeout = 300
server_lifetime = 3600
server_reset_query = DISCARD ALL
;; Prisma sends these at connect time; harmless to ignore in transaction mode
ignore_startup_parameters = extra_float_digits,search_path,options

logfile = /var/log/postgresql/pgbouncer.log
pidfile = /var/run/postgresql/pgbouncer.pid
log_connections = 0
log_disconnections = 0
INI

echo "== 4. postgres max_connections -> 100 (restart ~1s)"
CUR=$(sudo -u postgres psql -tAc "show max_connections")
if [[ "$CUR" -lt 100 ]]; then
  sudo -u postgres psql -qc "ALTER SYSTEM SET max_connections = 100;"
  systemctl restart postgresql
  sleep 2
fi
echo "   max_connections = $(sudo -u postgres psql -tAc "show max_connections")"

echo "== 5. start pgbouncer + smoke test"
systemctl enable --now pgbouncer >/dev/null 2>&1
systemctl restart pgbouncer
sleep 1
systemctl is-active --quiet pgbouncer || { echo "pgbouncer failed to start:"; tail -20 /var/log/postgresql/pgbouncer.log; exit 1; }
ss -ltn | grep -q ":6432" && echo "   listening on 127.0.0.1:6432"

for f in /home/ubuntu/part-find-2/part-find/.env /home/ubuntu/part-find-dev/.env; do
  # Use DIRECT_URL if the cutover already ran, else DATABASE_URL; then point it at 6432
  URL=$(grep -E "^(DIRECT_URL|DATABASE_URL)=" "$f" | head -1 | cut -d= -f2- | tr -d '"' \
        | sed -e 's/:5432/:6432/' -e 's/?schema=public//' -e 's/[?&]pgbouncer=true//')
  DB=$(echo "$URL" | sed -E 's#.*/([^?]+).*#\1#')
  echo "   via pgbouncer -> $DB: $(psql "$URL" -tAc "select 'ok'" 2>&1 | tail -1)"
done

echo "== done. Next: bash cutover-apps.sh   (points both apps at 6432 and restarts them)"
