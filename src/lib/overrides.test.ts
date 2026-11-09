import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOverrides } from './overrides.ts';
import type { Notice } from '../types.ts';

const base: Notice[] = [
  { id: 'a', source: 'lh', category: 'LH', name: 'A', dates: {}, lat: 37, lng: 127, geoPrecision: 'region' },
  { id: 'b', source: 'lh', category: 'LH', name: 'B', dates: {} },
];

test('숨김·좌표 수정·수동 등록', () => {
  const out = applyOverrides(base, {
    hide: ['b'],
    patch: { a: { lat: 37.5, lng: 127.1, note: '현장 확인' } },
    manual: [{ id: 'sh-1', source: 'manual', category: 'LH', subType: 'SH 행복주택', name: 'SH 행복주택 모집', region: '서울', dates: { announce: '2026-11-10' } }],
  });
  assert.deepEqual(out.map((n) => n.id), ['a', 'sh-1']);
  assert.equal(out[0].lat, 37.5);
  assert.equal(out[0].geoPrecision, 'address');
  assert.equal(out[0].note, '현장 확인');
  assert.equal(out[1].manual, true);
});

test('보정 파일이 없으면 그대로', () => {
  assert.equal(applyOverrides(base, null), base);
});
