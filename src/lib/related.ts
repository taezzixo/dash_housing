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
