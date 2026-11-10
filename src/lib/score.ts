import type { Notice, Profile, Verdict } from '../types.ts';
import { gajeomTableFor, type GajeomTable } from '../config/criteria.ts';
import { AREA_BUCKETS, PRICE_BUCKETS, matchArea, matchPrice } from './filters.ts';

// ---- F4 가점 계산기 (민영주택 가점제, 84점 만점) ----
// 배점표는 src/config/criteria.ts 의 GAJEOM_VERSIONS 한 곳에서만 관리한다.

export interface GajeomPart {
  key: 'homeless' | 'dependents' | 'account';
  label: string;
  points: number;
  max: number;
  basis: string; // 계산 근거 (사람이 읽는 문장)
}
export interface Gajeom {
  total: number;
  max: number;
  parts: GajeomPart[];
  notes: string[]; // 계산에서 가정한 것·빠진 것
  complete: boolean; // 출생연도 등 필수 입력이 있는가
}

/** 무주택기간 시작 연도: 만 30세가 된 해와 혼인한 해 중 빠른 해. 처분 등으로 더 늦게 무주택이 됐다면 그 해 */
export function homelessStartYear(p: Profile): number | undefined {
  const bases: number[] = [];
  if (p.birthYear) bases.push(p.birthYear + 30);
  if (p.marital === 'married' && p.marriageDate) bases.push(+p.marriageDate.slice(0, 4));
  if (!bases.length) return p.homelessSinceYear;
  const base = Math.min(...bases);
  return p.homelessSinceYear ? Math.max(base, p.homelessSinceYear) : base;
}

export function homelessPoints(years: number | undefined, t: GajeomTable): number {
  if (years === undefined || years < 0) return 0; // 만 30세 미만 미혼 등: 기간 산정 전
  return Math.min(t.homeless.max, t.homeless.base + t.homeless.perYear * Math.floor(years));
}
export function dependentsPoints(count: number, t: GajeomTable): number {
  return Math.min(t.dependents.max, t.dependents.base + t.dependents.perPerson * Math.max(0, Math.floor(count)));
}
export function accountPoints(months: number, t: GajeomTable): number {
  if (months < 6) return t.account.under6m;
  if (months < 12) return t.account.under1y;
  return Math.min(t.account.max, t.account.under1y + t.account.perYear * Math.floor(months / 12));
}

/** 부양가족 수 (본인 제외). 직접 입력이 없으면 배우자 + 미성년 자녀로 추정 */
export function dependentsOf(p: Profile): { count: number; estimated: boolean } {
  if (p.dependents !== undefined) return { count: p.dependents, estimated: false };
  return { count: (p.marital === 'married' ? 1 : 0) + (p.children ?? 0), estimated: true };
}

export function calcGajeom(p: Profile, today: string, announce?: string): Gajeom {
  const t = gajeomTableFor(announce);
  const year = +today.slice(0, 4);
  const notes: string[] = [];

  let hp = 0;
  let hBasis: string;
  const start = homelessStartYear(p);
  if (!p.homeless) {
    hBasis = '현재 유주택 (0점)';
  } else if (start === undefined) {
    hBasis = '출생연도를 입력하면 계산됩니다';
  } else {
    const years = year - start;
    hp = homelessPoints(years, t);
    hBasis = years < 0 ? '만 30세 전 미혼 기간은 무주택기간에서 제외 (0점)' : `${start}년부터 약 ${years}년`;
  }

  const dep = dependentsOf(p);
  const dp = dependentsPoints(dep.count, t);
  if (dep.estimated) notes.push('부양가족은 배우자·미성년 자녀로 추정했습니다. 부모님(3년 이상 같은 세대)이나 성년 자녀(미혼, 1년 이상 같은 세대)가 있으면 "부양가족 수"를 직접 입력하세요.');
  if (p.supportsElderly3y && dep.estimated) notes.push('부모님 부양을 체크했지만 인원수를 알 수 없어 부양가족에 넣지 않았습니다.');

  const ap = accountPoints(p.accountMonths ?? 0, t);
  notes.push('배우자 통장 가입기간 가산(최대 3점)과 미성년 가입기간 인정 상한은 반영하지 않았습니다.');

  const parts: GajeomPart[] = [
    { key: 'homeless', label: '무주택기간', points: hp, max: t.homeless.max, basis: hBasis },
    { key: 'dependents', label: '부양가족', points: dp, max: t.dependents.max, basis: `${dep.count}명${dep.estimated ? ' (추정)' : ''}` },
    { key: 'account', label: '청약통장 가입기간', points: ap, max: t.account.max, basis: `${p.accountMonths ?? 0}개월` },
  ];
  return {
    total: Math.min(t.total, parts.reduce((s, x) => s + x.points, 0)),
    max: t.total,
    parts,
    notes,
    complete: !p.homeless || start !== undefined,
  };
}

