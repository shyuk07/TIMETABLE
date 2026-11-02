// 통계 시트: 카테고리별 카드, 일/주/월/년 막대 그래프.
// 막대 높이는 '그 카테고리의 최댓값'이 아니라 고정 눈금(24시간 / 월은 168시간) 기준이다.

import { state, weeklyGoalMinutes } from "../state/store.js";
import { toMin, toDateStr, fmtDuration, startOfWeek, addDays, weekdayLabels } from "../lib/dates.js";
import { $, sheetController } from "../lib/dom.js";

const RANGE_TOTAL_LABEL = { day: "오늘", week: "이번 주", month: "이번 달", year: "올해" };
const RANGE_BTN_LABEL = { day: "일", week: "주", month: "월", year: "년" };
const BAR_MAX_PX = 54;
const BAR_MIN_PX = 6;

const durOf = (it) => Math.max(0, toMin(it.end) - toMin(it.start));

// ---- 구간 계산 (순수 함수: tests/stats.test.js 에서 검증) ----
export function catDurationOn(all, dStr, catId) {
  let sum = 0;
  for (const it of all) if (it.date === dStr && it.categoryId === catId) sum += durOf(it);
  return sum;
}

/** 일: 오늘을 24개의 1시간 칸으로 */
export function dayBuckets(all, catId, now = new Date()) {
  const dStr = toDateStr(now);
  const nowH = now.getHours();
  const buckets = [];
  for (let h = 0; h < 24; h++) {
    const hs = h * 60;
    const he = hs + 60;
    let mins = 0;
    for (const it of all) {
      if (it.date !== dStr || it.categoryId !== catId) continue;
      const overlap = Math.min(toMin(it.end), he) - Math.max(toMin(it.start), hs);
      if (overlap > 0) mins += overlap;
    }
    buckets.push({ label: h % 3 === 0 ? String(h) : "", full: h + "시", mins, isNow: h === nowH });
  }
  return buckets;
}

/** 주: 오늘이 속한 주의 7일 (시작 요일은 설정) */
export function weekBuckets(all, catId, weekStart = 0, now = new Date()) {
  const first = startOfWeek(now, weekStart);
  const labels = weekdayLabels(weekStart);
  const today = toDateStr(now);
  return labels.map((label, i) => {
    const dStr = toDateStr(addDays(first, i));
    return { label, mins: catDurationOn(all, dStr, catId), isNow: dStr === today };
  });
}

/** 월: 이번 달을 7일 단위 4~5개 칸으로 */
export function monthBuckets(all, catId, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = toDateStr(now);
  const buckets = [];
  let wi = 1;
  for (let start = 1; start <= daysInMonth; start += 7) {
    const end = Math.min(start + 6, daysInMonth);
    let mins = 0;
    let containsToday = false;
    for (let d = start; d <= end; d++) {
      const dStr = toDateStr(new Date(year, month, d));
      mins += catDurationOn(all, dStr, catId);
      if (dStr === today) containsToday = true;
    }
    buckets.push({ label: wi + "주", mins, isNow: containsToday });
    wi++;
  }
  return buckets;
}

/** 년: 올해 1~12월 */
export function yearBuckets(all, catId, now = new Date()) {
  const year = now.getFullYear();
  const sums = new Array(12).fill(0);
  for (const it of all) {
    if (it.categoryId !== catId) continue;
    const p = (it.date || "").split("-");
    if (+p[0] !== year) continue;
    sums[+p[1] - 1] += durOf(it);
  }
  return sums.map((mins, m) => ({ label: m + 1 + "월", mins, isNow: m === now.getMonth() }));
}

export function fixedMaxMins(range) {
  return range === "month" ? 7 * 24 * 60 : 24 * 60;
}
export function barHeightPx(mins, range) {
  return Math.max(BAR_MIN_PX, Math.min(BAR_MAX_PX, Math.round((mins / fixedMaxMins(range)) * BAR_MAX_PX)));
}

