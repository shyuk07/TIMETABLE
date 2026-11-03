export const $ = (id) => document.getElementById(id);

/** 시트(백드롭 + 패널) 열고 닫기 */
export function sheetController(backdropEl, sheetEl, { onClose } = {}) {
  function open() {
    backdropEl.hidden = false;
    sheetEl.hidden = false;
  }
  function close() {
    backdropEl.hidden = true;
    sheetEl.hidden = true;
    if (onClose) onClose();
  }
  backdropEl.addEventListener("click", close);
  return { open, close, isOpen: () => !sheetEl.hidden };
}

/**
 * 아래로 쓸어내려 시트 닫기. 시트 내용이 맨 위까지 스크롤된 상태에서 아래로 끌 때만 시트가 따라 내려오고,
 * 충분히(90px) 또는 빠르게 내리면 닫힌다. 손가락은 시트 어디서든, 마우스는 handleSelector 부분에서만 끈다.
 * 시트의 기본 transform(가운데 정렬용 translateX(-50%))은 baseTransform 으로 넘긴다.
 */
export function enableSwipeDown(sheetEl, onClose, { handleSelector, baseTransform = "translateX(-50%)" } = {}) {
  const START_PX = 8; // 이만큼 내려가야 끌기로 본다 (그 전에는 평소 탭/스크롤)
  const CLOSE_PX = 90;
  const CLOSE_SPEED = 0.6; // px/ms
  let startY = 0;
  let startT = 0;
  let dy = 0;
  let tracking = false;
  let dragging = false;

  const place = (y, animate) => {
    sheetEl.style.transition = animate ? "transform .22s ease" : "none";
    sheetEl.style.transform = `${baseTransform} translateY(${y}px)`;
  };
  const reset = () => {
    sheetEl.style.transition = "";
    sheetEl.style.transform = "";
  };
  function begin(y) {
    tracking = sheetEl.scrollTop <= 0;
    dragging = false;
    startY = y;
    startT = performance.now();
    dy = 0;
  }
  // 반환값: 이번 움직임을 시트 끌기로 가져갔는지 (그렇다면 스크롤 등 기본 동작을 막는다)
  function move(y) {
    if (!tracking) return false;
    dy = y - startY;
    if (!dragging) {
      if (dy < -START_PX) tracking = false; // 위로 밀면 평소 스크롤
      if (dy <= START_PX) return false;
      dragging = true;
    }
    place(Math.max(0, dy - START_PX), false);
    return true;
  }
  function end() {
    if (!dragging) {
      tracking = false;
      return;
    }
    const speed = dy / Math.max(1, performance.now() - startT);
    tracking = dragging = false;
    // 끌고 난 직후 손을 뗀 자리의 click(날짜 선택 등)이 실행되지 않게 잠깐만 막는다
    const swallow = (e) => e.stopPropagation();
    sheetEl.addEventListener("click", swallow, true);
    setTimeout(() => sheetEl.removeEventListener("click", swallow, true), 300);
    if (dy > CLOSE_PX || speed > CLOSE_SPEED) {
      place(sheetEl.offsetHeight, true);
      setTimeout(() => {
        onClose();
        reset();
      }, 220);
    } else {
      place(0, true);
      setTimeout(reset, 220);
    }
  }

  sheetEl.addEventListener("touchstart", (e) => begin(e.touches[0].clientY), { passive: true });
  sheetEl.addEventListener(
    "touchmove",
    (e) => {
      if (move(e.touches[0].clientY) && e.cancelable) e.preventDefault();
    },
    { passive: false }
  );
  sheetEl.addEventListener("touchend", end);
  sheetEl.addEventListener("touchcancel", end);

  // 마우스: 손잡이(머리) 부분을 잡고 끌 때만
  sheetEl.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || !handleSelector || !e.target.closest(handleSelector) || e.target.closest("button")) return;
    begin(e.clientY);
    const onMove = (ev) => {
      if (move(ev.clientY)) ev.preventDefault();
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      end();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
