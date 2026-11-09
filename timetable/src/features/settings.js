// 설정 화면. 예전에 '준비 중' 토스트였던 탭이 이제 실제 설정이 된다:
// 계정 · 카테고리 관리 · 주 시작 요일 · 알림 · 데이터 초기화 · 사용법 다시 보기

import { state, bus, isDefaultCategory, weeklyGoalMinutes } from "../state/store.js";
import { updateSettings, updateProfile, deleteCategory, moveCategory, removeAllSchedules } from "../state/actions.js";
import { NOTIFY_MINUTES_OPTIONS } from "../data/defaults.js";
import { fmtDuration } from "../lib/dates.js";
import { $, sheetController, escapeHtml } from "../lib/dom.js";
import { showToast } from "../lib/toast.js";
import { openCategorySheet } from "./category-sheet.js";
import { themePickerHtml, isTheme, hasThemeChoice } from "../lib/themes.js";
import { enableNotifications, systemNotificationsGranted, IN_APP_NOTICE } from "./notify.js";

const APP_VERSION = "2.0.0";

export function initSettings({ onSignOut, onReplayOnboarding }) {
  const sheetEl = $("settingsSheet");
  const ctl = sheetController($("settingsBackdrop"), sheetEl);
  const body = $("settingsBody");
  const confirmTimers = new Map();

  const minutesLabel = (m) => (m === 0 ? "정각에" : m === 60 ? "1시간 전" : `${m}분 전`);

  function render() {
    const { repo, user, profile, settings, categories } = state;
    const isLocal = repo.mode === "local";
    const initial = (profile.displayName || (user && user.email) || "나").trim().charAt(0).toUpperCase();

    const catRows = categories
      .map((c, i) => {
        const goal = weeklyGoalMinutes(c.id);
        const isDef = isDefaultCategory(c);
        return `
        <div class="set-cat" data-id="${c.id}">
          <span class="set-cat-dot" style="background:${c.bg}"></span>
          <div class="set-cat-main">
            <div class="set-cat-name">${escapeHtml(c.name)}${isDef ? '<span class="set-tag">기본</span>' : ""}</div>
            ${goal ? `<div class="set-cat-sub">주간 목표 ${fmtDuration(goal)}</div>` : ""}
          </div>
          <div class="set-cat-actions">
            <button type="button" class="set-icon-btn" data-action="cat-up" aria-label="위로" ${i === 0 ? "disabled" : ""}>▲</button>
            <button type="button" class="set-icon-btn" data-action="cat-down" aria-label="아래로" ${i === categories.length - 1 ? "disabled" : ""}>▼</button>
            <button type="button" class="set-text-btn" data-action="cat-edit">편집</button>
            ${isDef ? "" : '<button type="button" class="set-text-btn danger" data-action="cat-delete" data-confirm-label="삭제할까요?">삭제</button>'}
          </div>
        </div>`;
      })
      .join("");

    const accountBlock = isLocal
      ? `<div class="set-note">로컬 모드 — 로그인 없이 이 기기의 브라우저에만 저장돼요. 브라우저 데이터를 지우면 일정도 함께 사라져요.</div>`
      : `<div class="set-sub">${escapeHtml((user && user.email) || "")}</div>`;

    body.innerHTML = `
      <section class="set-group">
        <h3 class="set-h">계정</h3>
        <div class="set-card">
          <div class="set-profile">
            <div class="set-avatar">${escapeHtml(initial)}</div>
            <div class="set-profile-main">
              <input class="set-name" id="setNameInput" type="text" maxlength="30" value="${escapeHtml(profile.displayName)}" placeholder="이름" aria-label="이름">
              ${accountBlock}
            </div>
          </div>
          ${isLocal ? "" : '<button type="button" class="set-row-btn" data-action="signout">로그아웃</button>'}
        </div>
      </section>

      ${
        hasThemeChoice()
          ? `<section class="set-group">
        <h3 class="set-h">테마</h3>
        <div class="set-card set-theme">${themePickerHtml(settings.theme)}</div>
        <p class="set-foot">배경과 글자색이 함께 바뀌고, 로그인한 모든 기기에 적용돼요.</p>
      </section>`
          : ""
      }

      <section class="set-group">
        <h3 class="set-h">카테고리</h3>
        <div class="set-card set-cats">
          ${catRows}
          <button type="button" class="set-row-btn" data-action="cat-add">+ 카테고리 추가</button>
        </div>
        <p class="set-foot">기본 카테고리는 이름·색만 바꿀 수 있고 삭제할 수 없어요. 카테고리를 삭제하면 그 일정은 '기타'로 옮겨져요.</p>
      </section>

      <section class="set-group">
        <h3 class="set-h">보기</h3>
        <div class="set-card">
          <div class="set-row">
            <div class="set-row-label">한 주의 시작</div>
            <div class="stat-seg seg-anim" id="setWeekStart">
              <button type="button" data-week="0" class="${settings.weekStart === 0 ? "active" : ""}">일요일</button>
              <button type="button" data-week="1" class="${settings.weekStart === 1 ? "active" : ""}">월요일</button>
            </div>
          </div>
        </div>
        <p class="set-foot">캘린더와 주간 통계에 적용돼요.</p>
      </section>

      <section class="set-group">
        <h3 class="set-h">알림</h3>
        <div class="set-card">
          <div class="set-row">
            <div class="set-row-label">일정 시작 알림</div>
            <button type="button" class="set-switch" role="switch" aria-checked="${settings.notifyEnabled}" data-action="notify-toggle"><span></span></button>
          </div>
          <div class="set-row set-row-stack ${settings.notifyEnabled ? "" : "disabled"}">
            <div class="set-row-label">알림 시점</div>
            <div class="stat-seg set-seg-wide seg-anim" id="setNotifyMinutes" role="radiogroup" aria-label="알림 시점">
              ${NOTIFY_MINUTES_OPTIONS.map((m) => {
                const on = m === settings.notifyMinutesBefore;
                return `<button type="button" role="radio" aria-checked="${on}" data-min="${m}" class="${on ? "active" : ""}" ${settings.notifyEnabled ? "" : "disabled"}>${minutesLabel(m)}</button>`;
              }).join("")}
            </div>
          </div>
        </div>
        <p class="set-foot">${settings.notifyEnabled && !systemNotificationsGranted() ? IN_APP_NOTICE : "디데이·메모가 있는 날은 그날이 되자마자(00:00) 알려 드려요. 앱이 열려 있는 동안만 알릴 수 있어요."}</p>
      </section>

      <section class="set-group">
        <h3 class="set-h">데이터</h3>
        <div class="set-card">
          <button type="button" class="set-row-btn danger" data-action="wipe" data-confirm-label="정말 모든 일정을 삭제할까요? 한 번 더 누르세요">모든 일정 삭제</button>
        </div>
      </section>

      <section class="set-group">
        <h3 class="set-h">도움말</h3>
        <div class="set-card">
          <button type="button" class="set-row-btn" data-action="replay">사용법 다시 보기</button>
        </div>
        <p class="set-foot center">TIMETABLE v${APP_VERSION}</p>
      </section>`;
  }

  // 위험한 동작은 '한 번 더 누르면 실행' (3초 안에)
  function needsConfirm(btn) {
    const key = btn.dataset.action + (btn.closest(".set-cat") ? btn.closest(".set-cat").dataset.id : "");
    if (confirmTimers.has(key)) {
      // 두 번째 누름: 원래 모양으로 되돌리고 실행하러 간다
      clearTimeout(confirmTimers.get(key).timer);
      btn.textContent = confirmTimers.get(key).original;
      btn.classList.remove("armed");
      confirmTimers.delete(key);
      return false;
    }
    const original = btn.textContent;
    btn.textContent = btn.dataset.confirmLabel || "한 번 더";
    btn.classList.add("armed");
    const timer = setTimeout(() => {
      confirmTimers.delete(key);
      btn.textContent = original;
      btn.classList.remove("armed");
    }, 3000);
    confirmTimers.set(key, { timer, original });
    return true;
  }

  async function run(fn, okMsg) {
    try {
      await fn();
      if (okMsg) showToast(okMsg);
    } catch (err) {
      showToast(err.message || "처리하지 못했어요");
    }
  }

  // ---- 버튼 묶음(.seg-anim): 선택 표시(thumb)가 고른 버튼으로 미끄러져 간다 ----
  // 저장하면 화면이 다시 그려지므로, 먼저 표시를 움직이고 애니메이션(.28s)이 끝난 뒤 저장한다
  const SEG_ANIM_MS = 280;
  function placeThumb(seg, animate) {
    const active = seg.querySelector("button.active");
    let thumb = seg.querySelector(".seg-thumb");
    if (!thumb) {
      thumb = document.createElement("span");
      thumb.className = "seg-thumb";
      seg.prepend(thumb);
    }
    if (!active || !active.offsetWidth) return; // 시트가 아직 숨겨져 있으면 잴 수 없다
    thumb.style.transition = animate ? "" : "none";
    thumb.style.width = active.offsetWidth + "px";
    thumb.style.transform = `translateX(${active.offsetLeft}px)`;
    seg.classList.add("has-thumb"); // 이때부터 버튼 자체 배경 대신 thumb 가 선택 표시를 맡는다
  }
  const placeAllThumbs = () => body.querySelectorAll(".seg-anim").forEach((seg) => placeThumb(seg, false));
  function slideTo(btn, save) {
    const seg = btn.closest(".seg-anim");
    if (btn.classList.contains("active") || seg.dataset.busy) return;
    seg.dataset.busy = "1";
    seg.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b === btn);
      if (b.hasAttribute("role")) b.setAttribute("aria-checked", String(b === btn));
    });
    placeThumb(seg, true);
    setTimeout(() => run(save).finally(() => delete seg.dataset.busy), SEG_ANIM_MS);
  }

  body.addEventListener("click", (e) => {
    const weekBtn = e.target.closest("#setWeekStart button");
    if (weekBtn) {
      slideTo(weekBtn, () => updateSettings({ weekStart: +weekBtn.dataset.week }));
      return;
    }
    const minBtn = e.target.closest("#setNotifyMinutes button");
    if (minBtn) {
      if (!minBtn.disabled) slideTo(minBtn, () => updateSettings({ notifyMinutesBefore: +minBtn.dataset.min }));
      return;
    }
    const themeBtn = e.target.closest("[data-theme-id]");
    if (themeBtn) {
      const id = themeBtn.dataset.themeId;
      if (isTheme(id) && id !== state.settings.theme) run(() => updateSettings({ theme: id }));
      return;
    }
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const row = btn.closest(".set-cat");
    const id = row && row.dataset.id;
    const cat = id && state.categories.find((c) => c.id === id);

    switch (btn.dataset.action) {
      case "cat-up":
        return run(() => moveCategory(id, -1));
      case "cat-down":
        return run(() => moveCategory(id, 1));
      case "cat-edit":
        return openCategorySheet({ category: cat });
      case "cat-add":
        return openCategorySheet({});
      case "cat-delete":
        if (needsConfirm(btn)) return;
        return run(() => deleteCategory(id), "카테고리를 삭제했어요");
      case "notify-toggle": {
        // 저장하면 설정 화면이 다시 그려져 스위치가 바뀌어 버리므로, 먼저 화면에서 스위치를 움직이고
        // 미끄러지는 애니메이션(.28s)이 끝난 뒤 저장한다
        if (btn.dataset.busy) return;
        btn.dataset.busy = "1";
        const turnOn = !state.settings.notifyEnabled;
        btn.setAttribute("aria-checked", String(turnOn));
        const minutesRow = $("setNotifyMinutes") && $("setNotifyMinutes").closest(".set-row");
        if (minutesRow) minutesRow.classList.toggle("disabled", !turnOn);
        return setTimeout(
          () =>
            run(async () => {
              if (!turnOn) {
                await updateSettings({ notifyEnabled: false });
                return;
              }
              const res = await enableNotifications();
              await updateSettings({ notifyEnabled: true });
              if (!res.system) showToast("알림을 켰어요. 앱 안 알림으로 알려 드려요");
            }).finally(() => delete btn.dataset.busy),
          280
        );
      }
      case "wipe":
        if (needsConfirm(btn)) return;
        return run(removeAllSchedules, "모든 일정을 삭제했어요");
      case "replay":
        ctl.close();
        return onReplayOnboarding();
      case "signout":
        return run(async () => {
          ctl.close();
          await onSignOut();
        });
    }
  });

  body.addEventListener("change", (e) => {
    if (e.target.id === "setNameInput") {
      const v = e.target.value.trim();
      run(async () => {
        await updateProfile({ displayName: v });
        render();
      });
    }
  });

  const rerender = () => {
    if (!ctl.isOpen()) return;
    // 이름 입력 중에는 입력칸이 사라지지 않도록 건너뛴다
    if (document.activeElement && document.activeElement.id === "setNameInput") return;
    render();
    placeAllThumbs();
  };
  bus.on("categories", rerender);
  bus.on("settings", rerender);
  bus.on("goals", rerender);

  $("settingsCloseBtn").addEventListener("click", ctl.close);

  return {
    open() {
      render();
      ctl.open();
      placeAllThumbs(); // 시트가 보인 뒤라야 버튼 위치를 잴 수 있다
    },
    close: ctl.close,
  };
}
