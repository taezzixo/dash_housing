import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, bestVerdict } from './eligibility.ts';
import { DEFAULT_PROFILE } from './profile.ts';
import { buildIcs, dday } from './schedule.ts';
import type { Notice, Profile } from '../types.ts';

const today = new Date('2026-11-08T00:00:00+09:00');
const apt = (o: Partial<Notice> = {}): Notice => ({
  id: 't', source: 'applyhome', category: 'APT', subType: '민영', name: '테스트', region: '서울',
  dates: { announce: '2026-11-01', specialStart: '2026-11-20' }, models: [{ type: '84A', area: 84.9 }], ...o,
});
const P = (o: Partial<Profile>): Profile => ({ ...DEFAULT_PROFILE, ...o });

test('서울 민영 1순위: 통장 24개월·예치금 300만원 충족 → 가능성 높음', () => {
  const r = evaluate(apt(), P({ birthYear: 1990, accountMonths: 24, accountDeposit: 300 }), today).find((x) => x.key === 'general')!;
  assert.equal(r.verdict, 'likely');
});

test('예치금 부족 → 1순위 불가', () => {
  const r = evaluate(apt(), P({ accountMonths: 24, accountDeposit: 200 }), today).find((x) => x.key === 'general')!;
  assert.equal(r.verdict, 'no');
});

test('투기과열지구는 세대주 아니면 1순위 불가', () => {
  const r = evaluate(apt({ flags: { speculative: true } }), P({ accountMonths: 30, accountDeposit: 300, headOfHousehold: false }), today).find((x) => x.key === 'general')!;
  assert.equal(r.verdict, 'no');
});

test('신혼부부: 혼인 3년·소득 120% → 통과, 혼인 8년 → 불가', () => {
  const base = { marital: 'married' as const, householdSize: 2, monthlyIncome: 980 };
  const ok = evaluate(apt(), P({ ...base, marriageDate: '2023-11-01' }), today).find((x) => x.key === 'newlywed')!;
  assert.equal(ok.verdict, 'likely');
  const old = evaluate(apt(), P({ ...base, marriageDate: '2018-01-01' }), today).find((x) => x.key === 'newlywed')!;
  assert.equal(old.verdict, 'no');
});

test('민영 신혼부부 소득 초과지만 부동산 3.31억 이하 → 추첨물량 확인 필요', () => {
  const r = evaluate(apt(), P({ marital: 'married', marriageDate: '2024-01-01', householdSize: 2, monthlyIncome: 1500, realEstate: 10000 }), today).find((x) => x.key === 'newlywed')!;
  assert.equal(r.verdict, 'check');
});

test('공공(국민) 자산 초과 → 생애최초 불가', () => {
  const r = evaluate(apt({ subType: '국민' }), P({ accountMonths: 24, accountPayments: 24, monthlyIncome: 500, netAssets: 50000 }), today).find((x) => x.key === 'firstLife')!;
  assert.equal(r.verdict, 'no');
});

test('오피스텔은 성인이면 가능, 미성년이면 불가', () => {
  const n = apt({ category: 'OFFICETEL', subType: '오피스텔' });
  assert.equal(bestVerdict(evaluate(n, P({ birthYear: 1995 }), today)), 'likely');
  assert.equal(bestVerdict(evaluate(n, P({ birthYear: 2012 }), today)), 'no');
});

test('dday 계산과 ics 생성', () => {
  assert.equal(dday('2026-11-10', '2026-11-08'), 2);
  const ics = buildIcs([apt()], 'https://x');
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261120/);
  assert.match(ics, /BEGIN:VALARM/);
});
