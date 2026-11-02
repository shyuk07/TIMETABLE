// 온보딩: 가입 직후 한 번(또는 설정 > 사용법 다시 보기). 이름 → 사용법 → 카테고리 → 설정

import { state } from "../state/store.js";
import { updateProfile, updateSettings } from "../state/actions.js";
import { $, escapeHtml } from "../lib/dom.js";
import { showToast } from "../lib/toast.js";
import { openCategorySheet } from "./category-sheet.js";
import { enableNotifications } from "./notify.js";
import { themePickerHtml, isTheme, hasThemeChoice } from "../lib/themes.js";

const STEPS = ["name", "howto", "categories", "prefs"];

export function initOnboarding() {
  const view = $("onboardView");
  const bodyEl = $("obBody");
  const dotsEl = $("obDots");
  const backBtn = $("obBackBtn");
  const nextBtn = $("obNextBtn");
  let step = 0;
  let onFinish = () => {};
  let draftName = "";

  function stepHtml(id) {
    if (id === "name") {
      return `
        <div class="ob-icon" aria-hidden="true">☀</div>
        <h1 class="ob-title">환영해요!</h1>
        <p class="ob-desc">TIMETABLE은 하루를 시간 단위로 계획하고,<br>얼마나 썼는지 돌아보는 앱이에요.<br>먼저, 뭐라고 부르면 될까요?</p>
        <div class="field ob-field">
          <label for="obName">이름</label>
          <input type="text" id="obName" maxlength="30" placeholder="예: 상혁" value="${escapeHtml(draftName)}" autocomplete="nickname">
        </div>`;
    }
    if (id === "howto") {
      return `
        <h1 class="ob-title">이렇게 써요</h1>
        <p class="ob-desc">세 가지만 기억하면 돼요.</p>
        <div class="ob-tips">
          <div class="ob-tip"><b>일정 만들기</b><span>타임라인을 길게 누른 채 위아래로 끌어 시간을 고르거나, + 버튼을 눌러요.</span></div>
          <div class="ob-tip"><b>날짜 이동</b><span>아래 캘린더 탭에서 날짜를 고르면 그날의 타임라인으로 가요. 일정이 있는 날엔 점이 찍혀요.</span></div>
          <div class="ob-tip"><b>돌아보기</b><span>통계 탭에서 카테고리별로 일·주·월·년 사용 시간을 볼 수 있어요.</span></div>
        </div>`;
    }
    if (id === "categories") {
      const chips = state.categories.map((c) => `<span class="chip" data-active="true" style="--chip-bg:${c.bg};--chip-ink:${c.ink}">${escapeHtml(c.name)}</span>`).join("");
      return `
        <h1 class="ob-title">카테고리</h1>
        <p class="ob-desc">일정은 카테고리로 나뉘어 통계에 쌓여요.<br>기본 ${state.categories.filter((c) => c.defaultKey).length}개가 준비돼 있고, 내 것을 더할 수 있어요.</p>
        <div class="chip-row ob-chips">${chips}<button type="button" class="ob-add-chip" id="obAddCat">+ 추가</button></div>
        <p class="ob-foot">나중에 설정에서 이름·색·순서를 바꾸거나 주간 목표를 정할 수 있어요.</p>`;
    }
    const s = state.settings;
    return `
      <h1 class="ob-title">마지막 설정</h1>
      <p class="ob-desc">언제든 설정에서 바꿀 수 있어요.</p>
      ${hasThemeChoice() ? `<div class="set-card ob-card ob-theme">${themePickerHtml(s.theme)}</div>` : ""}
      <div class="set-card ob-card">
        <div class="set-row">
          <div class="set-row-label">한 주의 시작</div>
          <div class="stat-seg" id="obWeek">
            <button type="button" data-week="0" class="${s.weekStart === 0 ? "active" : ""}">일요일</button>
            <button type="button" data-week="1" class="${s.weekStart === 1 ? "active" : ""}">월요일</button>
          </div>
        </div>
        <div class="set-row">
          <div class="set-row-label">일정 시작 알림<small>${s.notifyMinutesBefore}분 전, 앱이 열려 있을 때</small></div>
          <button type="button" class="set-switch" role="switch" aria-checked="${s.notifyEnabled}" id="obNotify"><span></span></button>
        </div>
      </div>`;
  }

  function render() {
    dotsEl.innerHTML = STEPS.map((_, i) => `<span class="${i === step ? "on" : i < step ? "done" : ""}"></span>`).join("");
    bodyEl.innerHTML = stepHtml(STEPS[step]);
    backBtn.hidden = step === 0;
    nextBtn.textContent = step === STEPS.length - 1 ? "시작하기" : "다음";
    const nameInput = $("obName");
    if (nameInput) nameInput.focus({ preventScroll: true });
  }

  function captureName() {
    const el = $("obName");
    if (el) draftName = el.value.trim();
  }

  async function finish() {
    captureName();
    try {
      if (draftName && draftName !== state.profile.displayName) await updateProfile({ displayName: draftName });
      if (!state.profile.onboarded) await updateProfile({ onboarded: true });
    } catch (err) {
      showToast(err.message || "저장하지 못했어요");
      return;
    }
    view.hidden = true;
    onFinish();
  }

  nextBtn.addEventListener("click", () => {
    captureName();
    if (step < STEPS.length - 1) {
      step += 1;
      render();
    } else finish();
  });
  backBtn.addEventListener("click", () => {
    captureName();
    if (step > 0) {
      step -= 1;
      render();
    }
  });
  $("obSkipBtn").addEventListener("click", finish);

  bodyEl.addEventListener("click", async (e) => {
    if (e.target.id === "obAddCat") {
      openCategorySheet({ onDone: () => render() });
      return;
    }
    const themeBtn = e.target.closest("[data-theme-id]");
    if (themeBtn) {
      const id = themeBtn.dataset.themeId;
      if (!isTheme(id)) return;
      try {
        await updateSettings({ theme: id });
        render();
      } catch (err) {
        showToast(err.message || "처리하지 못했어요");
      }
      return;
    }
    const week = e.target.closest("#obWeek button");
    if (week) {
      try {
        await updateSettings({ weekStart: +week.dataset.week });
        render();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }
    const sw = e.target.closest("#obNotify");
    if (sw) {
      try {
        if (state.settings.notifyEnabled) await updateSettings({ notifyEnabled: false });
        else {
          const res = await enableNotifications();
          await updateSettings({ notifyEnabled: true });
          if (!res.system) showToast("알림을 켰어요. 앱 안 알림으로 알려 드려요");
        }
        render();
      } catch (err) {
        showToast(err.message || "처리하지 못했어요");
      }
    }
  });

  return {
    start(opts = {}) {
      onFinish = opts.onFinish || (() => {});
      step = 0;
      draftName = state.profile.displayName || (state.user && state.user.name) || (state.user && state.user.email ? state.user.email.split("@")[0] : "") || "";
      view.hidden = false;
      render();
    },
  };
}
