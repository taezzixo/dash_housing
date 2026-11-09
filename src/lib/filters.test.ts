import { test } from 'node:test';
import assert from 'node:assert/strict';
import { receiptStatus, matchArea, matchPrice, AREA_BUCKETS, PRICE_BUCKETS, recentlyChanged, inBounds } from './filters.ts';
import { criteriaFor, CRITERIA_VERSIONS } from '../config/criteria.ts';
import type { Notice } from '../types.ts';

const n = (o: Partial<Notice>): Notice => ({ id: 'x', source: 'applyhome', category: 'APT', name: 'n', dates: {}, ...o });

test('접수 상태: 예정/중/마감', () => {
  const x = n({ dates: { specialStart: '2026-11-16', rank2End: '2026-11-19' } });
  assert.equal(receiptStatus(x, '2026-11-10'), 'upcoming');
  assert.equal(receiptStatus(x, '2026-11-17'), 'open');
  assert.equal(receiptStatus(x, '2026-11-20'), 'closed');
  assert.equal(receiptStatus(n({ status: '접수중' }), '2026-11-20'), 'open');
});

test('면적·가격 필터', () => {
  const x = n({ models: [{ type: '59', area: 59.9, priceMax: 45000 }, { type: '84', area: 84.9, priceMax: 62000 }] });
  assert.ok(matchArea(x, AREA_BUCKETS[1]));
  assert.ok(matchArea(x, AREA_BUCKETS[2]));
  assert.ok(!matchArea(x, AREA_BUCKETS[3]));
  assert.ok(matchPrice(x, PRICE_BUCKETS[2]));
  assert.ok(!matchPrice(x, PRICE_BUCKETS[1]));
  assert.ok(matchArea(n({}), AREA_BUCKETS[0]));
});

test('지도 영역·최근 변경', () => {
  assert.ok(inBounds(n({ lat: 37.5, lng: 127 }), { south: 37, north: 38, west: 126, east: 128 }));
  assert.ok(!inBounds(n({}), { south: 37, north: 38, west: 126, east: 128 }));
  assert.ok(recentlyChanged(n({ changes: [{ at: '2026-11-05', field: 'winner' }] }), '2026-11-09'));
  assert.ok(!recentlyChanged(n({ changes: [{ at: '2026-10-01', field: 'winner' }] }), '2026-11-09'));
});

test('판정 기준 버전: 모집공고일로 선택', () => {
  const v2 = { ...CRITERIA_VERSIONS[0], id: 'next', effectiveFrom: '2027-03-01' };
  const vs = [v2, ...CRITERIA_VERSIONS];
  assert.equal(criteriaFor('2027-04-01', vs).id, 'next');
  assert.equal(criteriaFor('2026-11-01', vs).id, CRITERIA_VERSIONS[0].id);
  assert.equal(criteriaFor(undefined, vs).id, 'next');
});
