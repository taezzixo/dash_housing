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
