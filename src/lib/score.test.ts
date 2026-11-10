import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountPoints, calcGajeom, dependentsPoints, fitStars, homelessPoints, homelessStartYear, nearbyScores } from './score.ts';
import { groupByComplex, blockTag } from './related.ts';
import { buildMonth, monthGrid, shiftMonth } from './calendar.ts';
import { gajeomTableFor } from '../config/criteria.ts';
import { DEFAULT_PROFILE } from './profile.ts';
import type { Notice, Profile } from '../types.ts';

const T = gajeomTableFor();
const P = (o: Partial<Profile> = {}): Profile => ({ ...DEFAULT_PROFILE, ...o });
const N = (id: string, name: string, o: Partial<Notice> = {}): Notice => ({ id, source: 'applyhome', category: 'APT', name, region: '서울', dates: {}, ...o });

test('가점 배점표: 구간 경계', () => {
  assert.equal(homelessPoints(0, T), 2); // 1년 미만
  assert.equal(homelessPoints(1, T), 4);
  assert.equal(homelessPoints(14.9, T), 30);
  assert.equal(homelessPoints(15, T), 32);
  assert.equal(homelessPoints(40, T), 32);
  assert.equal(homelessPoints(-2, T), 0); // 만 30세 전 미혼
  assert.equal(dependentsPoints(0, T), 5);
  assert.equal(dependentsPoints(3, T), 20);
  assert.equal(dependentsPoints(9, T), 35);
  assert.equal(accountPoints(5, T), 1);
  assert.equal(accountPoints(6, T), 2);
  assert.equal(accountPoints(12, T), 3);
  assert.equal(accountPoints(179, T), 16);
  assert.equal(accountPoints(180, T), 17);
});

test('무주택기간 시작: 만 30세·혼인 중 빠른 해, 처분 연도가 더 늦으면 처분 연도', () => {
  assert.equal(homelessStartYear(P({ birthYear: 1990 })), 2020);
  assert.equal(homelessStartYear(P({ birthYear: 1990, marital: 'married', marriageDate: '2017-05-01' })), 2017);
  assert.equal(homelessStartYear(P({ birthYear: 1990, homelessSinceYear: 2023 })), 2023);
  assert.equal(homelessStartYear(P()), undefined);
});

test('가점 합계: 기혼 자녀 2명, 1985년생, 통장 10년', () => {
  const g = calcGajeom(P({ birthYear: 1985, marital: 'married', marriageDate: '2012-03-01', children: 2, accountMonths: 120 }), '2026-11-10');
  // 무주택 2012~ 14년 → 30점, 부양 3명(추정) → 20점, 통장 10년 → 12점
  assert.deepEqual(g.parts.map((p) => p.points), [30, 20, 12]);
  assert.equal(g.total, 62);
  assert.ok(g.notes.some((x) => x.includes('추정')));
  const owner = calcGajeom(P({ birthYear: 1985, homeless: false }), '2026-11-10');
  assert.equal(owner.parts[0].points, 0);
});

test('인근 당첨가점: 같은 시군구 우선, 없으면 시도 전체', () => {
  const target = N('t', '새 단지', { region: '경기', address: '경기도 부천시 원미구 1' });
  const a = N('a', 'A', { region: '경기', address: '경기도 부천시 소사구 2', scores: [{ type: '84', min: 40, avg: 50, max: 60 }] });
  const b = N('b', 'B', { region: '경기', address: '경기도 수원시 3', scores: [{ type: '84', min: 20, avg: 30, max: 70 }] });
  const r = nearbyScores(target, [target, a, b])!;
  assert.equal(r.scope, '경기 부천시');
  assert.deepEqual([r.min, r.avg, r.max, r.count], [40, 50, 60, 1]);
  const far = N('f', 'F', { region: '경기', address: '경기도 이천시 1' });
  assert.equal(nearbyScores(far, [a, b])!.scope, '경기 전체');
  assert.equal(nearbyScores(N('z', 'Z', { region: '제주' }), [a, b]), null);
});

