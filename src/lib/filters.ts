import type { Notice } from '../types.ts';

// 접수 상태 (D1)
export type ReceiptStatus = 'upcoming' | 'open' | 'closed' | 'unknown';
export const RECEIPT_LABEL: Record<ReceiptStatus, string> = {
  upcoming: '접수예정',
  open: '접수중',
  closed: '접수마감',
  unknown: '일정확인',
};

export function receiptWindow(n: Notice): { start?: string; end?: string } {
  const d = n.dates;
  const starts = [d.specialStart, d.rank1Start, d.receiptStart, d.rank2Start].filter(Boolean) as string[];
  const ends = [d.receiptEnd, d.rank2End, d.rank1End, d.specialEnd].filter(Boolean) as string[];
  return { start: starts.sort()[0], end: ends.sort().pop() };
}

export function receiptStatus(n: Notice, today: string): ReceiptStatus {
  if (n.status) {
    if (/접수중/.test(n.status)) return 'open';
    if (/마감|완료/.test(n.status)) return 'closed';
  }
  const { start, end } = receiptWindow(n);
  if (!start && !end) return 'unknown';
  if (start && today < start) return 'upcoming';
  if (end && today > end) return 'closed';
  if (!start && end) return today <= end ? 'open' : 'closed';
  if (start && !end) return today === start ? 'open' : 'unknown'; // 마감일 미제공 (청년안심주택 등)
  return 'open';
}

type Bucket = { key: string; label: string; min?: number; max?: number };

// 면적 구간 (전용·공급 면적 중 주택형 값, ㎡)
export const AREA_BUCKETS: Bucket[] = [
  { key: '', label: '전체 면적' },
  { key: 'lt60', label: '60㎡ 이하', min: 0, max: 60 },
  { key: '60to85', label: '60~85㎡', min: 60, max: 85 },
  { key: 'gt85', label: '85㎡ 초과', min: 85, max: Infinity },
];

// 가격 구간 (분양최고금액, 만원)
export const PRICE_BUCKETS: Bucket[] = [
  { key: '', label: '전체 가격' },
  { key: 'lt3', label: '3억 이하', min: 0, max: 30000 },
  { key: '3to6', label: '3~6억', min: 30000, max: 60000 },
  { key: '6to9', label: '6~9억', min: 60000, max: 90000 },
  { key: 'gt9', label: '9억 초과', min: 90000, max: Infinity },
];

/** 주택형 중 하나라도 구간에 들면 통과. 주택형 정보가 없는 공고(LH 등)는 필터 적용 시 제외 */
export function matchArea(n: Notice, b: Bucket): boolean {
  if (b.min === undefined) return true;
  return (n.models ?? []).some((m) => m.area !== undefined && m.area > b.min! && m.area <= b.max!) ||
    (b.min === 0 && (n.models ?? []).some((m) => m.area === 0));
}

export function matchPrice(n: Notice, b: Bucket): boolean {
  if (b.min === undefined) return true;
  return (n.models ?? []).some((m) => !!m.priceMax && m.priceMax > b.min! && m.priceMax <= b.max!);
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function inBounds(n: Notice, b: Bounds): boolean {
  return n.lat !== undefined && n.lng !== undefined && n.lat >= b.south && n.lat <= b.north && n.lng >= b.west && n.lng <= b.east;
}

/** 최근 14일 안에 일정 변경이 감지된 공고 */
export function recentlyChanged(n: Notice, today: string, days = 14): boolean {
  if (!n.changes?.length) return false;
  const t = new Date(today + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() - days);
  const from = t.toISOString().slice(0, 10);
  return n.changes.some((c) => c.at >= from);
}
