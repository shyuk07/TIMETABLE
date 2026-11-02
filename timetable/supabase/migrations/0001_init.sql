-- =============================================================================
-- TIMETABLE(timetable) — Supabase 초기 스키마
--   테이블 5개: profiles, categories, schedules, user_settings, goals
--   인증은 Supabase Auth(auth.users)가 담당하고, profiles 가 그 1:1 확장이다.
--   모든 테이블에 Row Level Security 를 켜서 "내 행만" 읽고 쓰게 한다.
--
-- 적용 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run
--          (또는 supabase CLI: supabase db push)
-- =============================================================================

-- 1) 프로필 (auth.users 와 1:1) ------------------------------------------------
create table public.profiles (
    id            uuid primary key references auth.users(id) on delete cascade,
    display_name  varchar(30) not null default '',
    onboarded     boolean     not null default false,   -- 온보딩을 끝냈는지
    created_at    timestamptz not null default now()
);

-- 2) 카테고리 -------------------------------------------------------------------
-- default_key 가 있으면 가입 때 자동으로 만들어진 기본 카테고리(삭제 불가)
create table public.categories (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid        not null default auth.uid() references public.profiles(id) on delete cascade,
    name        varchar(10) not null check (length(btrim(name)) > 0),
    bg          char(7)     not null check (bg  ~ '^#[0-9a-fA-F]{6}$'),
    ink         char(7)     not null check (ink ~ '^#[0-9a-fA-F]{6}$'),
    sort_order  integer     not null default 0,
    default_key varchar(20) check (default_key in ('study','break','growth','hobby','exercise','other')),
    created_at  timestamptz not null default now(),
    unique (user_id, name),
    unique (user_id, default_key),          -- 기본 카테고리는 사용자당 하나씩만
    unique (id, user_id)                    -- 일정/목표가 "같은 사용자의 카테고리"만 가리키도록 (아래 복합 FK)
);
create index idx_categories_user on public.categories (user_id, sort_order);

-- 3) 일정 -----------------------------------------------------------------------
create table public.schedules (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
    category_id  uuid not null,
    title        varchar(100) not null check (length(btrim(title)) > 0),
    date         date not null,
    start_time   time not null,
    end_time     time not null,
    created_at   timestamptz not null default now(),
    check (end_time > start_time),
    foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict
);
-- 화면 조회("이 날짜의 내 일정")와 통계(기간 합산)가 모두 이 인덱스를 탄다
create index idx_schedules_user_date on public.schedules (user_id, date, start_time);
create index idx_schedules_category   on public.schedules (category_id);

-- 4) 사용자 설정 (1:1) ----------------------------------------------------------
create table public.user_settings (
    user_id               uuid primary key references public.profiles(id) on delete cascade,
    week_start            smallint not null default 0 check (week_start in (0, 1)),   -- 0=일요일, 1=월요일
    notify_enabled        boolean  not null default false,
    notify_minutes_before smallint not null default 10 check (notify_minutes_before between 0 and 120)
);

-- 5) 목표 -----------------------------------------------------------------------
create table public.goals (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
    category_id    uuid not null,
    period         varchar(5) not null check (period in ('day','week')),
    target_minutes integer    not null check (target_minutes > 0),
    unique (user_id, category_id, period),
    foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

-- =============================================================================
-- 자동 처리 (앱 코드가 하던 일을 DB가 보장)
-- =============================================================================

-- 가입하면: 프로필 + 기본 카테고리 6개 + 기본 설정을 만든다.
-- (security definer: 방금 가입한 사용자 권한이 아니라 소유자 권한으로 실행)
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles (id, display_name)
    values (
        new.id,
        left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1), ''), 30)
    );
    insert into public.categories (user_id, name, bg, ink, sort_order, default_key) values
        (new.id, '공부',     '#e3a765', '#2c1c0c', 0, 'study'),
        (new.id, '휴식',     '#96b78f', '#16210f', 1, 'break'),
        (new.id, '자기발전', '#5fa8a3', '#0d211f', 2, 'growth'),
        (new.id, '취미',     '#b98fc4', '#241627', 3, 'hobby'),
        (new.id, '운동',     '#cf6f56', '#2a140c', 4, 'exercise'),
        (new.id, '기타',     '#8fa9c9', '#101a26', 5, 'other');
    insert into public.user_settings (user_id) values (new.id);
    return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
    for each row execute function public.handle_new_user();

-- 카테고리를 지우면: 기본 카테고리는 막고, 그 카테고리의 일정은 '기타'로 옮긴다.
-- (계정 삭제로 인한 연쇄 삭제일 때는 그냥 통과)
create function public.on_category_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if not exists (select 1 from public.profiles where id = old.user_id) then
        return old;
    end if;
    if old.default_key is not null then
        raise exception '기본 카테고리는 삭제할 수 없어요';
    end if;
    update public.schedules
       set category_id = (select id from public.categories
                           where user_id = old.user_id and default_key = 'other')
     where category_id = old.id and user_id = old.user_id;
    return old;
end;
$$;

create trigger trg_category_before_delete before delete on public.categories
    for each row execute function public.on_category_before_delete();

-- 기본 카테고리의 정체성(default_key)은 바꿀 수 없다
create function public.protect_default_key() returns trigger
language plpgsql as $$
begin
    if new.default_key is distinct from old.default_key then
        raise exception 'default_key 는 변경할 수 없어요';
    end if;
    return new;
end;
$$;

create trigger trg_protect_default_key before update on public.categories
    for each row execute function public.protect_default_key();

-- =============================================================================
-- Row Level Security — 로그인한 사용자는 자기 행만 접근
-- =============================================================================
alter table public.profiles      enable row level security;
alter table public.categories    enable row level security;
alter table public.schedules     enable row level security;
alter table public.user_settings enable row level security;
alter table public.goals         enable row level security;

-- profiles: 읽기/수정만 (생성은 가입 트리거, 삭제는 auth.users 삭제로 연쇄)
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy user_settings_select on public.user_settings for select to authenticated using (user_id = auth.uid());
create policy user_settings_update on public.user_settings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy categories_all on public.categories for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy schedules_all  on public.schedules  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goals_all      on public.goals      for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 로그인하지 않은 요청(anon)에는 아무 권한도 주지 않는다
revoke all on public.profiles, public.categories, public.schedules, public.user_settings, public.goals from anon;
