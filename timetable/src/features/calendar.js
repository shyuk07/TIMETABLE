// 캘린더 시트(날짜 선택). 주 시작 요일은 설정을 따르고, 일정이 있는 날에는 점이 찍힌다.

import { state, bus } from "../state/store.js";
import { setViewDate } from "../state/actions.js";
import { toDateStr, todayStr, fmtDateLabel, weekdayLabels, addDays } from "../lib/dates.js";
import { HOLIDAYS, monthHolidaySummary } from "../lib/holidays.js";
import { $, sheetController } from "../lib/dom.js";

export function initCalendar() {
  const calSheet = $("calSheet");
  const ctl = sheetController($("calBackdrop"), calSheet);
  const calTitle = $("calTitle");
  const calMonthLabel = $("calMonthLabel");
  const calWeekdaysEl = $("calWeekdays");
  const calGridEl = $("calGrid");
  const calHolidayListEl = $("calHolidayList");

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
    calWeekdaysEl.innerHTML = weekdayLabels(ws).map((w) => `<span>${w}</span>`).join("");

    const cells = buildCells(year, month, ws);
    const realToday = todayStr();
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
      btn.className = cls;
      btn.type = "button";
      btn.textContent = c.date.getDate();
      if (HOLIDAYS[cStr]) btn.title = HOLIDAYS[cStr];
      const dot = document.createElement("span");
      dot.className = "cal-dot";
      btn.appendChild(dot);
      dots.set(cStr, btn);
      btn.addEventListener("click", () => {
        setViewDate(c.date);
        calMonthDate = new Date(c.date.getFullYear(), c.date.getMonth(), 1);
        ctl.close();
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

  function open() {
    calMonthDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth(), 1);
    calTitle.textContent = fmtDateLabel(state.viewDate);
    renderGrid();
    ctl.open();
  }

  $("calPrevBtn").addEventListener("click", () => {
    calMonthDate = new Date(calMonthDate.getFullYear(), calMonthDate.getMonth() - 1, 1);
    renderGrid();
  });
  $("calNextBtn").addEventListener("click", () => {
    calMonthDate = new Date(calMonthDate.getFullYear(), calMonthDate.getMonth() + 1, 1);
    renderGrid();
  });
  $("calCloseBtn").addEventListener("click", ctl.close);
  bus.on("settings", () => ctl.isOpen() && renderGrid());

  return { open, close: ctl.close };
}
