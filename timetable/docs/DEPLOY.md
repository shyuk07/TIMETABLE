# 배포 가이드

흐름은 세 단계입니다: **① Supabase 만들기 → ② 사이트 올리기 → ③ (선택) 앱스토어용 앱으로 감싸기.**

## 1. Supabase 연결 (서비스 모드)

1. <https://supabase.com> 에서 프로젝트 생성 (리전은 `Northeast Asia (Seoul)` 권장).
2. **SQL Editor** 에 `supabase/migrations/0001_init.sql` 전체를 붙여넣고 **Run**, 이어서 `0002_theme.sql` 도 같은 방법으로 **Run**.
   → 테이블 5개, 가입 시 기본 카테고리 6개 자동 생성 트리거, RLS 정책, 배경 테마 컬럼이 만들어집니다. (번호 순서대로, 한 번씩만)
3. **Authentication → Providers**
   - **Email**: 켜져 있는지 확인 (기본값). 비밀번호 없이 로그인 링크(매직 링크)를 쓰므로 *Confirm email* 설정과 무관하게 동작합니다.
   - **Google**(선택): Google Cloud Console 에서 OAuth 클라이언트(웹)를 만들고, 승인된 리디렉션 URI 에 Supabase 가 알려 주는 `https://<프로젝트>.supabase.co/auth/v1/callback` 을 넣은 뒤 Client ID/Secret 을 Supabase 에 입력.
4. **Authentication → URL Configuration**
   - *Site URL*: 배포한 주소 (예: `https://timetable.vercel.app`)
   - *Redirect URLs*: 배포 주소 + 개발 주소(`http://localhost:5173`) 를 모두 추가. 여기에 없는 주소로는 로그인 링크가 돌아오지 못합니다.
5. **Project Settings → API** 의 `Project URL` 과 `anon public` 키를 복사.
6. 로컬 확인: 프로젝트 루트에 `.env.local` 파일을 만들고

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

   `npm run dev` → 로그인 화면이 나오면 성공. (`.env.local` 은 git 에 올라가지 않습니다.)

> 메일 발송 한도: Supabase 기본 메일 서버는 시간당 발송 수가 매우 적습니다(테스트용). 실제 사용자를 받기 전에 **Authentication → SMTP Settings** 에 Resend / SendGrid 같은 SMTP 를 연결하세요.

## 2. 사이트 배포

빌드 결과는 `dist/` 의 정적 파일뿐이라 어디에 올려도 됩니다. 어느 곳이든 **환경변수 두 개**(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)를 빌드 설정에 넣어야 합니다. (Vite 는 빌드 시점에 값을 주입하므로, 값을 바꾸면 다시 배포해야 합니다.)

### Vercel (가장 쉬움)
GitHub 저장소 연결 → *Add New Project* → Framework 는 자동으로 Vite → Environment Variables 에 두 값 입력 → Deploy. (`vercel.json` 포함)

### Netlify
*Add new site → Import from Git* → 빌드 명령 `npm run build`, 게시 폴더 `dist` (`netlify.toml` 포함) → Site settings 에서 환경변수 두 개 추가.

### GitHub Pages
1. 저장소 **Settings → Pages → Source** 를 **GitHub Actions** 로.
2. **Settings → Secrets and variables → Actions → Variables** 에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 추가 (anon 키는 공개용이라 Variables 로 충분합니다).
3. `main` 에 푸시하면 `.github/workflows/pages.yml` 이 빌드·배포합니다.
4. 주소가 `https://<계정>.github.io/<저장소>/` 처럼 하위 경로여도 동작합니다(`vite.config.js` 의 `base: "./"`). Supabase *Redirect URLs* 에 이 주소를 넣는 것을 잊지 마세요.

## 3. 앱스토어 / 플레이스토어 (선택)

웹앱을 그대로 감싸는 **Capacitor** 를 권장합니다.

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init TIMETABLE com.example.harugyeol --web-dir=dist
npm run build
npx cap add ios && npx cap add android
npx cap sync
npx cap open ios      # Xcode (Mac 필요, Apple Developer 연 $99)
npx cap open android  # Android Studio (Google Play 1회 $25)
```

네이티브로 갈 때 챙길 것:

- **로그인 링크 복귀**: 앱 안에서는 매직 링크가 브라우저로 열립니다. `@capacitor/app` 의 딥링크(커스텀 URL 스킴)를 설정하고 Supabase *Redirect URLs* 에 그 스킴을 추가해야 앱으로 돌아옵니다. (Google 로그인도 같은 방식)
- **Sign in with Apple**: iOS 앱에서 Google 같은 소셜 로그인을 제공하면 App Store 심사 규정상 Apple 로그인도 함께 제공해야 합니다. 이메일 링크만 쓰면 해당 없습니다.
- **알림**: 앱을 닫아도 울리려면 `@capacitor/local-notifications` 로 일정 시작 시각에 로컬 알림을 예약하도록 `src/features/notify.js` 를 확장하세요 (지금은 브라우저 알림 기반).
- **계정 삭제**: App Store 는 앱 안에서 계정 삭제를 요구합니다. 클라이언트에서는 `auth.users` 를 지울 수 없으므로 Supabase Edge Function(service_role 사용)으로 만들어 설정 화면에 연결하세요. 현재는 '모든 일정 삭제'까지만 있습니다.
- **개인정보처리방침 URL**, 아이콘(1024×1024), 스크린샷이 심사에 필요합니다.

## 운영 체크리스트

- [ ] `0001_init.sql`, `0002_theme.sql` 순서대로 실행 확인 (Table Editor 에 5개 테이블, 각 테이블 RLS *enabled*)
- [ ] Redirect URLs 에 배포 주소 추가
- [ ] 커스텀 SMTP 연결
- [ ] 새 계정으로 가입 → 기본 카테고리 6개가 보이는지 확인
- [ ] 계정 두 개로 서로의 일정이 안 보이는지 확인
- [ ] `service_role` 키가 프런트 코드/환경변수/저장소 어디에도 없는지 확인

## DB 를 바꿀 때

`supabase/migrations/` 에 `0002_...sql` 처럼 번호를 이어서 파일을 추가하세요. 이미 적용한 파일은 수정하지 않습니다. Supabase CLI 를 쓴다면 `supabase db push` 로 적용됩니다.
로컬 Postgres 에서 규칙을 확인하려면 `tests/db_stub_auth.sql`(Supabase 대역 스텁) → `0001_init.sql` → `tests/rls_scenario.sql` 순서로 실행하세요.
