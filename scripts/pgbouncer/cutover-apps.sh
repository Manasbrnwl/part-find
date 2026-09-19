#!/usr/bin/env bash
# Point both apps (prod + dev) at PgBouncer — the only route to Postgres after
# setup-pgbouncer.sh — and redeploy. Idempotent.
#
#   bash cutover-apps.sh            # as ubuntu (no sudo needed)
#
# Per app dir:
#   - backs up .env to .env.bak.pre-pgbouncer.<ts>
#   - DATABASE_URL = 127.0.0.1:6432/<db>?schema=public&pgbouncer=true   [app, transaction pool]
#   - DIRECT_URL   = 127.0.0.1:6432/<db>_direct                         [prisma migrate, session pool]
#   - DB_POOL_SIZE = 15 (prod) / 6 (dev) — matches the pgbouncer pool_size
#   - git pull dev, npm install, prisma migrate deploy (via DIRECT_URL),
#     prisma generate, build, pm2 restart --update-env
set -euo pipefail

cutover() {
  local dir=$1 pm2name=$2 pool=$3
  echo "== $pm2name ($dir)"
  cd "$dir"

  if ! grep -q "^DIRECT_URL=" .env; then
    cp .env ".env.bak.pre-pgbouncer.$(date +%Y%m%d%H%M%S)"
    local raw userpass db
    raw=$(grep "^DATABASE_URL=" .env | cut -d= -f2- | tr -d '"')
    userpass=$(echo "$raw" | sed -E 's#^postgresql://([^@]+)@.*#\1#')
    db=$(echo "$raw" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
    sed -i "s#^DATABASE_URL=.*#DATABASE_URL=\"postgresql://${userpass}@127.0.0.1:6432/${db}?schema=public\&pgbouncer=true\"#" .env
    printf '\n# Session-mode PgBouncer alias — used by prisma migrate (Postgres has no TCP listener)\nDIRECT_URL="postgresql://%s@127.0.0.1:6432/%s_direct?schema=public"\n# Prisma pool size for the shared client (matches pgbouncer pool_size)\nDB_POOL_SIZE=%s\n' "$userpass" "$db" "$pool" >> .env
    echo "   .env updated"
  else
    echo "   .env already cut over"
  fi
  grep -E "^(DATABASE_URL|DIRECT_URL|DB_POOL_SIZE)=" .env | sed -E 's#(://[^:]+:)[^@]+@#\1***@#'

  git pull -q origin dev
  echo "   code @ $(git log --oneline -1)"
  npm install --silent 2>&1 | tail -1 || true
  npx prisma migrate deploy 2>&1 | tail -1
  npx prisma generate 2>&1 | grep -i generated
  npm run build 2>&1 | tail -1
  pm2 restart "$pm2name" --update-env >/dev/null
  sleep 6
  pm2 logs "$pm2name" --lines 30 --nostream 2>/dev/null | grep -E "Prisma client initialised|Server is running|rror" | tail -3
}

cutover /home/ubuntu/part-find-dev        part-find-dev 6
cutover /home/ubuntu/part-find-2/part-find part-find     15

echo
echo "== Postgres backends (all should be owned by pgbouncer now):"
sudo -u postgres psql -c "select datname, usename, state, count(*) from pg_stat_activity where datname is not null group by 1,2,3 order by 1;"
echo "== PgBouncer pools:"
sudo -u postgres psql -p 6432 -h /var/run/postgresql -U pgbouncer pgbouncer -c "show pools;" | cut -c1-120
