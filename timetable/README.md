# TIMETABLE (timetable)

하루를 타임라인으로 계획하고, 통계로 돌아보는 시간관리/학습 앱.
Vite + 순수 JavaScript(ES 모듈) · 백엔드는 Supabase(PostgreSQL + Auth) · 정적 파일로 배포됩니다.

```
로그인(이메일 링크 / Google)  →  온보딩(이름·사용법·카테고리·설정)  →  타임라인 · 캘린더 · 통계 · 설정
```

## 빠른 시작

```bash
npm install
npm run dev        # http://localhost:5173
```

환경변수를 설정하지 않으면 **로컬 모드**로 동작합니다. 로그인 없이 브라우저(localStorage)에만 저장되고, 나머지 흐름(온보딩 · 설정 · 통계…)은 똑같이 동작합니다. 바로 써 보거나 UI를 만질 때 편합니다.

서비스 모드(로그인 + 클라우드 저장)로 바꾸려면 [docs/DEPLOY.md](docs/DEPLOY.md)의 순서대로 Supabase를 연결하세요. 5분이면 됩니다.

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | `dist/` 에 배포용 정적 파일 생성 |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm test` | 단위 테스트 (vitest) |

## 폴더 구조

```
timetable/
├─ index.html                  화면 뼈대 (로그인 · 온보딩 · 메인 · 각종 시트)
├─ public/                     manifest.webmanifest, 아이콘 (PWA / 홈 화면 추가)
├─ src/
│  ├─ main.js                  진입점: 로그인 → 온보딩 → 메인 라우팅
│  ├─ data/                    ── 데이터 계층 (화면은 여기만 통해 저장)
│  │  ├─ index.js              환경변수 유무로 저장소 선택
│  │  ├─ local-repo.js         로컬 모드 (localStorage)
│  │  ├─ supabase-repo.js      서비스 모드 (Supabase)
│  │  └─ defaults.js           기본 카테고리 · 색상 · 설정 기본값
│  ├─ state/
│  │  ├─ store.js              공유 상태 + 이벤트 버스
│  │  └─ actions.js            상태를 바꾸는 모든 동작 (repo 호출 → 상태 → 알림)
│  ├─ features/                ── 화면 기능
│  │  ├─ timeline.js           헤더 · 시간 레일 · 일정 블록 · 현재 시각선
│  │  ├─ drag-create.js        길게 눌러 끌어서 일정 만들기
│  │  ├─ schedule-sheet.js     일정 추가/수정
│  │  ├─ chip-row.js           카테고리 칩 (길게 눌러 삭제)
│  │  ├─ category-sheet.js     카테고리 추가/편집 (+ 주간 목표)
│  │  ├─ timepicker.js         휠 시간 선택기
│  │  ├─ calendar.js           날짜 이동 (공휴일 · 일정 있는 날 점)
│  │  ├─ stats.js              일/주/월/년 통계
│  │  ├─ settings.js           설정 화면
│  │  ├─ auth-view.js          로그인 화면
│  │  ├─ onboarding.js         온보딩
│  │  └─ notify.js             일정 시작 알림 (시스템 알림 → 막히면 앱 안 배너)
│  ├─ lib/                     dates · holidays(2025–2030) · themes · toast · dom · emitter
│  └─ styles/                  CSS (화면별로 분리)
├─ supabase/migrations/                0001_init.sql(테이블 5개 + 트리거 + RLS), 0002_theme.sql(배경 테마), 0003_default_black.sql(기본 테마 black), 0004_d_days.sql(디데이), 0005_memos.sql(메모)
├─ tests/                      vitest 단위 테스트 + Postgres RLS 시나리오(SQL)
├─ docs/DEPLOY.md              Supabase 연결 · 배포 · 앱스토어 가이드
└─ .github/workflows/          CI(테스트+빌드), GitHub Pages 배포
```

## 설계 메모

**저장소 추상화.** 화면 코드는 `state.repo` 의 메서드(`schedules.listByDate`, `categories.create` …)만 부릅니다. 같은 인터페이스를 `local-repo` 와 `supabase-repo` 가 구현하므로 환경변수 하나로 저장소가 바뀌고, 화면은 어느 쪽인지 몰라도 됩니다. 새 백엔드(예: Firebase)를 붙이려면 같은 인터페이스의 repo 파일 하나만 추가하면 됩니다.

**규칙은 DB가 보장, 로컬은 똑같이 흉내.** "기본 카테고리는 삭제 불가", "카테고리를 지우면 그 일정은 '기타'로", "이름 중복 금지", "종료 > 시작" 같은 규칙은 DB(트리거/제약)에 있고, `local-repo` 가 같은 규칙을 JS로 지킵니다. 두 구현의 동작은 `tests/local-repo.test.js` 와 `tests/rls_scenario.sql`(scripts/test-db.sh) 로 각각 검증합니다.

**보안.** 모든 테이블에 Row Level Security 가 켜져 있어 로그인한 사용자는 자기 행만 읽고 쓸 수 있습니다. 프런트에 들어가는 anon 키는 공개돼도 안전하도록 설계된 키입니다(권한은 RLS 가 결정). `service_role` 키는 절대 프런트/저장소에 넣지 마세요.

**테마.** 색은 전부 CSS 변수(토큰)이고, `src/styles/themes.css` 가 테마별로 같은 변수를 덮어씁니다(`<html data-theme="...">`). 기본 테마는 "블랙"이고, 테마가 2개 이상이면 설정·온보딩에 선택 UI가 나타납니다. 선택값은 `user_settings.theme` 에 저장되어 모든 기기에 적용됩니다. 테마를 추가하려면 `themes.css` 에 블록(주석의 템플릿 참고) + `src/lib/themes.js` 목록에 한 줄을 더하면 되고, DB 마이그레이션은 필요 없습니다.

**통계.** 별도 테이블 없이 일정(`schedules`)을 합산해 계산합니다. 막대 높이는 최댓값 기준이 아니라 고정 눈금(일·주·년 24시간, 월 168시간)입니다.

**시간 표기.** 앱 안에서는 24시간 `"HH:MM"` 문자열을 씁니다. Postgres `time` 은 `"09:00:00"` 으로 오기 때문에 repo 경계에서 `"09:00"` 으로 정규화합니다.

## 알려진 한계

- 알림은 브라우저 알림 기반이라 **앱(탭)이 열려 있는 동안에만** 울립니다. 앱을 닫은 뒤에도 받으려면 네이티브 래핑(Capacitor) 후 로컬 알림 플러그인을 쓰세요 → docs/DEPLOY.md
- 공휴일은 `src/lib/holidays.js` 의 표(2025–2030)입니다. 2031년 이후는 표를 이어서 채워야 합니다.
- 여러 기기에서 동시에 편집할 때 실시간 반영(Realtime 구독)은 넣지 않았습니다. 화면 이동/저장 시점에 다시 불러옵니다.

## 이전 버전

단일 HTML → 분리된 정적 파일(Firebase) 버전은 `timetable-v1-static/` 에 그대로 보관돼 있습니다 (이 프로젝트와 무관하게 동작).
