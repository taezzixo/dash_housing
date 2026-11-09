// 서울시 청년안심주택 모집공고 (C6: API가 없는 공고 수집)
// 출처: 서울주거포털 청년안심주택 (soco.seoul.go.kr) 모집공고 게시판 목록 JSON
// 원칙: 하루 1회, 최근 공고만(최대 8페이지), 요청 간 1초 대기, 목록 메타데이터만 수집(본문·첨부 미수집), 원문 링크 제공

const BASE = 'https://soco.seoul.go.kr/youth';
const UA = 'dash_housing-collector/0.2 (+https://github.com/taezzixo/dash_housing)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchYouthSeoul(sinceYmd, maxPages = 8) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const body = new URLSearchParams({ bbsId: 'BMSR00015', pageIndex: String(page), searchAdresGu: '', searchCondition: '', searchKeyword: '', optn2: '', optn5: '' });
    const res = await fetch(`${BASE}/pgm/home/yohome/bbsListJson.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA, accept: 'application/json' },
      body,
    });
    if (!res.ok) throw new Error(`청년안심주택 HTTP ${res.status}`);
    const j = await res.json();
    const rows = j.resultList ?? [];
    let older = false;
    for (const r of rows) {
      const n = normYouth(r);
      if ((n.dates.announce ?? '') < sinceYmd) {
        older = true;
        continue;
      }
      out.push(n);
    }
    if (!rows.length || older) break;
    await sleep(1000);
  }
  return out;
}

export function normYouth(r) {
  const title = String(r.nttSj ?? '').trim();
  const kind = r.optn2 === '1' ? '공공' : r.optn2 === '2' ? '민간' : undefined;
  const round = r.optn5 === '1' ? '최초' : r.optn5 === '2' ? '추가' : undefined;
  return {
    id: `ys-${r.boardId}`,
    source: 'youth-seoul',
    category: 'YOUTH',
    subType: ['청년안심주택', kind, round].filter(Boolean).join(' · '),
    name: title,
    region: '서울',
    developer: r.optn3 || undefined,
    dates: { announce: ymd(r.optn1), receiptStart: ymd(r.optn4) },
    url: `${BASE}/bbs/BMSR00015/view.do?boardId=${r.boardId}&menuNo=400008`,
    geoKeyword: stationQuery(title),
  };
}

function ymd(s) {
  const t = String(s ?? '').replace(/[^0-9]/g, '');
  return t.length >= 8 ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : undefined;
}

// "[민간임대] 화랑대역 에이트플레이스 추가모집공고" → "서울 화랑대역"
export function stationQuery(title) {
  const t = title.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ');
  const st = t.match(/(\S+역)(?=\s|$)/);
  if (st) return `서울 ${st[1]}`;
  const name = t.replace(/(최초|추가)?\s*모집\s*공고.*$/, '').trim();
  return name ? `서울 ${name}` : undefined;
}

// ---------- 상세 페이지 파싱 (주소·전체 일정·문의처) ----------
// 상세 본문은 "■주택위치 : …", "■청약신청 : ‘26. 10. 16. (금) ~ 10. 19. (월)" 형태의 텍스트다.

export function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n');
}

/** "‘26. 10. 16. (금) ~ 10. 19. (월)" / "~‘26. 10. 21." / "2026.10.16" → { start, end } */
export function parseDateRange(s, fallbackYear) {
  const out = [];
  const re = /(?:[‘'’`]?\s*(\d{2}|\d{4})\s*[.\-/년]\s*)?(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*[.일]?/g;
  let year = fallbackYear;
  for (const m of String(s).matchAll(re)) {
    if (m[1]) year = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!year || mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    out.push(`${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    if (out.length === 2) break;
  }
  const onlyEnd = /^\s*~/.test(s);
  if (onlyEnd) return { end: out[0] };
  return { start: out[0], end: out[1] };
}

const FIELD = (text, labels) => {
  const m = text.match(new RegExp(`■\\s*(?:${labels})\\s*[:：]\\s*([^\\n■]+)`));
  return m ? m[1].trim() : undefined;
};

export function parseYouthDetail(html, announce) {
  const text = htmlToText(html);
  const year = announce ? Number(announce.slice(0, 4)) : undefined;
  const address = FIELD(text, '주택\\s*위치|위\\s*치|소재지|주\\s*소');
  const units = FIELD(text, '공급\\s*호수|공급\\s*세대|공급\\s*규모');
  const out = {
    address: address?.replace(/\s*\(.*$/, '').trim() || undefined,
    addressNote: address?.match(/\(([^)]*)\)/)?.[1],
    complexName: FIELD(text, '단지명'),
    developer: FIELD(text, '사업주체|사업자'),
    builder: FIELD(text, '시공사'),
    phone: FIELD(text, '문의\\s*전화|문의처|문의')?.match(/[\d-]{9,}/)?.[0],
    applyUrl: FIELD(text, '청약\\s*신청\\s*페이지|신청\\s*페이지|접수\\s*페이지')?.match(/https?:\/\/\S+/)?.[0],
    totalUnits: units ? Number(units.match(/금회[^\d]*(\d+)/)?.[1] ?? units.match(/(\d+)\s*(세대|호)/)?.[1]) || undefined : undefined,
    dates: {},
    extraSchedule: [],
  };
  // [공급일정] 구역의 ■항목 : 날짜 들
  const sched = text.slice(Math.max(0, text.search(/\[?\s*(공급|모집)\s*일정/)));
  for (const m of sched.matchAll(/■\s*([^:：■\n]{2,30}?)\s*[:：]\s*([^\n■]+)/g)) {
    const label = m[1].replace(/\s+/g, ' ').trim();
    const r = parseDateRange(m[2], year);
    if (!r.start && !r.end) continue;
    if (/모집\s*공고/.test(label)) out.dates.announce ??= r.start;
    else if (/청약\s*(신청|접수)|접수\s*기간|신청\s*기간/.test(label)) {
      out.dates.receiptStart ??= r.start;
      out.dates.receiptEnd ??= r.end ?? r.start;
    } else if (/(당첨|서류\s*심사\s*대상|대상자)\s*.*발표|발표/.test(label)) out.dates.winner ??= r.start ?? r.end;
    else if (/계약/.test(label)) {
      out.dates.contractStart ??= r.start ?? r.end;
      out.dates.contractEnd ??= r.end ?? r.start;
    } else out.extraSchedule.push({ label, start: r.start, end: r.end });
  }
  return out; // 발표·계약 외 일정(서류 제출 등)은 extraSchedule

}

/** 새로 올라온 공고만 상세를 받아 보강 (이전에 받은 것은 재사용) */
export async function enrichYouthDetails(notices, prevById, { delayMs = 1000 } = {}) {
  let fetched = 0;
  for (const n of notices) {
    if (n.source !== 'youth-seoul') continue;
    const prev = prevById.get(n.id);
    if (prev?.detailParsed) {
      Object.assign(n, pickDetail(prev));
      continue;
    }
    try {
      const res = await fetch(n.url, { headers: { 'user-agent': UA } });
      if (!res.ok) continue;
      const d = parseYouthDetail(await res.text(), n.dates.announce);
      Object.assign(n, mergeDetail(n, d));
      fetched++;
    } catch {
      /* 다음 실행 때 다시 시도 */
    }
    await sleep(delayMs);
  }
  return fetched;
}

function mergeDetail(n, d) {
  const dates = { ...n.dates };
  for (const [k, v] of Object.entries(d.dates)) if (v) dates[k] = v; // 상세 본문이 목록보다 정확
  return {
    address: d.address ?? n.address,
    addressNote: d.addressNote,
    complexName: d.complexName,
    developer: d.developer ?? n.developer,
    builder: d.builder,
    phone: d.phone,
    homepage: d.applyUrl,
    totalUnits: d.totalUnits,
    dates,
    extraSchedule: d.extraSchedule.length ? d.extraSchedule : undefined,
    detailParsed: true,
  };
}

function pickDetail(p) {
  const keys = ['address', 'addressNote', 'complexName', 'developer', 'builder', 'phone', 'homepage', 'totalUnits', 'dates', 'extraSchedule', 'detailParsed'];
  return Object.fromEntries(keys.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]));
}
