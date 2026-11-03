-- 기본 배경 테마를 ember → black 으로 바꾼다. 이미 저장된 사용자 값은 건드리지 않는다.
alter table public.user_settings
    alter column theme set default 'black';
