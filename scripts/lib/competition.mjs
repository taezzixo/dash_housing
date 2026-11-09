// 청약 경쟁률·당첨가점 (C4) — 한국부동산원_청약홈 청약접수 경쟁률 및 특별공급 신청현황 조회 서비스
// 접수가 끝난 APT 공고만 조회한다 (진행 전 공고는 결과가 없음).

const CMP = 'https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1';

export function needsCompetition(n, today) {
  if (n.source !== 'applyhome' || n.category !== 'APT') return false;
  const end = n.dates?.rank1End ?? n.dates?.receiptEnd;
  return !!end && end < today;
}

/** 경쟁률 원본 → 주택형별 1순위 요약 */
export function summarizeCompetition(rows) {
  const byType = new Map();
  for (const r of rows) {
    if (Number(r.SUBSCRPT_RANK_CODE) !== 1) continue;
    const t = String(r.HOUSE_TY ?? '').trim();
    const cur = byType.get(t) ?? { type: t, supply: Number(r.SUPLY_HSHLDCO) || undefined, local: undefined, other: undefined };
    const rate = parseRate(r.CMPET_RATE);
    const req = Number(String(r.REQ_CNT ?? '').replace(/,/g, '')) || 0;
    if (r.RESIDE_SECD === '01') cur.local = { req, rate };
    else cur.other = { req: (cur.other?.req ?? 0) + req, rate: cur.other?.rate ?? rate };
    byType.set(t, cur);
  }
  return [...byType.values()];
}

/** 당첨가점 원본 → 주택형·거주지역별 */
export function summarizeScores(rows) {
  return rows
    .map((r) => ({
      type: String(r.HOUSE_TY ?? '').trim(),
      reside: r.RESIDE_SENM,
      min: Number(r.LWET_SCORE) || undefined,
      max: Number(r.TOP_SCORE) || undefined,
      avg: Number(r.AVRG_SCORE) || undefined,
    }))
    .filter((s) => s.min !== undefined || s.avg !== undefined);
}

function parseRate(v) {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  if (/^\(?△/.test(s)) return -Number(s.replace(/[^\d.]/g, '')); // 미달 표기
  const n = Number(s.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export async function fetchCompetition(n, getAll) {
  const key = n.id.replace(/^ah-/, '').split('-');
  const cond = { 'cond[HOUSE_MANAGE_NO::EQ]': key[0], 'cond[PBLANC_NO::EQ]': key[1] };
  const [cmp, score] = await Promise.all([
    getAll(`${CMP}/getAPTLttotPblancCmpet`, cond),
    getAll(`${CMP}/getAptLttotPblancScore`, cond),
  ]);
  return { competition: summarizeCompetition(cmp), scores: summarizeScores(score) };
}
