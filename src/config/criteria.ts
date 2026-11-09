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
