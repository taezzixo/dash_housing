// 수집 스크립트(scripts/fetch-notices.mjs)가 만드는 정규화된 공고 형식

export type Category =
  | 'APT' // APT 분양 (민영/국민)
  | 'OFFICETEL' // 오피스텔/도시형/민간임대/생활숙박시설
  | 'REMNDR' // APT 무순위/잔여세대
  | 'PBL_PVT_RENT' // 공공지원 민간임대
  | 'OPT' // 임의공급
  | 'LH' // LH 분양·임대 공고
  | 'YOUTH'; // 서울시 청년안심주택

export const CATEGORY_LABEL: Record<Category, string> = {
  APT: 'APT 분양',
  OFFICETEL: '오피스텔·도시형',
  REMNDR: '무순위·잔여세대',
  PBL_PVT_RENT: '공공지원 민간임대',
  OPT: '임의공급',
  LH: 'LH 분양·임대',
  YOUTH: '청년안심주택',
};

export interface NoticeModel {
  type: string; // 주택형 (예: 084.9876A)
  area?: number; // 공급/전용면적 ㎡
  general?: number; // 일반공급 세대수
  special?: number; // 특별공급 세대수 합계
  specialBreakdown?: Partial<Record<SpecialKind, number>>;
  priceMax?: number; // 분양최고금액(만원)
}

export type SpecialKind =
  | 'newlywed'
  | 'firstLife'
  | 'multiChild'
  | 'oldParents'
  | 'youth'
  | 'newborn'
  | 'institution'
  | 'etc';

export interface NoticeDates {
  announce?: string; // 모집공고일
  specialStart?: string;
  specialEnd?: string;
  rank1Start?: string; // 1순위 해당지역 (APT)
  rank1End?: string;
  rank2Start?: string;
  rank2End?: string;
  receiptStart?: string; // 청약접수 시작 (전체)
  receiptEnd?: string;
  winner?: string; // 당첨자 발표
  contractStart?: string;
  contractEnd?: string;
}

export interface Notice {
  id: string;
  source: 'applyhome' | 'lh' | 'youth-seoul' | 'manual';
  category: Category;
  subType?: string; // 민영/국민/오피스텔/행복주택 등
  name: string;
  address?: string;
  region?: string; // 공급지역명 (서울, 경기 ...)
  lat?: number;
  lng?: number;
  geoPrecision?: 'address' | 'district' | 'region'; // 위치 신뢰도: 주소/시군구/시도
  totalUnits?: number;
  dates: NoticeDates;
  flags?: {
    speculative?: boolean; // 투기과열지구
    adjusted?: boolean; // 조정대상지역
    priceCap?: boolean; // 분양가상한제
    publicHouseZone?: boolean; // 공공주택지구
  };
  models?: NoticeModel[];
  url?: string; // 공고 원문 / 청약홈 URL
  homepage?: string;
  phone?: string;
  builder?: string;
  developer?: string;
  moveIn?: string; // 입주예정월 YYYYMM
  status?: string; // LH 공고상태
  corrected?: boolean; // 정정 공고
  firstSeen?: string; // 최초 수집일 (YYYY-MM-DD)
  changes?: NoticeChange[]; // 수집 간 일정 변경 이력
  removedAt?: string; // 진행 중이던 공고가 출처에서 사라진 날 (취소·삭제 의심)
  competition?: Competition[]; // 1순위 경쟁률 (접수 마감 APT)
  scores?: ScoreStat[]; // 당첨가점
  manual?: boolean; // 관리자 수동 등록
  note?: string; // 관리자 메모
}

export interface NoticeChange {
  at: string; // 감지일
  field: keyof NoticeDates;
  from?: string;
  to?: string;
}

export interface NoticeFile {
  generatedAt: string;
  sample: boolean;
  sources: string[];
  notices: Notice[];
}

// 사용자 프로필 (브라우저 localStorage에만 저장)
export interface Profile {
  birthYear?: number;
  marital: 'single' | 'married' | 'engaged';
  marriageDate?: string; // YYYY-MM-DD
  householdSize: number;
  children: number;
  childUnder2: boolean; // 2세 미만 자녀(임신 포함)
  supportsElderly3y: boolean; // 만65세 이상 직계존속 3년 이상 부양
  homeless: boolean; // 세대 전원 무주택
  everOwned: boolean; // 세대원 전원 과거 주택 소유 이력
  headOfHousehold: boolean;
  region: string; // 거주 시·도 (서울, 경기 ...)
  residenceYears: number; // 현 거주 시·도 연속 거주 기간(년)
  accountMonths: number; // 청약통장 가입 개월
  accountPayments: number; // 납입 인정 횟수
  accountDeposit: number; // 예치금(만원)
  monthlyIncome: number; // 세대 월평균소득(만원)
  dualIncome: boolean;
  realEstate: number; // 부동산 가액(만원)
  carValue: number; // 자동차 가액(만원)
  netAssets: number; // 총자산-부채(만원)
  preferredRegions: string[];
  saved: string[]; // 관심 공고 id
}

export type Verdict = 'likely' | 'check' | 'no';

export interface ProgramResult {
  key: string;
  label: string;
  verdict: Verdict;
  reasons: string[];
}

export interface Competition {
  type: string;
  supply?: number;
  local?: { req: number; rate?: number }; // 1순위 해당지역
  other?: { req: number; rate?: number }; // 1순위 기타지역(합산)
}
export interface ScoreStat {
  type: string;
  reside?: string;
  min?: number;
  max?: number;
  avg?: number;
}

// 관리자 수동 보정 (public/data/overrides.json) — GitHub에서 편집
export interface Overrides {
  hide?: string[]; // 숨길 공고 id
  patch?: Record<string, Partial<Pick<Notice, 'lat' | 'lng' | 'geoPrecision' | 'address' | 'name' | 'url'>> & { note?: string }>;
  manual?: Notice[]; // 수동 등록 공고 (SH·GH 등)
}

export interface RunLog {
  last: Run;
  history: Run[];
}
export interface Run {
  runAt: string;
  durationSec: number;
  ok: boolean;
  total: number;
  changedToday?: number;
  removedToday?: number;
  geo?: Record<string, number>;
  sources: { id: string; label: string; ok: boolean; count: number; error?: string; ms?: number }[];
}