test('적합도 별점: 불충족은 숨김, 관심 조건이 맞을수록 높음', () => {
  const n = N('n', 'n', { region: '서울', models: [{ type: '59', area: 59, priceMax: 50000 }] });
  assert.equal(fitStars(n, P(), 'no'), null);
  assert.equal(fitStars(n, P(), 'likely')!.stars, 4); // 관심 조건 미설정 → 중간
  assert.equal(fitStars(n, P({ preferredRegions: ['서울'], preferredArea: 'lt60', preferredPrice: '3to6' }), 'likely')!.stars, 5);
  assert.equal(fitStars(n, P({ preferredRegions: ['부산'], preferredArea: 'gt85' }), 'likely')!.stars, 3);
  assert.equal(fitStars(n, P({ preferredRegions: ['부산'] }), 'check')!.stars, 2);
});

test('목록 묶기: 같은 단지는 접수중 공고가 대표, 다른 블록은 따로', () => {
  assert.equal(blockTag('시흥 거모 아테라(시흥거모 A-6BL)'), 'A6');
  assert.equal(blockTag('남양주왕숙 A-2블록 신혼희망타운'), 'A2');
  const orig = N('o', '안산신길2 B-1블록 공공분양주택 입주자 모집공고', { category: 'LH', region: '경기', dates: { announce: '2026-10-01' } });
  const fix = N('f', '[정정공고]안산신길2 B-1블록 공공분양주택 입주자 모집공고', { category: 'LH', region: '경기', dates: { announce: '2026-10-05' } });
  const l2 = N('l2', '캐슬앤파밀리에 디아트(4-1생활권 P1구역 L2블록 수루배마을2단지)', { region: '세종' });
  const m1 = N('m1', '캐슬앤파밀리에 디아트(4-1생활권 P1구역 M1블록 수루배마을1단지)', { region: '세종' });
  const rank = (n: Notice) => (n.id === 'o' ? 0 : 1); // 원공고만 접수중이라고 가정
  const g = groupByComplex([fix, l2, orig, m1], rank);
  assert.equal(g.length, 3);
  assert.equal(g[0].lead.id, 'o');
  assert.deepEqual(g[0].others.map((x) => x.id), ['f']);
});

test('월 캘린더: 주 격자와 접수 막대가 주 경계에서 잘림', () => {
  const grid = monthGrid('2026-11');
  assert.equal(grid[0][0], '2026-11-01'); // 2026-11-01은 일요일
  assert.equal(grid.length, 5);
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  const n = N('a', 'A', { dates: { specialStart: '2026-11-06', rank2End: '2026-11-10', winner: '2026-11-18' } });
  const { weeks, dots } = buildMonth('2026-11', [n], new Set(['a']), '2026-11-05');
  const w1 = weeks[0].bars[0];
  const w2 = weeks[1].bars[0];
  assert.deepEqual([w1.col, w1.span, w1.contEnd], [5, 2, true]);
  assert.deepEqual([w2.col, w2.span, w2.contStart], [0, 3, true]);
  assert.equal(dots.get('2026-11-18')?.[0].kind, '발표');
  const { dots: none } = buildMonth('2026-11', [n], new Set(), '2026-11-05');
  assert.equal(none.size, 0); // 관심 공고가 아니면 발표·계약 점 없음
});

test('같은 단지 다른 공고 유형 라벨', async () => {
  const { relatedKind } = await import('./related.ts');
  assert.equal(relatedKind(N('a', '[정정공고]안산신길2 B-1블록 공공분양주택')), '정정');
  assert.equal(relatedKind(N('b', '서초 리버파크', { category: 'REMNDR' })), '무순위');
  assert.equal(relatedKind(N('c', '서초 리버파크', { category: 'OPT' })), '임의공급');
  assert.equal(relatedKind(N('d', '남양주왕숙 A-2블록 잔여세대 추가입주자모집공고', { category: 'LH' })), '무순위');
  assert.equal(relatedKind(N('e', '화랑대역 에이트플레이스 추가모집공고', { category: 'PBL_PVT_RENT', subType: '공공지원민간임대' })), '추가모집');
  assert.equal(relatedKind(N('f', '서초 리버파크')), '최초분양');
});

