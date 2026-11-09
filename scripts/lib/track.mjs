// 정정·취소 추적 (D5): 직전 수집 결과와 비교해 일정 변경 이력과 사라진 공고를 기록한다.

const DATE_FIELDS = [
  'announce', 'specialStart', 'specialEnd', 'rank1Start', 'rank1End', 'rank2Start', 'rank2End',
  'receiptStart', 'receiptEnd', 'winner', 'contractStart', 'contractEnd',
];
const KEEP_REMOVED_DAYS = 14;

export function lastDate(n) {
  const d = n.dates ?? {};
  return [d.contractEnd, d.contractStart, d.winner, d.receiptEnd, d.rank2End, d.rank1End, d.specialEnd, d.announce]
    .filter(Boolean)
    .sort()
    .pop();
}

function addDays(ymd, days) {
  const t = new Date(ymd + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/**
 * @param {object[]} prev 직전 notices
 * @param {object[]} next 이번 수집 notices
 * @param {string} today YYYY-MM-DD (KST)
 * @param {Set<string>} [okSources] 이번에 수집에 성공한 source (실패한 출처의 공고는 "사라짐"으로 보지 않음)
 */
export function trackChanges(prev, next, today, okSources) {
  const old = new Map(prev.map((n) => [n.id, n]));
  const seen = new Set();
  for (const n of next) {
    seen.add(n.id);
    const o = old.get(n.id);
    n.firstSeen = o?.firstSeen ?? today;
    n.changes = [...(o?.changes ?? [])];
    if (o) {
      for (const f of DATE_FIELDS) {
        const a = o.dates?.[f];
        const b = n.dates?.[f];
        if (a && a !== b) n.changes.push({ at: today, field: f, from: a, to: b });
      }
    }
    if (/정정/.test(n.name ?? '') || /정정/.test(n.status ?? '')) n.corrected = true;
    if (!n.changes.length) delete n.changes;
  }
  // 출처에서 사라진 공고: 아직 일정이 남아 있으면 "취소·삭제 의심"으로 14일간 유지
  const kept = [];
  for (const o of prev) {
    if (seen.has(o.id)) continue;
    if (okSources && !okSources.has(o.source)) {
      kept.push(o); // 이번에 그 출처 수집이 실패 → 그대로 유지
      continue;
    }
    const last = lastDate(o);
    if (!last || last < today) continue; // 끝난 공고는 정상 종료
    const removedAt = o.removedAt ?? today;
    if (addDays(removedAt, KEEP_REMOVED_DAYS) < today) continue;
    kept.push({ ...o, removedAt });
  }
  return [...next, ...kept];
}
