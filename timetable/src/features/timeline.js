// 타임라인 화면: 고정 헤더(날짜 + 지금 시각), 시간 레일, 일정 블록, 현재 시각선.

import { state, bus, categoryById } from "../state/store.js";
import { setViewDate } from "../state/actions.js";
import { DAY_START, DAY_END, PX_PER_MIN, fmtDateLabel, minsNow, toMin, todayStr } from "../lib/dates.js";
import { $ } from "../lib/dom.js";

const wrap = $("timelineWrap");
const appHeader = $("appHeader");
const appEl = document.querySelector(".app");
const railHeight = (DAY_END - DAY_START) * PX_PER_MIN;

// 다른 모듈(드래그 생성)이 쓰는 레이어들
export const dragLayer = document.createElement("div");
export const selectionBox = document.createElement("div");
export const selectionLabel = document.createElement("div");

let blocksLayer, nowLine, emptyNote;
let headerHpx = 148;
let onOpenItem = () => {};

export function onItemClick(fn) {
  onOpenItem = fn;
}

function syncHeaderHeight() {
  const h = appHeader.getBoundingClientRect().height;
  if (h > 0) {
    headerHpx = h;
    document.documentElement.style.setProperty("--header-h", h + "px");
  }
}

// 헤더 밑으로 지나가는 내용이 서서히 사라지도록 마스크를 스크롤마다 직접 계산한다
// (`mask-attachment: fixed` 가 모든 브라우저에서 지원되지 않기 때문)
const FADE_BAND = 12; // 헤더의 "지금" 글자 아래에서만 흐려지게 (크면 지나가는 시간 눈금이 "지금"과 겹쳐 보인다)
let maskTicking = false;
function applyContentMask() {
  maskTicking = false;
  const scrollY = window.pageYOffset;
  const hideEnd = scrollY + headerHpx - FADE_BAND;
  const showStart = scrollY + headerHpx;
  const g = `linear-gradient(to bottom, transparent 0, transparent ${Math.max(0, hideEnd)}px, #000 ${Math.max(0, showStart)}px, #000 100%)`;
  appEl.style.maskImage = g;
  appEl.style.webkitMaskImage = g;
}
function requestMaskUpdate() {
  if (maskTicking) return;
  maskTicking = true;
  requestAnimationFrame(applyContentMask);
}

function updateEmptyNote() {
  emptyNote.textContent =
    (state.viewDateStr === todayStr() ? "오늘" : "이 날짜에") +
    " 등록된 일정이 없어요. + 버튼을 누르거나, 타임라인을 길게 눌러 원하는 시간까지 드래그해 보세요.";
}

function updateDateHeader() {
  $("dateLabel").textContent = fmtDateLabel(state.viewDate);
  $("todayChip").hidden = state.viewDateStr === todayStr();
  // 보고 있는 날의 디데이 이름·메모를 날짜 옆에 띄운다 (같은 날 여러 개면 함께)
  showDatedChip($("ddayChip"), state.ddays);
  showDatedChip($("memoChip"), state.memos);
}
function showDatedChip(chip, items) {
  const names = items.filter((d) => d.date === state.viewDateStr).map((d) => d.title);
  chip.textContent = names.join(" · ");
  chip.title = chip.textContent;
  chip.hidden = !names.length;
}

export function positionNow() {
  const d = new Date();
  $("nowTime").textContent = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");

  // 점선 '지금' 선은 오늘 타임라인에서만 의미가 있다
  if (state.viewDateStr !== todayStr()) {
    nowLine.style.display = "none";
    return;
  }
  const m = minsNow();
  const clamped = Math.max(DAY_START, Math.min(DAY_END, m));
  nowLine.style.top = (clamped - DAY_START) * PX_PER_MIN + "px";
  nowLine.style.display = m < DAY_START || m > DAY_END ? "none" : "block";
}

export function renderBlocks() {
  const items = state.items;
  blocksLayer.innerHTML = "";
  emptyNote.hidden = items.length > 0;

  const GAP = 4;
  const MIN_H = 52; // 제목 + 시간 두 줄이 잘리지 않는 높이
  let maxBottom = 0;

  items.forEach((item, idx) => {
    const s = toMin(item.start);
    let e = toMin(item.end);
    if (e <= s) e = s + 15;
    // 블록의 위쪽은 항상 실제 시작 시각에 맞춘다(이웃을 피해 내려가지 않음).
    // 가독성을 위해 높이만 늘리되, 다음 일정의 실제 시작 전까지만 늘린다.
    const top = (Math.max(s, DAY_START) - DAY_START) * PX_PER_MIN;
    const rawHeight = (e - s) * PX_PER_MIN;
    let height = Math.max(rawHeight, MIN_H);
    const next = items[idx + 1];
    if (next) {
      const nextTop = (Math.max(toMin(next.start), DAY_START) - DAY_START) * PX_PER_MIN;
      height = Math.min(height, Math.max(rawHeight, nextTop - top - GAP));
    }
    maxBottom = Math.max(maxBottom, top + height);

    const cat = categoryById(item.categoryId);
    const el = document.createElement("div");
    el.className = "block";
    el.dataset.cat = cat.defaultKey || cat.id;
    el.style.top = top + "px";
    el.style.height = height + "px";
    el.style.setProperty("--cat-color", cat.bg);
    el.innerHTML = '<div class="block-title"></div><div class="block-time"></div>';
    el.querySelector(".block-title").textContent = item.title;
    el.querySelector(".block-time").textContent = `${item.start} – ${item.end} · ${cat.name}`;
    el.addEventListener("click", () => onOpenItem(item));
    blocksLayer.appendChild(el);
  });

  wrap.style.minHeight = Math.max(railHeight, maxBottom + 24) + "px";
}

