import type { Profile } from '../types.ts';

const KEY = 'dash_housing.profile.v1';

export const DEFAULT_PROFILE: Profile = {
  marital: 'single',
  householdSize: 1,
  children: 0,
  childUnder2: false,
  supportsElderly3y: false,
  homeless: true,
  everOwned: false,
  headOfHousehold: true,
  region: '서울',
  residenceYears: 0,
  accountMonths: 0,
  accountPayments: 0,
  accountDeposit: 0,
  monthlyIncome: 0,
  dualIncome: false,
  realEstate: 0,
  carValue: 0,
  netAssets: 0,
  preferredRegions: [],
  saved: [],
};

// 개인정보는 서버로 보내지 않고 이 브라우저에만 저장 (사용자가 "저장"을 켠 경우에만)
export function loadProfile(): { profile: Profile; persisted: boolean } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { profile: { ...DEFAULT_PROFILE, ...JSON.parse(raw) }, persisted: true };
  } catch {
    /* 저장소 접근 불가 */
  }
  return { profile: DEFAULT_PROFILE, persisted: false };
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function clearProfile() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const REGIONS = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
