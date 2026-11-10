import { useState } from 'react';
import type { Notice, ProgramResult } from '../types.ts';
import { myUnits, typeLabel, unitStats, won, type UnitStats } from '../lib/units.ts';

const SB_LABEL: Record<string, string> = {
  newlywed: '신혼부부', firstLife: '생애최초', multiChild: '다자녀', oldParents: '노부모', youth: '청년', newborn: '신생아', institution: '기관추천', etc: '기타',
};
const V_ICON = { likely: '✓', check: '△', no: '✗' } as const;
const m2 = (x?: number) => (x === undefined ? '-' : `${x.toFixed(2)}㎡`);

interface Props {
  notice: Notice;
  results: ProgramResult[];
  hasProfile: boolean;
  onEditProfile: () => void;
}

// 공급 타입·평형: 평형 버튼 → 세대수·면적·금액, 내 조건으로 지원 가능한 공급의 세대수, 평면도
export function UnitTypes({ notice: n, results, hasProfile, onEditProfile }: Props) {
  const models = n.models ?? [];
  const [sel, setSel] = useState(0);
  if (!models.length) {
    return (
      <section>
        <h3>공급 타입 · 평형</h3>
        <p className="small muted">
          이 공고는 주택형별 정보(면적·세대수·금액)를 자동으로 받지 못했습니다{n.totalUnits ? ` (전체 ${n.totalUnits.toLocaleString()}세대)` : ''}.
          {' '}모집공고문의 공급 내역 표에서 확인하세요.
        </p>
        <SourceLinks n={n} />
      </section>
    );
  }
  const i = Math.min(sel, models.length - 1);
  const m = models[i];
  const s = unitStats(m);
  const mine = hasProfile ? myUnits(m, results) : [];
  const isRent = m.deposit !== undefined || m.rent !== undefined;

  return (
    <section className="units">
      <h3>공급 타입 · 평형 <small className="muted">{models.length}개 타입</small></h3>

      {hasProfile && <MySummary models={models} results={results} />}

      <div className="unit-tabs" role="tablist" aria-label="평형 선택">
        {models.map((x, k) => {
          const st = unitStats(x);
          return (
            <button key={x.type + k} role="tab" aria-selected={k === i} className={k === i ? 'on' : ''} onClick={() => setSel(k)}>
              <b>{typeLabel(x)}</b>
              {st.pyeong !== undefined && <small>{st.pyeong}평</small>}
            </button>
          );
        })}
      </div>

      <div className="unit-stats">
        <Stat label="세대수" value={s.households !== undefined ? `${s.households.toLocaleString()}세대` : '-'} />
        <Stat label="전용면적" value={m2(s.exclusive)} />
        <Stat label="주거공용" value={m2(s.common)} />
        <Stat label="공급면적" value={m2(s.supply)} />
        {s.contract !== undefined && <Stat label="계약면적" value={m2(s.contract)} />}
        {isRent ? (
          <>
            {m.deposit !== undefined && <Stat label="임대보증금" value={won(m.deposit)} />}
            {m.rent !== undefined && <Stat label="월 임대료" value={won(m.rent)} />}
          </>
        ) : (
          <Stat label="분양가(최고)" value={m.priceMax ? won(m.priceMax) : '-'} sub={s.pricePerPyeong ? `3.3㎡당 약 ${s.pricePerPyeong.toLocaleString()}만원` : undefined} />
        )}
      </div>

      <div className="unit-supply">
        <span className="unit-k">공급 내역</span>
        <span className="chip-row">
          {m.general !== undefined && <span className="tag soft">일반 {m.general}</span>}
          {Object.entries(m.specialBreakdown ?? {}).filter(([, v]) => v).map(([k, v]) => <span key={k} className="tag soft">{SB_LABEL[k] ?? k} {v}</span>)}
          {m.general === undefined && !m.specialBreakdown && m.special !== undefined && <span className="tag soft">특별공급 {m.special}</span>}
        </span>
      </div>
      {hasProfile ? (
        <div className="unit-mine">
          <span className="unit-k">내 조건으로 지원 가능</span>
          {mine.length ? (
            <ul>
              {mine.map((u) => (
                <li key={u.key} className={u.verdict}>
                  <span className={`pill ${u.verdict}`}>{V_ICON[u.verdict]}</span> {u.label}
                  <b>{u.count !== undefined ? `${u.count.toLocaleString()}세대` : '세대수 공고문 확인'}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">이 타입에서 내 조건으로 지원할 수 있는 공급이 없습니다.</p>
          )}
        </div>
      ) : (
        <button className="btn small-btn" onClick={onEditProfile}>내 조건을 넣으면 이 타입에서 지원 가능한 세대수를 보여드려요</button>
      )}

      <Plan n={n} label={typeLabel(m)} planImage={m.planImage} planSource={m.planSource} stats={s} />
      <p className="disclaimer">
        청약홈 주택형 정보 기준 참고용입니다. 주택형별 공급 세대수·금액·면적은 정정될 수 있으니 반드시 모집공고문으로 확인하세요.
        {n.url && <> <a href={n.url} target="_blank" rel="noreferrer">공고 원문 ↗</a></>}
      </p>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="unit-stat">
      <small>{label}</small>
      <b>{value}</b>
      {sub && <small className="muted">{sub}</small>}
    </div>
  );
}

/** 모든 타입을 한눈에: 타입별 내 공급 세대수 */
function MySummary({ models, results }: { models: Notice['models'] & object; results: ProgramResult[] }) {
  const rows = models.map((m) => ({ m, mine: myUnits(m, results) })).filter((r) => r.mine.length);
  if (!rows.length) return <p className="small muted unit-sum-empty">내 조건으로 지원할 수 있는 공급이 이 공고에 없습니다 (참고용).</p>;
  return (
    <div className="unit-sum">
      <span className="unit-k">내 공급 유형별 물량</span>
      <ul>
        {rows.map(({ m, mine }) => (
          <li key={m.type}>
            <b>{typeLabel(m)}</b>
            <span>{mine.map((u) => `${u.label.replace(/ ?(특별공급|우선·특별공급|1순위)$/, '')} ${u.count ?? '?'}`).join(' · ')}</span>
            <span className="muted">{m.priceMax ? won(m.priceMax) : m.deposit !== undefined ? `보증금 ${won(m.deposit)}` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceLinks({ n }: { n: Notice }) {
  if (!n.homepage && !n.url) return null;
  return (
    <p className="unit-links small">
      {n.homepage && <a href={n.homepage} target="_blank" rel="noreferrer">단지 홈페이지에서 평면도 보기 ↗</a>}
      {n.url && <a href={n.url} target="_blank" rel="noreferrer">모집공고 원문 ↗</a>}
    </p>
  );
}

/** 평면도: 관리자가 등록한 이미지가 있으면 표시, 없으면 면적 구성 그림 + 홈페이지·공고문 링크 */
function Plan({ n, label, planImage, planSource, stats }: { n: Notice; label: string; planImage?: string; planSource?: string; stats: UnitStats }) {
  const [broken, setBroken] = useState(false);
  if (planImage && !broken) {
    return (
      <figure className="unit-plan">
        <img src={planImage} alt={`${n.complexName ?? n.name} ${label} 평면도`} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        <figcaption className="small muted">
          {label} 평면도 · 출처 {planSource ? <a href={planSource} target="_blank" rel="noreferrer">{new URL(planSource).hostname} ↗</a> : '단지 공급 자료'}
        </figcaption>
      </figure>
    );
  }
  const total = stats.contract ?? stats.supply;
  return (
    <div className="unit-plan empty">
      {stats.exclusive && total ? (
        <div className="area-viz" aria-label={`전용 ${stats.exclusive.toFixed(1)}㎡, ${stats.contract ? '계약' : '공급'} ${total.toFixed(1)}㎡`}>
          <div className="area-outer">
            <div className="area-inner" style={{ width: `${Math.sqrt(stats.exclusive / total) * 100}%`, height: `${Math.sqrt(stats.exclusive / total) * 100}%` }}>
              <span>전용 {stats.exclusive.toFixed(1)}㎡</span>
            </div>
            <span className="area-outer-label">{stats.contract ? '계약' : '공급'} {total.toFixed(1)}㎡</span>
          </div>
        </div>
      ) : null}
      <p className="small muted">{label} 평면도 이미지는 아직 등록되지 않았습니다. 위 그림은 면적 비율입니다.</p>
      <SourceLinks n={n} />
    </div>
  );
}
