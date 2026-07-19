#!/usr/bin/env bash
# dev-up.sh — Start AUDEBase infrastructure with Docker Compose
#   docker compose up -d + wait for PG & Redis health checks
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"

echo "=== AUDEBase: Starting Docker infrastructure ==="

cd "$PROJECT_ROOT"

# Start all services in detached mode
docker compose up -d

echo ""
echo "Waiting for PostgreSQL..."
until docker compose exec -T postgres pg_isready -U aude -d audebase 2>/dev/null; do
  sleep 0.5
done
echo "  PostgreSQL is ready."

echo "Waiting for Redis..."
until docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do
  sleep 0.5
done
echo "  Redis is ready."

echo "Waiting for kernel..."
until curl -sf http://localhost:3000/health >/dev/null 2>&1; do
  sleep 1
done
echo "  Kernel is ready."

echo ""
echo "=== All services healthy ==="
docker compose ps
echo ""
echo "  Kernel:   http://localhost:3000"
echo "  Health:   http://localhost:3000/health"
echo "  Admin UI: http://localhost:5173 (run 'pnpm dev' separately)"
