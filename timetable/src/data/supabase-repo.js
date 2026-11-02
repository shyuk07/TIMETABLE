// 서비스 모드 저장소 — Supabase(PostgreSQL + Auth)에 저장한다.
// 보안은 DB의 Row Level Security가 맡는다: 모든 테이블이 user_id = auth.uid() 인 행만 보여 준다.
// 스키마는 supabase/migrations/0001_init.sql 참고.

import { normTime } from "../lib/dates.js";

function fail(error, fallback = "요청을 처리하지 못했어요") {
  if (!error) return;
  const msg = error.message || fallback;
  // unique(user_id, name) 위반 → 알아보기 쉬운 문구로
  if (error.code === "23505" && /categories/.test(error.message + (error.details || ""))) throw new Error("이미 있는 카테고리 이름이에요");
  throw new Error(msg);
}

const toCategory = (r) => ({ id: r.id, name: r.name, bg: r.bg, ink: r.ink, sortOrder: r.sort_order, defaultKey: r.default_key });
const toSchedule = (r) => ({ id: r.id, date: r.date, title: r.title, start: normTime(r.start_time), end: normTime(r.end_time), categoryId: r.category_id });
const toGoal = (r) => ({ categoryId: r.category_id, period: r.period, targetMinutes: r.target_minutes });

