import type { Notice, ProgramResult } from '../types.ts';

// 공고 유형·지원 가능 프로그램에 따른 제출서류 체크리스트
// 일반적인 서류 기준이며, 실제 서류는 공고문의 "당첨자 제출서류" 항목을 따라야 합니다.

export interface ChecklistItem {
  id: string;
  label: string;
  where: string; // 발급처
  note?: string;
}

const COMMON: ChecklistItem[] = [
  { id: 'id', label: '신분증', where: '본인 지참' },
  { id: 'resident', label: '주민등록표등본 (세대주·전입일 포함, 상세)', where: '정부24' },
  { id: 'resident2', label: '주민등록표초본 (주소변동 이력 포함)', where: '정부24', note: '거주기간 확인용' },
  { id: 'family', label: '가족관계증명서 (상세)', where: '대법원 전자가족관계등록시스템' },
  { id: 'seal', label: '인감증명서 또는 본인서명사실확인서', where: '주민센터', note: '계약 시' },
];

const BY_PROGRAM: Record<string, ChecklistItem[]> = {
  general: [
    { id: 'rank', label: '청약통장 순위(가입)확인서', where: '청약홈' },
    { id: 'homeless', label: '무주택 서약서', where: '견본주택/사업주체 양식' },
  ],
  newlywed: [
    { id: 'marriage', label: '혼인관계증명서 (상세)', where: '대법원 전자가족관계등록시스템' },
    { id: 'income', label: '소득증빙: 근로소득원천징수영수증 또는 소득금액증명원', where: '홈택스/회사' },
    { id: 'health', label: '건강보험자격득실확인서', where: '국민건강보험공단' },
    { id: 'pregnancy', label: '임신진단서 또는 출산증명서 (해당 시)', where: '병원' },
  ],
  firstLife: [
    { id: 'tax5', label: '5개년도 소득세 납부 입증서류 (소득금액증명원 등)', where: '홈택스' },
    { id: 'income', label: '소득증빙: 근로소득원천징수영수증 또는 소득금액증명원', where: '홈택스/회사' },
    { id: 'health', label: '건강보험자격득실확인서', where: '국민건강보험공단' },
    { id: 'rank', label: '청약통장 순위(가입)확인서', where: '청약홈' },
  ],
  multiChild: [
    { id: 'family', label: '가족관계증명서 (자녀 확인)', where: '대법원 전자가족관계등록시스템' },
    { id: 'pregnancy', label: '임신진단서·입양관계증명서 (해당 시)', where: '병원/주민센터' },
  ],
  newborn: [
    { id: 'birth', label: '출생증명서 또는 임신진단서', where: '병원' },
    { id: 'income', label: '소득증빙 서류', where: '홈택스/회사' },
  ],
  oldParents: [
    { id: 'parentResident', label: '피부양 직계존속 주민등록표초본 (3년 이상 동일 등재 확인)', where: '정부24' },
    { id: 'parentFamily', label: '직계존속 가족관계증명서', where: '대법원 전자가족관계등록시스템' },
  ],
  youth: [
    { id: 'income', label: '소득증빙 서류', where: '홈택스/회사' },
    { id: 'asset', label: '자산 확인 동의서(공공)', where: '사업주체 양식' },
  ],
  lh: [
    { id: 'consent', label: '개인정보 수집·이용 및 금융정보 제공 동의서', where: 'LH 청약플러스 양식' },
    { id: 'income', label: '소득·자산 확인 서류', where: 'LH 안내 기준' },
  ],
  rent: [
    { id: 'homeless', label: '무주택 서약서', where: '사업주체 양식' },
  ],
  rentYouth: [{ id: 'income', label: '소득증빙 서류', where: '홈택스/회사' }],
  rentNewlywed: [
    { id: 'marriage', label: '혼인관계증명서 (상세)', where: '대법원 전자가족관계등록시스템' },
    { id: 'income', label: '소득증빙 서류', where: '홈택스/회사' },
  ],
  remndr: [{ id: 'homeless', label: '무주택 서약서', where: '사업주체 양식' }],
  open: [],
};

export function buildChecklist(n: Notice, results: ProgramResult[]): ChecklistItem[] {
  const map = new Map<string, ChecklistItem>();
  for (const it of COMMON) map.set(it.id, it);
  const active = results.filter((r) => r.verdict !== 'no');
  for (const r of active) for (const it of BY_PROGRAM[r.key] ?? []) if (!map.has(it.id)) map.set(it.id, it);
  if (n.category === 'APT' && n.subType === '국민') {
    map.set('assetConsent', { id: 'assetConsent', label: '금융정보 등 제공 동의서 (소득·자산 조회)', where: '사업주체 양식' });
  }
  return [...map.values()];
}
