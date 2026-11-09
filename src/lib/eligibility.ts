import type { Notice, Profile, ProgramResult, Verdict } from '../types.ts';
import type { Criteria } from '../config/criteria.ts';
import { CAPITAL_AREA, criteriaFor, depositRequired, income100, rank1Months } from '../config/criteria.ts';

// 판정 규칙: 하나라도 명확히 불충족 → 'no', 입력 부족·공고별 상이 → 'check', 모두 충족 → 'likely'
class Check {
  verdict: Verdict = 'likely';
  reasons: string[] = [];
  fail(msg: string) {
    this.verdict = 'no';
    this.reasons.push('✗ ' + msg);
  }
  warn(msg: string) {
    if (this.verdict === 'likely') this.verdict = 'check';
    this.reasons.push('△ ' + msg);
  }
  ok(msg: string) {
    this.reasons.push('✓ ' + msg);
  }
  result(key: string, label: string): ProgramResult {
    return { key, label, verdict: this.verdict, reasons: this.reasons };
  }
}

export function ageOf(p: Profile, today = new Date()): number | undefined {
  if (!p.birthYear) return undefined;
  return today.getFullYear() - p.birthYear; // 연 나이(근사)
}

function marriageYears(p: Profile, today = new Date()): number | undefined {
  if (p.marital !== 'married' || !p.marriageDate) return undefined;
  const d = new Date(p.marriageDate);
  if (isNaN(d.getTime())) return undefined;
  return (today.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
}

function incomePct(p: Profile, cr: Criteria): number | undefined {
  if (!p.monthlyIncome && p.monthlyIncome !== 0) return undefined;
  return (p.monthlyIncome / income100(p.householdSize, cr)) * 100;
}

// 현재 판정 중인 공고의 기준 버전 (evaluate 진입 시 설정)
let CR: Criteria = criteriaFor();

function checkIncome(c: Check, p: Profile, limit: { single: number; dual: number }, name: string) {
  const pct = incomePct(p, CR);
  const lim = p.dualIncome ? limit.dual : limit.single;
  if (pct === undefined) return c.warn(`${name} 소득 기준(${lim}% 이하) — 소득을 입력하세요`);
  if (pct <= lim) c.ok(`소득 ${pct.toFixed(0)}% ≤ ${lim}%`);
  else c.fail(`소득 ${pct.toFixed(0)}% > ${lim}% (${name})`);
  return pct <= lim;
}

function checkPublicAssets(c: Check, p: Profile) {
  const a = CR.publicAsset;
  if (p.netAssets > a.netAssetsMax) c.fail(`순자산 ${p.netAssets.toLocaleString()}만원 > ${a.netAssetsMax.toLocaleString()}만원`);
  else c.ok('순자산 기준 이내');
  if (p.carValue > a.carMax) c.fail(`자동차 ${p.carValue.toLocaleString()}만원 > ${a.carMax.toLocaleString()}만원`);
  else c.ok('자동차 기준 이내');
}

function checkHomeless(c: Check, p: Profile) {
  if (!p.homeless) c.fail('무주택세대구성원 요건 불충족');
  else c.ok('무주택세대구성원');
}

function minModelArea(n: Notice): number | undefined {
  const areas = (n.models ?? []).map((m) => m.area).filter((a): a is number => !!a);
  return areas.length ? Math.min(...areas) : undefined;
}

function rank1(c: Check, p: Profile, n: Notice, isPublic: boolean) {
  const reg = !!(n.flags?.speculative || n.flags?.adjusted);
  const months = rank1Months(n.region, reg);
  if (p.accountMonths >= months) c.ok(`통장 가입 ${p.accountMonths}개월 ≥ ${months}개월`);
  else c.fail(`통장 가입 ${p.accountMonths}개월 < ${months}개월 (1순위)`);
  if (isPublic) {
    const cnt = reg ? 24 : n.region && CAPITAL_AREA.includes(n.region) ? 12 : 6;
    if (p.accountPayments >= cnt) c.ok(`납입 ${p.accountPayments}회 ≥ ${cnt}회`);
    else c.fail(`납입 ${p.accountPayments}회 < ${cnt}회 (1순위)`);
  } else {
    const area = minModelArea(n);
    const need = depositRequired(p.region, area ?? 85);
    if (p.accountDeposit >= need) c.ok(`예치금 ${p.accountDeposit}만원 ≥ ${need}만원${area ? '' : ' (85㎡ 이하 가정)'}`);
    else c.fail(`예치금 ${p.accountDeposit}만원 < ${need}만원 (거주지 ${p.region} 기준)`);
  }
  if (n.flags?.speculative && !p.headOfHousehold) c.fail('투기과열지구 1순위는 세대주만 가능');
}

function residency(c: Check, p: Profile, n: Notice) {
  if (!n.region) return;
  const sameRegion = p.region === n.region;
  const capital = CAPITAL_AREA.includes(n.region) && CAPITAL_AREA.includes(p.region);
  if (sameRegion) c.ok(`해당지역(${n.region}) 거주`);
  else if (capital) c.warn(`수도권 기타지역 거주 — 해당지역 우선 후 기타지역으로 청약 가능`);
  else c.warn(`공급지역(${n.region})과 거주지(${p.region}) 다름 — 기타지역 접수 가능 여부 공고문 확인`);
}

export function evaluate(n: Notice, p: Profile, today = new Date(), versions?: Criteria[]): ProgramResult[] {
  CR = criteriaFor(n.dates.announce, versions);
  const out: ProgramResult[] = [];
  const age = ageOf(p, today);
  const adult = age === undefined || age >= 19;

  if (n.category === 'OFFICETEL' || n.category === 'OPT') {
    const c = new Check();
    if (!adult) c.fail('만 19세 이상만 신청 가능');
    else c.ok('청약통장·주택소유 무관, 만 19세 이상 누구나');
    if (n.subType?.includes('민간임대')) c.warn('민간임대는 무주택 요건 등 공고별 상이');
    out.push(c.result('open', '일반 청약(통장 불필요)'));
    return out;
  }

  if (n.category === 'REMNDR') {
    const c = new Check();
    if (!adult) c.fail('만 19세 이상');
    checkHomeless(c, p);
    c.warn('무순위는 지역·거주요건이 공고별로 다름');
    out.push(c.result('remndr', '무순위·잔여세대'));
    return out;
  }

  if (n.category === 'PBL_PVT_RENT') {
    const c = new Check();
    if (!adult) c.fail('만 19세 이상');
    checkHomeless(c, p);
    out.push(c.result('rent', '공공지원 민간임대 일반공급'));
    if (age !== undefined && age >= 19 && age <= 39 && p.marital === 'single') {
      const y = new Check();
      checkHomeless(y, p);
      checkIncome(y, p, { single: 120, dual: 120 }, '청년 특별공급');
      out.push(y.result('rentYouth', '청년 특별공급'));
    }
    if (p.marital === 'married') {
      const y = new Check();
      checkHomeless(y, p);
      checkIncome(y, p, { single: 120, dual: 120 }, '신혼 특별공급');
      out.push(y.result('rentNewlywed', '신혼부부 특별공급'));
    }
    return out;
  }

  if (n.category === 'LH') {
    const c = new Check();
    checkHomeless(c, p);
    const t = `${n.subType ?? ''} ${n.name}`;
    if (/행복주택/.test(t)) {
      if (age !== undefined && age >= 19 && age <= 39) c.ok('청년 계층(만19~39세) 해당');
      else if (p.marital === 'married') c.ok('신혼부부 계층 해당 가능');
      else c.warn('행복주택 대상 계층(청년·신혼·고령자 등) 확인');
      checkIncome(c, p, { single: 100, dual: 120 }, '행복주택(청년 기준)');
    } else if (/국민임대|영구임대/.test(t)) {
      checkIncome(c, p, { single: 70, dual: 70 }, '국민임대');
    } else if (/분양/.test(t)) {
      c.warn('공공분양 — 특별공급 유형별 소득·자산 기준 공고문 확인');
    } else {
      c.warn('공고 유형별 자격 상이 — 공고문 확인');
    }
    checkPublicAssets(c, p);
    out.push(c.result('lh', 'LH 공고 기본 자격'));
    return out;
  }

  // ===== APT (민영 / 국민) =====
  const isPublic = n.subType === '국민';
  const lim = isPublic ? CR.incomeLimits.public : CR.incomeLimits.private;

  // 일반공급 1순위
  {
    const c = new Check();
    if (!adult) c.fail('만 19세 이상');
    rank1(c, p, n, isPublic);
    if (isPublic) checkHomeless(c, p);
    else if (!p.homeless) c.warn('유주택자 — 가점제 불리, 추첨제 물량만 가능(규제지역 제한)');
    residency(c, p, n);
    out.push(c.result('general', '일반공급 1순위'));
  }

  // 신혼부부
  {
    const yrs = marriageYears(p, today);
    if (p.marital === 'married' || p.marital === 'engaged') {
      const c = new Check();
      checkHomeless(c, p);
      if (p.marital === 'engaged') c.warn('예비신혼부부 — 입주 전 혼인신고 필요');
      else if (yrs === undefined) c.warn('혼인일을 입력하세요');
      else if (yrs <= CR.newlywedYears) c.ok(`혼인 ${yrs.toFixed(1)}년 (${CR.newlywedYears}년 이내)`);
      else c.fail(`혼인 ${yrs.toFixed(1)}년 > ${CR.newlywedYears}년`);
      const passed = checkIncome(c, p, lim.newlywed, '신혼부부');
      if (!isPublic && passed === false && p.realEstate <= CR.privateLotteryRealEstateMax) {
        // 소득 초과지만 부동산 기준 충족 → 추첨 물량
        c.reasons = c.reasons.map((r) => (r.includes('신혼부부') && r.startsWith('✗') ? r.replace('✗', '△') + ' → 추첨물량 가능' : r));
        c.verdict = c.reasons.some((r) => r.startsWith('✗')) ? 'no' : 'check';
      }
      if (isPublic) checkPublicAssets(c, p);
      out.push(c.result('newlywed', '신혼부부 특별공급'));
    }
  }

  // 생애최초
  {
    const c = new Check();
    if (p.everOwned) c.fail('세대원 과거 주택소유 이력 있음');
    else c.ok('세대원 전원 평생 무주택');
    checkHomeless(c, p);
    rank1(c, p, n, isPublic);
    if (p.marital === 'single' && p.children === 0) {
      if (p.householdSize === 1) c.warn('1인 가구 — 추첨 물량·소형(전용 60㎡ 이하)만 가능');
      else c.warn('미혼·무자녀 — 혼인 또는 자녀 요건 확인');
    }
    c.warn('5년 이상 소득세 납부 이력 필요');
    const passed = checkIncome(c, p, lim.firstLife, '생애최초');
    if (!isPublic && passed === false && p.realEstate <= CR.privateLotteryRealEstateMax) {
      c.reasons = c.reasons.map((r) => (r.includes('생애최초') && r.startsWith('✗') ? r.replace('✗', '△') + ' → 추첨물량 가능' : r));
      c.verdict = c.reasons.some((r) => r.startsWith('✗')) ? 'no' : 'check';
    }
    if (isPublic) checkPublicAssets(c, p);
    out.push(c.result('firstLife', '생애최초 특별공급'));
  }

  // 다자녀
  if (p.children >= 2) {
    const c = new Check();
    checkHomeless(c, p);
    c.ok(`미성년 자녀 ${p.children}명 (2명 이상)`);
    if (isPublic) {
      checkIncome(c, p, CR.incomeLimits.public.multiChild, '다자녀');
      checkPublicAssets(c, p);
    }
    out.push(c.result('multiChild', '다자녀 특별공급'));
  }

  // 신생아
  if (p.childUnder2) {
    const c = new Check();
    checkHomeless(c, p);
    c.ok('2세 미만 자녀(임신 포함)');
    if (isPublic) {
      checkIncome(c, p, CR.incomeLimits.public.newborn, '신생아');
      checkPublicAssets(c, p);
    } else {
      c.warn('민영은 신혼부부·생애최초 물량 내 신생아 우선공급');
    }
    out.push(c.result('newborn', '신생아 우선·특별공급'));
  }

  // 노부모부양
  if (p.supportsElderly3y) {
    const c = new Check();
    checkHomeless(c, p);
    if (!p.headOfHousehold) c.fail('세대주만 신청 가능');
    else c.ok('세대주');
    rank1(c, p, n, isPublic);
    if (isPublic) {
      checkIncome(c, p, CR.incomeLimits.public.oldParents, '노부모부양');
      checkPublicAssets(c, p);
    }
    out.push(c.result('oldParents', '노부모부양 특별공급'));
  }

  // 청년 (공공분양)
  if (isPublic && age !== undefined && age >= 19 && age <= 39 && p.marital === 'single') {
    const c = new Check();
    checkHomeless(c, p);
    c.ok(`만 ${age}세 미혼`);
    checkIncome(c, p, CR.incomeLimits.public.youth, '청년');
    c.warn('청년 특별공급 자산 기준은 공고문 확인');
    out.push(c.result('youth', '청년 특별공급'));
  }

  return out;
}

export function bestVerdict(results: ProgramResult[]): Verdict {
  if (results.some((r) => r.verdict === 'likely')) return 'likely';
  if (results.some((r) => r.verdict === 'check')) return 'check';
  return 'no';
}

// 매칭 점수: 자격 + 선호지역 + 마감 임박
export function matchScore(n: Notice, p: Profile, today = new Date()): number {
  const rs = evaluate(n, p, today);
  const v = bestVerdict(rs);
  let s = v === 'likely' ? 100 : v === 'check' ? 50 : 0;
  s += rs.filter((r) => r.verdict === 'likely').length * 5;
  if (n.region && p.preferredRegions.includes(n.region)) s += 30;
  if (n.region === p.region) s += 10;
  return s;
}
