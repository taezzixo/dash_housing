import { useEffect, useState } from 'react';
import type { Notice, Profile } from '../types.ts';
import { CATEGORY_LABEL } from '../types.ts';
import { evaluate } from '../lib/eligibility.ts';
import { buildChecklist } from '../lib/checklist.ts';
import { buildIcs, dday, eventsOf } from '../lib/schedule.ts';

const VERDICT_LABEL = { likely: '가능성 높음', check: '확인 필요', no: '어려움' } as const;
const SB_LABEL: Record<string, string> = {
  newlywed: '신혼', firstLife: '생애최초', multiChild: '다자녀', oldParents: '노부모', youth: '청년', newborn: '신생아', institution: '기관추천', etc: '기타',
};

function useChecked(id: string) {
  const key = `dash_housing.check.${id}`;
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '{}');
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(done));
    } catch {
      /* ignore */
    }
  }, [key, done]);
  return [done, setDone] as const;
}

export function downloadIcs(notices: Notice[]) {
  const blob = new Blob([buildIcs(notices, location.href)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = notices.length === 1 ? `${notices[0].name}.ics` : '내청약일정.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

interface Props {
  notice: Notice;
  profile: Profile;
  hasProfile: boolean;
  today: string;
  saved: boolean;
  onToggleSave: () => void;
  onClose: () => void;
  onEditProfile: () => void;
}

export function NoticeDetail({ notice: n, profile, hasProfile, today, saved, onToggleSave, onClose, onEditProfile }: Props) {
  const results = evaluate(n, profile);
  const checklist = buildChecklist(n, results);
  const [done, setDone] = useChecked(n.id);
  const events = eventsOf(n);

  return (
    <aside className="detail" aria-label="공고 상세">
      <div className="detail-head">
        <button className="icon-btn" onClick={onClose} aria-label="닫기">←</button>
        <div>
          <div className="tags">
            <span className="tag">{CATEGORY_LABEL[n.category]}</span>
            {n.subType && <span className="tag soft">{n.subType}</span>}
            {n.flags?.speculative && <span className="tag warn">투기과열</span>}
            {n.flags?.adjusted && <span className="tag warn">조정대상</span>}
            {n.flags?.priceCap && <span className="tag soft">분양가상한제</span>}
          </div>
          <h2>{n.name}</h2>
          <p className="muted">{n.address ?? n.region}{n.totalUnits ? ` · ${n.totalUnits.toLocaleString()}세대` : ''}</p>
        </div>
      </div>

      <div className="actions">
        <button className={saved ? 'btn primary' : 'btn'} onClick={onToggleSave}>{saved ? '★ 관심 공고' : '☆ 관심 공고 저장'}</button>
        <button className="btn" onClick={() => downloadIcs([n])}>📅 캘린더 알림 추가</button>
        {n.url && <a className="btn" href={n.url} target="_blank" rel="noreferrer">공고 원문 ↗</a>}
      </div>

      <section>
        <h3>일정</h3>
        <ol className="timeline">
          {events.map((e) => {
            const dd = dday(e.start, today);
            const past = (e.end ?? e.start) < today;
            return (
              <li key={e.kind} className={past ? 'past' : ''}>
                <span className="t-kind">{e.kind}</span>
                <span className="t-date">{e.start}{e.end && e.end !== e.start ? ` ~ ${e.end.slice(5)}` : ''}</span>
                {!past && <span className="dday">{dd === 0 ? 'D-DAY' : dd > 0 ? `D-${dd}` : '진행중'}</span>}
              </li>
            );
          })}
        </ol>
      </section>

      <section>
        <h3>내 자격 판정</h3>
        {!hasProfile ? (
          <div className="cta">
            <p>나이·통장·소득 등을 입력하면 이 공고에 지원 가능한지 유형별로 알려드려요.</p>
            <button className="btn primary" onClick={onEditProfile}>내 조건 입력하기</button>
          </div>
        ) : (
        <div className="results">
          {results.map((r) => (
            <details key={r.key} className={`result ${r.verdict}`} open={r.verdict === 'likely'}>
              <summary><b>{r.label}</b><span className={`pill ${r.verdict}`}>{VERDICT_LABEL[r.verdict]}</span></summary>
              <ul>{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </details>
          ))}
        </div>
        )}
        <p className="disclaimer">판정은 공개 기준에 따른 참고용 안내입니다. 최종 자격은 반드시 입주자모집공고문과 청약홈에서 확인하세요.</p>
      </section>

      {!!n.models?.length && (
        <section>
          <h3>주택형</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>주택형</th><th>면적㎡</th><th>일반</th><th>특공</th><th>최고가</th></tr></thead>
              <tbody>
                {n.models.map((m, i) => (
                  <tr key={i}>
                    <td>{m.type}</td>
                    <td>{m.area?.toFixed(1) ?? '-'}</td>
                    <td>{m.general ?? '-'}</td>
                    <td title={m.specialBreakdown ? Object.entries(m.specialBreakdown).map(([k, v]) => `${SB_LABEL[k] ?? k} ${v}`).join(', ') : ''}>{m.special ?? '-'}</td>
                    <td>{m.priceMax ? `${(m.priceMax / 10000).toFixed(1)}억` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h3>제출 서류 체크리스트 <small className="muted">{checklist.filter((c) => done[c.id]).length}/{checklist.length}</small></h3>
        <ul className="checklist">
          {checklist.map((c) => (
            <li key={c.id}>
              <label>
                <input type="checkbox" checked={!!done[c.id]} onChange={(e) => setDone({ ...done, [c.id]: e.target.checked })} />
                <span>{c.label}<small className="muted"> · {c.where}{c.note ? ` · ${c.note}` : ''}</small></span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="meta muted">
        {n.builder && <div>시공: {n.builder}</div>}
        {n.developer && <div>시행: {n.developer}</div>}
        {n.phone && <div>문의: <a href={`tel:${n.phone}`}>{n.phone}</a></div>}
        {n.moveIn && <div>입주예정: {n.moveIn.slice(0, 4)}.{n.moveIn.slice(4, 6)}</div>}
        {n.geoPrecision === 'region' && <div>※ 지도 위치는 지역 중심 근사값입니다.</div>}
      </section>
    </aside>
  );
}
