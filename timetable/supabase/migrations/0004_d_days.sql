-- 디데이 (캘린더 > 디데이). 이벤트 이름과 날짜만 저장하고, "D-3" 같은 표시는 앱이 계산한다.
create table public.d_days (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid        not null default auth.uid() references public.profiles(id) on delete cascade,
    title       varchar(30) not null check (length(btrim(title)) > 0),
    date        date        not null,
    created_at  timestamptz not null default now()
);
create index idx_d_days_user_date on public.d_days (user_id, date);

-- 다른 테이블과 같이 "내 행만" 읽고 쓴다
alter table public.d_days enable row level security;
create policy d_days_all on public.d_days for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.d_days from anon;
