import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackChanges } from './track.mjs';
import { geoCandidates } from './geo.mjs';

test('정정 추적: 일정 변경 기록', () => {
  const prev = [{ id: 'a', source: 'applyhome', name: 'A', dates: { winner: '2026-11-20' }, firstSeen: '2026-11-01' }];
  const next = [{ id: 'a', source: 'applyhome', name: 'A', dates: { winner: '2026-11-25' } }];
  const out = trackChanges(prev, next, '2026-11-09', new Set(['applyhome']));
  assert.equal(out[0].firstSeen, '2026-11-01');
  assert.deepEqual(out[0].changes, [{ at: '2026-11-09', field: 'winner', from: '2026-11-20', to: '2026-11-25' }]);
});

test('사라진 진행중 공고는 취소 의심으로 유지, 끝난 공고는 제거, 실패한 출처는 그대로', () => {
  const prev = [
    { id: 'live', source: 'applyhome', name: 'L', dates: { contractEnd: '2026-12-01' } },
    { id: 'done', source: 'applyhome', name: 'D', dates: { contractEnd: '2026-10-01' } },
    { id: 'lh1', source: 'lh', name: 'H', dates: { receiptEnd: '2026-12-01' } },
  ];
  const out = trackChanges(prev, [], '2026-11-09', new Set(['applyhome']));
  const ids = Object.fromEntries(out.map((o) => [o.id, o]));
  assert.equal(ids.live.removedAt, '2026-11-09');
  assert.ok(!ids.done);
  assert.ok(ids.lh1 && !ids.lh1.removedAt);
  // 14일 지나면 제거
  const later = trackChanges(out, [], '2026-11-30', new Set(['applyhome', 'lh']));
  assert.ok(!later.find((o) => o.id === 'live'));
});

test('정정 공고 표시', () => {
  const out = trackChanges([], [{ id: 'x', source: 'lh', name: '[정정공고] OO', dates: {} }], '2026-11-09');
  assert.equal(out[0].corrected, true);
});

test('주소 후보: 괄호 지번 우선, 지구 이름은 시군구로 대체', () => {
  const c = geoCandidates('대전광역시 유성구 도안 2-6지구 30블록(유성구 용계동 299-7번지 일원)');
  assert.equal(c[0].q, '대전광역시 유성구 용계동 299-7');
  assert.equal(c.at(-1).precision, 'district');
  const g = geoCandidates('경기도 시흥시 거모지구 내 A-6블록');
  assert.equal(g.at(-1).q, '경기도 시흥시');
});

import { normYouth, stationQuery } from '../sources/youth-seoul.mjs';
test('청년안심주택 정규화·역 이름 검색어', () => {
  const n = normYouth({ boardId: 6724, nttSj: '[민간임대] 화랑대역 에이트플레이스 추가모집공고', optn1: '2026-11-05', optn2: '2', optn4: '2026-11-06', optn5: '2', optn3: '㈜대한' });
  assert.equal(n.id, 'ys-6724');
  assert.equal(n.dates.announce, '2026-11-05');
  assert.equal(n.subType, '청년안심주택 · 민간 · 추가');
  assert.equal(n.geoKeyword, '서울 화랑대역');
  assert.equal(stationQuery('[민간임대] 숭곡초교역(예정) 성북펠릭스 추가모집공고'), '서울 숭곡초교역');
});

import { noticePage, applyOverrides as ovNode } from '../prerender.mjs';
test('SEO 페이지: 제목·일정·딥링크·HTML 이스케이프', () => {
  const html = noticePage({ id: 'ah-1-1', category: 'APT', subType: '민영', name: 'A<B> 아파트', address: '서울 서초구', dates: { announce: '2026-11-01', specialStart: '2026-11-10', specialEnd: '2026-11-11' } }, { site: 'https://x.kr', generatedAt: '2026-11-09T00:00:00Z' });
  assert.match(html, /<title>A&lt;B&gt; 아파트 청약 일정·자격 \| 청약맵<\/title>/);
  assert.match(html, /특별공급 접수<\/th><td>2026-11-10 ~ 2026-11-11/);
  assert.match(html, /href="\/\?id=ah-1-1"/);
  assert.match(html, /rel="canonical" href="https:\/\/x.kr\/n\/ah-1-1"/);
  assert.equal(ovNode([{ id: 'a', name: 'a', dates: {} }], { hide: ['a'] }).length, 0);
});

