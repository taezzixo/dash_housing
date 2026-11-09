#!/usr/bin/env node
// 청약 공고 수집 → 정규화 → 좌표 변환 → public/data/notices.json
// 실행: DATA_GO_KR_KEY=... KAKAO_REST_KEY=... node scripts/fetch-notices.mjs
// GitHub Actions에서 매일 실행됨 (.github/workflows/deploy.yml)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { geoCandidates } from './lib/geo.mjs';
import { trackChanges } from './lib/track.mjs';

const KEY = process.env.DATA_GO_KR_KEY;
const KAKAO = process.env.KAKAO_REST_KEY;
const DAYS_BACK = Number(process.env.DAYS_BACK ?? 60);
const OUT = 'public/data/notices.json';
const GEO_CACHE = 'data/geocache.json';

if (!KEY) {
  console.error('DATA_GO_KR_KEY 가 없습니다. 공공데이터포털 인증키를 환경변수로 넣어주세요.');
  process.exit(1);
}
// 포털 "Encoding" 키(이미 %인코딩)와 "Decoding" 키 모두 허용
const serviceKey = KEY.includes('%') ? KEY : encodeURIComponent(KEY);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ymd = (d) => d.toISOString().slice(0, 10);
const today = new Date(Date.now() + 9 * 3600e3);
const since = new Date(today.getTime() - DAYS_BACK * 86400e3);

async function getJson(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      return JSON.parse(text);
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(1000 * i);
    }
  }
}

// ---------- 청약홈 (한국부동산원) ----------
const ODC = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1';
const APPLYHOME = [
  { cat: 'APT', detail: 'getAPTLttotPblancDetail', model: 'getAPTLttotPblancMdl' },
  { cat: 'OFFICETEL', detail: 'getUrbtyOfctlLttotPblancDetail', model: 'getUrbtyOfctlLttotPblancMdl' },
  { cat: 'REMNDR', detail: 'getRemndrLttotPblancDetail', model: 'getRemndrLttotPblancMdl' },
  // 아래 두 API는 모집공고일이 YYYYMMDD 형식이라 조건값도 같은 형식으로 보내야 한다
  { cat: 'PBL_PVT_RENT', detail: 'getPblPvtRentLttotPblancDetail', model: 'getPblPvtRentLttotPblancMdl', compactDate: true },
  { cat: 'OPT', detail: 'getOPTLttotPblancDetail', model: 'getOPTLttotPblancMdl', compactDate: true },
];

async function odcAll(op, conds = {}) {
  const rows = [];
  for (let page = 1; page < 50; page++) {
    const q = new URLSearchParams({ page: String(page), perPage: '100', returnType: 'JSON' });
    for (const [k, v] of Object.entries(conds)) q.set(k, v);
    const j = await getJson(`${ODC}/${op}?${q}&serviceKey=${serviceKey}`);
    rows.push(...(j.data ?? []));
    if (!j.data?.length || rows.length >= (j.matchCount ?? j.totalCount ?? 0)) break;
  }
  return rows;
}

const d = (s) => {
  if (!s) return undefined;
  const t = String(s).replace(/[^0-9]/g, '');
  return t.length >= 8 ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : undefined;
};
const num = (s) => (s === undefined || s === null || s === '' ? undefined : Number(String(s).replace(/,/g, '')) || undefined);
const yn = (s) => s === 'Y';

