import { describe, it, expect, vi } from "vitest";
import { createSupabaseRepo } from "../src/data/supabase-repo.js";

// supabase-js 의 체이닝 쿼리 빌더를 흉내 낸다: 호출 기록을 남기고, await 하면 미리 정한 결과를 돌려준다.
function fakeClient(responses = {}) {
  const calls = [];
  const client = {
    calls,
    auth: {
      getUser: async () => ({ data: { user: { id: "u1" } } }),
      getSession: async () => ({ data: { session: { user: { id: "u1", email: "a@b.com", user_metadata: { full_name: "상혁" } } } } }),
      onAuthStateChange: (cb) => {
        client._authCb = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      signInWithOtp: vi.fn(async () => ({ error: null })),
      signInWithOAuth: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from(table) {
      const rec = { table, ops: [] };
      calls.push(rec);
      const b = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then") {
              const res = (responses[table] && responses[table](rec)) || { data: [], error: null };
              return (resolve) => resolve(res);
            }
            return (...args) => {
              rec.ops.push([prop, ...args]);
              return b;
            };
          },
        }
      );
      return b;
    },
  };
  return client;
}
const ops = (rec) => Object.fromEntries(rec.ops.map(([k, ...a]) => [k, a]));

describe("supabase repo — 매핑", () => {
  it("일정: Postgres time('09:00:00') → '09:00', snake_case → camelCase", async () => {
    const c = fakeClient({
      schedules: () => ({ data: [{ id: "s1", date: "2026-11-02", title: "수학", start_time: "09:00:00", end_time: "10:30:00", category_id: "c1" }], error: null }),
    });
    const repo = createSupabaseRepo(c);
    const list = await repo.schedules.listByDate("2026-11-02");
    expect(list).toEqual([{ id: "s1", date: "2026-11-02", title: "수학", start: "09:00", end: "10:30", categoryId: "c1" }]);
    expect(ops(c.calls[0])).toMatchObject({ eq: ["date", "2026-11-02"], order: ["start_time"] });
  });
  it("일정 생성 payload (user_id는 DB 기본값 auth.uid() 에 맡긴다)", async () => {
    const row = { id: "s1", date: "2026-11-02", title: "수학", start_time: "09:00:00", end_time: "10:00:00", category_id: "c1" };
    const c = fakeClient({ schedules: () => ({ data: row, error: null }) });
    await createSupabaseRepo(c).schedules.create({ date: "2026-11-02", title: " 수학 ", start: "09:00", end: "10:00", categoryId: "c1" });
    expect(ops(c.calls[0]).insert[0]).toEqual({ date: "2026-11-02", title: "수학", start_time: "09:00", end_time: "10:00", category_id: "c1" });
  });
  it("기간 조회는 gte/lte", async () => {
    const c = fakeClient();
    await createSupabaseRepo(c).schedules.listRange("2026-01-01", "2026-12-31");
    expect(ops(c.calls[0])).toMatchObject({ gte: ["date", "2026-01-01"], lte: ["date", "2026-12-31"] });
  });
  it("카테고리 매핑 + 정렬 요청", async () => {
    const c = fakeClient({ categories: () => ({ data: [{ id: "c1", name: "공부", bg: "#e3a765", ink: "#2c1c0c", sort_order: 0, default_key: "study" }], error: null }) });
    expect(await createSupabaseRepo(c).categories.list()).toEqual([{ id: "c1", name: "공부", bg: "#e3a765", ink: "#2c1c0c", sortOrder: 0, defaultKey: "study" }]);
    expect(ops(c.calls[0]).order).toEqual(["sort_order"]);
  });
  it("설정: week_start 등 매핑, 업데이트는 변경한 필드만", async () => {
    const c = fakeClient({ user_settings: () => ({ data: { week_start: 1, notify_enabled: true, notify_minutes_before: 15, theme: "sample" }, error: null }) });
    const repo = createSupabaseRepo(c);
    expect(await repo.settings.update({ weekStart: 1 })).toEqual({ weekStart: 1, notifyEnabled: true, notifyMinutesBefore: 15, theme: "sample" });
    expect(ops(c.calls[0]).update[0]).toEqual({ week_start: 1 });
    await repo.settings.update({ theme: "sample" });
    expect(ops(c.calls[2]).update[0]).toEqual({ theme: "sample" });
  });
  it("프로필 업데이트", async () => {
    const c = fakeClient({ profiles: () => ({ data: { display_name: "상혁", onboarded: true }, error: null }) });
    const repo = createSupabaseRepo(c);
    expect(await repo.profile.update({ displayName: "상혁", onboarded: true })).toEqual({ displayName: "상혁", onboarded: true });
    expect(ops(c.calls[0]).update[0]).toEqual({ display_name: "상혁", onboarded: true });
  });
  it("목표: 0 이하면 삭제, 아니면 upsert", async () => {
    const c = fakeClient();
    const repo = createSupabaseRepo(c);
    await repo.goals.set("c1", "week", 0);
    expect(ops(c.calls[0]).delete).toBeDefined();
    await repo.goals.set("c1", "week", 300);
    expect(ops(c.calls[1]).upsert[0]).toEqual({ user_id: "u1", category_id: "c1", period: "week", target_minutes: 300 });
    expect(ops(c.calls[1]).upsert[1]).toEqual({ onConflict: "user_id,category_id,period" });
  });
});

