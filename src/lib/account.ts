// 계정 저장 (Supabase) — 카카오·구글 로그인, 이메일 미수집, 본인 데이터만 접근(RLS)
// VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 가 없으면 기능 전체가 꺼진다(기존 브라우저 저장만 사용).
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from '../types.ts';

const ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}; // 테스트(node)에서는 env 없음
const URL_ = ENV.VITE_SUPABASE_URL;
const KEY_ = ENV.VITE_SUPABASE_ANON_KEY;
export const accountEnabled = !!(URL_ && KEY_);
export const CONSENT_VERSION = '2026-11-10';

// 라이브러리는 기능이 켜져 있을 때만 따로 내려받는다 (첫 화면 용량 절약)
let client: Promise<SupabaseClient> | null = null;
export function sb(): Promise<SupabaseClient> {
  if (!accountEnabled) return Promise.reject(new Error('account disabled'));
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL_!, KEY_!, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } }),
  );
  return client;
}

// 소득·자산 (사용자가 '서버에도 저장'을 켜지 않으면 계정에 올리지 않음)
export const FINANCIAL_KEYS = ['monthlyIncome', 'realEstate', 'carValue', 'netAssets'] as const;

export function stripFinancial(p: Profile): Partial<Profile> {
  const out: Partial<Profile> = { ...p };
  for (const k of FINANCIAL_KEYS) delete out[k];
  delete out.saved;
  return out;
}

const CHECK_PREFIX = 'dash_housing.check.';
export function readLocalChecklists(): Record<string, Record<string, boolean>> {
  const out: Record<string, Record<string, boolean>> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(CHECK_PREFIX)) out[k.slice(CHECK_PREFIX.length)] = JSON.parse(localStorage.getItem(k) ?? '{}');
    }
  } catch {
    /* ignore */
  }
  return out;
}
export function writeLocalChecklists(all: Record<string, Record<string, boolean>>) {
  try {
    for (const [id, items] of Object.entries(all)) localStorage.setItem(CHECK_PREFIX + id, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}
export function clearLocalChecklists() {
  try {
    for (const id of Object.keys(readLocalChecklists())) localStorage.removeItem(CHECK_PREFIX + id);
  } catch {
    /* ignore */
  }
}

export interface RemoteState {
  exists: boolean;
  profile: Partial<Profile>;
  includeFinancial: boolean;
  saved: string[];
  checklists: Record<string, Record<string, boolean>>;
}

export async function loadRemote(): Promise<RemoteState> {
  const c = await sb();
  const [p, s, ch] = await Promise.all([
    c.from('profiles').select('profile, include_financial').maybeSingle(),
    c.from('saved_notices').select('notice_id'),
    c.from('checklists').select('notice_id, items'),
  ]);
  if (p.error) throw p.error;
  return {
    exists: !!p.data,
    profile: (p.data?.profile as Partial<Profile>) ?? {},
    includeFinancial: !!p.data?.include_financial,
    saved: (s.data ?? []).map((r) => r.notice_id as string),
    checklists: Object.fromEntries((ch.data ?? []).map((r) => [r.notice_id as string, r.items as Record<string, boolean>])),
  };
}

export async function saveRemote(userId: string, profile: Profile, includeFinancial: boolean, saved: string[], checklists: Record<string, Record<string, boolean>>) {
  const c = await sb();
  const now = new Date().toISOString();
  const body = includeFinancial ? { ...profile, saved: undefined } : stripFinancial(profile);
  const r1 = await c.from('profiles').upsert({
    user_id: userId,
    profile: body,
    include_financial: includeFinancial,
    consent_version: CONSENT_VERSION,
    updated_at: now,
    last_seen_at: now,
  });
  if (r1.error) throw r1.error;
  // 관심 공고: 현재 목록과 같게 맞춘다
  const del = c.from('saved_notices').delete().eq('user_id', userId);
  const r2 = await (saved.length ? del.not('notice_id', 'in', `(${saved.map((x) => `"${x.replace(/"/g, '')}"`).join(',')})`) : del);
  if (r2.error) throw r2.error;
  if (saved.length) {
    const r3 = await c.from('saved_notices').upsert(saved.map((notice_id) => ({ user_id: userId, notice_id })), { onConflict: 'user_id,notice_id', ignoreDuplicates: true });
    if (r3.error) throw r3.error;
  }
  const rows = Object.entries(checklists)
    .filter(([, items]) => Object.values(items).some(Boolean))
    .map(([notice_id, items]) => ({ user_id: userId, notice_id, items, updated_at: now }));
  if (rows.length) {
    const r4 = await c.from('checklists').upsert(rows, { onConflict: 'user_id,notice_id' });
    if (r4.error) throw r4.error;
  }
}

export async function signIn(provider: 'kakao' | 'google') {
  // 로그인 후 돌아오면 바로 저장하도록 표시 (OAuth 리다이렉트로 페이지가 새로 열림)
  sessionStorage.setItem('dash_housing.pendingSave', '1');
  await (await sb()).auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + location.pathname } });
}

export async function signOut() {
  await (await sb()).auth.signOut();
}

export async function deleteAccount() {
  const c = await sb();
  const r = await c.rpc('delete_my_account');
  if (r.error) throw r.error;
  await c.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  return (await (await sb()).auth.getSession()).data.session;
}

export async function adminStats(): Promise<Record<string, unknown> | null> {
  if (!accountEnabled) return null;
  const r = await (await sb()).rpc('admin_stats');
  return r.error ? null : (r.data as Record<string, unknown>);
}

/** 로그인 직후 합치기: 서버에 저장된 값이 있으면 서버 우선, 관심 공고·체크는 합집합 */
export function mergeOnLogin(local: { profile: Profile; touched: boolean; saved: string[]; checklists: Record<string, Record<string, boolean>> }, remote: RemoteState) {
  const profile: Profile = remote.exists ? { ...local.profile, ...remote.profile } : local.profile;
  // 서버에 소득·자산이 없으면 이 기기의 값을 유지
  if (remote.exists && !remote.includeFinancial) for (const k of FINANCIAL_KEYS) (profile as unknown as Record<string, unknown>)[k] = local.profile[k];
  const saved = [...new Set([...remote.saved, ...local.saved])];
  const checklists: Record<string, Record<string, boolean>> = { ...remote.checklists };
  for (const [id, items] of Object.entries(local.checklists)) {
    checklists[id] = { ...(checklists[id] ?? {}) };
    for (const [k, v] of Object.entries(items)) if (v) checklists[id][k] = true;
  }
  return { profile, saved, checklists, touched: local.touched || remote.exists };
}
