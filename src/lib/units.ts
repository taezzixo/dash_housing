import type { NoticeModel, ProgramResult, SpecialKind, Verdict } from '../types.ts';
import { exclusiveArea } from './filters.ts';

// ---- 공급 타입·평형 (공고 상세) ----
export const PYEONG = 3.3058; // 1평 = 3.3058㎡

/** 버튼 이름: 관리자 label → 주택형 코드('084.9904A' → '84A') → 원래 type */
export function typeLabel(m: NoticeModel): string {
  if (m.label) return m.label;
  const t = m.type.match(/^0*(\d{2,3})\.\d+\s*([A-Za-z]*)/);
  return t ? `${t[1]}${t[2].toUpperCase()}` : m.type;
}

export interface UnitStats {
  households?: number; // 일반 + 특별공급
  exclusive?: number; // 전용면적
  supply?: number; // 공급면적 (전용 + 주거공용)
  common?: number; // 주거공용 = 공급 - 전용
  contract?: number; // 계약면적
  pyeong?: number; // 공급면적 기준 평형
  pricePerPyeong?: number; // 3.3㎡당 분양가(만원)
}

export function unitStats(m: NoticeModel): UnitStats {
  const exclusive = m.exclusiveArea ?? exclusiveArea(m);
  // 주택형 코드에 전용면적이 있으면 area는 공급면적. 코드가 없으면 area가 무엇인지 알 수 없어 공급면적으로 쓰지 않는다
  const supply = exclusive !== undefined && m.area !== undefined && m.area > exclusive + 0.01 ? m.area : undefined;
  const households = m.general !== undefined || m.special !== undefined ? (m.general ?? 0) + (m.special ?? 0) : undefined;
  return {
    households,
    exclusive,
    supply,
    common: supply !== undefined && exclusive !== undefined ? supply - exclusive : undefined,
    contract: m.contractArea,
    pyeong: supply ? Math.round(supply / PYEONG) : exclusive ? Math.round(exclusive / PYEONG) : undefined,
    pricePerPyeong: m.priceMax && supply ? Math.round(m.priceMax / (supply / PYEONG)) : undefined,
  };
}

/** 자격 판정 프로그램 → 주택형별 공급 세대수 항목 */
const PROGRAM_SUPPLY: Record<string, 'general' | SpecialKind> = {
  general: 'general',
  open: 'general',
  remndr: 'general',
  rent: 'general',
  youthHousing: 'general',
  lh: 'general',
  newlywed: 'newlywed',
  rentNewlywed: 'newlywed',
  firstLife: 'firstLife',
  multiChild: 'multiChild',
  newborn: 'newborn',
  oldParents: 'oldParents',
  youth: 'youth',
  rentYouth: 'youth',
};

export interface MyUnit {
  key: string;
  label: string;
  verdict: Verdict;
  count?: number; // 이 주택형에서 해당 공급의 세대수 (모르면 undefined)
}

/** 이 주택형에서 내가 지원할 수 있는(충족·추가확인) 공급 유형별 세대수 */
export function myUnits(m: NoticeModel, results: ProgramResult[]): MyUnit[] {
  return results
    .filter((r) => r.verdict !== 'no' && PROGRAM_SUPPLY[r.key])
    .map((r) => {
      const s = PROGRAM_SUPPLY[r.key];
      // 특별공급 내역이 있는데 해당 항목이 없으면 이 주택형엔 그 물량이 없다(0). 내역 자체가 없으면 모름
      const count = s === 'general' ? m.general : m.specialBreakdown ? (m.specialBreakdown[s] ?? 0) : undefined;
      return { key: r.key, label: r.label, verdict: r.verdict, count };
    })
    .filter((u) => u.count === undefined || u.count > 0);
}

/** 만원 → '6억 9,100만원' */
export function won(man: number): string {
  const eok = Math.floor(man / 10000);
  const rest = Math.round(man % 10000);
  if (!eok) return `${rest.toLocaleString()}만원`;
  return rest ? `${eok}억 ${rest.toLocaleString()}만원` : `${eok}억원`;
}
