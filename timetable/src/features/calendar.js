// 캘린더 시트(날짜 선택). 주 시작 요일은 설정을 따르고, 일정이 있는 날에는 점이 찍힌다.

import { state, bus } from "../state/store.js";
import { setViewDate } from "../state/actions.js";
import { toDateStr, todayStr, fromDateStr, fmtDateLabel, weekdayLabels, ddayLabel } from "../lib/dates.js";
import { HOLIDAYS, monthHolidaySummary } from "../lib/holidays.js";
import { $, sheetController, escapeHtml, enableSwipeDown } from "../lib/dom.js";
import { initDdaySheet } from "./dday-sheet.js";

export function initCalendar() {
  const calSheet = $("calSheet");
  const ctl = sheetController($("calBackdrop"), calSheet);
  const calTitle = $("calTitle");
  const calMonthLabel = $("calMonthLabel");
  const calWeekdaysEl = $("calWeekdays");
  const calGridEl = $("calGrid");
  const calHolidayListEl = $("calHolidayList");
  const calDdayMonthEl = $("calDdayMonth");
  const ddayListEl = $("ddayList");
  const memoListEl = $("memoList");
  const ddaySheet = initDdaySheet();

  // 격자에 보이는 달 — 보고 있는 날짜와는 별개 (날짜를 탭하기 전까지 타임라인은 안 바뀐다)
  let calMonthDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth(), 1);
  let renderToken = 0;

  function buildCells(year, month, weekStart) {
    const firstDow = (new Date(year, month, 1).getDay() - weekStart + 7) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const cells = [];
    for (let i = firstDow - 1; i >= 0; i--) cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), dim: true });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(year, month, d), dim: false });
    let next = 1;
    while (cells.length < 42) cells.push({ date: new Date(year, month + 1, next++), dim: true });
    return cells;
  }

  function renderGrid() {
    const token = ++renderToken;
    const year = calMonthDate.getFullYear();
    const month = calMonthDate.getMonth();
    const ws = state.settings.weekStart;
    calMonthLabel.textContent = `${year}년 ${month + 1}월`;
    calHolidayListEl.textContent = monthHolidaySummary(year, month);
    // 이 달의 디데이도 공휴일과 같은 형식(11.19 수능)으로, 한 줄에 하나씩
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
    const monthDdays = state.ddays.filter((d) => d.date.startsWith(prefix));
    calDdayMonthEl.innerHTML = monthDdays.map((d) => `<div>${month + 1}.${+d.date.slice(8)} ${escapeHtml(d.title)}</div>`).join("");
    calDdayMonthEl.hidden = !monthDdays.length;
    calWeekdaysEl.innerHTML = weekdayLabels(ws).map((w) => `<span>${w}</span>`).join("");

    const cells = buildCells(year, month, ws);
    const realToday = todayStr();
    // 날짜별 디데이 이름 (칸 표시 + 마우스를 올리면 보이는 설명)
    const ddayNames = new Map();
    state.ddays.forEach((d) => ddayNames.set(d.date, [...(ddayNames.get(d.date) || []), d.title]));
    calGridEl.innerHTML = "";
    const dots = new Map();
    cells.forEach((c) => {
      const cStr = toDateStr(c.date);
      const btn = document.createElement("button");
      let cls = "cal-day";
      if (c.dim) cls += " dim";
      if (cStr < realToday) cls += " past";
      if (HOLIDAYS[cStr]) cls += " holiday";
      if (cStr === state.viewDateStr) cls += " selected";
      if (cStr === realToday) cls += " today";
      if (ddayNames.has(cStr)) cls += " has-dday";
      btn.className = cls;
      btn.type = "button";
      btn.textContent = c.date.getDate();
      const tips = [HOLIDAYS[cStr], ...(ddayNames.get(cStr) || [])].filter(Boolean);
      if (tips.length) btn.title = tips.join(", ");
      const dot = document.createElement("span");
      dot.className = "cal-dot";
      btn.appendChild(dot);
      dots.set(cStr, btn);
      // 날짜를 고르면 뒤의 타임라인만 그 날로 바꾸고 캘린더는 열어 둔다 (닫기는 사용자가 직접)
      btn.addEventListener("click", () => {
        setViewDate(c.date);
        calMonthDate = new Date(c.date.getFullYear(), c.date.getMonth(), 1);
        calTitle.textContent = fmtDateLabel(state.viewDate);
        renderGrid();
      });
      calGridEl.appendChild(btn);
    });

    // 일정이 있는 날 표시 (비동기 — 격자는 먼저 그리고 점만 나중에 켠다)
    const from = toDateStr(cells[0].date);
    const to = toDateStr(cells[cells.length - 1].date);
    state.repo.schedules
      .listRange(from, to)
      .then((list) => {
        if (token !== renderToken) return;
        list.forEach((s) => {
          const b = dots.get(s.date);
          if (b) b.classList.add("has-items");
        });
      })
      .catch(() => {});
  }

  // 메모·디데이 목록: 다가오는 것을 가까운 순으로, 지난 것은 그 뒤에 최근 순으로.
  // 디데이만 오른쪽에 D-3 같은 표시가 붙는다 (메모는 달력 칸에도 표시하지 않는다)
  function renderDatedList(listEl, items, { emptyText, withCount }) {
    const today = todayStr();
    const upcoming = items.filter((d) => d.date >= today);
    const past = items.filter((d) => d.date < today).reverse();
    const list = [...upcoming, ...past];
    if (!list.length) {
      listEl.innerHTML = `<p class="cal-dday-empty">${emptyText}</p>`;
      return;
    }
    listEl.innerHTML = list
      .map((d) => {
        const dt = fromDateStr(d.date);
        const label = withCount ? ddayLabel(d.date, today) : "";
        return `<button type="button" class="cal-dday-item${d.date < today ? " past" : ""}" data-id="${d.id}">
          <span class="cal-dday-main">
            <span class="cal-dday-name">${escapeHtml(d.title)}</span>
            <span class="cal-dday-date">${dt.getFullYear()}. ${dt.getMonth() + 1}. ${dt.getDate()}.</span>
          </span>
          ${label ? `<span class="cal-dday-count${label === "D-Day" ? " today" : ""}">${label}</span>` : ""}
        </button>`;
      })
      .join("");
  }
  const renderDdays = () =>
    renderDatedList(ddayListEl, state.ddays, { emptyText: "디데이를 추가해 보세요.", withCount: true });
  const renderMemos = () =>
    renderDatedList(memoListEl, state.memos, { emptyText: "메모를 추가해 보세요.", withCount: false });

  function open() {
    calMonthDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth(), 1);
    calTitle.textContent = fmtDateLabel(state.viewDate);
    renderGrid();
    renderMemos();
    renderDdays();
    ctl.open();
  }

  // 목록 항목을 누르면 수정, + 버튼은 새로 (kind 별로 같은 시트를 쓴다)
  function wireDatedList(kind, addBtnId, listEl) {
    $(addBtnId).addEventListener("click", () => ddaySheet.open(kind, null));
    listEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".cal-dday-item");
      if (!btn) return;
      const item = state[kind].find((d) => d.id === btn.dataset.id);
      if (item) ddaySheet.open(kind, item);
    });
  }
  wireDatedList("memos", "memoAddBtn", memoListEl);
  wireDatedList("ddays", "ddayAddBtn", ddayListEl);
  bus.on("ddays", () => {
    if (!ctl.isOpen()) return;
    renderGrid();
    renderDdays();
  });
  bus.on("memos", () => ctl.isOpen() && renderMemos());

  $("calPrevBtn").addEventListener("click", () => {
    calMonthDate = new Date(calMonthDate.getFullYear(), calMonthDate.getMonth() - 1, 1);
    renderGrid();
  });
  $("calNextBtn").addEventListener("click", () => {
    calMonthDate = new Date(calMonthDate.getFullYear(), calMonthDate.getMonth() + 1, 1);
    renderGrid();
  });
  $("calCloseBtn").addEventListener("click", ctl.close);
  // 아래로 쓸어내려 닫기 (마우스는 맨 위 날짜 제목 줄을 잡고)
  enableSwipeDown(calSheet, ctl.close, { handleSelector: ".cal-handle, .cal-header" });
  bus.on("settings", () => ctl.isOpen() && renderGrid());

  return { open, close: ctl.close };
}
