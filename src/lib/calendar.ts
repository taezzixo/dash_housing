import type { Notice } from '../types.ts';
import { receiptStatus, receiptWindow, type ReceiptStatus } from './filters.ts';

// ---- F2·F8 월 캘린더 ----
// 기본: 청약 접수 기간을 막대로. 당첨자 발표·계약은 관심 공고만 점으로.

export interface CalBar {
  noticeId: string;
  name: string;
  status: ReceiptStatus;
  start: string; // 이번 주 안에서 잘린 시작
  end: string;
  col: number; // 0(일)~6(토)
  span: number; // 칸 수
  lane: number; // 같은 주 안의 줄 번호
  contStart: boolean; // 지난 주에서 이어짐
  contEnd: boolean; // 다음 주로 이어짐
  saved: boolean;
}
export interface CalDot {
  noticeId: string;
  name: string;
  kind: '발표' | '계약';
  date: string;
}
export interface CalWeek {
  days: string[]; // 7일 (YYYY-MM-DD)
  bars: CalBar[];
  lanes: number;
}

export function addDays(d: string, n: number): string {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
function weekday(d: string): number {
  return new Date(d + 'T00:00:00Z').getUTCDay();
}

/** ym = 'YYYY-MM'. 일요일 시작 주 단위 격자 */
export function monthGrid(ym: string): string[][] {
  const first = `${ym}-01`;
  const start = addDays(first, -weekday(first));
  const weeks: string[][] = [];
  let d = start;
  do {
    const w: string[] = [];
    for (let i = 0; i < 7; i++) {
      w.push(d);
      d = addDays(d, 1);
    }
    weeks.push(w);
  } while (d.slice(0, 7) === ym);
  return weeks;
}

export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 7);
}

export function buildMonth(ym: string, notices: Notice[], savedIds: Set<string>, today: string): { weeks: CalWeek[]; dots: Map<string, CalDot[]> } {
  const grid = monthGrid(ym);
  const first = grid[0][0];
  const last = grid[grid.length - 1][6];
  const spans = notices
    .map((n) => ({ n, w: receiptWindow(n) }))
    .filter((x): x is { n: Notice; w: { start: string; end?: string } } => !!x.w.start)
    .map(({ n, w }) => ({ n, start: w.start, end: w.end && w.end >= w.start ? w.end : w.start }))
    .filter((x) => x.end >= first && x.start <= last)
    // 관심 공고 먼저, 그다음 시작일·긴 기간 순 (위 줄을 차지)
    .sort((a, b) => Number(savedIds.has(b.n.id)) - Number(savedIds.has(a.n.id)) || a.start.localeCompare(b.start) || b.end.localeCompare(a.end));

  const weeks: CalWeek[] = grid.map((days) => {
    const ws = days[0];
    const we = days[6];
    const lanesEnd: string[] = []; // 줄마다 마지막으로 차지한 날짜
    const bars: CalBar[] = [];
    for (const s of spans) {
      if (s.end < ws || s.start > we) continue;
      const a = s.start < ws ? ws : s.start;
      const b = s.end > we ? we : s.end;
      let lane = lanesEnd.findIndex((e) => e < a);
      if (lane === -1) lane = lanesEnd.push(b) - 1;
      else lanesEnd[lane] = b;
      const col = days.indexOf(a);
      bars.push({
        noticeId: s.n.id, name: s.n.name, status: receiptStatus(s.n, today),
        start: a, end: b, col, span: days.indexOf(b) - col + 1, lane,
        contStart: s.start < ws, contEnd: s.end > we, saved: savedIds.has(s.n.id),
      });
    }
    return { days, bars, lanes: lanesEnd.length };
  });

  const dots = new Map<string, CalDot[]>();
  const push = (dot: CalDot) => dots.set(dot.date, [...(dots.get(dot.date) ?? []), dot]);
  for (const n of notices) {
    if (!savedIds.has(n.id)) continue;
    if (n.dates.winner) push({ noticeId: n.id, name: n.name, kind: '발표', date: n.dates.winner });
    if (n.dates.contractStart) push({ noticeId: n.id, name: n.name, kind: '계약', date: n.dates.contractStart });
  }
  return { weeks, dots };
}
