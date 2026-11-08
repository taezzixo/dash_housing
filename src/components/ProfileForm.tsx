import type { Profile } from '../types.ts';
import { REGIONS } from '../lib/profile.ts';
import { income100, CRITERIA_AS_OF } from '../config/criteria.ts';

interface Props {
  profile: Profile;
  persisted: boolean;
  onChange: (p: Profile) => void;
  onPersist: (on: boolean) => void;
}

export function ProfileForm({ profile: p, persisted, onChange, onPersist }: Props) {
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => onChange({ ...p, [k]: v });
  const num = (k: keyof Profile) => ({
    type: 'number' as const,
    inputMode: 'numeric' as const,
    min: 0,
    value: (p[k] as number | undefined) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, (e.target.value === '' ? undefined : Number(e.target.value)) as never),
  });
  const pct = p.monthlyIncome ? Math.round((p.monthlyIncome / income100(p.householdSize)) * 100) : null;

  return (
    <div className="profile">
      <div className="privacy">
        <label className="switch">
          <input type="checkbox" checked={persisted} onChange={(e) => onPersist(e.target.checked)} />
          <span>이 기기에 내 조건 저장</span>
        </label>
        <p className="muted">입력한 정보는 서버로 전송되지 않고 이 브라우저에서만 쓰입니다.</p>
      </div>

      <fieldset>
        <legend>기본 정보</legend>
        <label>출생연도<input {...num('birthYear')} placeholder="예: 1994" /></label>
        <label>거주지(시·도)
          <select value={p.region} onChange={(e) => set('region', e.target.value)}>{REGIONS.map((r) => <option key={r}>{r}</option>)}</select>
        </label>
        <label>현 거주지 연속 거주(년)<input {...num('residenceYears')} /></label>
        <label>혼인 상태
          <select value={p.marital} onChange={(e) => set('marital', e.target.value as Profile['marital'])}>
            <option value="single">미혼</option><option value="engaged">예비신혼</option><option value="married">기혼</option>
          </select>
        </label>
        {p.marital === 'married' && <label>혼인신고일<input type="date" value={p.marriageDate ?? ''} onChange={(e) => set('marriageDate', e.target.value)} /></label>}
        <label>세대원 수<input {...num('householdSize')} min={1} /></label>
        <label>미성년 자녀 수<input {...num('children')} /></label>
        <label className="check"><input type="checkbox" checked={p.childUnder2} onChange={(e) => set('childUnder2', e.target.checked)} />2세 미만 자녀 또는 임신 중</label>
        <label className="check"><input type="checkbox" checked={p.supportsElderly3y} onChange={(e) => set('supportsElderly3y', e.target.checked)} />만 65세 이상 부모님 3년 이상 부양</label>
      </fieldset>

      <fieldset>
        <legend>주택 소유</legend>
        <label className="check"><input type="checkbox" checked={p.homeless} onChange={(e) => set('homeless', e.target.checked)} />세대 전원 현재 무주택</label>
        <label className="check"><input type="checkbox" checked={p.everOwned} onChange={(e) => set('everOwned', e.target.checked)} />세대원 중 과거 주택 소유 이력 있음</label>
        <label className="check"><input type="checkbox" checked={p.headOfHousehold} onChange={(e) => set('headOfHousehold', e.target.checked)} />본인이 세대주</label>
      </fieldset>

      <fieldset>
        <legend>청약통장</legend>
        <label>가입 기간(개월)<input {...num('accountMonths')} /></label>
        <label>납입 인정 횟수<input {...num('accountPayments')} /></label>
        <label>예치금(만원)<input {...num('accountDeposit')} /></label>
      </fieldset>

      <fieldset>
        <legend>소득·자산 (만원)</legend>
        <label>세대 월평균 소득<input {...num('monthlyIncome')} />
          {pct !== null && <small className="muted">도시근로자 월평균소득의 약 {pct}%</small>}
        </label>
        <label className="check"><input type="checkbox" checked={p.dualIncome} onChange={(e) => set('dualIncome', e.target.checked)} />맞벌이</label>
        <label>부동산 가액<input {...num('realEstate')} /></label>
        <label>자동차 가액<input {...num('carValue')} /></label>
        <label>순자산(자산−부채)<input {...num('netAssets')} /></label>
      </fieldset>

      <fieldset>
        <legend>관심 지역</legend>
        <div className="chips">
          {REGIONS.map((r) => {
            const on = p.preferredRegions.includes(r);
            return (
              <button key={r} type="button" className={on ? 'chip on' : 'chip'}
                onClick={() => set('preferredRegions', on ? p.preferredRegions.filter((x) => x !== r) : [...p.preferredRegions, r])}>
                {r}
              </button>
            );
          })}
        </div>
      </fieldset>
      <p className="disclaimer">판정 기준값 확인일 {CRITERIA_AS_OF}. 소득·자산 기준은 매년 바뀌며 공고별로 다를 수 있습니다.</p>
    </div>
  );
}
