-- 청약맵 계정 저장 스키마 (Supabase SQL Editor에서 한 번 실행)
-- 원칙: 카카오 고유번호(또는 구글 계정)로만 식별, 이메일·연락처 미수집. 본인 데이터만 접근(RLS). 관리자는 집계만.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,        -- 내 조건 (소득·자산은 사용자가 '서버 저장'을 켠 경우에만 포함)
  include_financial boolean not null default false,
  consent_version text not null,
  consented_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.saved_notices (
  user_id uuid not null references auth.users(id) on delete cascade,
  notice_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, notice_id)
);

create table if not exists public.checklists (
  user_id uuid not null references auth.users(id) on delete cascade,
  notice_id text not null,
  items jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, notice_id)
);

alter table public.profiles enable row level security;
alter table public.saved_notices enable row level security;
alter table public.checklists enable row level security;

-- 본인 행만 읽기·쓰기
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own saved" on public.saved_notices;
create policy "own saved" on public.saved_notices for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own checklists" on public.checklists;
create policy "own checklists" on public.checklists for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 회원 탈퇴: 본인 계정과 데이터를 즉시 삭제 (on delete cascade)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 관리자페이지용 집계 (개인별 내용은 반환하지 않음)
create or replace function public.admin_stats() returns json
language sql security definer set search_path = public as $$
  select json_build_object(
    'members', (select count(*) from public.profiles),
    'members_7d', (select count(*) from public.profiles where last_seen_at > now() - interval '7 days'),
    'with_financial', (select count(*) from public.profiles where include_financial),
    'saved_total', (select count(*) from public.saved_notices),
    'top_saved', (select coalesce(json_agg(t), '[]'::json) from (
        select notice_id, count(*) as cnt from public.saved_notices group by notice_id order by cnt desc limit 10) t),
    'regions', (select coalesce(json_object_agg(r, c), '{}'::json) from (
        select profile->>'region' as r, count(*) as c from public.profiles group by 1) x)
  );
$$;
grant execute on function public.admin_stats() to anon, authenticated;

-- 1년 이상 접속하지 않은 계정 자동 삭제 (Database → Extensions에서 pg_cron 켠 뒤 실행)
-- select cron.schedule('purge-inactive', '0 4 * * *', $$ delete from auth.users u using public.profiles p where p.user_id = u.id and p.last_seen_at < now() - interval '1 year' $$);
