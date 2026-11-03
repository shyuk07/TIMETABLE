// 로컬 모드 저장소 — 브라우저 localStorage에 저장한다 (서버/로그인 없음).
// Supabase 저장소(supabase-repo.js)와 완전히 같은 인터페이스이고,
// DB 트리거가 해 주는 규칙(기본 카테고리 삭제 금지, 삭제 시 '기타'로 이동, 이름 중복 금지)을 JS로 똑같이 지킨다.

import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, CATEGORY_NAME_MAX, DDAY_TITLE_MAX, MEMO_TEXT_MAX } from "./defaults.js";
import { toMin } from "../lib/dates.js";
import { isTheme } from "../lib/themes.js";

const STORAGE_KEY = "timetable:v2";
const uuid = () =>
  globalThis.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

function freshState() {
  return {
    profile: { displayName: "", onboarded: false },
    settings: { ...DEFAULT_SETTINGS },
    categories: DEFAULT_CATEGORIES.map((c, i) => ({ id: uuid(), ...c, sortOrder: i })),
    schedules: [],
    goals: [],
    ddays: [],
    memos: [],
  };
}

// localStorage 를 쓸 수 없는 환경(사생활 보호 모드, 일부 임베드 화면)에서는 이번 방문 동안만 메모리에 저장한다
function resolveStorage() {
  try {
    const s = globalThis.localStorage;
    s.setItem("__timetable_probe", "1");
    s.removeItem("__timetable_probe");
    return s;
  } catch (e) {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  }
}

