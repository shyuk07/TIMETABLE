// 커스텀 휠 시간 선택기 (네이티브 <input type=time> 팝업 대체). 오전/오후 · 1–12 · 0–59.
// 앱 전체는 24시간 "HH:MM" 문자열을 쓰고, 이 모듈만 휠 인덱스와 변환한다.

import { toMin } from "../lib/dates.js";
import { $ } from "../lib/dom.js";

const TP_ROW_H = 44;
const AMPM_VALUES = ["오전", "오후"];
const HOUR_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MIN_VALUES = Array.from({ length: 60 }, (_, i) => i);
const pad2 = (n) => String(n).padStart(2, "0");

export function hhmmToParts(hhmm) {
  const mins = toMin(hhmm);
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return { ampmIdx: h24 < 12 ? 0 : 1, hourIdx: HOUR_VALUES.indexOf(h12), minIdx: MIN_VALUES.indexOf(m) };
}
export function partsToHHMM(ampmIdx, hourIdx, minIdx) {
  let h24 = HOUR_VALUES[hourIdx] % 12;
  if (ampmIdx === 1) h24 += 12;
  return pad2(h24) + ":" + pad2(MIN_VALUES[minIdx]);
}
export function fmtButtonLabel(hhmm) {
  const p = hhmmToParts(hhmm);
  return AMPM_VALUES[p.ampmIdx] + " " + pad2(HOUR_VALUES[p.hourIdx]) + ":" + pad2(MIN_VALUES[p.minIdx]);
}

// 휠 열(column)을 만든다. 디데이 날짜 선택(dday-sheet.js)도 같은 휠을 쓴다.
export function buildWheelCol(el, labels) {
  el.innerHTML = "";
  const pad = () => {
    const d = document.createElement("div");
    d.className = "tp-col-pad";
    return d;
  };
  el.appendChild(pad());
  labels.forEach((label) => {
    const it = document.createElement("div");
    it.className = "tp-item";
    it.textContent = label;
    el.appendChild(it);
  });
  el.appendChild(pad());
}

// 스크롤하는 동안 가운데 띠에 가장 가까운 항목을 강조하고, 멈추면 정확히 그 위치로 맞춘다.
// onSettle(idx): 멈춘 뒤 호출. setLimit(n): 앞의 n개만 고를 수 있게 한다 (예: 2월은 28일까지).
export function makeWheel(el, count, { onSettle } = {}) {
  const items = el.querySelectorAll(".tp-item");
  let settleTimer = null;
  let limit = count;
  let wheelTarget = null; // 휠로 이동 중인 목표 칸 (부드럽게 움직이는 동안 연속 입력을 이어 붙인다)
  let wheelAcc = 0;
  let lastWheelStep = 0;
  const nearestIndex = () => Math.max(0, Math.min(limit - 1, Math.round(el.scrollTop / TP_ROW_H)));
  const highlight = () => {
    const idx = nearestIndex();
    items.forEach((it, i) => it.classList.toggle("active", i === idx));
    return idx;
  };
  el.addEventListener(
    "scroll",
    () => {
      highlight();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        const target = nearestIndex() * TP_ROW_H;
        if (Math.abs(el.scrollTop - target) > 0.5) el.scrollTo({ top: target, behavior: "smooth" });
        const idx = highlight();
        wheelTarget = null;
        if (onSettle) onSettle(idx);
      }, 100);
    },
    { passive: true }
  );
  // 마우스 휠: 브라우저 기본은 한 칸에 ~100px(2–3항목)이라, 한 칸 = 한 항목으로 바꾼다.
  // 트랙패드처럼 잘게 오는 입력은 모아서 일정량마다, 너무 빠르면 잠깐 쉬며 한 항목씩 넘긴다.
  el.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) return; // 핀치 확대는 그대로
      e.preventDefault();
      wheelAcc += e.deltaMode === 1 ? e.deltaY * TP_ROW_H : e.deltaY;
      const now = performance.now();
      if (Math.abs(wheelAcc) < 30 || now - lastWheelStep < 70) return;
      const dir = Math.sign(wheelAcc);
      wheelAcc = 0;
      lastWheelStep = now;
      const base = wheelTarget === null ? nearestIndex() : wheelTarget;
      wheelTarget = Math.max(0, Math.min(limit - 1, base + dir));
      el.scrollTo({ top: wheelTarget * TP_ROW_H, behavior: "smooth" });
    },
    { passive: false }
  );
  el.addEventListener("click", (e) => {
    const it = e.target.closest(".tp-item");
    if (!it || it.classList.contains("disabled")) return;
    el.scrollTo({ top: Array.prototype.indexOf.call(items, it) * TP_ROW_H, behavior: "smooth" });
  });
  return {
    getIndex: nearestIndex,
    setIndex(idx) {
      el.scrollTop = Math.min(idx, limit - 1) * TP_ROW_H;
      highlight();
    },
    setLimit(n) {
      limit = Math.max(1, Math.min(count, n));
      items.forEach((it, i) => it.classList.toggle("disabled", i >= limit));
      if (Math.round(el.scrollTop / TP_ROW_H) >= limit) el.scrollTo({ top: (limit - 1) * TP_ROW_H, behavior: "smooth" });
      highlight();
    },
  };
}

export function initTimePicker() {
  const fStart = $("fStart");
  const fEnd = $("fEnd");
  const fStartText = $("fStartText");
  const fEndText = $("fEndText");
  const tpBackdrop = $("tpBackdrop");
  const tpSheet = $("tpSheet");
  const tpTitle = $("tpTitle");

  buildWheelCol($("tpAmpm"), AMPM_VALUES);
  buildWheelCol($("tpHour"), HOUR_VALUES.map(pad2));
  buildWheelCol($("tpMin"), MIN_VALUES.map(pad2));
  const ampmWheel = makeWheel($("tpAmpm"), AMPM_VALUES.length);
  const hourWheel = makeWheel($("tpHour"), HOUR_VALUES.length);
  const minWheel = makeWheel($("tpMin"), MIN_VALUES.length);

  let editing = null; // "start" | "end"

  function sync() {
    fStartText.textContent = fmtButtonLabel(fStart.value);
    fEndText.textContent = fmtButtonLabel(fEnd.value);
  }
  function open(which) {
    editing = which;
    const p = hhmmToParts(which === "start" ? fStart.value : fEnd.value);
    tpTitle.textContent = which === "start" ? "시작 시간" : "종료 시간";
    tpBackdrop.hidden = false;
    tpSheet.hidden = false;
    // 시트가 실제로 배치된 뒤에야 휠 스크롤 위치를 맞출 수 있다
    requestAnimationFrame(() => {
      ampmWheel.setIndex(p.ampmIdx);
      hourWheel.setIndex(p.hourIdx);
      minWheel.setIndex(p.minIdx);
    });
  }
  function close() {
    tpBackdrop.hidden = true;
    tpSheet.hidden = true;
  }

  $("fStartBtn").addEventListener("click", () => open("start"));
  $("fEndBtn").addEventListener("click", () => open("end"));
  $("tpCancelBtn").addEventListener("click", close);
  tpBackdrop.addEventListener("click", close);
  $("tpDoneBtn").addEventListener("click", () => {
    const hhmm = partsToHHMM(ampmWheel.getIndex(), hourWheel.getIndex(), minWheel.getIndex());
    (editing === "start" ? fStart : fEnd).value = hhmm;
    sync();
    close();
  });

  return { sync, open };
}
