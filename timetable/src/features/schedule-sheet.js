// 일정 추가/수정 시트
import { state } from "../state/store.js";
import { saveSchedule, removeSchedule } from "../state/actions.js";
import { DAY_END, fmtHHMM, minsNow, toMin, todayStr } from "../lib/dates.js";
import { $, sheetController } from "../lib/dom.js";
import { showToast } from "../lib/toast.js";
import { initTimePicker } from "./timepicker.js";
import { initChipRow, renderChipRow, setChip, resetChipSelection, getSelectedCategoryId } from "./chip-row.js";

export function initScheduleSheet() {
  const sheetEl = $("sheet");
  const ctl = sheetController($("backdrop"), sheetEl);
  const fTitle = $("fTitle");
  const fStart = $("fStart");
  const fEnd = $("fEnd");
  const deleteBtn = $("deleteBtn");
  const sheetTitle = $("sheetTitle");
  const tp = initTimePicker();
  let editingId = null;
  let busy = false;

  initChipRow();

  function open(item, preset) {
    renderChipRow();
    if (item) {
      editingId = item.id;
      sheetTitle.textContent = "일정 수정";
      fTitle.value = item.title;
      fStart.value = item.start;
      fEnd.value = item.end;
      setChip(item.categoryId);
      deleteBtn.hidden = false;
    } else {
      editingId = null;
      sheetTitle.textContent = "새 일정";
      fTitle.value = "";
      if (preset) {
        fStart.value = fmtHHMM(preset.start);
        fEnd.value = fmtHHMM(preset.end);
      } else {
        const rounded = Math.ceil(minsNow() / 5) * 5;
        // 오늘이 아니면 '지금'이 아니라 오전 9시부터 제안한다
        const base = state.viewDateStr === todayStr() ? rounded : 9 * 60;
        fStart.value = fmtHHMM(Math.min(base, DAY_END - 30));
        fEnd.value = fmtHHMM(Math.min(base + 30, DAY_END));
      }
      resetChipSelection();
      deleteBtn.hidden = true;
    }
    tp.sync();
    ctl.open();
    fTitle.focus({ preventScroll: true });
  }

  $("addBtn").addEventListener("click", () => {
    if (state.viewDateStr < todayStr()) {
      showToast("지난 날짜에는 일정을 추가할 수 없어요");
      return;
    }
    open(null);
  });
  $("cancelBtn").addEventListener("click", ctl.close);

  $("saveBtn").addEventListener("click", async () => {
    if (busy) return;
    const title = fTitle.value.trim();
    const start = fStart.value;
    const end = fEnd.value;
    if (!title) {
      fTitle.focus({ preventScroll: true });
      return;
    }
    if (toMin(end) <= toMin(start)) {
      tp.open("end");
      return;
    }
    busy = true;
    try {
      await saveSchedule({ id: editingId, title, start, end, categoryId: getSelectedCategoryId() });
      ctl.close();
    } catch (err) {
      showToast(err.message || "저장하지 못했어요");
    } finally {
      busy = false;
    }
  });

  deleteBtn.addEventListener("click", async () => {
    if (!editingId || busy) return;
    busy = true;
    try {
      await removeSchedule(editingId);
      ctl.close();
    } catch (err) {
      showToast(err.message || "삭제하지 못했어요");
    } finally {
      busy = false;
    }
  });

  return {
    openNew: (preset) => open(null, preset),
    openEdit: (item) => open(item),
  };
}