import { splitArchive } from './track.mjs';
test('수집 기간 밖 공고는 취소 의심으로 보지 않음', () => {
  const prev = [{ id: 'old', source: 'applyhome', name: 'O', dates: { announce: '2026-07-01', contractEnd: '2026-12-01' } }];
  const out = trackChanges(prev, [], '2026-11-09', new Set(['applyhome']), '2026-08-11');
  assert.equal(out[0].id, 'old');
  assert.ok(!out[0].removedAt);
});

test('끝난 공고는 보관으로 이동, 1년 지난 보관은 삭제, 경쟁률 유지', () => {
  const notices = [
    { id: 'live', dates: { announce: '2026-11-01', contractEnd: '2026-12-01' } },
    { id: 'done', dates: { announce: '2026-09-01', contractEnd: '2026-10-20' }, competition: [{ type: '84A' }] },
  ];
  const prevArchive = [{ id: 'ancient', dates: { announce: '2025-09-01' } }, { id: 'kept', dates: { announce: '2026-03-01' } }];
  const { current, archive } = splitArchive(notices, prevArchive, '2026-11-09');
  assert.deepEqual(current.map((n) => n.id), ['live']);
  assert.deepEqual(archive.map((n) => n.id), ['done', 'kept']);
  assert.equal(archive[0].competition.length, 1);
});

import { lastDate } from './track.mjs';
test('마감일 없는 공고의 종료일 추정 (클라이언트 상태와 일치)', () => {
  assert.equal(lastDate({ dates: { announce: '2026-11-05', receiptStart: '2026-11-06' } }), '2026-11-20');
  assert.equal(lastDate({ dates: { announce: '2026-11-01' } }), '2026-12-31');
  assert.equal(lastDate({ dates: { announce: '2026-11-01', receiptEnd: '2026-11-15', winner: '2026-11-25' } }), '2026-11-25');
});

import { readFileSync } from 'node:fs';
import { parseYouthDetail, parseDateRange } from '../sources/youth-seoul.mjs';
test('청년안심주택 상세: 주소·일정·문의처 파싱', () => {
  const d = parseYouthDetail(readFileSync(new URL('../fixtures/youth-view.html', import.meta.url), 'utf8'), '2026-10-15');
  assert.equal(d.address, '서울특별시 강서구 화곡로 146');
  assert.equal(d.complexName, '포르투나블루');
  assert.equal(d.dates.receiptStart, '2026-10-16');
  assert.equal(d.dates.receiptEnd, '2026-10-19');
  assert.equal(d.dates.winner, '2026-10-20');
  assert.equal(d.dates.contractStart, '2026-10-22');
  assert.equal(d.dates.contractEnd, '2026-10-23');
  assert.deepEqual(d.extraSchedule, [{ label: '서류사본제출', start: undefined, end: '2026-10-21' }]);
  assert.equal(d.phone, '010-4942-8982');
  assert.equal(d.totalUnits, 1);
});
test('날짜 범위 파싱', () => {
  assert.deepEqual(parseDateRange("‘26. 11. 09. (월) ~ 11. 13. (금) 10:00 ~ 17:00", 2026), { start: '2026-11-09', end: '2026-11-13' });
  assert.deepEqual(parseDateRange("~ ‘26. 11. 05. (목)", 2026), { end: '2026-11-05' });
  assert.deepEqual(parseDateRange('2026.12.01', 2026), { start: '2026-12-01', end: undefined });
});

import { checkQuality } from './quality.mjs';
test('정합성 점검', () => {
  assert.deepEqual(checkQuality({ source: 'youth-seoul', dates: { announce: '2026-10-29', receiptStart: '2026-11-02' } }), ['주소 미제공', '접수 마감일 미제공', '발표일 미제공', '계약일 미제공']);
  assert.deepEqual(checkQuality({ source: 'applyhome', category: 'APT', address: 'x', geoPrecision: 'address', models: [{}], dates: { announce: '2026-11-01', receiptStart: '2026-11-05', receiptEnd: '2026-11-04', winner: '2026-11-10', contractStart: '2026-11-20' } }), ['접수 마감이 시작보다 빠름']);
});