export function createLocalRepo(storage = resolveStorage()) {
  let db = null;

  function load() {
    if (db) return db;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        db = JSON.parse(raw);
        // 이후 버전에서 필드가 늘어도 깨지지 않도록 기본값과 합친다
        db.settings = { ...DEFAULT_SETTINGS, ...(db.settings || {}) };
        db.profile = { displayName: "", onboarded: false, ...(db.profile || {}) };
        db.goals = db.goals || [];
        db.ddays = db.ddays || [];
        db.memos = db.memos || [];
        return db;
      }
    } catch (e) {
      console.warn("[timetable] local data unreadable, starting fresh", e);
    }
    db = freshState();
    save();
    return db;
  }
  function save() {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (e) {
      console.warn("[timetable] could not save local data", e);
    }
  }
  const byOrder = (a, b) => a.sortOrder - b.sortOrder;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const otherCategory = () => load().categories.find((c) => c.defaultKey === "other");

  function validateName(name, exceptId) {
    const n = (name || "").trim();
    if (!n) throw new Error("이름을 입력해 주세요");
    if (n.length > CATEGORY_NAME_MAX) throw new Error(`이름은 ${CATEGORY_NAME_MAX}자까지 가능해요`);
    if (load().categories.some((c) => c.name === n && c.id !== exceptId)) throw new Error("이미 있는 카테고리 이름이에요");
    return n;
  }
  function validateSchedule(s) {
    if (!s.title || !s.title.trim()) throw new Error("제목을 입력해 주세요");
    if (toMin(s.end) <= toMin(s.start)) throw new Error("종료 시간은 시작 시간보다 늦어야 해요");
    if (!load().categories.some((c) => c.id === s.categoryId)) throw new Error("카테고리를 찾을 수 없어요");
  }
  // 디데이·메모: {id, title, date} 를 날짜 순으로 다루는 같은 모양의 저장소
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  function datedItems(key, { max, emptyMsg, notFoundMsg }) {
    function validate(d) {
      const t = (d.title || "").trim();
      if (!t) throw new Error(emptyMsg);
      if (t.length > max) throw new Error(`${max}자까지 가능해요`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || "")) throw new Error("날짜가 올바르지 않아요");
      return t;
    }
    return {
      /** 날짜 순 */
      async list() {
        return clone(load()[key].slice().sort(byDate));
      },
      async create(input) {
        const title = validate(input);
        const it = { id: uuid(), title, date: input.date };
        load()[key].push(it);
        save();
        return clone(it);
      },
      async update(id, patch) {
        const it = load()[key].find((x) => x.id === id);
        if (!it) throw new Error(notFoundMsg);
        const next = { ...it, ...patch };
        Object.assign(it, { title: validate(next), date: next.date });
        save();
        return clone(it);
      },
      async remove(id) {
        const d = load();
        d[key] = d[key].filter((x) => x.id !== id);
        save();
      },
    };
  }

  const user = { id: "local", email: null, name: "" };

  return {
    mode: "local",

    auth: {
      async getUser() {
        load();
        return user;
      },
      onChange() {
        return () => {};
      },
      async signInWithEmail() {
        throw new Error("로컬 모드에서는 로그인이 필요 없어요");
      },
      async signInWithGoogle() {
        throw new Error("로컬 모드에서는 로그인이 필요 없어요");
      },
      async signOut() {},
    },

    profile: {
      async get() {
        return clone(load().profile);
      },
      async update(patch) {
        Object.assign(load().profile, patch);
        save();
        return clone(load().profile);
      },
    },

    settings: {
      async get() {
        return clone(load().settings);
      },
      async update(patch) {
        if (patch.theme !== undefined && !isTheme(patch.theme)) throw new Error("알 수 없는 테마예요");
        Object.assign(load().settings, patch);
        save();
        return clone(load().settings);
      },
    },

    categories: {
      async list() {
        return clone(load().categories.slice().sort(byOrder));
      },
      async create({ name, bg, ink }) {
        const n = validateName(name);
        const d = load();
        const sortOrder = d.categories.reduce((m, c) => Math.max(m, c.sortOrder), -1) + 1;
        const cat = { id: uuid(), name: n, bg, ink, sortOrder, defaultKey: null };
        d.categories.push(cat);
        save();
        return clone(cat);
      },
      async update(id, patch) {
        const c = load().categories.find((x) => x.id === id);
        if (!c) throw new Error("카테고리를 찾을 수 없어요");
        if (patch.name !== undefined) c.name = validateName(patch.name, id);
        if (patch.bg !== undefined) c.bg = patch.bg;
        if (patch.ink !== undefined) c.ink = patch.ink;
        save();
        return clone(c);
      },
      /** ids 순서대로 sortOrder를 다시 매긴다 */
      async reorder(ids) {
        const d = load();
        ids.forEach((id, i) => {
          const c = d.categories.find((x) => x.id === id);
          if (c) c.sortOrder = i;
        });
        save();
      },
      async remove(id) {
        const d = load();
        const c = d.categories.find((x) => x.id === id);
        if (!c) return;
        if (c.defaultKey) throw new Error("기본 카테고리는 삭제할 수 없어요");
        const other = otherCategory();
        d.schedules.forEach((s) => {
          if (s.categoryId === id) s.categoryId = other.id;
        });
        d.goals = d.goals.filter((g) => g.categoryId !== id);
        d.categories = d.categories.filter((x) => x.id !== id);
        save();
      },
    },

    schedules: {
      async listByDate(date) {
        return clone(
          load()
            .schedules.filter((s) => s.date === date)
            .sort((a, b) => toMin(a.start) - toMin(b.start))
        );
      },
      /** from, to: "YYYY-MM-DD" (양끝 포함) */
      async listRange(from, to) {
        return clone(load().schedules.filter((s) => s.date >= from && s.date <= to));
      },
      async create(input) {
        validateSchedule(input);
        const s = { id: uuid(), date: input.date, title: input.title.trim(), start: input.start, end: input.end, categoryId: input.categoryId };
        load().schedules.push(s);
        save();
        return clone(s);
      },
      async update(id, patch) {
        const s = load().schedules.find((x) => x.id === id);
        if (!s) throw new Error("일정을 찾을 수 없어요");
        const next = { ...s, ...patch };
        validateSchedule(next);
        Object.assign(s, { ...next, title: next.title.trim() });
        save();
        return clone(s);
      },
      async remove(id) {
        const d = load();
        d.schedules = d.schedules.filter((s) => s.id !== id);
        save();
      },
      async removeAll() {
        load().schedules = [];
        save();
      },
    },

    goals: {
      async list() {
        return clone(load().goals);
      },
      /** targetMinutes가 0/빈 값이면 목표를 지운다 */
      async set(categoryId, period, targetMinutes) {
        const d = load();
        d.goals = d.goals.filter((g) => !(g.categoryId === categoryId && g.period === period));
        if (targetMinutes > 0) d.goals.push({ categoryId, period, targetMinutes: Math.round(targetMinutes) });
        save();
      },
    },

    ddays: datedItems("ddays", { max: DDAY_TITLE_MAX, emptyMsg: "이벤트 이름을 입력해 주세요", notFoundMsg: "디데이를 찾을 수 없어요" }),
    memos: datedItems("memos", { max: MEMO_TEXT_MAX, emptyMsg: "메모를 입력해 주세요", notFoundMsg: "메모를 찾을 수 없어요" }),
  };
}