function bucketsFor(range, all, catId) {
  if (range === "day") return dayBuckets(all, catId);
  if (range === "week") return weekBuckets(all, catId, state.settings.weekStart);
  if (range === "month") return monthBuckets(all, catId);
  return yearBuckets(all, catId);
}

function buildStatCard(cat, getItems) {
  const card = document.createElement("div");
  card.className = "stat-card";

  const head = document.createElement("div");
  head.className = "stat-card-head";
  const name = document.createElement("div");
  name.className = "stat-card-name";
  const dot = document.createElement("span");
  dot.className = "stat-dot";
  dot.style.background = cat.bg;
  name.appendChild(dot);
  name.appendChild(document.createTextNode(cat.name));

  const seg = document.createElement("div");
  seg.className = "stat-seg";
  Object.keys(RANGE_BTN_LABEL).forEach((r) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.range = r;
    btn.textContent = RANGE_BTN_LABEL[r];
    seg.appendChild(btn);
  });
  head.appendChild(name);
  head.appendChild(seg);

  const summary = document.createElement("div");
  summary.className = "stat-summary";
  const chart = document.createElement("div");
  chart.className = "stat-chart";
  card.append(head, summary, chart);

  let curRange = "week";

  function paint() {
    const all = getItems();
    Array.prototype.forEach.call(seg.children, (b) => b.classList.toggle("active", b.dataset.range === curRange));
    const buckets = bucketsFor(curRange, all, cat.id);
    const total = buckets.reduce((s, b) => s + b.mins, 0);
    let text = `${RANGE_TOTAL_LABEL[curRange]} 총 ${fmtDuration(total)}`;
    const goal = weeklyGoalMinutes(cat.id);
    if (curRange === "week" && goal) text += ` · 목표 ${fmtDuration(goal)}의 ${Math.round((total / goal) * 100)}%`;
    summary.textContent = text;

    chart.classList.toggle("compact", buckets.length > 12);
    chart.innerHTML = "";
    buckets.forEach((b) => {
      const col = document.createElement("div");
      col.className = "stat-bar-col" + (b.isNow ? " today" : "");
      const tip = `${b.full || b.label} · ${fmtDuration(b.mins)}`;
      // 기록이 있을 때만 막대가 생긴다. 아래의 눈금은 데이터와 무관한 고정 기준선이다.
      if (b.mins > 0) {
        const bar = document.createElement("div");
        bar.className = "stat-bar";
        bar.style.height = barHeightPx(b.mins, curRange) + "px";
        bar.style.background = cat.bg;
        bar.title = tip;
        col.appendChild(bar);
      }
      const tick = document.createElement("div");
      tick.className = "stat-tick";
      tick.title = tip;
      col.appendChild(tick);
      const label = document.createElement("div");
      label.className = "stat-bar-label";
      label.textContent = b.label;
      col.appendChild(label);
      chart.appendChild(col);
    });
  }

  seg.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    curRange = btn.dataset.range;
    paint();
  });
  return { el: card, paint };
}

export function initStats() {
  const statsSheet = $("statsSheet");
  const ctl = sheetController($("statsBackdrop"), statsSheet);
  const statsBody = $("statsBody");
  let all = [];
  let token = 0;

  async function open() {
    const my = ++token;
    statsBody.innerHTML = "";
    const cards = state.categories.map((cat) => {
      const c = buildStatCard(cat, () => all);
      statsBody.appendChild(c.el);
      return c;
    });
    cards.forEach((c) => c.paint()); // 데이터가 오기 전에도 빈 틀을 먼저 보여 준다
    ctl.open();
    // 올해 + 앞뒤 일주일(연초/연말에 걸친 주 계산용)만 불러온다
    const y = new Date().getFullYear();
    try {
      all = await state.repo.schedules.listRange(toDateStr(new Date(y - 1, 11, 24)), toDateStr(new Date(y + 1, 0, 7)));
    } catch (e) {
      all = [];
    }
    if (my !== token) return;
    cards.forEach((c) => c.paint());
  }

  $("statsCloseBtn").addEventListener("click", ctl.close);
  return { open, close: ctl.close };
}
