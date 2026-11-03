#!/usr/bin/env bash
# 마이그레이션 + RLS/트리거 시나리오를 "빈" Postgres 에서 검증한다. (Supabase 없이 로컬 Postgres 만 있으면 됨)
#   사용법:  DATABASE_URL=postgres://postgres@localhost:5432/tt_test scripts/test-db.sh
# 주의: auth 스키마를 스텁으로 만들므로 실제 Supabase DB 에는 절대 실행하지 마세요.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL 을 지정하세요 (빈 테스트용 DB)}"
cd "$(dirname "$0")/.."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q \
  -f tests/db_stub_auth.sql \
  -f supabase/migrations/0001_init.sql \
  -f supabase/migrations/0002_theme.sql \
  -f supabase/migrations/0003_default_black.sql \
  -f tests/rls_scenario.sql
