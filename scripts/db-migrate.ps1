# Apply all SQL migrations to the RUNNING Postgres container.
#
# Postgres only auto-runs the migrations in docker-entrypoint-initdb.d on the
# FIRST init of an empty data volume. If you already have a `postgres_data`
# volume (e.g. you ran the stack before these migrations existed), run this to
# apply the newer migrations. All migrations use `IF NOT EXISTS`, so re-running
# is safe/idempotent.
#
# Usage:  ./scripts/db-migrate.ps1
# Requires: the `db` service running (docker compose up -d db)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

$files = @()
$files += Get-ChildItem (Join-Path $root 'database/migrations/*.sql') | Sort-Object Name
$files += Get-ChildItem (Join-Path $root 'backend/db/migrations/*.sql') | Sort-Object Name

if ($files.Count -eq 0) { Write-Host 'No migration files found.' -ForegroundColor Yellow; exit 1 }

foreach ($f in $files) {
  Write-Host "→ applying $($f.Name)" -ForegroundColor Cyan
  Get-Content $f.FullName -Raw | docker compose exec -T db psql -U smartsched -d smartsched
}

Write-Host "✓ migrations applied" -ForegroundColor Green
