// 홈 화면: 요일 줄 → 지금 시각(가장 크게, 시각만) → 오늘 하루(지금 하는 일·다음 일정 + 띠 + 카테고리별 시간) → 디데이 한 줄.
// 위에서 아래로 중요한 순서. 오늘 하루 카드를 누르면 타임라인 탭으로 간다.
//
// 화면 전환은 #mainView 의 data-mode 하나로 한다: "home" | "timeline" | "calendar" | "stats"
// (CSS 가 보이고 숨길 것을 정하고, 하단 탭의 선택 표시도 같은 값을 따른다 — setMode)

import { state, bus, categoryById } from "../state/store.js";
import { setViewDate } from "../state/actions.js";
import { WEEKDAY, addDays, startOfWeek, toDateStr, todayStr, fmtDateLabel, minsNow, toMin, fmtDuration, ddayLabel } from "../lib/dates.js";
import { $, escapeHtml } from "../lib/dom.js";
import { revealTimeline } from "./timeline.js";

const mainView = $("mainView");
const DAY_MIN = 24 * 60;

/** 보이는 화면을 바꾸고 하단 탭의 선택 표시를 맞춘다 */
export function setMode(mode) {
  mainView.dataset.mode = mode;
  document.querySelectorAll(".tab-item").forEach((t) => {
    const on = t.dataset.tab === mode;
    t.classList.toggle("active", on);
    if (on) t.setAttribute("aria-current", "page");
    else t.removeAttribute("aria-current");
  });
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** 일정의 [시작, 끝] 분. 끝이 시작보다 빠르거나 같으면 타임라인과 같게 15분짜리로 본다 */
function span(item) {
  const s = toMin(item.start);
  let e = toMin(item.end);
  if (e <= s) e = s + 15;
  return [s, e];
}

export function initHome({ openCalendar }) {
  const isToday = () => state.viewDateStr === todayStr();
  let heroMin = null; // 오늘 하루 카드를 누르면 타임라인에서 이 시각(지금/다음 일정)으로 간다

  function renderWeek() {
    const ws = state.settings.weekStart || 0;
    const first = startOfWeek(state.viewDate, ws);
    const today = todayStr();
    $("homeWeek").innerHTML = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(first, i);
      const ds = toDateStr(d);
      const cls = (ds === state.viewDateStr ? " on" : "") + (ds === today ? " today" : "");
      return `<button type="button" class="week-day${cls}" data-date="${ds}" aria-label="${fmtDateLabel(d)}"${ds === state.viewDateStr ? ' aria-current="date"' : ""}><span>${WEEKDAY[d.getDay()]}</span><b>${d.getDate()}</b></button>`;
    }).join("");
  }

  const dot = (cat) => `<i class="hero-dot" style="background:${cat.bg}"></i>`;

  /** 지금 시각(위 카드) + 오늘 하루 카드 윗부분: 지금 하는 일(남은 시간·진행 막대) + 다음 일정 한 줄 */
  function renderHero() {
    const d = new Date();
    $("homeNowTime").textContent = pad2(d.getHours()) + ":" + pad2(d.getMinutes());
    const main = $("heroMain");
    const sub = $("heroSub");
    const bar = $("heroBar");
    const next = $("heroNext");
    bar.hidden = true;
    next.hidden = true;
    heroMin = null;

    if (!isToday()) {
      main.textContent = "다른 날짜 보는 중";
      sub.textContent = "위 요일 줄에서 오늘을 누르면 돌아가요";
      const first = state.items[0];
      if (first) {
        next.hidden = false;
        next.innerHTML = `<span>첫 일정</span>${dot(categoryById(first.categoryId))}<b>${escapeHtml(first.title)}</b><em>${escapeHtml(first.start)}</em>`;
      }
      return;
    }

    const m = minsNow();
    const cur = state.items.find((it) => {
      const [s, e] = span(it);
      return s <= m && m < e;
    });
    const upcoming = state.items.find((it) => toMin(it.start) > m);

    if (cur) {
      const [s, e] = span(cur);
      const cat = categoryById(cur.categoryId);
      main.innerHTML = dot(cat) + escapeHtml(cur.title);
      sub.textContent = `${fmtDuration(e - m)} 남음 · ${cur.start} – ${cur.end}`;
      bar.hidden = false;
      bar.style.setProperty("--cat-color", cat.bg);
      bar.firstElementChild.style.width = Math.round(((m - s) / (e - s)) * 100) + "%";
      heroMin = s;
    } else if (upcoming) {
      main.textContent = "비어 있는 시간";
      sub.textContent = `${fmtDuration(toMin(upcoming.start) - m)} 뒤에 다음 일정`;
    } else {
      main.textContent = "비어 있는 시간";
      sub.textContent = state.items.length ? "오늘 일정을 모두 마쳤어요" : "+ 버튼으로 일정을 추가해 보세요";
    }
    if (upcoming) {
      next.hidden = false;
      next.innerHTML = `<span>다음</span>${dot(categoryById(upcoming.categoryId))}<b>${escapeHtml(upcoming.title)}</b><em>${escapeHtml(upcoming.start)}</em>`;
      if (heroMin == null) heroMin = toMin(upcoming.start);
    }
  }

  /** 오늘 하루: 0~24시 띠 + 카테고리별 시간 */
  function renderDay() {
    $("homeDayLabel").textContent = isToday() ? "오늘 하루" : `${state.viewDate.getMonth() + 1}월 ${state.viewDate.getDate()}일 하루`;
    const total = new Map(); // categoryId → 분
    let sum = 0;
    const segs = state.items
      .map((it) => {
        const [s, e] = span(it);
        const cat = categoryById(it.categoryId);
        total.set(cat.id, (total.get(cat.id) || 0) + (e - s));
        sum += e - s;
        const left = (s / DAY_MIN) * 100;
        const width = Math.max(((Math.min(e, DAY_MIN) - s) / DAY_MIN) * 100, 0.8);
        return `<span style="left:${left}%;width:${width}%;background:${cat.bg}"></span>`;
      })
      .join("");
    const now = isToday() ? `<em style="left:${(minsNow() / DAY_MIN) * 100}%"></em>` : "";
    $("homeStrip").innerHTML = segs + now;
    $("homeDayTotal").textContent = sum ? fmtDuration(sum) : "";
    const cats = state.categories.filter((c) => total.has(c.id));
    $("homeLegend").innerHTML = cats.length
      ? cats.map((c) => `<span><i style="background:${c.bg}"></i>${escapeHtml(c.name)} ${fmtDuration(total.get(c.id))}</span>`).join("")
      : `<span>등록된 일정이 없어요</span>`;
  }

  function renderDday() {
    const today = todayStr();
    const d = state.ddays.find((x) => x.date >= today); // 날짜 순이라 첫 번째가 가장 가까운 디데이
    $("homeDday").innerHTML = d
      ? `<span class="row-k">디데이</span><b>${escapeHtml(d.title)}</b><em>${ddayLabel(d.date)}</em>`
      : `<span class="row-k">디데이</span><b class="muted">없음</b><em class="muted">캘린더에서 추가</em>`;
  }

  function render() {
    $("homeDate").textContent = fmtDateLabel(state.viewDate);
    renderWeek();
    renderHero();
    renderDay();
    renderDday();
  }

  // ---- 화면 전환 ----
  function showHome() {
    setMode("home");
    window.scrollTo(0, 0);
    render();
  }
  /** min: 그 시각이 화면 위쪽에 오게 연다. 없으면 '지금'(오늘) 또는 첫 일정 위치 */
  function showTimeline(min) {
    setMode("timeline");
    if (min == null && !isToday() && state.items.length) min = toMin(state.items[0].start);
    revealTimeline(min);
  }

  $("homeWeek").addEventListener("click", (e) => {
    const btn = e.target.closest(".week-day");
    if (btn && btn.dataset.date !== state.viewDateStr) {
      const [y, m, d] = btn.dataset.date.split("-").map(Number);
      setViewDate(new Date(y, m - 1, d));
    }
  });
  $("homeDay").addEventListener("click", () => showTimeline(isToday() && heroMin != null ? heroMin : undefined));
  $("homeDday").addEventListener("click", openCalendar);

  ["items", "categories", "viewdate", "ddays", "settings", "daychange"].forEach((ev) => bus.on(ev, render));
  setInterval(render, 30000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") render();
  });

  return { showHome, showTimeline };
}
