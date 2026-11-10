import type { Notice } from '../types.ts';

// 같은 단지의 다른 공고 찾기 (④ 추가모집·무순위·잔여세대 ↔ 최초 분양 연결)
// 공고명에서 회차·유형 수식어를 지워 단지 이름만 남긴 뒤 비교한다.
const NOISE = [
  /\[[^\]]*\]/g, // [정정공고], [민간임대] 등
  /\([^)]*\)/g, // (본청약), (A-6BL), (민영) 등 괄호 내용
  /(최초|추가|재|잔여|무순위|임의|취소\s*후\s*재)\s*(모집|공급|세대)?/g,
  /(입주자|예비입주자)?\s*모집\s*공고/g,
  /(분양|공급|모집)\s*공고/g,
  /공고/g,
  /(신혼희망타운|공공분양|민영|국민|본청약|사전청약|계약취소주택|일반매각)/g,
  /\d+차/g,
];

export function complexKey(name: string): string {
  let s = name;
  for (const re of NOISE) s = s.replace(re, ' ');
  return s.replace(/[^가-힣A-Za-z0-9]/g, '').toLowerCase();
}

/** 재공급 성격의 공고인가 (무순위·잔여세대·임의공급·추가모집) */
export function isReoffer(n: Notice): boolean {
  return n.category === 'REMNDR' || n.category === 'OPT' || /추가\s*모집|잔여|무순위|재공급|임의공급/.test(`${n.name} ${n.subType ?? ''}`);
}

export function findRelated(n: Notice, all: Notice[]): Notice[] {
  const k = complexKey(n.name);
  if (k.length < 3) return [];
  return all
    .filter((o) => o.id !== n.id && (!n.region || !o.region || o.region === n.region))
    .filter((o) => {
      const ok = complexKey(o.name);
      return ok.length >= 3 && (ok === k || (Math.min(ok.length, k.length) >= 5 && (ok.includes(k) || k.includes(ok))));
    })
    .sort((a, b) => (b.dates.announce ?? '').localeCompare(a.dates.announce ?? ''));
}

// ---- F9 목록 묶기: 단지당 1건 대표 + "+N건" ----
// 괄호 속 블록 번호(A-6BL, L2블록 등)는 complexKey가 지우므로, 다른 블록 단지가 합쳐지지 않게 따로 붙인다.
export function blockTag(name: string): string {
  const m = name.match(/([A-Z]{1,2})\s*-?\s*(\d+(?:-\d+)*)\s*(?:BL|블록|블럭)/i);
  return m ? `${m[1].toUpperCase()}${m[2]}` : '';
}

export function groupKey(n: Notice): string {
  const k = complexKey(n.name);
  if (k.length < 3) return `id:${n.id}`; // 이름이 너무 짧으면 묶지 않는다
  return `${n.region ?? ''}|${k}|${blockTag(n.name)}`;
}

export interface NoticeGroup {
  lead: Notice; // 대표 공고
  others: Notice[]; // 같은 단지의 나머지 공고
}

/**
 * 같은 단지 공고를 1건으로 묶는다. 대표는 접수 상태 우선순위(접수중 → 접수예정 → 일정확인 → 계약 대기 → 지난 공고),
 * 같으면 최근 공고. 목록 순서는 각 묶음에서 원래 목록에 가장 먼저 나온 공고의 자리를 따른다(정렬 유지).
 */
export function groupByComplex(list: Notice[], rank: (n: Notice) => number): NoticeGroup[] {
  const groups = new Map<string, Notice[]>();
  for (const n of list) {
    const k = groupKey(n);
    const g = groups.get(k);
    if (g) g.push(n);
    else groups.set(k, [n]);
  }
  return [...groups.values()].map((g) => {
    const sorted = [...g].sort((a, b) => rank(a) - rank(b) || (b.dates.announce ?? '').localeCompare(a.dates.announce ?? ''));
    return { lead: sorted[0], others: sorted.slice(1) };
  });
}

/** 같은 단지 다른 공고의 유형 라벨 (F9): 정정 / 무순위 / 임의공급 / 추가모집 / 최초분양·모집 */
export function relatedKind(n: Notice): string {
  const t = `${n.name} ${n.subType ?? ''}`;
  if (n.corrected || /정정/.test(t)) return '정정';
  if (n.category === 'OPT' || /임의\s*공급/.test(t)) return '임의공급';
  if (n.category === 'REMNDR' || /무순위|잔여|재공급/.test(t)) return '무순위';
  if (/추가\s*(모집|입주자)/.test(t)) return '추가모집';
  return /임대/.test(t) ? '최초모집' : '최초분양';
}
