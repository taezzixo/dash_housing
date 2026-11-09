import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeOnLogin, stripFinancial } from './account.ts';
import { DEFAULT_PROFILE } from './profile.ts';

test('소득·자산은 서버 저장을 켜지 않으면 빠진다', () => {
  const p = stripFinancial({ ...DEFAULT_PROFILE, monthlyIncome: 500, realEstate: 1, carValue: 2, netAssets: 3, region: '경기' });
  assert.equal(p.monthlyIncome, undefined);
  assert.equal(p.netAssets, undefined);
  assert.equal(p.region, '경기');
});

test('로그인 시 합치기: 서버 조건 우선, 기기의 소득 유지, 관심·체크 합집합', () => {
  const local = { profile: { ...DEFAULT_PROFILE, region: '서울', monthlyIncome: 400 }, touched: true, saved: ['a'], checklists: { a: { id: true } } };
  const remote = { exists: true, profile: { region: '경기', birthYear: 1990 }, includeFinancial: false, saved: ['b'], checklists: { a: { resident: true } } };
  const m = mergeOnLogin(local, remote);
  assert.equal(m.profile.region, '경기');
  assert.equal(m.profile.birthYear, 1990);
  assert.equal(m.profile.monthlyIncome, 400);
  assert.deepEqual(m.saved.sort(), ['a', 'b']);
  assert.deepEqual(m.checklists.a, { resident: true, id: true });
});
