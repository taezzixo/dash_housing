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
