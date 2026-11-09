import { test } from 'node:test';
import assert from 'node:assert/strict';
import { complexKey, findRelated, isReoffer } from './related.ts';
import { receiptStatus, isPast } from './filters.ts';
import type { Notice } from '../types.ts';

const N = (id: string, name: string, o: Partial<Notice> = {}): Notice => ({ id, source: 'applyhome', category: 'APT', name, region: '서울', dates: {}, ...o });

test('단지 이름 정규화', () => {
  assert.equal(complexKey('[민간임대] 화랑대역 에이트플레이스 추가모집공고'), complexKey('[민간임대] 화랑대역 에이트플레이스 최초모집공고'));
  assert.equal(complexKey('시흥 거모 아테라(시흥거모 A-6BL) 신혼희망타운(공공분양)(본청약)'), complexKey('시흥 거모 아테라'));
});

test('같은 단지의 무순위 공고 연결, 다른 지역·다른 단지는 제외', () => {
  const first = N('a', '서초 리버파크', { dates: { announce: '2026-09-01' } });
  const remain = N('b', '서초 리버파크(무순위)', { category: 'REMNDR', dates: { announce: '2026-11-01' } });
  const other = N('c', '서초 그린파크');
  const busan = N('d', '서초 리버파크', { region: '부산' });
  assert.deepEqual(findRelated(remain, [first, remain, other, busan]).map((x) => x.id), ['a']);
  assert.ok(isReoffer(remain));
  assert.ok(!isReoffer(first));
});

test('접수 마감 후 발표·계약 남으면 대기, 모두 끝나면 지난 공고', () => {
  const n = N('x', 'x', { dates: { specialStart: '2026-11-01', rank2End: '2026-11-03', winner: '2026-11-10', contractEnd: '2026-11-25' } });
  assert.equal(receiptStatus(n, '2026-11-05'), 'waiting');
  assert.equal(receiptStatus(n, '2026-11-26'), 'closed');
  assert.ok(isPast(n, '2026-11-26'));
  const y = N('y', 'y', { category: 'YOUTH', dates: { announce: '2026-10-01', receiptStart: '2026-10-05' } });
  assert.equal(receiptStatus(y, '2026-10-10'), 'unknown');
  assert.equal(receiptStatus(y, '2026-11-01'), 'closed');
});
