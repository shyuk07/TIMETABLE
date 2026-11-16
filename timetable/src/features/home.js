// 홈(벤토) 화면: 요일 줄 + 타일 묶음(지금 · 다음 · 디데이 · 하루 띠 · 계획 비율).
// 타일을 누르면 24시간 타임라인으로 들어가고, 타임라인의 뒤로 버튼·홈 탭으로 돌아온다.
// 화면 전환은 #mainView 의 data-mode("home" | "timeline") 하나로 한다 (CSS 가 보이고 숨길 것을 정한다).

import { state, bus, categoryById } from "../state/store.js";
import { setViewDate } from "../state/actions.js";
import { WEEKDAY, addDays, startOfWeek, toDateStr, todayStr, fmtDateLabel, minsNow, toMin, fmtDuration, ddayLabel } from "../lib/dates.js";
import { $, escapeHtml } from "../lib/dom.js";
import { revealTimeline } from "./timeline.js";

const mainView = $("mainView");
const DAY_MIN = 24 * 60;

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

  function renderNow() {
    const d = new Date();
    $("homeNowTime").textContent = pad2(d.getHours()) + ":" + pad2(d.getMinutes());
    const title = $("homeNowTitle");
    const sub = $("homeNowSub");
    title.classList.remove("has-cat");
    if (!isToday()) {
      title.textContent = "다른 날짜 보는 중";
      sub.textContent = "눌러서 오늘로 돌아가기";
      return;
    }
    const m = minsNow();
    const cur = state.items.find((it) => {
      const [s, e] = span(it);
      return s <= m && m < e;
    });
    if (cur) {
      title.textContent = cur.title;
      // 카테고리 색은 글자가 아니라 앞의 점으로 — 밝은 테마에서 색 글자는 잘 안 읽힌다
      title.classList.add("has-cat");
      title.style.setProperty("--cat-color", categoryById(cur.categoryId).bg);
      sub.textContent = fmtDuration(span(cur)[1] - m) + " 남음";
      return;
    }
    const next = state.items.find((it) => toMin(it.start) > m);
    title.textContent = "비어 있는 시간";
    sub.textContent = next ? `${fmtDuration(toMin(next.start) - m)} 뒤 ${next.title}` : state.items.length ? "오늘 일정을 모두 마쳤어요" : "등록된 일정이 없어요";
  }

  /**
   * '일정' 타일에 올릴 일정과 그 라벨.
   * 오늘: 지금 시각에 걸린 일정("진행 중")이 먼저, 없으면 다음에 시작할 일정("다음"). 다른 날: 그날의 첫 일정.
   */
  function tileItem() {
    if (!isToday()) return state.items[0] ? { it: state.items[0], label: "첫 일정" } : null;
    const m = minsNow();
    const cur = state.items.find((x) => {
      const [s, e] = span(x);
      return s <= m && m < e;
    });
    if (cur) return { it: cur, label: "진행 중" };
    const next = state.items.find((x) => toMin(x.start) > m);
    return next ? { it: next, label: "다음" } : null;
  }

  function renderNext() {
    const tile = $("homeNext");
    const found = tileItem();
    tile.classList.toggle("empty", !found);
    if (!found) {
      tile.style.background = "";
      tile.style.color = "";
      tile.innerHTML = `<div class="tile-k">일정</div><b class="tile-big">일정 없음</b><small>+ 추가</small>`;
      tile.dataset.min = "";
      return;
    }
    const { it, label } = found;
    const cat = categoryById(it.categoryId);
    const [s, e] = span(it);
    tile.style.background = cat.bg;
    tile.style.color = cat.ink;
    tile.innerHTML = `<div class="tile-k">${label} · ${escapeHtml(it.start)}${label === "진행 중" ? " – " + escapeHtml(it.end) : ""}</div><b class="tile-big">${escapeHtml(it.title)}</b><small>${fmtDuration(e - s)} · ${escapeHtml(cat.name)}</small>`;
    tile.dataset.min = String(s);
  }

  function renderDday() {
    const today = todayStr();
    const d = state.ddays.find((x) => x.date >= today); // 날짜 순이라 첫 번째가 가장 가까운 디데이
    $("homeDday").innerHTML = d
      ? `<div class="tile-k">디데이</div><b class="tile-num">${ddayLabel(d.date)}</b><small>${escapeHtml(d.title)}</small>`
      : `<div class="tile-k">디데이</div><b class="tile-big">없음</b><small>캘린더에서 추가</small>`;
  }

  function renderDay() {
    $("homeDayLabel").textContent = isToday() ? "오늘 하루" : `${state.viewDate.getMonth() + 1}월 ${state.viewDate.getDate()}일 하루`;
    const segs = state.items
      .map((it) => {
        const [s, e] = span(it);
        const left = (s / DAY_MIN) * 100;
        const width = Math.max(((Math.min(e, DAY_MIN) - s) / DAY_MIN) * 100, 0.8);
        return `<span style="left:${left}%;width:${width}%;background:${categoryById(it.categoryId).bg}"></span>`;
      })
      .join("");
    const now = isToday() ? `<em style="left:${(minsNow() / DAY_MIN) * 100}%"></em>` : "";
    $("homeStrip").innerHTML = segs + now;
  }

  function renderPlan() {
    const total = new Map(); // categoryId → 분 (카테고리 정렬 순으로 보여 준다)
    let sum = 0;
    state.items.forEach((it) => {
      const [s, e] = span(it);
      const cat = categoryById(it.categoryId);
      total.set(cat.id, (total.get(cat.id) || 0) + (e - s));
      sum += e - s;
    });
    $("homePlanLabel").textContent = (isToday() ? "오늘 계획" : "이날 계획") + (sum ? ` · ${fmtDuration(sum)}` : "");
    const cats = state.categories.filter((c) => total.has(c.id));
    if (!cats.length && total.size) cats.push(categoryById("")); // 지워진 카테고리의 일정
    $("homePlanBar").innerHTML = cats.map((c) => `<span style="flex:${total.get(c.id) || 1};background:${c.bg}"></span>`).join("");
    $("homePlanBar").hidden = !cats.length;
    $("homePlanLegend").innerHTML = cats.length
      ? cats.map((c) => `<span><i style="background:${c.bg}"></i>${escapeHtml(c.name)} ${fmtDuration(total.get(c.id))}</span>`).join("")
      : `<span>등록된 일정이 없어요</span>`;
  }

  function render() {
    $("homeDate").textContent = fmtDateLabel(state.viewDate);
    renderWeek();
    renderNow();
    renderNext();
    renderDday();
    renderDay();
    renderPlan();
  }

  // ---- 화면 전환 ----
  function showHome() {
    mainView.dataset.mode = "home";
    window.scrollTo(0, 0);
    render();
  }
  /** min: 그 시각이 화면 위쪽에 오게 연다. 없으면 '지금'(오늘) 또는 첫 일정 위치 */
  function showTimeline(min) {
    mainView.dataset.mode = "timeline";
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
  $("homeNow").addEventListener("click", () => {
    if (!isToday()) setViewDate(new Date());
    else showTimeline();
  });
  $("homeNext").addEventListener("click", () => {
    const min = $("homeNext").dataset.min;
    showTimeline(min ? Number(min) : undefined);
  });
  $("homeDay").addEventListener("click", () => showTimeline());
  $("homeDday").addEventListener("click", openCalendar);
  $("homeBtn").addEventListener("click", showHome);

  ["items", "categories", "viewdate", "ddays", "settings", "daychange"].forEach((ev) => bus.on(ev, render));
  setInterval(render, 30000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") render();
  });

  return { showHome, showTimeline, isHome: () => mainView.dataset.mode === "home" };
}