describe("supabase repo — 오류/인증", () => {
  it("DB 오류 메시지를 그대로 사용자에게 (예: 트리거의 '기본 카테고리는 삭제할 수 없어요')", async () => {
    const c = fakeClient({ categories: () => ({ data: null, error: { message: "기본 카테고리는 삭제할 수 없어요", code: "P0001" } }) });
    await expect(createSupabaseRepo(c).categories.remove("c1")).rejects.toThrow("기본 카테고리는 삭제할 수 없어요");
  });
  it("카테고리 이름 중복(23505)은 알아보기 쉬운 문구로", async () => {
    const c = fakeClient({
      categories: (rec) =>
        rec.ops.some(([k]) => k === "insert")
          ? { data: null, error: { message: 'duplicate key value violates unique constraint "categories_user_id_name_key"', code: "23505" } }
          : { data: [], error: null },
    });
    await expect(createSupabaseRepo(c).categories.create({ name: "독서", bg: "#000000", ink: "#ffffff" })).rejects.toThrow("이미 있는 카테고리 이름이에요");
  });
  it("로그인: 이메일 OTP 와 redirect, Google OAuth", async () => {
    const c = fakeClient();
    const repo = createSupabaseRepo(c);
    await repo.auth.signInWithEmail("a@b.com");
    expect(c.auth.signInWithOtp.mock.calls[0][0].email).toBe("a@b.com");
    expect(c.auth.signInWithOtp.mock.calls[0][0].options.emailRedirectTo).toContain("http");
    await repo.auth.signInWithGoogle();
    expect(c.auth.signInWithOAuth.mock.calls[0][0].provider).toBe("google");
  });
  it("getUser / onChange 가 앱용 user 객체로 변환", async () => {
    const c = fakeClient();
    const repo = createSupabaseRepo(c);
    expect(await repo.auth.getUser()).toEqual({ id: "u1", email: "a@b.com", name: "상혁" });
    const cb = vi.fn();
    repo.auth.onChange(cb);
    c._authCb("SIGNED_OUT", null);
    expect(cb).toHaveBeenCalledWith(null);
  });
  it("로그인 메일 전송 실패 시 오류를 던진다", async () => {
    const c = fakeClient();
    c.auth.signInWithOtp = async () => ({ error: { message: "rate limit" } });
    await expect(createSupabaseRepo(c).auth.signInWithEmail("a@b.com")).rejects.toThrow("rate limit");
  });
});
