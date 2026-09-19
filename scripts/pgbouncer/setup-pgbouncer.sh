#!/usr/bin/env bash
# Put PgBouncer in front of the local Postgres 17 on the EC2 box and make it the
# ONLY way in: Postgres stops listening on TCP (5432) entirely and is reachable
# just over its Unix socket, which PgBouncer (and the nightly pg_dump backup,
# via peer auth as the postgres OS user) use.
# Idempotent — safe to re-run. Does NOT touch the apps; see cutover-apps.sh.
#
#   sudo bash setup-pgbouncer.sh
#
# Steps:
#   1. apt installs pgbouncer (PGDG repo is already configured for Postgres 17)
#   2. /etc/pgbouncer/userlist.txt from the SCRAM verifiers already in pg_authid
#      (no plaintext passwords are written anywhere; PgBouncer uses SCRAM
#      pass-through to authenticate to Postgres with the client's credentials)
#   3. /etc/pgbouncer/pgbouncer.ini — 127.0.0.1:6432, transaction pooling for
#      the apps + a session-mode alias per DB (<db>_direct) for prisma migrate
#      and GUI tools
#   4. pg_hba.conf: allow partfind_* roles over the socket with scram
#   5. postgresql: listen_addresses='' (socket only) + max_connections=100,
#      then a ~1s restart
#   6. enable + start pgbouncer and smoke-test every pool
set -euo pipefail

if [[ $EUID -ne 0 ]]; then echo "run with sudo"; exit 1; fi
PGCONF_DIR=/etc/postgresql/17/main
SOCK=/var/run/postgresql

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
cat > /etc/pgbouncer/pgbouncer.ini <<INI
;; PgBouncer is the ONLY entry point to Postgres on this box. Postgres itself
;; has listen_addresses='' (Unix socket only); PgBouncer reaches it over the
;; socket with SCRAM pass-through.
;;   <db>         — transaction pooling, used by the apps (DATABASE_URL)
;;   <db>_direct  — session pooling, used by prisma migrate (DIRECT_URL) and
;;                  by GUI tools that need session state
;; Managed by part-find/scripts/pgbouncer/setup-pgbouncer.sh
[databases]
partfind_prod        = host=$SOCK dbname=partfind_prod pool_size=15
partfind_dev         = host=$SOCK dbname=partfind_dev  pool_size=6
partfind_prod_direct = host=$SOCK dbname=partfind_prod pool_mode=session pool_size=4
partfind_dev_direct  = host=$SOCK dbname=partfind_dev  pool_mode=session pool_size=2

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
unix_socket_dir = $SOCK
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
server_reset_query_always = 0
;; Prisma sends these at connect time; harmless to ignore
ignore_startup_parameters = extra_float_digits,search_path,options

logfile = /var/log/postgresql/pgbouncer.log
pidfile = $SOCK/pgbouncer.pid
log_connections = 0
log_disconnections = 0
INI

echo "== 4. pg_hba: partfind_* roles over the socket with scram (postgres OS user keeps peer)"
if ! grep -q "# pgbouncer-scram" "$PGCONF_DIR/pg_hba.conf"; then
  cp "$PGCONF_DIR/pg_hba.conf" "$PGCONF_DIR/pg_hba.conf.bak.pre-pgbouncer"
  # Insert before the generic "local all all peer" rule so it wins for our roles
  sed -i '/^local\s\+all\s\+all\s\+peer/i local   partfind_prod   partfind_prod                           scram-sha-256   # pgbouncer-scram' "$PGCONF_DIR/pg_hba.conf"
  sed -i '/^local\s\+all\s\+all\s\+peer/i local   partfind_dev    partfind_dev                            scram-sha-256   # pgbouncer-scram' "$PGCONF_DIR/pg_hba.conf"
  echo "   pg_hba updated"
else
  echo "   pg_hba already updated"
fi

echo "== 5. postgres: socket-only + max_connections=100 (restart ~1s)"
sudo -u postgres psql -qc "ALTER SYSTEM SET listen_addresses = '';"
sudo -u postgres psql -qc "ALTER SYSTEM SET max_connections = 100;"
systemctl restart postgresql
sleep 2
echo "   listen_addresses='$(sudo -u postgres psql -tAc "show listen_addresses")'  max_connections=$(sudo -u postgres psql -tAc "show max_connections")"
if ss -ltn | grep -q ":5432"; then echo "   !! something still listens on 5432"; else echo "   TCP 5432 closed (socket only)"; fi

echo "== 6. start pgbouncer + smoke test"
systemctl enable --now pgbouncer >/dev/null 2>&1
systemctl restart pgbouncer
sleep 1
systemctl is-active --quiet pgbouncer || { echo "pgbouncer failed to start:"; tail -20 /var/log/postgresql/pgbouncer.log; exit 1; }
ss -ltn | grep -q ":6432" && echo "   pgbouncer listening on 127.0.0.1:6432"

# Credentials come from each app's .env (DIRECT_URL after cutover, DATABASE_URL before)
for f in /home/ubuntu/part-find-2/part-find/.env /home/ubuntu/part-find-dev/.env; do
  RAW=$(grep -E "^(DIRECT_URL|DATABASE_URL)=" "$f" | head -1 | cut -d= -f2- | tr -d '"')
  USERPASS=$(echo "$RAW" | sed -E 's#^postgresql://([^@]+)@.*#\1#')
  DB=$(echo "$RAW" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#' | sed 's/_direct$//')
  for alias in "$DB" "${DB}_direct"; do
    echo "   6432/$alias: $(psql "postgresql://${USERPASS}@127.0.0.1:6432/${alias}" -tAc "select 'ok'" 2>&1 | tail -1)"
  done
done
echo "   direct 5432 (should FAIL): $(psql "postgresql://x:x@127.0.0.1:5432/postgres" -tAc "select 1" 2>&1 | tail -1 | cut -c1-70)"

echo "== done. Next: bash cutover-apps.sh   (points both apps at 6432 and restarts them)"
