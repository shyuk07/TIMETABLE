-- 배경 테마 선택 (설정 > 테마). 허용 목록은 앱(src/lib/themes.js)이 관리하고,
-- DB 는 id 형식만 검사한다 → 테마를 추가해도 마이그레이션이 필요 없다.
alter table public.user_settings
    add column theme varchar(20) not null default 'ember'
    check (theme ~ '^[a-z0-9-]{1,20}$');
-- RLS 는 user_settings 의 기존 정책(본인 행만 조회/수정)이 그대로 적용된다.
