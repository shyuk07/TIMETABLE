// 앱 진입점 — 흐름: (서비스 모드) 로그인 → (첫 사용) 온보딩 → 메인(타임라인/캘린더/통계/설정)

import "./styles/index.css";
import { createRepo } from "./data/index.js";
import { state, bus } from "./state/store.js";
import { applyTheme } from "./lib/themes.js";
import { loadCore, setViewDate } from "./state/actions.js";
import { $ } from "./lib/dom.js";
import { initTimeline, activateTimeline, onItemClick } from "./features/timeline.js";
import { initScheduleSheet } from "./features/schedule-sheet.js";
import { initDragCreate } from "./features/drag-create.js";
import { initCalendar } from "./features/calendar.js";
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

  // ---- 탭바 / 헤더 ----
  const closeSheets = () => [calendar, stats, settings].forEach((s) => s.close());
  document.querySelectorAll(".tab-item").forEach((tab) => {
    tab.addEventListener("click", () => {
      const t = tab.dataset.tab;
      closeSheets();
      if (t === "calendar") calendar.open();
      else if (t === "stats") stats.open();
      else if (t === "settings") settings.open();
    });
  });
  $("menuBtn").addEventListener("click", () => {
    closeSheets();
    settings.open();
  });

  // ---- 라우팅 ----
  let entered = false;
  let notificationsStarted = false;
  let routeToken = 0;

  async function enterApp() {
    mainView.hidden = false;
    entered = true;
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
