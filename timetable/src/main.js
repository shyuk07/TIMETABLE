// 앱 진입점 — 흐름: (서비스 모드) 로그인 → (첫 사용) 온보딩 → 메인(타임라인/캘린더/통계/설정)

import "./styles/index.js";
import { createRepo } from "./data/index.js";
import { state, bus } from "./state/store.js";
import { applyTheme } from "./lib/themes.js";
import { loadCore, setViewDate } from "./state/actions.js";
import { $ } from "./lib/dom.js";
import { initTimeline, activateTimeline, onItemClick } from "./features/timeline.js";
import { initScheduleSheet } from "./features/schedule-sheet.js";
import { initDragCreate } from "./features/drag-create.js";
import { initCalendar } from "./features/calendar.js";
import { initHome, setMode } from "./features/home.js";
import { initStats } from "./features/stats.js";
import { initSettings } from "./features/settings.js";
import { initAuthView } from "./features/auth-view.js";
import { initOnboarding } from "./features/onboarding.js";
import { initNotifications } from "./features/notify.js";

const mainView = $("mainView");
const fatalView = $("fatalView");

function showFatal(err) {
  console.error("[timetable]", err);
  $("fatalMsg").textContent = (err && err.message) || "네트워크 연결을 확인하고 다시 시도해 주세요.";
  mainView.hidden = true;
  fatalView.hidden = false;
}

async function boot() {
  fatalView.hidden = true;
  try {
    state.repo = await createRepo();
  } catch (err) {
    return showFatal(err);
  }
  const repo = state.repo;

  // ---- 화면 모듈 연결 ----
  initTimeline();
  const scheduleSheet = initScheduleSheet();
  onItemClick(scheduleSheet.openEdit);
  initDragCreate({ openNewSheet: scheduleSheet.openNew });
  const calendar = initCalendar();
  const stats = initStats();
  const home = initHome({ openCalendar: () => go("calendar") });
  const auth = initAuthView({ repo });
  const onboarding = initOnboarding();
  const settings = initSettings({
    onSignOut: async () => {
      await repo.auth.signOut();
      location.reload();
    },
    onReplayOnboarding: () => {
      mainView.hidden = true;
      onboarding.start({ onFinish: enterApp });
    },
  });

  // 설정(계정에 저장된 값)이 로드·변경될 때마다 테마를 화면에 적용
  bus.on("settings", () => applyTheme(state.settings.theme));

  // ---- 하단 탭 / 설정 메뉴 ----
  // 탭(홈 · 타임라인 · 캘린더 · 통계)은 어느 화면에서든 늘 보이고, 누르면 그 화면으로 바로 바뀐다.
  // 설정은 오른쪽 위 메뉴(선 3개)로만 연다 — 탭을 누르면 설정은 닫히고 그 화면으로 간다.
  const pages = { calendar, stats };
  function go(tab) {
    settings.close();
    Object.entries(pages).forEach(([k, pg]) => k !== tab && pg.close());
    if (tab === "home") return home.showHome();
    if (tab === "timeline") return home.showTimeline();
    setMode(tab);
    window.scrollTo(0, 0);
    pages[tab].open();
  }
  document.querySelectorAll(".tab-item").forEach((tab) => tab.addEventListener("click", () => go(tab.dataset.tab)));
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-menu]")) settings.open();
  });

  // ---- 라우팅 ----
  let entered = false;
  let notificationsStarted = false;
  let routeToken = 0;

  async function enterApp() {
    mainView.hidden = false;
    entered = true;
    home.showHome(); // 시작 화면은 홈
    activateTimeline();
    await setViewDate(new Date());
    activateTimeline(); // 일정까지 그린 뒤 '지금' 위치로 한 번 더 맞춘다
    if (!notificationsStarted) {
      notificationsStarted = true;
      initNotifications();
    }
  }

  async function route(user) {
    const my = ++routeToken;
    state.user = user;
    if (!user) {
      mainView.hidden = true;
      $("onboardView").hidden = true;
      auth.show();
      return;
    }
    auth.hide();
    try {
      await loadCore();
    } catch (err) {
      if (my === routeToken) showFatal(err);
      return;
    }
    if (my !== routeToken) return;
    if (!state.profile.onboarded) {
      onboarding.start({ onFinish: enterApp });
      return;
    }
    await enterApp();
  }

  $("fatalRetryBtn").addEventListener("click", () => location.reload());

  const unsubscribe = repo.auth.onChange((user) => {
    const sameUser = (user && user.id) === (state.user && state.user.id);
    if (sameUser) return; // 토큰 갱신 등 — 화면을 다시 만들 필요 없음
    if (!user && entered) {
      location.reload(); // 다른 탭에서 로그아웃 → 깨끗한 상태로
      return;
    }
    route(user);
  });
  window.addEventListener("pagehide", unsubscribe);

  await route(await repo.auth.getUser());
}

boot();
