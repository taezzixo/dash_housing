#!/usr/bin/env node
// SEO: 빌드 후 공고별 정적 페이지(dist/n/<id>.html), 목록(dist/n/index.html), sitemap.xml, robots.txt 생성
// 검색엔진이 자바스크립트 없이도 공고 내용을 읽을 수 있게 한다. 각 페이지는 앱의 /?id=<id> 로 연결된다.
// SITE_URL(예: https://example.com)이 있으면 canonical·sitemap에 절대 주소를 쓴다.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const DIST = 'dist';
const SITE = (process.env.SITE_URL ?? '').replace(/\/$/, '');
const CAT = { APT: 'APT 분양', OFFICETEL: '오피스텔·도시형', REMNDR: '무순위·잔여세대', PBL_PVT_RENT: '공공지원 민간임대', OPT: '임의공급', LH: 'LH 분양·임대', YOUTH: '청년안심주택' };
const DATE_LABEL = [
  ['announce', '모집공고'], ['specialStart', '특별공급 접수', 'specialEnd'], ['rank1Start', '1순위 접수', 'rank1End'],
  ['rank2Start', '2순위 접수', 'rank2End'], ['receiptStart', '청약 접수', 'receiptEnd'], ['winner', '당첨자 발표'], ['contractStart', '계약', 'contractEnd'],
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fileId = (id) => id.replace(/[^A-Za-z0-9_-]/g, '_');

export function applyOverrides(notices, ov) {
  if (!ov) return notices;
  const hide = new Set(ov.hide ?? []);
  const out = notices.filter((n) => !hide.has(n.id)).map((n) => (ov.patch?.[n.id] ? { ...n, ...ov.patch[n.id] } : n));
  const ids = new Set(out.map((n) => n.id));
  for (const m of ov.manual ?? []) if (m?.id && m.name && !ids.has(m.id) && !hide.has(m.id)) out.push({ ...m, dates: m.dates ?? {}, category: m.category ?? 'LH', manual: true });
  return out;
}

function schedule(n) {
  const d = n.dates ?? {};
  return DATE_LABEL.filter(([k]) => d[k]).map(([k, label, end]) => [label, d[k] + (end && d[end] && d[end] !== d[k] ? ` ~ ${d[end]}` : '')]);
}

export function noticePage(n, { site, generatedAt }) {
  const url = `${site}/n/${fileId(n.id)}`;
  const where = n.address ?? n.region ?? '';
  const sch = schedule(n);
  const first = sch.find(([l]) => l !== '모집공고');
  const desc = `${CAT[n.category] ?? ''} ${n.subType ?? ''} · ${where}${first ? ` · ${first[0]} ${first[1]}` : ''}. 청약 일정, 주택형, 내 조건 자격 판정과 제출 서류를 확인하세요.`.replace(/\s+/g, ' ').trim();
  const models = (n.models ?? []).slice(0, 20);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: n.name,
    description: desc,
    dateModified: generatedAt,
    ...(site ? { url } : {}),
    about: { '@type': 'Place', name: n.name, address: where, ...(n.lat ? { geo: { '@type': 'GeoCoordinates', latitude: n.lat, longitude: n.lng } } : {}) },
  };
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(n.name)} 청약 일정·자격 | 청약맵</title>
<meta name="description" content="${esc(desc)}">
${site ? `<link rel="canonical" href="${esc(url)}">` : ''}
<meta property="og:title" content="${esc(n.name)} 청약 일정">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<link rel="stylesheet" href="/policy.css">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
</head><body><main>
<p><a href="/n/">← 전체 공고</a> · <a href="/">청약맵 홈</a></p>
<h1>${esc(n.name)}</h1>
<p>${esc(CAT[n.category] ?? '')}${n.subType ? ` · ${esc(n.subType)}` : ''} · ${esc(where)}${n.totalUnits ? ` · ${n.totalUnits.toLocaleString()}세대` : ''}</p>
<p><a href="/?id=${encodeURIComponent(n.id)}"><b>지도에서 보기 · 내 조건으로 지원 가능 여부 확인 →</b></a></p>
${sch.length ? `<h2>청약 일정</h2><table>${sch.map(([l, v]) => `<tr><th>${esc(l)}</th><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}
${models.length ? `<h2>주택형</h2><table><tr><th>주택형</th><th>면적(㎡)</th><th>일반</th><th>특별</th><th>최고가</th></tr>${models.map((m) => `<tr><td>${esc(m.type)}</td><td>${m.area ?? '-'}</td><td>${m.general ?? '-'}</td><td>${m.special ?? '-'}</td><td>${m.priceMax ? `${(m.priceMax / 10000).toFixed(1)}억` : '-'}</td></tr>`).join('')}</table>` : ''}
${n.competition?.length ? `<h2>1순위 경쟁률</h2><table><tr><th>주택형</th><th>해당지역</th><th>기타지역</th></tr>${n.competition.map((c) => `<tr><td>${esc(c.type)}</td><td>${c.local?.rate ?? '-'}</td><td>${c.other?.rate ?? '-'}</td></tr>`).join('')}</table>` : ''}
<h2>정보</h2><table>
${n.developer ? `<tr><th>사업주체</th><td>${esc(n.developer)}</td></tr>` : ''}
${n.builder ? `<tr><th>시공사</th><td>${esc(n.builder)}</td></tr>` : ''}
${n.moveIn ? `<tr><th>입주예정</th><td>${esc(n.moveIn.slice(0, 4))}.${esc(n.moveIn.slice(4, 6))}</td></tr>` : ''}
${n.url ? `<tr><th>공고 원문</th><td><a href="${esc(n.url)}" rel="nofollow noopener" target="_blank">원문 보기</a></td></tr>` : ''}
</table>
<p class="muted">자동 수집한 공공데이터 기반 정보이며, 정정·취소될 수 있습니다. 최종 내용은 반드시 공고 원문으로 확인하세요. 갱신: ${esc(generatedAt.slice(0, 10))}</p>
</main></body></html>`;
}

async function main() {
  if (!existsSync(`${DIST}/data/notices.json`)) return console.log('prerender: dist/data/notices.json 없음 → 건너뜀');
  const file = JSON.parse(await readFile(`${DIST}/data/notices.json`, 'utf8'));
  const ov = existsSync(`${DIST}/data/overrides.json`) ? JSON.parse(await readFile(`${DIST}/data/overrides.json`, 'utf8')) : null;
  // 지난 공고(보관)도 공고별 페이지를 만든다 — 경쟁률·당첨가점 검색 유입
  const arch = existsSync(`${DIST}/data/archive.json`) ? JSON.parse(await readFile(`${DIST}/data/archive.json`, 'utf8')).notices ?? [] : [];
  const ids = new Set(file.notices.map((n) => n.id));
  const notices = applyOverrides([...file.notices, ...arch.filter((n) => !ids.has(n.id))], ov);
  await mkdir(`${DIST}/n`, { recursive: true });
  const opts = { site: SITE, generatedAt: file.generatedAt };
  for (const n of notices) await writeFile(`${DIST}/n/${fileId(n.id)}.html`, noticePage(n, opts));

  const byCat = {};
  for (const n of notices) (byCat[n.category] ??= []).push(n);
  await writeFile(`${DIST}/n/index.html`, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>전국 청약 공고 목록 | 청약맵</title><meta name="description" content="청약홈·LH·서울 청년안심주택의 최근 청약 공고 ${notices.length}건 목록">
${SITE ? `<link rel="canonical" href="${SITE}/n/">` : ''}<link rel="stylesheet" href="/policy.css"></head><body><main>
<p><a href="/">← 청약맵 홈 (지도)</a></p><h1>전국 청약 공고 목록</h1><p class="muted">갱신 ${esc(file.generatedAt.slice(0, 10))} · ${notices.length}건</p>
${Object.entries(byCat).map(([c, list]) => `<h2>${esc(CAT[c] ?? c)} (${list.length})</h2><ul>${list.map((n) => `<li><a href="/n/${fileId(n.id)}">${esc(n.name)}</a> <span class="muted">${esc(n.region ?? '')} ${esc(n.dates?.announce ?? '')}</span></li>`).join('')}</ul>`).join('\n')}
</main></body></html>`);

  if (SITE) {
    const urls = [`${SITE}/`, `${SITE}/n/`, ...notices.map((n) => `${SITE}/n/${fileId(n.id)}`)];
    await writeFile(`${DIST}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u)}</loc><lastmod>${file.generatedAt.slice(0, 10)}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  }
  await writeFile(`${DIST}/robots.txt`, `User-agent: *\nAllow: /\nDisallow: /admin.html\n${SITE ? `Sitemap: ${SITE}/sitemap.xml\n` : ''}`);
  console.log(`prerender: 공고 페이지 ${notices.length}개${SITE ? ', sitemap.xml' : ' (SITE_URL 없음 → sitemap 생략)'}, robots.txt`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
