import type { Notice } from '../types.ts';

// 공고의 주요 일정을 이벤트 목록으로 펼침 (캘린더 표시 + .ics 내보내기 공용)
export interface ScheduleEvent {
  noticeId: string;
  title: string;
  kind: string;
  start: string; // YYYY-MM-DD
  end?: string;
}

const KINDS: [keyof Notice['dates'], keyof Notice['dates'] | null, string][] = [
  ['announce', null, '모집공고'],
  ['specialStart', 'specialEnd', '특별공급 접수'],
  ['rank1Start', 'rank1End', '1순위 접수'],
  ['rank2Start', 'rank2End', '2순위 접수'],
  ['receiptStart', 'receiptEnd', '청약 접수'],
  ['winner', null, '당첨자 발표'],
  ['contractStart', 'contractEnd', '계약'],
];

export function eventsOf(n: Notice): ScheduleEvent[] {
  const out: ScheduleEvent[] = [];
  for (const [s, e, kind] of KINDS) {
    const start = n.dates[s];
    if (!start) continue;
    out.push({ noticeId: n.id, title: `[${kind}] ${n.name}`, kind, start, end: e ? n.dates[e] : undefined });
  }
  // 공고 본문에서 추출한 기타 일정 (서류 제출 마감 등)
  for (const x of n.extraSchedule ?? []) {
    const start = x.start ?? x.end;
    if (start) out.push({ noticeId: n.id, title: `[${x.label}] ${n.name}`, kind: x.label, start, end: x.start ? x.end : undefined });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

// 다음 일정 (오늘 이후 가장 가까운 것)
export function nextEvent(n: Notice, today: string): ScheduleEvent | undefined {
  return eventsOf(n)
    .filter((e) => (e.end ?? e.start) >= today)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
}

export function dday(date: string, today: string): number {
  const a = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
  const b = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  return Math.round((a - b) / 86400000);
}

export function todayKST(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// iCalendar(.ics) — 폰 캘린더에 가져오면 일정 전날 오전 9시 알림
function icsDate(d: string) {
  return d.replaceAll('-', '');
}
function addDay(d: string, n = 1) {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
function esc(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function buildIcs(notices: Notice[], siteUrl: string): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//dash_housing//청약 일정//KO', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:내 청약 일정'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  for (const n of notices) {
    for (const e of eventsOf(n)) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${n.id}-${e.kind}@dash_housing`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(e.start)}`,
        `DTEND;VALUE=DATE:${icsDate(addDay(e.end ?? e.start))}`,
        `SUMMARY:${esc(e.title)}`,
        `DESCRIPTION:${esc(`${n.address ?? ''}\n공고: ${n.url ?? siteUrl}`)}`,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${esc(e.title)}`,
        'TRIGGER:-PT15H', // 전날 09:00
        'END:VALARM',
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
