-- 시나리오: 두 사용자 A, B 로 RLS / 트리거 / 복합 FK 검증 (각 단계가 기대대로가 아니면 예외로 중단)
\set ON_ERROR_STOP 1
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com', '{}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com', '{"full_name":"비비"}');

do $$ begin
  assert (select count(*) from public.categories) = 12, '가입 시 기본 카테고리 6개씩';
  assert (select count(*) from public.user_settings) = 2, '설정 자동 생성';
  assert (select count(*) from public.user_settings where theme = 'black') = 2, '기본 테마 black';
  assert (select display_name from public.profiles where id='bbbbbbbb-0000-0000-0000-000000000002') = '비비', '구글 이름 반영';
  assert (select display_name from public.profiles where id='aaaaaaaa-0000-0000-0000-000000000001') = 'a', '이메일 앞부분';
end $$;

-- ---- A 로 로그인 ----
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

do $$
declare study uuid; other_ uuid; custom uuid; sched uuid; n int;
begin
  assert (select count(*) from public.categories) = 6, 'A는 자기 카테고리 6개만 보인다';
  assert (select count(*) from public.profiles) = 1, 'A는 자기 프로필만 보인다';

  select id into study from public.categories where default_key='study';
  select id into other_ from public.categories where default_key='other';

  -- user_id 를 안 넣어도 auth.uid() 로 채워진다
  insert into public.categories (name, bg, ink, sort_order) values ('독서', '#d98fa0', '#1f1410', 6) returning id into custom;
  insert into public.schedules (category_id, title, date, start_time, end_time) values (custom, '소설 읽기', '2026-11-02', '21:00', '22:00') returning id into sched;
  insert into public.goals (category_id, period, target_minutes) values (custom, 'week', 300);

  -- 이름 중복 금지
  begin insert into public.categories (name, bg, ink) values ('독서', '#d98fa0', '#1f1410'); assert false, '중복 이름이 들어가면 안 됨';
  exception when unique_violation then null; end;

  -- 시간 역전 금지
  begin insert into public.schedules (category_id, title, date, start_time, end_time) values (study, 'x', '2026-11-02', '10:00', '09:00'); assert false;
  exception when check_violation then null; end;

  -- 기본 카테고리 삭제 금지
  begin delete from public.categories where id = study; assert false, '기본 카테고리 삭제가 막혀야 함';
  exception when raise_exception then null; end;

  -- default_key 변경 금지
  begin update public.categories set default_key = null where id = study; assert false;
  exception when raise_exception then null; end;

  -- 테마 변경은 허용, 형식에 맞지 않는 값은 거부
  update public.user_settings set theme = 'sample';
  assert (select theme from public.user_settings) = 'sample', '테마 저장';
  begin update public.user_settings set theme = 'Neon Pink!'; assert false, '잘못된 테마 id';
  exception when check_violation then null; end;

  -- 이름/색 변경은 허용
  update public.categories set name = '공부방', bg = '#112233' where id = study;

  -- 커스텀 카테고리 삭제 → 일정은 '기타'로 이동, 목표는 함께 삭제
  delete from public.categories where id = custom;
  assert (select category_id from public.schedules where id = sched) = other_, '일정이 기타로 이동';
  assert (select count(*) from public.goals) = 0, '목표 삭제';
end $$;

-- ---- B 로 전환: A의 데이터가 안 보이고 건드릴 수 없다 ----
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
do $$
declare a_cat uuid; n int;
begin
  assert (select count(*) from public.schedules) = 0, 'B에게 A의 일정이 보이면 안 됨';
  assert (select count(*) from public.categories) = 6, 'B는 자기 카테고리만';
  select id into a_cat from public.categories where default_key='study';   -- B의 것
  -- A의 카테고리 id 를 알아도 B 일정에 붙일 수 없다 (복합 FK + RLS)
  reset role;
  select id into a_cat from public.categories where user_id='aaaaaaaa-0000-0000-0000-000000000001' limit 1;
  set role authenticated; set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
  begin insert into public.schedules (category_id, title, date, start_time, end_time) values (a_cat, 'x', '2026-11-02', '10:00', '11:00'); assert false, 'A의 카테고리를 쓸 수 있으면 안 됨';
  exception when foreign_key_violation then null; end;
  -- 남의 user_id 로 직접 삽입 불가
  begin insert into public.categories (user_id, name, bg, ink) values ('aaaaaaaa-0000-0000-0000-000000000001', '침입', '#000000', '#ffffff'); assert false;
  exception when insufficient_privilege then null; end;
  -- 수정/삭제도 0행
  update public.categories set name = '해킹' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'; get diagnostics n = row_count;
  assert n = 0, '남의 행은 수정 0건';
end $$;

-- ---- 비로그인(anon) 은 아무것도 못 본다 ----
reset role; set role anon;
do $$ begin
  begin perform 1 from public.schedules; assert false, 'anon 은 접근 불가'; exception when insufficient_privilege then null; end;
end $$;

-- ---- 계정 삭제 시 전부 연쇄 삭제 ----
reset role;
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from public.categories where user_id='aaaaaaaa-0000-0000-0000-000000000001') = 0, '연쇄 삭제';
  assert (select count(*) from public.schedules) = 0;
end $$;
\echo '== RLS scenario: ALL PASSED =='
