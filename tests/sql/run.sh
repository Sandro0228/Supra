#!/bin/sh
# Runs the database tests against a scratch Postgres 16: tests/sql/run.sh [psql connection args]
set -e
cd "$(dirname "$0")"
DB="supra_test_$$"
psql "$@" -q -c "create database $DB" postgres
trap 'psql "$@" -q -c "drop database $DB" postgres' EXIT
for f in 00_supabase_stub.sql ../../supabase/schema.sql 10_seed_pre.sql ../../supabase/002_guest_lookup.sql ../../supabase/003_public_looks.sql 20_guest_lookup_test.sql 30_public_looks_test.sql; do
  [ -f "$f" ] || continue
  psql "$@" -q -v ON_ERROR_STOP=1 -v fixture="$(pwd)/fixture-plan-sql.json" -d "$DB" -f "$f"
done
echo "all database tests passed"