function normApplyhome(cat, r) {
  const subType =
    cat === 'APT' ? (r.HOUSE_DTL_SECD === '03' ? '국민' : '민영')
      : r.HOUSE_DTL_SECD_NM || r.HOUSE_SECD_NM || undefined;
  return {
    id: `ah-${r.HOUSE_MANAGE_NO}-${r.PBLANC_NO}`,
    source: 'applyhome',
    category: cat,
    subType,
    name: r.HOUSE_NM,
    address: r.HSSPLY_ADRES,
    region: normRegion(r.SUBSCRPT_AREA_CODE_NM),
    totalUnits: num(r.TOT_SUPLY_HSHLDCO),
    dates: {
      announce: d(r.RCRIT_PBLANC_DE),
      specialStart: d(r.SPSPLY_RCEPT_BGNDE),
      specialEnd: d(r.SPSPLY_RCEPT_ENDDE),
      rank1Start: d(r.GNRL_RNK1_CRSPAREA_RCPTDE),
      rank1End: d(r.GNRL_RNK1_ETC_AREA_ENDDE || r.GNRL_RNK1_CRSPAREA_ENDDE),
      rank2Start: d(r.GNRL_RNK2_CRSPAREA_RCPTDE),
      rank2End: d(r.GNRL_RNK2_ETC_AREA_ENDDE || r.GNRL_RNK2_CRSPAREA_ENDDE),
      receiptStart: d(r.RCEPT_BGNDE || r.SUBSCRPT_RCEPT_BGNDE || r.GNRL_RCEPT_BGNDE),
      receiptEnd: d(r.RCEPT_ENDDE || r.SUBSCRPT_RCEPT_ENDDE || r.GNRL_RCEPT_ENDDE),
      winner: d(r.PRZWNER_PRESNATN_DE),
      contractStart: d(r.CNTRCT_CNCLS_BGNDE),
      contractEnd: d(r.CNTRCT_CNCLS_ENDDE),
    },
    flags: {
      speculative: yn(r.SPECLT_RDN_EARTH_AT),
      adjusted: yn(r.MDAT_TRGET_AREA_SECD),
      priceCap: yn(r.PARCPRC_ULS_AT),
      publicHouseZone: yn(r.PUBLIC_HOUSE_EARTH_AT),
    },
    url: r.PBLANC_URL,
    homepage: r.HMPG_ADRES,
    phone: r.MDHS_TELNO,
    builder: r.CNSTRCT_ENTRPS_NM,
    developer: r.BSNS_MBY_NM,
    moveIn: r.MVN_PREARNGE_YM,
    _key: { HOUSE_MANAGE_NO: r.HOUSE_MANAGE_NO, PBLANC_NO: r.PBLANC_NO },
  };
}

function normModel(m) {
  const sb = {
    multiChild: num(m.MNYCH_HSHLDCO),
    newlywed: num(m.NWWDS_HSHLDCO ?? m.SPSPLY_NEW_MRRG_HSHLDCO),
    firstLife: num(m.LFE_FRST_HSHLDCO),
    oldParents: num(m.OLD_PARNTS_SUPORT_HSHLDCO ?? m.SPSPLY_AGED_HSHLDCO),
    institution: num(m.INSTT_RECOMEND_HSHLDCO),
    youth: num(m.YGMN_HSHLDCO ?? m.SPSPLY_YGMN_HSHLDCO),
    newborn: num(m.NWBB_HSHLDCO),
    etc: num(m.ETC_HSHLDCO),
  };
  for (const k of Object.keys(sb)) if (sb[k] === undefined) delete sb[k];
  const type = m.HOUSE_TY ?? [m.GP, m.TP].filter(Boolean).join(' ');
  const area = num(m.SUPLY_AR ?? m.EXCLUSE_AR) ?? num(String(m.HOUSE_TY ?? '').match(/^\d+(\.\d+)?/)?.[0]);
  return {
    type,
    area,
    general: num(m.SUPLY_HSHLDCO ?? m.GNSPLY_HSHLDCO),
    special: num(m.SPSPLY_HSHLDCO),
    specialBreakdown: Object.keys(sb).length ? sb : undefined,
    priceMax: num(m.LTTOT_TOP_AMOUNT ?? m.SUPLY_AMOUNT),
  };
}

async function fetchApplyhome() {
  const out = [];
  for (const api of APPLYHOME) {
    const from = api.compactDate ? ymd(since).replaceAll('-', '') : ymd(since);
    const rows = await odcAll(api.detail, { 'cond[RCRIT_PBLANC_DE::GTE]': from });
    let kept = 0;
    for (const r of rows) {
      const n = normApplyhome(api.cat, r);
      if ((n.dates.announce ?? '9999') < ymd(since)) continue; // 형식 차이 대비 이중 확인
      kept++;
      try {
        const ms = await odcAll(api.model, {
          'cond[HOUSE_MANAGE_NO::EQ]': n._key.HOUSE_MANAGE_NO,
          'cond[PBLANC_NO::EQ]': n._key.PBLANC_NO,
        });
        n.models = ms.map(normModel);
      } catch (e) {
        console.warn(`  주택형 조회 실패 ${n.name}: ${e.message}`);
      }
      delete n._key;
      out.push(n);
      await sleep(80);
    }
    console.log(`청약홈 ${api.cat}: ${kept}건`);
  }
  return out;
}

