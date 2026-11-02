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

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
