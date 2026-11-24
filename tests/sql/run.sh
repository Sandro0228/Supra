#!/bin/sh
# Runs the database tests against a scratch Postgres 15+ (local or in Docker): tests/sql/run.sh [psql connection args]
# The fixture plan is passed to psql as text, so the server does not need to see this folder.
set -e
cd "$(dirname "$0")"
# A fresh Docker Postgres restarts once while it initialises: wait until it answers 3 times in a row (up to 60 s).
ok=0
for i in $(seq 1 60); do
  if psql "$@" -q -tAc "select 1" postgres >/dev/null 2>&1; then ok=$((ok + 1)); [ $ok -ge 3 ] && break; else ok=0; fi
  sleep 1
done
[ $ok -ge 3 ] || { echo "Postgres did not answer within 60 s" >&2; exit 1; }
DB="supra_test_$$"
psql "$@" -q -c "create database $DB" postgres
trap 'psql "$@" -q -c "drop database $DB" postgres' EXIT
for f in 00_supabase_stub.sql ../../supabase/schema.sql 10_seed_pre.sql ../../supabase/002_guest_lookup.sql ../../supabase/003_public_looks.sql ../../supabase/004_seat_choice.sql ../../supabase/005_table_people.sql 20_guest_lookup_test.sql 30_public_looks_test.sql 40_seat_choice_test.sql ../../supabase/006_share_lifecycle.sql ../../supabase/006_share_lifecycle.sql 50_share_lifecycle_test.sql ../../supabase/007_name_skeleton.sql 60_name_skeleton_test.sql ../../supabase/008_rsvp.sql ../../supabase/008_rsvp.sql 70_rsvp_test.sql ../../supabase/009_trash.sql ../../supabase/009_trash.sql 80_trash_test.sql ../../supabase/010_plan_version.sql ../../supabase/010_plan_version.sql 90_plan_version_test.sql ../../supabase/011_entitlements.sql ../../supabase/011_entitlements.sql 95_entitlements_test.sql ../../supabase/012_account.sql ../../supabase/012_account.sql 99_account_test.sql ../../supabase/013_versions.sql ../../supabase/013_versions.sql 100_versions_test.sql; do
  [ -f "$f" ] || continue
  psql "$@" -q -v ON_ERROR_STOP=1 -v fixture="$(cat fixture-plan-sql.json)" -d "$DB" -f "$f"
done
echo "all database tests passed"