export function createSupabaseRepo(client) {
  let uid = null;
  const userOf = (u) =>
    u && {
      id: u.id,
      email: u.email || null,
      name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || "",
    };

  async function requireUid() {
    if (uid) return uid;
    const { data } = await client.auth.getUser();
    if (!data || !data.user) throw new Error("로그인이 필요해요");
    uid = data.user.id;
    return uid;
  }

  return {
    mode: "supabase",

    auth: {
      async getUser() {
        const { data } = await client.auth.getSession();
        const u = data && data.session && data.session.user;
        uid = u ? u.id : null;
        return userOf(u);
      },
      /** 로그인/로그아웃/토큰 갱신 때마다 호출된다. 반환값은 구독 해제 함수 */
      onChange(cb) {
        const { data } = client.auth.onAuthStateChange((_event, session) => {
          const u = session && session.user;
          uid = u ? u.id : null;
          cb(userOf(u));
        });
        return () => data.subscription.unsubscribe();
      },
      async signInWithEmail(email) {
        const { error } = await client.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin + window.location.pathname },
        });
        fail(error, "로그인 메일을 보내지 못했어요");
      },
      async signInWithGoogle() {
        const { error } = await client.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.origin + window.location.pathname },
        });
        fail(error, "Google 로그인을 시작하지 못했어요");
      },
      async signOut() {
        const { error } = await client.auth.signOut();
        fail(error);
      },
    },

    profile: {
      async get() {
        const id = await requireUid();
        const { data, error } = await client.from("profiles").select("display_name, onboarded").eq("id", id).maybeSingle();
        fail(error);
        return { displayName: (data && data.display_name) || "", onboarded: !!(data && data.onboarded) };
      },
      async update(patch) {
        const id = await requireUid();
        const row = {};
        if (patch.displayName !== undefined) row.display_name = patch.displayName;
        if (patch.onboarded !== undefined) row.onboarded = patch.onboarded;
        const { error } = await client.from("profiles").update(row).eq("id", id);
        fail(error);
        return this.get();
      },
    },

    settings: {
      async get() {
        const id = await requireUid();
        const { data, error } = await client.from("user_settings").select("week_start, notify_enabled, notify_minutes_before, theme").eq("user_id", id).single();
        fail(error);
        return { weekStart: data.week_start, notifyEnabled: data.notify_enabled, notifyMinutesBefore: data.notify_minutes_before, theme: data.theme };
      },
      async update(patch) {
        const id = await requireUid();
        const row = {};
        if (patch.weekStart !== undefined) row.week_start = patch.weekStart;
        if (patch.notifyEnabled !== undefined) row.notify_enabled = patch.notifyEnabled;
        if (patch.notifyMinutesBefore !== undefined) row.notify_minutes_before = patch.notifyMinutesBefore;
        if (patch.theme !== undefined) row.theme = patch.theme;
        const { error } = await client.from("user_settings").update(row).eq("user_id", id);
        fail(error);
        return this.get();
      },
    },

    categories: {
      async list() {
        const { data, error } = await client.from("categories").select("*").order("sort_order");
        fail(error);
        return data.map(toCategory);
      },
      async create({ name, bg, ink }) {
        const { data: last } = await client.from("categories").select("sort_order").order("sort_order", { ascending: false }).limit(1);
        const sortOrder = last && last.length ? last[0].sort_order + 1 : 0;
        const { data, error } = await client.from("categories").insert({ name: name.trim(), bg, ink, sort_order: sortOrder }).select().single();
        fail(error);
        return toCategory(data);
      },
      async update(id, patch) {
        const row = {};
        if (patch.name !== undefined) row.name = patch.name.trim();
        if (patch.bg !== undefined) row.bg = patch.bg;
        if (patch.ink !== undefined) row.ink = patch.ink;
        const { data, error } = await client.from("categories").update(row).eq("id", id).select().single();
        fail(error);
        return toCategory(data);
      },
      async reorder(ids) {
        const results = await Promise.all(ids.map((id, i) => client.from("categories").update({ sort_order: i }).eq("id", id)));
        results.forEach((r) => fail(r.error));
      },
      /** 기본 카테고리 삭제 금지 + 일정을 '기타'로 이동은 DB 트리거가 처리한다 */
      async remove(id) {
        const { error } = await client.from("categories").delete().eq("id", id);
        fail(error);
      },
    },

    schedules: {
      async listByDate(date) {
        const { data, error } = await client.from("schedules").select("*").eq("date", date).order("start_time");
        fail(error);
        return data.map(toSchedule);
      },
      async listRange(from, to) {
        const { data, error } = await client.from("schedules").select("*").gte("date", from).lte("date", to).limit(20000);
        fail(error);
        return data.map(toSchedule);
      },
      async create(input) {
        const { data, error } = await client
          .from("schedules")
          .insert({ date: input.date, title: input.title.trim(), start_time: input.start, end_time: input.end, category_id: input.categoryId })
          .select()
          .single();
        fail(error);
        return toSchedule(data);
      },
      async update(id, patch) {
        const row = {};
        if (patch.date !== undefined) row.date = patch.date;
        if (patch.title !== undefined) row.title = patch.title.trim();
        if (patch.start !== undefined) row.start_time = patch.start;
        if (patch.end !== undefined) row.end_time = patch.end;
        if (patch.categoryId !== undefined) row.category_id = patch.categoryId;
        const { data, error } = await client.from("schedules").update(row).eq("id", id).select().single();
        fail(error);
        return toSchedule(data);
      },
      async remove(id) {
        const { error } = await client.from("schedules").delete().eq("id", id);
        fail(error);
      },
      async removeAll() {
        const id = await requireUid();
        const { error } = await client.from("schedules").delete().eq("user_id", id);
        fail(error);
      },
    },

    goals: {
      async list() {
        const { data, error } = await client.from("goals").select("*");
        fail(error);
        return data.map(toGoal);
      },
      async set(categoryId, period, targetMinutes) {
        const id = await requireUid();
        if (!(targetMinutes > 0)) {
          const { error } = await client.from("goals").delete().eq("user_id", id).eq("category_id", categoryId).eq("period", period);
          fail(error);
          return;
        }
        const { error } = await client
          .from("goals")
          .upsert({ user_id: id, category_id: categoryId, period, target_minutes: Math.round(targetMinutes) }, { onConflict: "user_id,category_id,period" });
        fail(error);
      },
    },
  };
}
