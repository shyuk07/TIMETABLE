// 타임라인 화면: 고정 헤더(날짜 + 지금 시계), 시간 레일, 일정 블록, 현재 시각선.

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
const FADE_BAND = 34;
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
}

export function positionNow() {
  const d = new Date();
  $("nowTime").textContent = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  const hourDeg = ((d.getHours() % 12) + d.getMinutes() / 60) * 30;
  const minDeg = d.getMinutes() * 6;
  $("hourHand").setAttribute("transform", `rotate(${hourDeg} 26 26)`);
  $("minHand").setAttribute("transform", `rotate(${minDeg} 26 26)`);

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
  const MIN_H = 40;
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
    el.innerHTML = '<div class="block-dot"></div><div class="block-title"></div><div class="block-time"></div>';
    el.querySelector(".block-title").textContent = item.title;
    el.querySelector(".block-time").textContent = `${item.start} – ${item.end} · ${cat.name}`;
    el.addEventListener("click", () => onOpenItem(item));
    blocksLayer.appendChild(el);
  });

  wrap.style.minHeight = Math.max(railHeight, maxBottom + 24) + "px";
}

/** 앱에 들어오면 맨 위가 아니라 '지금' 근처로 스크롤 */
export function scrollToNow() {
  if (state.viewDateStr !== todayStr()) return;
  const clamped = Math.max(DAY_START, Math.min(DAY_END, minsNow()));
  const lineTopInWrap = (clamped - DAY_START) * PX_PER_MIN;
  const wrapAbsTop = wrap.getBoundingClientRect().top + window.pageYOffset;
  window.scrollTo(0, Math.max(0, wrapAbsTop + lineTopInWrap - window.innerHeight * 0.32));
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

  setInterval(() => {
    positionNow();
    updateDateHeader(); // 자정이 지나면 '오늘' 칩이 맞게 갱신되도록
  }, 30000);

  bus.on("items", renderBlocks);
  bus.on("categories", renderBlocks);
  bus.on("viewdate", () => {
    updateDateHeader();
    updateEmptyNote();
    positionNow();
    renderBlocks();
  });
}