test('면적 구간·예치금은 주택형 코드의 전용면적 기준 (공급면적 아님)', async () => {
  const { exclusiveArea, matchArea, AREA_BUCKETS } = await import('./filters.ts');
  const { evaluate } = await import('./eligibility.ts');
  assert.equal(exclusiveArea({ type: '084.9904A', area: 111.94 }), 84.9904);
  assert.equal(exclusiveArea({ type: '84', area: 84.9 }), 84.9); // 코드에 소수가 없으면 area 사용
  const n = N('x', 'x', { region: '서울', subType: '민영', models: [{ type: '084.9904A', area: 111.94 }] });
  assert.ok(matchArea(n, AREA_BUCKETS.find((b) => b.key === '60to85')!));
  // 서울 거주 85㎡ 이하 예치금 300만원이면 1순위 예치금 충족이어야 한다 (공급면적 111㎡로 보면 600만원)
  const rs = evaluate(n, P({ birthYear: 1990, region: '서울', accountMonths: 30, accountPayments: 30, accountDeposit: 300 }));
  assert.ok(rs.some((r) => r.reasons.some((x) => x.includes('예치금 300만원 ≥ 300만원'))), JSON.stringify(rs.map((r) => r.reasons)));
});

test('공급 타입: 평형 이름·면적 구성·내 공급 유형 세대수', async () => {
  const { typeLabel, unitStats, myUnits, won } = await import('./units.ts');
  const { mergeModels } = await import('./overrides.ts');
  const m = { type: '084.9904A', area: 111.9429, general: 193, special: 226, specialBreakdown: { newlywed: 62, firstLife: 29 }, priceMax: 69100 };
  assert.equal(typeLabel(m), '84A');
  assert.equal(typeLabel({ type: '59', label: '25형' }), '25형');
  const s = unitStats(m);
  assert.equal(s.households, 419);
  assert.equal(s.pyeong, 34);
  assert.equal(Math.round(s.common! * 100) / 100, 26.95);
  assert.equal(s.pricePerPyeong, 2041);
  assert.equal(unitStats({ type: '오피스텔', area: 40 }).supply, undefined); // 전용인지 공급인지 모르면 공급으로 쓰지 않음
  const mine = myUnits(m, [
    { key: 'general', label: '일반공급 1순위', verdict: 'likely', reasons: [] },
    { key: 'newlywed', label: '신혼부부 특별공급', verdict: 'check', reasons: [] },
    { key: 'multiChild', label: '다자녀 특별공급', verdict: 'no', reasons: [] },
    { key: 'youth', label: '청년 특별공급', verdict: 'likely', reasons: [] }, // 이 주택형 특공 내역에 청년 없음 → 제외
  ]);
  assert.deepEqual(mine.map((u) => [u.key, u.count]), [['general', 193], ['newlywed', 62]]);
  const noBreakdown = myUnits({ type: '59', general: 10 }, [{ key: 'youth', label: '청년 특별공급', verdict: 'likely', reasons: [] }]);
  assert.deepEqual(noBreakdown.map((u) => u.count), [undefined]); // 내역이 없으면 모름으로 표시
  assert.equal(won(69100), '6억 9,100만원');
  assert.equal(won(30000), '3억원');
  assert.equal(won(850), '850만원');
  const merged = mergeModels([m], [{ type: '084.9904A', planImage: 'https://example.com/84a.png' }, { type: '059.9000B', deposit: 5000, rent: 60 }]);
  assert.equal(merged[0].planImage, 'https://example.com/84a.png');
  assert.equal(merged[0].general, 193);
  assert.equal(merged.length, 2);
});
