// 주소 → 좌표 변환용 검색어 후보 (정확한 것부터)
// 청약 공고 주소는 "OO지구 내 A-6블록", "(유성구 용계동 299-7번지 일원)" 같은 형태가 많아서
// 그대로는 주소 검색이 안 된다. 괄호 안 지번 → 정리한 전체 주소 → 시·군·구까지 순으로 시도한다.

const SIDO_RE = /^(서울특별시|서울|부산광역시|부산|대구광역시|대구|인천광역시|인천|광주광역시|광주|대전광역시|대전|울산광역시|울산|세종특별자치시|세종|경기도|경기|강원특별자치도|강원도|강원|충청북도|충북|충청남도|충남|전북특별자치도|전라북도|전북|전라남도|전남|경상북도|경북|경상남도|경남|제주특별자치도|제주)\s*/;

export function geoCandidates(raw) {
  if (!raw) return [];
  const addr = raw.replace(/\s+/g, ' ').trim();
  const sido = addr.match(SIDO_RE)?.[1] ?? '';
  const out = [];

  // 1) 괄호 안 지번 주소: "(유성구 용계동 299-7번지 일원)" → "대전광역시 유성구 용계동 299-7"
  for (const m of addr.matchAll(/\(([^)]*?(?:동|리|읍|면|로|길)\s*[\d-]+)[^)]*\)/g)) {
    const inner = m[1].replace(/번지.*$/, '').trim();
    out.push(inner.startsWith(sido) ? inner : `${sido} ${inner}`.trim());
  }

  // 2) 괄호·블록·지구 수식어를 지운 주소
  const cleaned = addr
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+(일원|일대|외\s*\d*\s*필지).*$/, '')
    .replace(/,.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  out.push(cleaned);

  // 3) "동/리/읍/면" 또는 "로/길 + 번지"까지만
  const upToDong = cleaned.match(/^(.*?(?:동|리|가)\s*[\d-]*)(?:\s|$)/);
  if (upToDong) out.push(upToDong[1].trim());

  // 4) 시·군·구까지 (district 정밀도)
  const district = cleaned.match(/^(\S+\s+\S+?(?:시|군|구))(?:\s+(\S*[^지\s]구)(?=\s|$))?/);
  if (district) out.push({ q: [district[1], district[2]].filter(Boolean).join(' '), precision: 'district' });

  // 중복 제거, 문자열은 address 정밀도
  const seen = new Set();
  return out
    .map((c) => (typeof c === 'string' ? { q: c, precision: 'address' } : c))
    .filter((c) => c.q && c.q.split(' ').length >= 2 && !seen.has(c.q) && seen.add(c.q));
}

// ---------- 단지명 키워드 검색 (카카오 장소 검색) ----------
// 분양 단지는 공사 중이어도 카카오에 "OO아파트 (2029년09월예정)" 같은 장소로 등록되는 경우가 많다.
// "시·군·구 + 단지명"으로 찾고, 이름이 실제로 겹치는 주거시설만 채택한다(견본주택·주차장 제외).

const GENERIC = /(추가|최초|재)?\s*모집\s*공고|입주자|예비입주자|모집|공고|무순위|잔여세대|임의공급|취소\s*후\s*재공급|신혼희망타운|공공분양|공공임대|국민임대|영구임대|행복주택|통합공공임대|매입임대|민간임대|공공지원|분양전환|본청약|사전청약|청약|민영|국민|\d+년|임대주택|주택|아파트|오피스텔|도시형생활주택|일반매각|단지|블록|블럭|지구|\bBL\b/g;

export function cleanName(name) {
  return String(name ?? '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\d{4}[.\-]\d{1,2}[.\-]\d{1,2}\.?/g, ' ')
    .replace(GENERIC, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const norm = (s) => String(s ?? '').replace(GENERIC, '').replace(/[^가-힣A-Za-z0-9]/g, '').toLowerCase();

/** 공고 주소에서 시·군·구 이름(예: "과천시" → "과천", "수원시 권선구") */
export function sigunguOf(address, region) {
  const t = String(address ?? '').replace(/\s+/g, ' ').trim().split(' ');
  const g = t[1] && /(시|군|구)$/.test(t[1]) ? t[1] : undefined;
  return g ? g.replace(/(특별자치시|광역시|특별시|시|군)$/, '') : region;
}

/** 키워드 검색어: "과천 해링턴 스퀘어 과천" */
export function nameQuery(n) {
  const name = cleanName(n.name);
  if (!name || name.replace(/\s/g, '').length < 3) return undefined;
  const area = sigunguOf(n.address, n.region);
  return area && !name.startsWith(area) ? `${area} ${name}` : name;
}

/** 장소가 공고 단지와 같은 곳인가: 주거시설 + 이름에 공통 부분(3글자 이상) + 같은 시·도 */
export function placeMatches(n, doc) {
  const cat = doc.category_name ?? '';
  if (/모델하우스|견본주택|주차장|충전소|부동산중개|공인중개/.test(`${cat} ${doc.place_name}`)) return false;
  if (!/주거시설|아파트|오피스텔|주택/.test(cat)) return false;
  const sido = { 서울: '서울', 경기: '경기', 인천: '인천', 부산: '부산', 대구: '대구', 광주: '광주', 대전: '대전', 울산: '울산', 세종: '세종', 강원: '강원', 충북: '충북', 충남: '충남', 전북: '전북', 전남: '전남', 경북: '경북', 경남: '경남', 제주: '제주' }[n.region];
  if (sido && !String(doc.address_name ?? '').startsWith(sido)) return false;
  const a = norm(cleanName(n.name));
  const b = norm(doc.place_name);
  if (a.length < 3 || b.length < 3) return false;
  for (let i = 0; i + 3 <= a.length; i++) if (b.includes(a.slice(i, i + 3))) return longestCommon(a, b) >= Math.min(4, a.length);
  return false;
}

function longestCommon(a, b) {
  let best = 0;
  for (let i = 0; i < a.length; i++) for (let j = i + best + 1; j <= a.length; j++) {
    if (b.includes(a.slice(i, j))) best = j - i;
    else break;
  }
  return best;
}