/** 앱에 들어오면 맨 위가 아니라 '지금' 근처로 스크롤 */
export function scrollToNow() {
  if ($("mainView").dataset.mode !== "timeline") return; // 홈 화면에서는 타임라인이 숨겨져 있다
  if (state.viewDateStr !== todayStr()) return;
  const clamped = Math.max(DAY_START, Math.min(DAY_END, minsNow()));
  const lineTopInWrap = (clamped - DAY_START) * PX_PER_MIN;
  const wrapAbsTop = wrap.getBoundingClientRect().top + window.pageYOffset;
  window.scrollTo(0, Math.max(0, wrapAbsTop + lineTopInWrap - window.innerHeight * 0.32));
}

/**
 * 홈에서 타임라인으로 들어올 때: 숨겨져 있던 동안 못 잰 헤더 높이를 다시 재고,
 * min(분)이 있으면 그 시각이 헤더 바로 아래에 오게, 없으면 '지금' 위치로 스크롤한다.
 */
export function revealTimeline(min) {
  syncHeaderHeight();
  positionNow();
  if (min == null) {
    if (state.viewDateStr === todayStr()) scrollToNow();
    else window.scrollTo(0, 0);
  } else {
    const wrapAbsTop = wrap.getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo(0, Math.max(0, wrapAbsTop + (min - DAY_START) * PX_PER_MIN - headerHpx - 24));
  }
  applyContentMask();
}

/** 메인 화면이 보이게 된 직후(로그인/온보딩 이후) 한 번 호출 — 숨겨진 동안은 높이를 잴 수 없다 */
export function activateTimeline() {
  syncHeaderHeight();
  applyContentMask();
  updateDateHeader();
  updateEmptyNote();
  positionNow();
  renderBlocks();
  scrollToNow();
}

export function initTimeline() {
  wrap.style.minHeight = railHeight + "px";

  for (let t = DAY_START; t <= DAY_END; t += 60) {
    const row = document.createElement("div");
    row.className = "hour-row";
    row.style.top = (t - DAY_START) * PX_PER_MIN + "px";
    row.innerHTML = `<div class="hour-label">${String(Math.floor(t / 60)).padStart(2, "0")}:00</div><div class="hour-tick"></div>`;
    wrap.appendChild(row);
  }

  dragLayer.className = "drag-layer";
  wrap.appendChild(dragLayer);

  blocksLayer = document.createElement("div");
  blocksLayer.style.cssText = "position:absolute;inset:0;pointer-events:none"; // 개별 .block 만 클릭 가능
  wrap.appendChild(blocksLayer);

  selectionBox.className = "selection-box";
  selectionLabel.className = "selection-label";
  selectionBox.appendChild(selectionLabel);
  selectionBox.hidden = true;
  wrap.appendChild(selectionBox);

  nowLine = document.createElement("div");
  nowLine.className = "now-line";
  wrap.appendChild(nowLine);

  emptyNote = document.createElement("div");
  emptyNote.className = "empty-note";
  emptyNote.hidden = true;
  wrap.appendChild(emptyNote);

  $("todayChip").addEventListener("click", () => setViewDate(new Date()));

  window.addEventListener("scroll", requestMaskUpdate, { passive: true });
  window.addEventListener("resize", () => {
    syncHeaderHeight();
    applyContentMask();
  });
  const resettle = () => {
    if ($("mainView").hidden) return;
    syncHeaderHeight();
    scrollToNow();
    applyContentMask();
  };
  window.addEventListener("load", resettle);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resettle).catch(() => {});

  // 자정이 지나면: 오늘 화면을 보고 있었으면 새 날짜로 넘기고, 다른 날짜를 보던 중이면 그대로 둔다.
  // (알림 등 '오늘' 기준으로 도는 기능은 "daychange" 를 듣고 다시 맞춘다)
  let lastToday = todayStr();
  function checkDayChange() {
    const t = todayStr();
    if (t === lastToday) return;
    const wasViewingToday = state.viewDateStr === lastToday;
    lastToday = t;
    bus.emit("daychange");
    if (wasViewingToday) setViewDate(new Date());
  }
  setInterval(() => {
    checkDayChange();
    positionNow();
    updateDateHeader(); // 다른 날짜를 보던 중이면 '오늘' 칩이 맞게 갱신되도록
  }, 30000);
  // 백그라운드에서는 타이머가 늦게 돌 수 있어, 화면으로 돌아오면 바로 확인한다
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    checkDayChange();
    positionNow();
    updateDateHeader();
  });

  bus.on("items", renderBlocks);
  bus.on("categories", renderBlocks);
  bus.on("viewdate", () => {
    updateDateHeader();
    updateEmptyNote();
    positionNow();
    renderBlocks();
  });
  bus.on("ddays", updateDateHeader);
  bus.on("memos", updateDateHeader);
}
