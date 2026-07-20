#!/usr/bin/env bash
# pixi-services.sh — Manage local PostgreSQL & Redis for AUDEBase dev
# Usage: pixi run db-init | db-start | db-stop | redis-start | redis-stop | services-start | services-stop | services-status
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"

PGDATA="$PROJECT_ROOT/.pixi-pgdata"
PGLOG="$PGDATA/pg.log"
PGPORT="${PGPORT:-5432}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PIDFILE="$PROJECT_ROOT/.pixi-redis.pid"
REDIS_PASSWORD="audebase_dev"

DB_USER="${DB_USER:-audebase}"
DB_NAME="${DB_NAME:-audebase}"
DB_PASS="${DB_PASS:-audebase_dev}"

# ── helpers ──

pg_running() {
  pg_ctl -D "$PGDATA" status &>/dev/null
}

redis_running() {
  if [ -f "$REDIS_PIDFILE" ] && kill -0 "$(cat "$REDIS_PIDFILE")" 2>/dev/null; then
    return 0
  fi
  return 1
}

ensure_pg_stopped() {
  if pg_running; then
    echo "  Stopping existing PostgreSQL..."
    pg_ctl -D "$PGDATA" stop -m fast &>/dev/null || true
    sleep 1
  fi
}

# ── init-db ──

init_db() {
  echo "=== AUDEBase DB Init ==="

  if [ -f "$PGDATA/PG_VERSION" ]; then
    echo "  PostgreSQL data directory already exists at $PGDATA"
    echo "  To reinitialize, run: rm -rf $PGDATA && pixi run db-init"
    return 0
  fi

  echo "  Initializing PostgreSQL cluster at $PGDATA ..."
  initdb -D "$PGDATA" --auth=trust --no-instructions >/dev/null

  # Start temp to create user/db
  pg_ctl -D "$PGDATA" -l "$PGLOG" -o "-p $PGPORT" start
  sleep 2

  echo "  Creating role '$DB_USER' ..."
  createuser -p "$PGPORT" -s "$DB_USER" 2>/dev/null || true

  echo "  Creating database '$DB_NAME' ..."
  createdb -p "$PGPORT" -O "$DB_USER" "$DB_NAME" 2>/dev/null || true

  pg_ctl -D "$PGDATA" stop -m fast
  echo "  PostgreSQL initialized."
}

# ── start-db ──

start_db() {
  echo -n "Starting PostgreSQL (port $PGPORT)... "
  if pg_running; then
    echo "already running."
    return 0
  fi
  pg_ctl -D "$PGDATA" -l "$PGLOG" -o "-p $PGPORT" start
  echo "done."
}

# ── stop-db ──

stop_db() {
  echo -n "Stopping PostgreSQL... "
  if ! pg_running; then
    echo "not running."
    return 0
  fi
  pg_ctl -D "$PGDATA" stop -m fast
  echo "stopped."
}

# ── start-redis ──

start_redis() {
  echo -n "Starting Redis (port $REDIS_PORT)... "
  if redis_running; then
    echo "already running."
    return 0
  fi
  redis-server \
    --port "$REDIS_PORT" \
    --daemonize yes \
    --requirepass "$REDIS_PASSWORD" \
    --pidfile "$REDIS_PIDFILE" \
    --loglevel notice \
    --dir "$PROJECT_ROOT"
  echo "done."
}

# ── stop-redis ──

stop_redis() {
  echo -n "Stopping Redis... "
  if ! redis_running; then
    echo "not running."
    return 0
  fi
  local pid
  pid=$(cat "$REDIS_PIDFILE")
  kill "$pid" 2>/dev/null || true
  rm -f "$REDIS_PIDFILE"
  sleep 1
  echo "stopped."
}

# ── status ──

status_all() {
  echo "=== AUDEBase Services ==="
  if pg_running; then
    echo "  PostgreSQL : running (port $PGPORT, data: $PGDATA)"
  else
    echo "  PostgreSQL : stopped"
  fi
  if redis_running; then
    echo "  Redis      : running (port $REDIS_PORT)"
  else
    echo "  Redis      : stopped"
  fi
}

# ── main ──

case "${1:-}" in
  init-db)     init_db ;;
  start-db)    start_db ;;
  stop-db)     stop_db ;;
  start-redis) start_redis ;;
  stop-redis)  stop_redis ;;
  start-all)
    start_db
    start_redis
    status_all
    ;;
  stop-all)
    stop_db
    stop_redis
    ;;
  status)      status_all ;;
  *)
    echo "Usage: pixi run {init-db|start-db|stop-db|start-redis|stop-redis|services-start|services-stop|services-status}"
    exit 1
    ;;
esac
