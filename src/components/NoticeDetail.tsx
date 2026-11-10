import { useEffect, useState } from 'react';
import type { Notice, Profile } from '../types.ts';
import { CATEGORY_LABEL } from '../types.ts';
import { evaluate } from '../lib/eligibility.ts';
import { buildChecklist } from '../lib/checklist.ts';
import { buildIcs, dday, eventsOf } from '../lib/schedule.ts';
import { RECEIPT_LABEL, receiptStatus } from '../lib/filters.ts';
import { bestVerdict } from '../lib/eligibility.ts';
import { calcGajeom, fitStars, type NearbyScores } from '../lib/score.ts';
import { relatedKind } from '../lib/related.ts';
import { UnitTypes } from './UnitTypes.tsx';

const VERDICT_LABEL = { likely: '조건 충족', check: '추가 확인', no: '조건 불충족' } as const;
const FIELD_LABEL: Record<string, string> = {
  announce: '모집공고', specialStart: '특공 접수 시작', specialEnd: '특공 접수 종료', rank1Start: '1순위 시작', rank1End: '1순위 종료',
  rank2Start: '2순위 시작', rank2End: '2순위 종료', receiptStart: '접수 시작', receiptEnd: '접수 마감', winner: '당첨자 발표',
  contractStart: '계약 시작', contractEnd: '계약 종료',
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
      window.dispatchEvent(new Event('dash:checklist')); // 계정 자동 저장 신호
    } catch {
      /* ignore */
    }
  }, [key, done]);
  return [done, setDone] as const;
}

function fmtRate(x?: { req: number; rate?: number }) {
  if (!x) return '-';
  if (x.rate === undefined) return `${x.req}건`;
  return x.rate < 0 ? `미달 (${x.req}건)` : `${x.rate.toFixed(2)} : 1`;
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
  related?: Notice[]; // 같은 단지의 다른 공고 (최초 분양 ↔ 무순위·추가모집)
  onSelectRelated?: (id: string) => void;
  nearby?: NearbyScores | null; // 인근 당첨가점 (같은 시군구 → 시도)
}

const FAR_DAYS = 30; // 이보다 먼 일정은 날짜만 작게

function Stars({ n }: { n: number }) {
  return <span className="stars" aria-label={`5점 중 ${n}점`}>{'★'.repeat(n)}<span className="off">{'★'.repeat(5 - n)}</span></span>;
}

