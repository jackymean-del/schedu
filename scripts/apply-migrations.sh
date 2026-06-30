#!/usr/bin/env bash
# Apply all SQL migrations to a Postgres database, in order.
#
# Usage (from repo root, needs `psql` on PATH):
#   DATABASE_URL='postgresql://user:pass@host:5432/db' ./scripts/apply-migrations.sh
#
# Safe to re-run: -v ON_ERROR_STOP=1 halts on the first real error so you can
# see exactly which statement failed. The canonical migrations live in
# database/migrations/ (001..00N, applied in filename order).
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to your Postgres connection string}"

shopt -s nullglob
for f in database/migrations/*.sql; do
  echo "==> applying $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "✓ All migrations applied."
