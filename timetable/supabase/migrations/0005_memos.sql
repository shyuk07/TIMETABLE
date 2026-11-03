-- 날짜 메모 (캘린더 > 메모). 그 날을 보면 날짜 옆에 보이고, 달력 칸에는 표시하지 않는다.
-- 디데이(0004_d_days.sql)와 같은 모양이라 앱도 같은 코드로 다룬다.
create table public.memos (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid        not null default auth.uid() references public.profiles(id) on delete cascade,
    title       varchar(50) not null check (length(btrim(title)) > 0),   -- 메모 내용
    date        date        not null,
    created_at  timestamptz not null default now()
);
create index idx_memos_user_date on public.memos (user_id, date);

alter table public.memos enable row level security;
create policy memos_all on public.memos for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.memos from anon;