// ---------- LH 분양임대공고문 ----------
async function fetchLH() {
  const fmt = (x) => ymd(x).replaceAll('-', '.');
  const end = new Date(today.getTime() + 120 * 86400e3);
  const out = [];
  let seen = 0;
  for (let page = 1; page < 30; page++) {
    const q = new URLSearchParams({ PG_SZ: '100', PAGE: String(page), PAN_NT_ST_DT: fmt(since), CLSG_DT: fmt(end) });
    const j = await getJson(`https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1?serviceKey=${serviceKey}&${q}`);
    // 응답: [ {dsSch:[...]}, {resHeader:[...], dsList:[...]} ]
    const list = (Array.isArray(j) ? j : [j]).flatMap((b) => b.dsList ?? []);
    for (const r of list) {
      // 주택만: 05 분양주택, 06 임대주택, 13 주거복지(매입임대 등), 39 공공분양(신혼희망). 토지(01)·상가(22)·어린이집(40) 제외
      if (!LH_HOUSING.has(r.UPP_AIS_TP_CD) || r.AIS_TP_CD === '40') continue;
      out.push({
        id: `lh-${r.PAN_ID ?? r.DTL_URL?.match(/PAN_ID:(\d+)/)?.[1] ?? r.PAN_NM}`,
        source: 'lh',
        category: 'LH',
        subType: r.AIS_TP_CD_NM || r.UPP_AIS_TP_NM,
        name: r.PAN_NM,
        region: normRegion(r.CNP_CD_NM),
        status: r.PAN_SS,
        dates: { announce: d(r.PAN_NT_ST_DT), receiptEnd: d(r.CLSG_DT) },
        url: r.DTL_URL,
        // 공급정보·상세정보 API 호출용 키 (연동 대기)
        lhKey: { PAN_ID: r.PAN_ID, SPL_INF_TP_CD: r.SPL_INF_TP_CD, CCR_CNNT_SYS_DS_CD: r.CCR_CNNT_SYS_DS_CD, UPP_AIS_TP_CD: r.UPP_AIS_TP_CD, AIS_TP_CD: r.AIS_TP_CD },
      });
    }
    seen += list.length;
    const all = Number(list[0]?.ALL_CNT ?? 0);
    if (!list.length || seen >= all) break;
  }
  console.log(`LH: ${out.length}건`);
  return out;
}

const LH_HOUSING = new Set(['05', '06', '13', '39']);

// ---------- 지역명 정규화 ----------
const REGION_MAP = {
  서울특별시: '서울', 경기도: '경기', 인천광역시: '인천', 부산광역시: '부산', 대구광역시: '대구', 광주광역시: '광주',
  대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종', 강원도: '강원', 강원특별자치도: '강원',
  충청북도: '충북', 충청남도: '충남', 전라북도: '전북', 전북특별자치도: '전북', 전라남도: '전남',
  경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주',
};
function normRegion(s) {
  if (!s) return undefined;
  const t = String(s).trim();
  return REGION_MAP[t] ?? t;
}

// 지역 중심 좌표 (주소 없는 LH 공고용)
const REGION_CENTER = {
  서울: [37.5665, 126.978], 경기: [37.2752, 127.0095], 인천: [37.4563, 126.7052], 부산: [35.1796, 129.0756],
  대구: [35.8714, 128.6014], 광주: [35.1595, 126.8526], 대전: [36.3504, 127.3845], 울산: [35.5384, 129.3114],
  세종: [36.48, 127.289], 강원: [37.8228, 128.1555], 충북: [36.6357, 127.4917], 충남: [36.6588, 126.6728],
  전북: [35.8203, 127.1088], 전남: [34.8161, 126.4629], 경북: [36.576, 128.5056], 경남: [35.2383, 128.6925],
  제주: [33.4996, 126.5312],
};

