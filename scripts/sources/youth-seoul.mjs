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
