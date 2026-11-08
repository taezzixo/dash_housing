// 청약 자격 판정 기준값
// ⚠️ 매년 바뀌는 값입니다. 판정은 "가능성" 안내용이며 최종 자격은 반드시 입주자모집공고문으로 확인해야 합니다.
// 값 확인일: 2026-11-08 (출처: 청약홈·LH 공고문 인용 자료 교차 확인, 공고별 상이할 수 있음)

export const CRITERIA_AS_OF = '2026-11-08';

// 전년도 도시근로자 가구원수별 가구당 월평균소득 100% (만원)
// 2025년도 값 (2026년 공고에 주로 적용). 6인 이상은 공고문 확인 필요 → 5인 값 사용(보수적).
export const MONTHLY_INCOME_100: Record<number, number> = {
  1: 816.8, // 3인 이하 동일 적용(민영 특공 기준)
  2: 816.8,
  3: 816.8,
  4: 880.2,
  5: 932.7,
};

export function income100(householdSize: number): number {
  const n = Math.max(1, Math.min(5, Math.round(householdSize)));
  return MONTHLY_INCOME_100[n];
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

// 특별공급 소득 기준 (도시근로자 월평균소득 대비 %)
export const INCOME_LIMITS = {
  private: {
    newlywed: { single: 140, dual: 160 }, // 우선 100/120, 일반 140/160
    firstLife: { single: 160, dual: 160 }, // 우선 130, 일반 160
  },
  public: {
    newlywed: { single: 130, dual: 200 },
    firstLife: { single: 130, dual: 130 },
    newborn: { single: 150, dual: 200 },
    multiChild: { single: 120, dual: 120 },
    oldParents: { single: 120, dual: 120 },
    youth: { single: 140, dual: 140 },
  },
};

// 소득 기준 초과 시 민영 추첨 물량 부동산 자산 기준 (만원)
export const PRIVATE_LOTTERY_REALESTATE_MAX = 33100;

// 공공(국민주택) 자산 기준 (만원)
export const PUBLIC_ASSET = {
  netAssetsMax: 36100,
  carMax: 3803,
};

// 신혼부부 혼인기간(년)
export const NEWLYWED_YEARS = 7;