// ---------- 카카오 지오코딩 (캐시) ----------
async function geocode(notices) {
  const cache = existsSync(GEO_CACHE) ? JSON.parse(await readFile(GEO_CACHE, 'utf8')) : {};
  let calls = 0;
  const stat = { address: 0, district: 0, region: 0, none: 0 };
  for (const n of notices) {
    let hit = null;
    for (const c of geoCandidates(n.address)) {
      if (!(c.q in cache) && KAKAO) {
        cache[c.q] = await kakaoLookup(c.q);
        calls++;
        await sleep(60);
      }
      const r = cache[c.q];
      if (r) {
        // 카카오가 동/리 단위(REGION)로만 찾았으면 근사 위치
        hit = { lat: r[0], lng: r[1], precision: c.precision === 'district' || r[2] === 'REGION' ? 'district' : 'address' };
        break;
      }
    }
    if (!hit) {
      const c = REGION_CENTER[n.region];
      if (c) {
        // 같은 지역 마커가 겹치지 않도록 약간 흩뿌림 (id 기반 결정적)
        const h = [...n.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
        hit = { lat: c[0] + ((h % 1000) / 1000 - 0.5) * 0.08, lng: c[1] + (((h >> 10) % 1000) / 1000 - 0.5) * 0.08, precision: 'region' };
      }
    }
    if (hit) {
      n.lat = hit.lat;
      n.lng = hit.lng;
      n.geoPrecision = hit.precision;
      stat[hit.precision]++;
    } else stat.none++;
  }
  await mkdir('data', { recursive: true });
  await writeFile(GEO_CACHE, JSON.stringify(cache));
  console.log(`지오코딩: 신규 조회 ${calls}건, 결과 ${JSON.stringify(stat)}${KAKAO ? '' : ' (KAKAO_REST_KEY 없음)'}`);
}

async function kakaoLookup(q) {
  const h = { Authorization: `KakaoAK ${KAKAO}` };
  try {
    let r = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q)}&size=1`, { headers: h });
    let j = await r.json();
    let doc = j.documents?.[0];
    if (doc) return [Number(doc.y), Number(doc.x), doc.address_type];
    r = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=1`, { headers: h });
    j = await r.json();
    doc = j.documents?.[0];
    return doc ? [Number(doc.y), Number(doc.x), 'KEYWORD'] : null;
  } catch {
    return undefined; // 네트워크 오류는 캐시하지 않음
  }
}

// ---------- main ----------
const sources = [];
const okSources = new Set();
let notices = [];
try {
  notices.push(...(await fetchApplyhome()));
  sources.push('청약홈(한국부동산원) 분양정보 조회 서비스');
  okSources.add('applyhome');
} catch (e) {
  console.error('청약홈 수집 실패:', e.message);
}
try {
  notices.push(...(await fetchLH()));
  sources.push('LH 분양임대공고문 조회 서비스');
  okSources.add('lh');
} catch (e) {
  console.error('LH 수집 실패:', e.message);
}
if (!notices.length) {
  console.error('수집된 공고가 없습니다. 기존 데이터를 유지합니다.');
  process.exit(1);
}
// 중복 제거
notices = [...new Map(notices.map((n) => [n.id, n])).values()];
await geocode(notices);

// 정정·취소 추적: 직전 데이터와 비교 (샘플 데이터는 비교하지 않음)
let prev = [];
if (existsSync(OUT)) {
  try {
    const old = JSON.parse(await readFile(OUT, 'utf8'));
    if (!old.sample) prev = old.notices ?? [];
  } catch {
    /* 첫 수집 */
  }
}
notices = trackChanges(prev, notices, ymd(today), okSources);
const changed = notices.filter((n) => n.changes?.some((c) => c.at === ymd(today))).length;
const removed = notices.filter((n) => n.removedAt === ymd(today)).length;
console.log(`변경 감지: 일정 변경 ${changed}건, 사라진 공고 ${removed}건`);
notices.sort((a, b) => (b.dates.announce ?? '').localeCompare(a.dates.announce ?? ''));
await mkdir('public/data', { recursive: true });
await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), sample: false, sources, notices }));
console.log(`저장: ${OUT} (${notices.length}건)`);