export function NoticeDetail({ notice: n, profile, hasProfile, today, saved, onToggleSave, onClose, onEditProfile, related = [], onSelectRelated, nearby }: Props) {
  const results = evaluate(n, profile);
  const fit = hasProfile ? fitStars(n, profile, bestVerdict(results)) : null;
  // 가점제는 민영주택에 적용 (국민주택은 순차제, 무순위·임의공급은 추첨)
  const usesGajeom = n.category === 'APT' && /민영/.test(n.subType ?? '');
  const gajeom = hasProfile && usesGajeom ? calcGajeom(profile, today, n.dates.announce) : null;
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
            {n.corrected && <span className="tag warn">정정</span>}
            {n.removedAt && <span className="tag danger">취소·삭제 의심</span>}
          </div>
          <h2>{n.name}</h2>
          <p className="muted">
            {n.address ?? `${n.region ?? ''} (상세 주소 미제공)`}
            {n.addressNote ? ` (${n.addressNote})` : ''}
            {n.totalUnits ? ` · ${n.totalUnits.toLocaleString()}세대` : ''}
          </p>
        </div>
      </div>

      <div className="actions">
        <button className={saved ? 'btn primary' : 'btn'} onClick={onToggleSave}>{saved ? '★ 관심 공고' : '☆ 관심 공고 저장'}</button>
        <button className="btn" onClick={() => downloadIcs([n])}>📅 캘린더 알림 추가</button>
        {n.url && <a className="btn" href={n.url} target="_blank" rel="noreferrer">공고 원문 ↗</a>}
      </div>

      {!!n.issues?.length && (
        <div className="alert soft">
          <b>공고 원문 확인 필요</b> — 자동 수집 정보에 빠진 항목이 있습니다: {n.issues.join(', ')}
          {n.url && <> · <a href={n.url} target="_blank" rel="noreferrer">원문 보기</a></>}
        </div>
      )}
      {n.removedAt && (
        <p className="alert">{n.removedAt}에 공고 출처 목록에서 사라졌습니다. 취소·철회되었을 수 있으니 공고 원문을 확인하세요.</p>
      )}
      {!!n.changes?.length && (
        <section>
          <h3>일정 변경 이력</h3>
          <ul className="changes">
            {n.changes.map((c, i) => (
              <li key={i}><span className="muted">{c.at} 감지</span> {FIELD_LABEL[c.field] ?? c.field}: <s>{c.from}</s> → <b>{c.to ?? '삭제'}</b></li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>일정</h3>
        <ol className="timeline">
          {events.map((e) => {
            const dd = dday(e.start, today);
            const past = (e.end ?? e.start) < today;
            const far = !past && dd > FAR_DAYS;
            return (
              <li key={e.kind} className={past ? 'past' : far ? 'far' : dd <= 0 ? 'now' : ''}>
                <span className="t-dot" aria-hidden="true" />
                <span className="t-kind">{e.kind}</span>
                <span className="t-date">{e.start}{e.end && e.end !== e.start ? ` ~ ${e.end.slice(5)}` : ''}</span>
                {!past && !far && <span className="dday">{dd === 0 ? 'D-DAY' : dd > 0 ? `D-${dd}` : '진행중'}</span>}
              </li>
            );
          })}
        </ol>
      </section>

      <UnitTypes notice={n} results={results} hasProfile={hasProfile} onEditProfile={onEditProfile} />

      <section>
        <h3>내 자격 판정 <span className="beta-tag">베타</span></h3>
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
        {hasProfile && (
          <div className="fit">
            <span className="fit-label">내 조건 적합도</span>
            {fit ? <><Stars n={fit.stars} /><small className="muted">{fit.reasons.join(' · ')}</small></> : <small className="muted">조건 불충족으로 별점을 표시하지 않습니다 (참고용)</small>}
          </div>
        )}
        <p className="disclaimer">판정은 공개 기준에 따른 참고용 안내입니다. 별점은 당첨 가능성이 아니라 내 조건(자격·관심 지역·면적·가격)과 맞는 정도입니다. 최종 자격은 반드시 입주자모집공고문과 청약홈에서 확인하세요.{n.url && <> <a href={n.url} target="_blank" rel="noreferrer">공고 원문 ↗</a></>}</p>
      </section>

      {usesGajeom && (
        <section>
          <h3>내 가점 vs 인근 당첨가점 <span className="beta-tag">베타</span></h3>
          {!gajeom ? (
            <div className="cta">
              <p>출생연도·혼인·자녀·통장 가입기간을 입력하면 가점(84점 만점)을 계산해 인근 당첨가점과 비교합니다.</p>
              <button className="btn primary" onClick={onEditProfile}>내 조건 입력하기</button>
            </div>
          ) : (
            <>
              <div className="score-compare">
                <div className="score-mine"><small>내 가점</small><b>{gajeom.complete ? gajeom.total : '-'}</b><small className="muted">/ {gajeom.max}점</small></div>
                <div className="score-near">
                  <small>인근 당첨가점{nearby ? ` · ${nearby.scope} ${nearby.count}개 단지` : ''}</small>
                  {nearby ? (
                    <div className="score-row">
                      <span>최저 <b>{Number.isNaN(nearby.min) ? '-' : nearby.min}</b></span>
                      <span>평균 <b>{Number.isNaN(nearby.avg) ? '-' : nearby.avg}</b></span>
                      <span>최고 <b>{Number.isNaN(nearby.max) ? '-' : nearby.max}</b></span>
                    </div>
                  ) : <span className="muted small">데이터 없음</span>}
                </div>
              </div>
              {nearby && gajeom.complete && !Number.isNaN(nearby.min) && (
                <div className="score-bar" aria-hidden="true">
                  <span className="range" style={{ left: `${(nearby.min / 84) * 100}%`, width: `${(((Number.isNaN(nearby.max) ? nearby.min : nearby.max) - nearby.min) / 84) * 100}%` }} />
                  <span className="me" style={{ left: `${(gajeom.total / 84) * 100}%` }} />
                </div>
              )}
              <ul className="score-parts">
                {gajeom.parts.map((x) => <li key={x.key}><span>{x.label}</span><span className="muted small">{x.basis}</span><b>{x.points}<small className="muted">/{x.max}</small></b></li>)}
              </ul>
              <p className="disclaimer">
                가점은 입력값으로 계산한 참고값입니다. {gajeom.notes.join(' ')} 인근 당첨가점은 최근 1년 청약홈 발표 기준으로, 주택형·거주지역 구분 없이 합쳐서 보여줍니다.
                정확한 가점은 <a href="https://www.applyhome.co.kr" target="_blank" rel="noreferrer">청약홈</a> 가점 계산기와 공고문으로 확인하세요.
              </p>
            </>
          )}
        </section>
      )}

      {!!n.competition?.length && (
        <section>
          <h3>1순위 경쟁률 <small className="muted">(청약홈 집계)</small></h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>주택형</th><th>공급</th><th>해당지역</th><th>기타지역</th></tr></thead>
              <tbody>
                {n.competition.map((c) => (
                  <tr key={c.type}>
                    <td>{c.type}</td>
                    <td>{c.supply ?? '-'}</td>
                    <td>{fmtRate(c.local)}</td>
                    <td>{fmtRate(c.other)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!!n.scores?.length && (
        <section>
          <h3>당첨 가점</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>주택형</th><th>거주</th><th>최저</th><th>평균</th><th>최고</th></tr></thead>
              <tbody>
                {n.scores.map((x, i) => (
                  <tr key={i}><td>{x.type}</td><td>{x.reside ?? '-'}</td><td>{x.min ?? '-'}</td><td>{x.avg ?? '-'}</td><td>{x.max ?? '-'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h3>서류 준비 일반 안내 <small className="muted">{checklist.filter((c) => done[c.id]).length}/{checklist.length}</small></h3>
        <p className="disclaimer">
          아래는 지원 유형별로 <b>일반적으로</b> 요구되는 서류입니다. 제출 서류·발급 기준일·원본 여부는 공고마다 다르므로,
          반드시 공고문의 「당첨자 제출서류」 항목으로 확정하세요.
          {n.url && <> <a href={n.url} target="_blank" rel="noreferrer">공고 원문에서 제출서류 확인 ↗</a></>}
        </p>
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

      {related.length > 0 && (
        <section>
          <h3>같은 단지의 다른 공고 <small className="muted">{related.length}건</small></h3>
          <ul className="related">
            {related.slice(0, 6).map((r) => {
              const st = receiptStatus(r, today);
              const rates = (r.competition ?? []).map((c) => c.local?.rate ?? c.other?.rate).filter((x): x is number => x !== undefined && x > 0);
              const mins = (r.scores ?? []).map((x) => x.min).filter((x): x is number => x !== undefined);
              return (
                <li key={r.id}>
                  <button className="link" onClick={() => onSelectRelated?.(r.id)}>
                    <span className="tag kind">{relatedKind(r)}</span> <span className={`tag st-${st}`}>{RECEIPT_LABEL[st]}</span> <b>{CATEGORY_LABEL[r.category]}</b> · {r.dates.announce ?? '-'} 공고
                    <div className="small muted">
                      {r.name}
                      {rates.length > 0 && ` · 1순위 최고 ${Math.max(...rates).toFixed(1)}:1`}
                      {mins.length > 0 && ` · 최저 가점 ${Math.min(...mins)}점`}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="small muted">공고명으로 같은 단지를 찾은 결과입니다. 다른 단지가 섞일 수 있습니다.</p>
        </section>
      )}

      <section className="meta muted">
        {n.builder && <div>시공: {n.builder}</div>}
        {n.developer && <div>시행: {n.developer}</div>}
        {n.phone && <div>문의: <a href={`tel:${n.phone}`}>{n.phone}</a></div>}
        {n.homepage && <div>홈페이지·청약 신청: <a href={n.homepage} target="_blank" rel="noreferrer">{n.homepage.replace(/^https?:\/\//, '').slice(0, 40)}</a></div>}
        {n.placeName && <div>지도 위치: 카카오맵 「{n.placeName}」 기준</div>}
        {n.moveIn && <div>입주예정: {n.moveIn.slice(0, 4)}.{n.moveIn.slice(4, 6)}</div>}
        {n.geoPrecision === 'region' && <div>※ 지도 위치는 시·도 중심 근사값입니다 (정확한 주소 미제공).</div>}
        {n.geoPrecision === 'district' && <div>※ 지도 위치는 시·군·구 또는 동 단위 근사값입니다.</div>}
        {n.firstSeen && <div>최초 수집: {n.firstSeen}</div>}
        {n.manual && <div>※ 관리자가 수동 등록한 공고입니다.</div>}
        {n.note && <div>메모: {n.note}</div>}
      </section>
    </aside>
  );
}
