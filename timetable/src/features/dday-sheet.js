// 디데이·메모 추가/수정 시트. 이름(내용) + 년·월·일 휠로 날짜를 고른다 (휠은 시간 선택기와 같은 것).
// 둘은 {title, date} 로 모양이 같아서, 열 때 kind 에 맞춰 문구만 바꿔 같은 시트를 쓴다.

import { state } from "../state/store.js";
import { saveDated, removeDated } from "../state/actions.js";
import { DDAY_TITLE_MAX, MEMO_TEXT_MAX } from "../data/defaults.js";
import { toDateStr, fromDateStr, ddayLabel } from "../lib/dates.js";
import { $, sheetController } from "../lib/dom.js";
import { showToast } from "../lib/toast.js";
import { buildWheelCol, makeWheel } from "./timepicker.js";

const KINDS = {
  ddays: {
    newTitle: "새 디데이",
    editTitle: "디데이 수정",
    label: "이벤트 이름",
    placeholder: "예: 생일",
    max: DDAY_TITLE_MAX,
    emptyMsg: "이벤트 이름을 입력해 주세요",
    deleteLabel: "이 디데이 삭제",
    deletedMsg: "디데이를 삭제했어요",
    showCount: true, // 날짜 옆에 D-3 미리보기
  },
  memos: {
    newTitle: "새 메모",
    editTitle: "메모 수정",
    label: "메모",
    placeholder: "예: 준비물 챙기기",
    max: MEMO_TEXT_MAX,
    emptyMsg: "메모를 입력해 주세요",
    deleteLabel: "이 메모 삭제",
    deletedMsg: "메모를 삭제했어요",
    showCount: false,
  },
};

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 31 }, (_, i) => THIS_YEAR - 5 + i); // 5년 전 ~ 25년 뒤
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const daysInMonth = (y, m) => new Date(y, m, 0).getDate(); // m: 1–12

export function initDdaySheet() {
  const sheetEl = $("ddaySheet");
  const ctl = sheetController($("ddayBackdrop"), sheetEl);
  const titleEl = $("ddaySheetTitle");
  const labelEl = $("ddayTitleLabel");
  const input = $("ddayTitleInput");
  const preview = $("ddayPreview");
  const errorEl = $("ddayError");
  const deleteBtn = $("ddayDeleteBtn");
  let kind = "ddays";
  let editingId = null;
  let busy = false;
  let confirmTimer = null;
  const cfg = () => KINDS[kind];

  buildWheelCol($("ddayYear"), YEARS.map((y) => `${y}년`));
  buildWheelCol($("ddayMonth"), MONTHS.map((m) => `${m}월`));
  buildWheelCol($("ddayDay"), DAYS.map((d) => `${d}일`));

  const pickedDate = () => new Date(YEARS[yearWheel.getIndex()], monthWheel.getIndex(), dayWheel.getIndex() + 1);
  const updatePreview = (d) => {
    preview.textContent = cfg().showCount ? ddayLabel(toDateStr(d)) : "";
  };
  // 년/월이 바뀌면 그 달의 마지막 날까지만 고를 수 있게 하고, D-표시를 갱신한다
  function onDateMove() {
    dayWheel.setLimit(daysInMonth(YEARS[yearWheel.getIndex()], monthWheel.getIndex() + 1));
    updatePreview(pickedDate());
  }
  const yearWheel = makeWheel($("ddayYear"), YEARS.length, { onSettle: onDateMove });
  const monthWheel = makeWheel($("ddayMonth"), MONTHS.length, { onSettle: onDateMove });
  const dayWheel = makeWheel($("ddayDay"), DAYS.length, { onSettle: onDateMove });

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
  }
  function resetDelete() {
    clearTimeout(confirmTimer);
    confirmTimer = null;
    deleteBtn.textContent = cfg().deleteLabel;
    deleteBtn.classList.remove("armed");
  }

  /** kind: "ddays" | "memos". item 이 있으면 수정, 없으면 새로 (기본 날짜: 지금 보고 있는 날짜) */
  function open(nextKind, item) {
    kind = nextKind;
    const c = cfg();
    editingId = item ? item.id : null;
    titleEl.textContent = item ? c.editTitle : c.newTitle;
    labelEl.textContent = c.label;
    input.placeholder = c.placeholder;
    input.maxLength = c.max;
    input.value = item ? item.title : "";
    deleteBtn.hidden = !item;
    resetDelete();
    showError("");
    let d = item ? fromDateStr(item.date) : state.viewDate;
    // 휠 범위 밖 날짜는 가장 가까운 끝으로
    if (d.getFullYear() < YEARS[0]) d = new Date(YEARS[0], 0, 1);
    if (d.getFullYear() > YEARS[YEARS.length - 1]) d = new Date(YEARS[YEARS.length - 1], 11, 31);
    ctl.open();
    // 시트가 화면에 배치된 뒤에야 휠 스크롤 위치를 맞출 수 있다
    requestAnimationFrame(() => {
      yearWheel.setIndex(YEARS.indexOf(d.getFullYear()));
      monthWheel.setIndex(d.getMonth());
      dayWheel.setLimit(daysInMonth(d.getFullYear(), d.getMonth() + 1));
      dayWheel.setIndex(d.getDate() - 1);
      updatePreview(d);
    });
    if (!item) input.focus({ preventScroll: true });
  }

  async function save() {
    if (busy) return;
    const c = cfg();
    const title = input.value.trim();
    if (!title) {
      showError(c.emptyMsg);
      input.focus({ preventScroll: true });
      return;
    }
    if (title.length > c.max) return showError(`${c.max}자까지 가능해요`);
    busy = true;
    try {
      await saveDated(kind, { id: editingId, title, date: toDateStr(pickedDate()) });
      ctl.close();
    } catch (err) {
      showError(err.message || "저장하지 못했어요");
    } finally {
      busy = false;
    }
  }

  $("ddaySaveBtn").addEventListener("click", save);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) save();
  });
  $("ddayCancelBtn").addEventListener("click", ctl.close);
  // 삭제는 '한 번 더 누르면' 실행 (설정 화면과 같은 방식)
  deleteBtn.addEventListener("click", async () => {
    if (!editingId) return;
    if (!confirmTimer) {
      deleteBtn.textContent = "정말 삭제할까요? 한 번 더 누르세요";
      deleteBtn.classList.add("armed");
      confirmTimer = setTimeout(resetDelete, 3000);
      return;
    }
    const msg = cfg().deletedMsg;
    resetDelete();
    try {
      await removeDated(kind, editingId);
      ctl.close();
      showToast(msg);
    } catch (err) {
      showError(err.message || "삭제하지 못했어요");
    }
  });

  return { open, close: ctl.close };
}
