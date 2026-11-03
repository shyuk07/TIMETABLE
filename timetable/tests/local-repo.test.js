import { describe, it, expect, beforeEach } from "vitest";
import { createLocalRepo } from "../src/data/local-repo.js";

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}

let repo, st;
beforeEach(() => {
  st = memStorage();
  repo = createLocalRepo(st);
});

const byKey = async (k) => (await repo.categories.list()).find((c) => c.defaultKey === k);

describe("local repo — 기본값", () => {
  it("처음 열면 기본 카테고리 6개가 순서대로 있다", async () => {
    const list = await repo.categories.list();
    expect(list.map((c) => c.name)).toEqual(["공부", "휴식", "자기발전", "취미", "운동", "기타"]);
    expect(list.every((c) => c.defaultKey)).toBe(true);
  });
  it("온보딩 전 프로필, 기본 설정", async () => {
    expect((await repo.profile.get()).onboarded).toBe(false);
    expect(await repo.settings.get()).toEqual({ weekStart: 0, notifyEnabled: false, notifyMinutesBefore: 10, theme: "black" });
  });
  it("저장한 데이터는 새 repo 인스턴스에서도 보인다 (새로고침)", async () => {
    await repo.profile.update({ displayName: "상혁", onboarded: true });
    const again = createLocalRepo(st);
    expect(await again.profile.get()).toEqual({ displayName: "상혁", onboarded: true });
  });
  it("깨진 저장 데이터는 무시하고 새로 시작한다", async () => {
    st.setItem("timetable:v2", "{not json");
    const r = createLocalRepo(st);
    expect((await r.categories.list()).length).toBe(6);
  });
});

describe("local repo — 카테고리 규칙 (DB 트리거와 동일)", () => {
  it("커스텀 추가 → 목록 맨 뒤", async () => {
    const c = await repo.categories.create({ name: "독서", bg: "#d98fa0", ink: "#1f1410" });
    expect(c.defaultKey).toBeNull();
    const list = await repo.categories.list();
    expect(list[list.length - 1].name).toBe("독서");
  });
  it("이름 중복/빈 이름/11자 초과 거부", async () => {
    await repo.categories.create({ name: "독서", bg: "#000000", ink: "#fff000" });
    await expect(repo.categories.create({ name: "독서", bg: "#000000", ink: "#ffffff" })).rejects.toThrow("이미");
    await expect(repo.categories.create({ name: "공부", bg: "#000000", ink: "#ffffff" })).rejects.toThrow("이미");
    await expect(repo.categories.create({ name: "  ", bg: "#000000", ink: "#ffffff" })).rejects.toThrow();
    await expect(repo.categories.create({ name: "12345678901", bg: "#000000", ink: "#ffffff" })).rejects.toThrow("10자");
  });
  it("기본 카테고리는 삭제 불가, 이름/색 변경은 가능", async () => {
    const study = await byKey("study");
    await expect(repo.categories.remove(study.id)).rejects.toThrow("기본 카테고리는 삭제할 수 없어요");
    await repo.categories.update(study.id, { name: "공부방", bg: "#112233" });
    const after = await byKey("study");
    expect(after.name).toBe("공부방");
    expect(after.bg).toBe("#112233");
  });
  it("커스텀 삭제 → 그 일정은 '기타'로, 목표는 함께 삭제", async () => {
    const c = await repo.categories.create({ name: "독서", bg: "#d98fa0", ink: "#1f1410" });
    const s = await repo.schedules.create({ date: "2026-11-02", title: "소설", start: "21:00", end: "22:00", categoryId: c.id });
    await repo.goals.set(c.id, "week", 300);
    await repo.categories.remove(c.id);
    const other = await byKey("other");
    expect((await repo.schedules.listByDate("2026-11-02"))[0]).toMatchObject({ id: s.id, categoryId: other.id });
    expect(await repo.goals.list()).toEqual([]);
  });
  it("reorder", async () => {
    const ids = (await repo.categories.list()).map((c) => c.id).reverse();
    await repo.categories.reorder(ids);
    expect((await repo.categories.list()).map((c) => c.id)).toEqual(ids);
  });
});

describe("local repo — 일정", () => {
  it("날짜별 조회는 시작 시간 순", async () => {
    const study = await byKey("study");
    const mk = (title, start, end) => repo.schedules.create({ date: "2026-11-02", title, start, end, categoryId: study.id });
    await mk("c", "15:00", "16:00");
    await mk("a", "09:00", "10:00");
    await mk("b", "10:00", "10:30");
    await repo.schedules.create({ date: "2026-11-03", title: "다른 날", start: "09:00", end: "10:00", categoryId: study.id });
    expect((await repo.schedules.listByDate("2026-11-02")).map((s) => s.title)).toEqual(["a", "b", "c"]);
  });
  it("종료가 시작보다 빠르거나 같으면 거부, 제목 필수", async () => {
    const study = await byKey("study");
    const base = { date: "2026-11-02", categoryId: study.id };
    await expect(repo.schedules.create({ ...base, title: "x", start: "10:00", end: "10:00" })).rejects.toThrow();
    await expect(repo.schedules.create({ ...base, title: "x", start: "10:00", end: "09:00" })).rejects.toThrow();
    await expect(repo.schedules.create({ ...base, title: " ", start: "09:00", end: "10:00" })).rejects.toThrow();
    await expect(repo.schedules.create({ ...base, categoryId: "없는-id", title: "x", start: "09:00", end: "10:00" })).rejects.toThrow();
  });
  it("수정/삭제/기간 조회/전체 삭제", async () => {
    const study = await byKey("study");
    const s = await repo.schedules.create({ date: "2026-11-02", title: "a", start: "09:00", end: "10:00", categoryId: study.id });
    await repo.schedules.create({ date: "2026-12-25", title: "b", start: "09:00", end: "10:00", categoryId: study.id });
    await repo.schedules.update(s.id, { title: "수정됨", end: "11:00" });
    expect((await repo.schedules.listByDate("2026-11-02"))[0]).toMatchObject({ title: "수정됨", end: "11:00" });
    expect((await repo.schedules.listRange("2026-11-01", "2026-11-30")).length).toBe(1);
    expect((await repo.schedules.listRange("2026-11-01", "2026-12-31")).length).toBe(2);
    await repo.schedules.remove(s.id);
    expect((await repo.schedules.listRange("0000-01-01", "9999-12-31")).length).toBe(1);
    await repo.schedules.removeAll();
    expect((await repo.schedules.listRange("0000-01-01", "9999-12-31")).length).toBe(0);
  });
});

describe("local repo — 목표/설정", () => {
  it("목표 설정 → 갱신 → 0이면 삭제", async () => {
    const study = await byKey("study");
    await repo.goals.set(study.id, "week", 600);
    await repo.goals.set(study.id, "week", 300);
    expect(await repo.goals.list()).toEqual([{ categoryId: study.id, period: "week", targetMinutes: 300 }]);
    await repo.goals.set(study.id, "week", 0);
    expect(await repo.goals.list()).toEqual([]);
  });
  it("설정 부분 업데이트", async () => {
    await repo.settings.update({ weekStart: 1 });
    expect(await repo.settings.get()).toEqual({ weekStart: 1, notifyEnabled: false, notifyMinutesBefore: 10, theme: "black" });
  });
  it("테마: ember 저장 · 모르는 테마는 거부", async () => {
    await repo.settings.update({ theme: "ember" });
    expect((await createLocalRepo(st).settings.get()).theme).toBe("ember");
    await expect(repo.settings.update({ theme: "neon-pink" })).rejects.toThrow("테마");
  });
});
