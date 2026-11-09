// 정정·취소 추적 (D5): 직전 수집 결과와 비교해 일정 변경 이력과 사라진 공고를 기록한다.

const DATE_FIELDS = [
  'announce', 'specialStart', 'specialEnd', 'rank1Start', 'rank1End', 'rank2Start', 'rank2End',
  'receiptStart', 'receiptEnd', 'winner', 'contractStart', 'contractEnd',
];
const KEEP_REMOVED_DAYS = 14;

export function lastDate(n) {
  const d = n.dates ?? {};
  const ends = [d.contractEnd, d.contractStart, d.winner, d.receiptEnd, d.rank2End, d.rank1End, d.specialEnd].filter(Boolean).sort();
  if (ends.length) return ends.pop();
  // 마감일이 없는 공고 (청년안심주택 등): 신청 시작 후 14일, 일정이 전혀 없으면 공고 후 60일까지 진행 중으로 본다
  const start = [d.receiptStart, d.specialStart, d.rank1Start].filter(Boolean).sort()[0];
  if (start) return addDays(start, 14);
  return d.announce ? addDays(d.announce, 60) : undefined;
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
 * @param {string} [sinceYmd] 이번 수집 기간의 시작일. 이보다 먼저 공고된 건은 수집 기간 밖이라 "사라짐"으로 보지 않고 유지
 */
export function trackChanges(prev, next, today, okSources, sinceYmd) {
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
    if (o.manual) continue; // 수동 등록은 overrides.json에서 관리
    if (sinceYmd && o.dates?.announce && o.dates.announce < sinceYmd) {
      kept.push(o); // 수집 기간 밖으로 밀려난 진행 중 공고 → 취소 아님, 그대로 유지
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

const ARCHIVE_DAYS = 365;

/**
 * 끝난 공고(접수·발표·계약 모두 지남)를 보관 파일로 옮긴다.
 * @returns {{ current: object[], archive: object[] }}
 */
export function splitArchive(notices, prevArchive, today) {
  const current = [];
  const finished = [];
  for (const n of notices) {
    const last = lastDate(n);
    (last && last < today ? finished : current).push(n);
  }
  const cutoff = addDays(today, -ARCHIVE_DAYS);
  const byId = new Map(prevArchive.map((n) => [n.id, n]));
  for (const n of finished) byId.set(n.id, { ...byId.get(n.id), ...n });
  // 다시 진행 중이 된 공고는 보관에서 뺀다
  for (const n of current) byId.delete(n.id);
  const archive = [...byId.values()]
    .filter((n) => (n.dates?.announce ?? lastDate(n) ?? '') >= cutoff)
    .sort((a, b) => (b.dates?.announce ?? '').localeCompare(a.dates?.announce ?? ''));
  return { current, archive };
}