// ---- 인근 당첨가점 (같은 시·군·구 → 없으면 같은 시·도) ----
export interface NearbyScores {
  scope: string; // 예: '경기 화성특례시' 또는 '경기 전체'
  count: number; // 비교에 쓴 공고 수
  min: number;
  avg: number;
  max: number;
  ids: string[];
}

function district(n: Notice): string | undefined {
  return n.address?.trim().split(/\s+/)[1];
}

export function nearbyScores(n: Notice, all: Notice[]): NearbyScores | null {
  const withScores = all.filter((o) => o.id !== n.id && o.scores?.some((s) => s.min !== undefined || s.avg !== undefined));
  const sameRegion = withScores.filter((o) => n.region && o.region === n.region);
  const d = district(n);
  const sameDistrict = d ? sameRegion.filter((o) => district(o) === d) : [];
  const pick = sameDistrict.length ? sameDistrict : sameRegion;
  if (!pick.length) return null;
  const mins: number[] = [];
  const maxs: number[] = [];
  const avgs: number[] = [];
  for (const o of pick) {
    for (const s of o.scores ?? []) {
      if (s.min !== undefined) mins.push(s.min);
      if (s.max !== undefined) maxs.push(s.max);
      if (s.avg !== undefined) avgs.push(s.avg);
    }
  }
  if (!mins.length && !avgs.length) return null;
  const avg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : NaN;
  return {
    scope: sameDistrict.length ? `${n.region} ${d}` : `${n.region} 전체`,
    count: pick.length,
    min: mins.length ? Math.min(...mins) : NaN,
    avg: Math.round(avg * 10) / 10,
    max: maxs.length ? Math.max(...maxs) : NaN,
    ids: pick.map((o) => o.id),
  };
}

// ---- 내 조건 적합도 별점 (1~5) ----
// "당첨 가능성"이 아니다. 자격 판정 + 관심 지역·면적·가격이 공고와 맞는 정도를 별로 표시한다.
// 판정이 '불충족'이면 별을 숨긴다 (null).
export interface Fit {
  stars: number;
  reasons: string[];
}

export function fitStars(n: Notice, p: Profile, verdict: Verdict): Fit | null {
  if (verdict === 'no') return null;
  const reasons: string[] = [verdict === 'likely' ? '자격 조건 충족' : '자격 추가 확인 필요'];
  let set = 0;
  let hit = 0;
  if (p.preferredRegions.length) {
    set++;
    const ok = !!n.region && p.preferredRegions.includes(n.region);
    if (ok) hit++;
    reasons.push(ok ? '관심 지역' : '관심 지역 아님');
  }
  const ab = AREA_BUCKETS.find((b) => b.key === p.preferredArea && b.key);
  if (ab && n.models?.some((m) => m.area)) {
    set++;
    const ok = matchArea(n, ab);
    if (ok) hit++;
    reasons.push(ok ? `면적 ${ab.label}` : `면적 ${ab.label} 없음`);
  }
  const pb = PRICE_BUCKETS.find((b) => b.key === p.preferredPrice && b.key);
  if (pb && n.models?.some((m) => m.priceMax)) {
    set++;
    const ok = matchPrice(n, pb);
    if (ok) hit++;
    reasons.push(ok ? `가격 ${pb.label}` : `가격 ${pb.label} 없음`);
  }
  const elig = verdict === 'likely' ? 1 : 0.5;
  const pref = set ? hit / set : 0.5; // 관심 조건을 안 정했으면 중간값
  if (!set) reasons.push('관심 지역·면적·가격을 정하면 더 정확해집니다');
  const stars = Math.max(1, Math.min(5, Math.round(1 + 2 * elig + 2 * pref)));
  return { stars, reasons };
}
