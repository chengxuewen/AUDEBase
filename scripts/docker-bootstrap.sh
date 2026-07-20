#!/usr/bin/env sh
# docker-bootstrap.sh — AUDEBase kernel startup in Docker
# Runs inside the kernel container after PostgreSQL & Redis are healthy.
set -eu

echo "[bootstrap] Waiting for PostgreSQL (5432)..."
until nc -z postgres 5432 2>/dev/null; do
  sleep 0.5
done
echo "[bootstrap] PostgreSQL is ready."

echo "[bootstrap] Waiting for Redis (6379)..."
until nc -z redis 6379 2>/dev/null; do
  sleep 0.5
done
echo "[bootstrap] Redis is ready."

echo "[bootstrap] Running database migrations..."
npx tsx packages/core/src/cli.ts db:migrate

echo "[bootstrap] Starting AUDEBase kernel on port 3000..."
exec npx tsx packages/core/src/cli.ts start
