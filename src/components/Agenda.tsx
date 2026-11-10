import { useMemo, useState } from 'react';
import type { Notice } from '../types.ts';
import { dday, eventsOf } from '../lib/schedule.ts';
import { buildMonth, shiftMonth } from '../lib/calendar.ts';
import { receiptWindow } from '../lib/filters.ts';
import { STATUS_COLOR, STATUS_SHORT } from '../config/tokens.ts';
import { downloadIcs } from './NoticeDetail.tsx';

interface Props {
  notices: Notice[];
  savedIds: string[];
  today: string;
  onSelect: (id: string) => void;
}

const MAX_LANES = 3; // 한 주에 보여 줄 접수 막대 줄 수. 넘치면 날짜 칸에 +N
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

// 일정 탭 (F2·F8): 기본은 월 캘린더. 접수 기간은 막대, 당첨자 발표·계약은 관심 공고만 점으로 표시
export function Agenda({ notices, savedIds, today, onSelect }: Props) {
  const [view, setView] = useState<'month' | 'list'>('month');
  const [onlySaved, setOnlySaved] = useState(false);
  const saved = notices.filter((n) => savedIds.includes(n.id));
  const shown = onlySaved ? saved : notices;

  return (
    <div className="agenda">
      <div className="agenda-head">
        <div className="seg" role="tablist" aria-label="일정 보기 방식">
          <button role="tab" aria-selected={view === 'month'} className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>월 캘린더</button>
          <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>날짜별 목록</button>
        </div>
        <label className="check small">
          <input type="checkbox" checked={onlySaved} onChange={(e) => setOnlySaved(e.target.checked)} />
          관심 공고만 ({saved.length})
        </label>
      </div>

      {view === 'month' ? <MonthView notices={shown} savedIds={savedIds} today={today} onSelect={onSelect} /> : <ListView notices={shown} savedIds={savedIds} today={today} onSelect={onSelect} />}

      <div className="ics-box">
        <button className="btn small-btn" disabled={!saved.length} onClick={() => downloadIcs(saved)}>📅 내 캘린더에도 추가 (관심 공고 {saved.length}건)</button>
        <p className="muted small">.ics 파일을 열면 폰 캘린더에 일정이 추가되고, 각 일정 전날 오전 9시에 알림이 옵니다. 아이폰 인앱 브라우저에서는 다운로드가 막힐 수 있습니다.</p>
      </div>
    </div>
  );
}

