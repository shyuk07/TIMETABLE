// 저장소 선택: Supabase 환경변수가 있으면 서비스 모드, 없으면 로컬 모드.
// 화면 코드는 어느 쪽인지 몰라도 된다 (repo.mode로 문구만 구분).

import { createLocalRepo } from "./local-repo.js";

export function supabaseConfigured() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return !!(url && key && /^https?:\/\//.test(url));
}

export async function createRepo() {
  if (supabaseConfigured()) {
    // 로컬 모드에서는 supabase 코드가 아예 로드되지 않도록 동적 import
    const [{ createClient }, { createSupabaseRepo }] = await Promise.all([import("@supabase/supabase-js"), import("./supabase-repo.js")]);
    const client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    return createSupabaseRepo(client);
  }
  return createLocalRepo();
}
