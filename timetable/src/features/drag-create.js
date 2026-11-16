// 타임라인에서 시간 범위를 끌어 고르고, 손을 떼면 그 범위가 채워진 '새 일정' 시트가 열린다. (예: 3시부터 5시까지)
// 터치: 두 번 톡 — 두 번째로 닿은 손가락을 떼지 않고 그대로 위/아래로 끈다. (길게 눌러도 시작된다)
// 마우스: 누르자마자 끌기 시작.

import { DAY_START, DAY_END, PX_PER_MIN, fmtHHMM } from "../lib/dates.js";
import { dragLayer, selectionBox, selectionLabel } from "./timeline.js";
import { $ } from "../lib/dom.js";

const STEP = 5; // 5분 단위로 맞춘다
const LONG_PRESS_MS = 320;
const MOVE_CANCEL_PX = 9;
const MIN_DRAG_MIN = 20; // 거의 안 끌었으면 30분짜리 블록
const DOUBLE_TAP_MS = 320; // 첫 번째 톡을 뗀 뒤 이 안에 다시 닿으면 두 번 톡
const DOUBLE_TAP_PX = 32; // 두 번째 톡이 첫 번째 자리에서 이만큼 안이어야 한다

export function initDragCreate({ openNewSheet }) {
  const wrap = $("timelineWrap");
  let pressTimer = null;
  let pressStartX = 0;
  let pressStartY = 0;
  let dragging = false;
  let anchorMin = 0;
  let currentMin = 0;
  let activePointerId = null;
  let lastTap = null; // 직전 '톡'(짧게 닿았다 뗀 터치): {x, y, t}

  dragLayer.style.touchAction = "pan-y";

  // 지난 날짜·지난 시간에도 일정을 만들 수 있다 (하루를 돌아보며 기록하는 용도)
  function yToMin(clientY) {
    const rect = wrap.getBoundingClientRect();
    let min = DAY_START + (clientY - rect.top) / PX_PER_MIN;
    min = Math.max(DAY_START, Math.min(DAY_END, min));
    return Math.round(min / STEP) * STEP;
  }

  function paintSelection() {
    const s = Math.min(anchorMin, currentMin);
    let e = Math.max(anchorMin, currentMin);
    if (e - s < STEP) e = s + STEP;
    selectionBox.style.top = (s - DAY_START) * PX_PER_MIN + "px";
    selectionBox.style.height = Math.max((e - s) * PX_PER_MIN, STEP * PX_PER_MIN) + "px";
    const dur = e - s;
    const durText = dur >= 60 ? Math.floor(dur / 60) + "시간" + (dur % 60 ? " " + (dur % 60) + "분" : "") : dur + "분";
    selectionLabel.textContent = `${fmtHHMM(s)} – ${fmtHHMM(e)} · ${durText}`;
  }

  function beginDrag(clientY) {
    dragging = true;
    anchorMin = yToMin(clientY);
    currentMin = anchorMin;
    dragLayer.style.touchAction = "none";
    selectionBox.hidden = false;
    paintSelection();
    if (navigator.vibrate) {
      try {
        navigator.vibrate(12);
      } catch (e) {
        /* 진동 미지원 */
      }
    }
  }

  function endDrag(cancelled) {
    dragging = false;
    dragLayer.style.touchAction = "pan-y";
    selectionBox.hidden = true;
    if (activePointerId !== null) {
      try {
        dragLayer.releasePointerCapture(activePointerId);
      } catch (e) {
        /* 이미 해제됨 */
      }
      activePointerId = null;
    }
    if (cancelled) return;
    const s = Math.min(anchorMin, currentMin);
    let e = Math.max(anchorMin, currentMin);
    if (e - s < MIN_DRAG_MIN) e = Math.min(s + 30, DAY_END);
    openNewSheet({ start: s, end: e });
  }

  dragLayer.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pressStartX = e.clientX;
    pressStartY = e.clientY;
    activePointerId = e.pointerId;
    clearTimeout(pressTimer);

    if (e.pointerType === "mouse") {
      // 마우스는 스크롤과 싸울 일이 없으니 누르자마자 시작
      try {
        dragLayer.setPointerCapture(activePointerId);
      } catch (err) {
        /* noop */
      }
      beginDrag(pressStartY);
      return;
    }
    // 터치/펜: 두 번 톡이면 두 번째 손가락이 닿은 자리에서 바로 시작
    // (끌기 중 스크롤은 아래 touchmove 에서 막는다 — 이 레이어는 touch-action:pan-y 라 두 번 톡 확대도 일어나지 않는다)
    if (lastTap && e.timeStamp - lastTap.t < DOUBLE_TAP_MS && Math.abs(e.clientX - lastTap.x) < DOUBLE_TAP_PX && Math.abs(e.clientY - lastTap.y) < DOUBLE_TAP_PX) {
      lastTap = null;
      try {
        dragLayer.setPointerCapture(activePointerId);
      } catch (err) {
        /* noop */
      }
      beginDrag(pressStartY);
      return;
    }
    // 그 밖에는 잠깐(길게) 눌러야 시작 — 평범한 스크롤 스와이프가 일정 생성으로 오인되지 않도록
    pressTimer = setTimeout(() => {
      try {
        dragLayer.setPointerCapture(activePointerId);
      } catch (err) {
        /* noop */
      }
      beginDrag(pressStartY);
    }, LONG_PRESS_MS);
  });

  // 터치에서 touch-action 은 '손가락이 닿는 순간' 기준으로 정해져서, 길게 누른 뒤 style 을 바꿔도
  // 그 제스처에는 적용되지 않는다. 그래서 끌기 중에는 touchmove 를 직접 막아 스크롤이 가로채지 못하게 한다.
  dragLayer.addEventListener(
    "touchmove",
    (e) => {
      if (dragging && e.cancelable) e.preventDefault();
    },
    { passive: false }
  );

  dragLayer.addEventListener("pointermove", (e) => {
    if (dragging) {
      e.preventDefault();
      currentMin = yToMin(e.clientY);
      paintSelection();
      return;
    }
    if (pressTimer && (Math.abs(e.clientX - pressStartX) > MOVE_CANCEL_PX || Math.abs(e.clientY - pressStartY) > MOVE_CANCEL_PX)) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  });
  dragLayer.addEventListener("pointerup", (e) => {
    // 끌기도, 스크롤로 움직이지도 않은 짧은 터치 = '톡' → 두 번 톡의 첫 번째로 기억해 둔다
    const wasTap = e.pointerType !== "mouse" && !dragging && pressTimer !== null;
    clearTimeout(pressTimer);
    pressTimer = null;
    if (dragging) endDrag(false);
    lastTap = wasTap ? { x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
  });
  dragLayer.addEventListener("pointercancel", () => {
    lastTap = null;
    clearTimeout(pressTimer);
    pressTimer = null;
    if (dragging) endDrag(true);
  });
}