function MonthView({ notices, savedIds, today, onSelect }: Props) {
  const [ym, setYm] = useState(today.slice(0, 7));
  const [day, setDay] = useState(today);
  const savedSet = useMemo(() => new Set(savedIds), [savedIds]);
  const { weeks, dots } = useMemo(() => buildMonth(ym, notices, savedSet, today), [ym, notices, savedSet, today]);
  const [y, m] = ym.split('-').map(Number);

  // 고른 날짜의 일정 (접수 중인 공고 + 관심 공고 발표·계약)
  const dayItems = useMemo(() => {
    const open = notices
      .map((n) => ({ n, w: receiptWindow(n) }))
      .filter(({ w }) => w.start && w.start <= day && (w.end ?? w.start) >= day)
      .sort((a, b) => Number(savedSet.has(b.n.id)) - Number(savedSet.has(a.n.id)) || (a.w.end ?? '').localeCompare(b.w.end ?? ''));
    return { open, dots: dots.get(day) ?? [] };
  }, [notices, day, dots, savedSet]);

  return (
    <div className="cal">
      <div className="cal-nav">
        <button className="icon-btn" aria-label="이전 달" onClick={() => setYm(shiftMonth(ym, -1))}>‹</button>
        <b>{y}년 {m}월</b>
        <button className="icon-btn" aria-label="다음 달" onClick={() => setYm(shiftMonth(ym, 1))}>›</button>
        {ym !== today.slice(0, 7) && <button className="btn small-btn" onClick={() => { setYm(today.slice(0, 7)); setDay(today); }}>오늘</button>}
      </div>
      <div className="cal-legend small muted">
        {(['open', 'upcoming', 'waiting', 'closed'] as const).map((s) => <span key={s}><i style={{ background: STATUS_COLOR[s] }} />{STATUS_SHORT[s]}</span>)}
        <span><i className="dot win" />발표</span><span><i className="dot con" />계약 (관심 공고)</span>
      </div>
      <div className="cal-grid" role="grid" aria-label={`${y}년 ${m}월 청약 접수 일정`}>
        <div className="cal-week cal-dow" role="row">{WEEK.map((w, i) => <span key={w} role="columnheader" className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>{w}</span>)}</div>
        {weeks.map((w) => {
          const hidden = w.days.map((d) => w.bars.filter((b) => b.lane >= MAX_LANES && b.start <= d && b.end >= d).length);
          const lanes = Math.min(w.lanes, MAX_LANES);
          return (
            <div key={w.days[0]} className="cal-week" role="row" style={{ gridTemplateRows: `22px repeat(${lanes}, 18px) minmax(16px, auto)` }}>
              {w.days.map((d, i) => (
                <button key={d} role="gridcell" aria-selected={d === day} style={{ gridColumn: i + 1, gridRow: `1 / span ${lanes + 2}` }}
                  className={`cal-day${d.slice(0, 7) !== ym ? ' out' : ''}${d === today ? ' today' : ''}${d === day ? ' sel' : ''}${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`}
                  onClick={() => setDay(d)} aria-label={`${+d.slice(5, 7)}월 ${+d.slice(8)}일`}>
                  <span className="cal-num">{+d.slice(8)}</span>
                </button>
              ))}
              {w.bars.filter((b) => b.lane < MAX_LANES).map((b) => (
                <button key={b.noticeId + b.start} className={`cal-bar${b.contStart ? ' cs' : ''}${b.contEnd ? ' ce' : ''}${b.saved ? ' saved' : ''}`}
                  style={{ gridColumn: `${b.col + 1} / span ${b.span}`, gridRow: b.lane + 2, background: STATUS_COLOR[b.status] }}
                  title={`${b.name} · ${STATUS_SHORT[b.status]}`} onClick={() => onSelect(b.noticeId)}>
                  {b.saved && '★ '}{b.name}
                </button>
              ))}
              {w.days.map((d, i) => {
                const ds = dots.get(d);
                if (!hidden[i] && !ds) return null;
                return (
                  <span key={'x' + d} className="cal-extra" style={{ gridColumn: i + 1, gridRow: lanes + 2 }}>
                    {ds?.slice(0, 3).map((x) => <i key={x.noticeId + x.kind} className={`dot ${x.kind === '발표' ? 'win' : 'con'}`} title={`${x.kind} · ${x.name}`} />)}
                    {hidden[i] > 0 && <button className="more" onClick={() => setDay(d)}>+{hidden[i]}</button>}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="cal-day-list">
        <b>{+day.slice(5, 7)}월 {+day.slice(8)}일{day === today ? ' (오늘)' : ''}</b>
        {!dayItems.open.length && !dayItems.dots.length && <p className="muted small">이 날 접수 중인 공고가 없습니다.</p>}
        <ul>
          {dayItems.dots.map((x) => (
            <li key={x.noticeId + x.kind}>
              <button className="link" onClick={() => onSelect(x.noticeId)}><i className={`dot ${x.kind === '발표' ? 'win' : 'con'}`} /> ★ [{x.kind === '발표' ? '당첨자 발표' : '계약'}] {x.name}</button>
            </li>
          ))}
          {dayItems.open.map(({ n, w }) => {
            const left = w.end ? dday(w.end, day) : null;
            return (
              <li key={n.id}>
                <button className="link" onClick={() => onSelect(n.id)}>
                  {savedSet.has(n.id) && '★ '}{n.name}
                  <small className="muted"> · 접수 {w.start!.slice(5).replace('-', '.')}~{(w.end ?? w.start)!.slice(5).replace('-', '.')}{left === 0 ? ' · 이 날 마감' : ''}</small>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// 날짜별 목록 (이전 일정 화면)
function ListView({ notices, savedIds, today, onSelect }: Props) {
  const events = notices
    .flatMap(eventsOf)
    .filter((e) => (e.end ?? e.start) >= today)
    .sort((a, b) => a.start.localeCompare(b.start));
  const byDate = new Map<string, typeof events>();
  for (const e of events) {
    const key = e.start < today ? today : e.start;
    byDate.set(key, [...(byDate.get(key) ?? []), e]);
  }
  return (
    <>
      {[...byDate.entries()].slice(0, 60).map(([date, list]) => {
        const dd = dday(date, today);
        return (
          <div key={date} className="agenda-day">
            <div className="agenda-date">
              <b>{date.slice(5).replace('-', '.')}</b>
              <span className="muted">{dd === 0 ? '오늘' : `D-${dd}`}</span>
            </div>
            <ul>
              {list.map((e) => (
                <li key={e.noticeId + e.kind}>
                  <button className="link" onClick={() => onSelect(e.noticeId)}>
                    {savedIds.includes(e.noticeId) && '★ '}
                    {e.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {!events.length && <p className="muted">다가오는 일정이 없습니다.</p>}
    </>
  );
}
