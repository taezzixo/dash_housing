// 청약 자격 판정 기준값 — 버전 관리
// ⚠️ 매년 바뀌는 값입니다. 판정은 "가능성" 안내용이며 최종 자격은 반드시 입주자모집공고문으로 확인해야 합니다.
//
// 공고의 모집공고일(announce)에 맞는 버전을 자동 선택합니다 (criteriaFor).
// 기준이 바뀌면 CRITERIA_VERSIONS 맨 앞에 새 버전을 추가하세요. 기존 버전은 지우지 않습니다
// (진행 중인 과거 공고는 과거 기준으로 판정해야 하므로).

export interface Criteria {
  id: string;
  effectiveFrom: string; // 이 날짜 이후 모집공고에 적용 (YYYY-MM-DD)
  checkedAt: string; // 값 확인일
  source: string;
  // 전년도 도시근로자 가구원수별 가구당 월평균소득 100% (만원). 6인 이상은 5인 값 사용(보수적).
  monthlyIncome100: Record<1 | 2 | 3 | 4 | 5, number>;
  incomeLimits: {
    private: { newlywed: Limit; firstLife: Limit };
    public: { newlywed: Limit; firstLife: Limit; newborn: Limit; multiChild: Limit; oldParents: Limit; youth: Limit };
  };
  privateLotteryRealEstateMax: number; // 민영 소득초과 추첨물량 부동산 기준(만원)
  publicAsset: { netAssetsMax: number; carMax: number }; // 공공 자산 기준(만원)
  newlywedYears: number;
}
export interface Limit {
  single: number;
  dual: number;
}

export const CRITERIA_VERSIONS: Criteria[] = [
  {
    id: '2025-income',
    effectiveFrom: '2025-01-01',
    checkedAt: '2026-11-08',
    source: '청약홈·LH 공고문 인용 자료 교차 확인 (공고별 상이할 수 있음, 원문 확정 필요)',
    monthlyIncome100: { 1: 816.8, 2: 816.8, 3: 816.8, 4: 880.2, 5: 932.7 },
    incomeLimits: {
      private: {
        newlywed: { single: 140, dual: 160 },
        firstLife: { single: 160, dual: 160 },
      },
      public: {
        newlywed: { single: 130, dual: 200 },
        firstLife: { single: 130, dual: 130 },
        newborn: { single: 150, dual: 200 },
        multiChild: { single: 120, dual: 120 },
        oldParents: { single: 120, dual: 120 },
        youth: { single: 140, dual: 140 },
      },
    },
    privateLotteryRealEstateMax: 33100,
    publicAsset: { netAssetsMax: 36100, carMax: 3803 },
    newlywedYears: 7,
  },
];

/** 모집공고일 기준으로 적용할 기준 버전 선택 (없으면 최신) */
export function criteriaFor(announce?: string, versions: Criteria[] = CRITERIA_VERSIONS): Criteria {
  const sorted = [...versions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  if (!announce) return sorted[0];
  return sorted.find((v) => v.effectiveFrom <= announce) ?? sorted[sorted.length - 1];
}

export const LATEST = criteriaFor();
export const CRITERIA_AS_OF = LATEST.checkedAt;

export function income100(householdSize: number, c: Criteria = LATEST): number {
  const n = Math.max(1, Math.min(5, Math.round(householdSize))) as 1 | 2 | 3 | 4 | 5;
  return c.monthlyIncome100[n];
}

export const CAPITAL_AREA = ['서울', '경기', '인천'];
export const METRO_CITIES = ['부산', '대구', '광주', '대전', '울산'];

// 민영주택 청약 예치금 기준 (만원) — 거주지 기준
// [85㎡ 이하, 102㎡ 이하, 135㎡ 이하, 모든 면적]
export const DEPOSIT_TABLE: Record<'seoulBusan' | 'metro' | 'other', number[]> = {
  seoulBusan: [300, 600, 1000, 1500],
  metro: [250, 400, 700, 1000],
  other: [200, 300, 400, 500],
};

export function depositRequired(userRegion: string, areaM2: number): number {
  const key = userRegion === '서울' || userRegion === '부산'
    ? 'seoulBusan'
    : METRO_CITIES.includes(userRegion) || userRegion === '인천'
      ? 'metro'
      : 'other';
  const row = DEPOSIT_TABLE[key];
  if (areaM2 <= 85) return row[0];
  if (areaM2 <= 102) return row[1];
  if (areaM2 <= 135) return row[2];
  return row[3];
}

// 1순위 청약통장 가입기간(개월)
export function rank1Months(noticeRegion: string | undefined, speculativeOrAdjusted: boolean): number {
  if (speculativeOrAdjusted) return 24;
  if (noticeRegion && CAPITAL_AREA.includes(noticeRegion)) return 12;
  return 6;
}

// ---- 민영주택 청약 가점제 배점표 (F4) — 버전 관리 ----
// 근거: 「주택공급에 관한 규칙」 별표 1 (가점제 적용기준). 84점 만점.
//  - 무주택기간(32점): 1년 미만 2점, 이후 1년마다 2점 추가, 15년 이상 32점. 유주택자 0점.
//    기간은 만 30세가 된 날과 혼인신고일 중 빠른 날부터 계산하고, 주택을 처분했다면 처분일 이후부터 계산.
//  - 부양가족수(35점): 0명 5점, 1명마다 5점 추가, 6명 이상 35점.
//  - 청약통장 가입기간(17점): 6개월 미만 1점, 6개월~1년 미만 2점, 이후 1년마다 1점 추가, 15년 이상 17점.
// ⚠️ 원문 검증 필요: 배우자 통장 가입기간 가산(기간의 50%, 최대 3점, 2024-03-25 시행), 미성년 가입기간 인정 상한(최대 5년),
//    직계존속 부양 인정 요건(3년 이상 같은 세대 등)은 계산기에 반영하지 않았다. 최종 가점은 청약홈 가점 계산기와 공고문으로 확인.
// 배점이 바뀌면 GAJEOM_VERSIONS 맨 앞에 새 버전을 추가하고 기존 버전은 지우지 않는다.
export interface GajeomTable {
  id: string;
  effectiveFrom: string;
  checkedAt: string;
  source: string;
  homeless: { max: number; base: number; perYear: number }; // base: 1년 미만 점수
  dependents: { max: number; base: number; perPerson: number }; // base: 0명 점수
  account: { max: number; under6m: number; under1y: number; perYear: number }; // 1년 이상: under1y + perYear × 경과연수
  total: number;
}

export const GAJEOM_VERSIONS: GajeomTable[] = [
  {
    id: '2024-rule',
    effectiveFrom: '2024-03-25',
    checkedAt: '2026-11-10',
    source: '주택공급에 관한 규칙 별표 1 (원문 재확인 필요)',
    homeless: { max: 32, base: 2, perYear: 2 },
    dependents: { max: 35, base: 5, perPerson: 5 },
    account: { max: 17, under6m: 1, under1y: 2, perYear: 1 },
    total: 84,
  },
];

export function gajeomTableFor(announce?: string): GajeomTable {
  const sorted = [...GAJEOM_VERSIONS].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  if (!announce) return sorted[0];
  return sorted.find((v) => v.effectiveFrom <= announce) ?? sorted[sorted.length - 1];
}
