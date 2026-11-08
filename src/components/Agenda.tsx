import type { Notice } from '../types.ts';
import { dday, eventsOf } from '../lib/schedule.ts';
import { downloadIcs } from './NoticeDetail.tsx';

interface Props {
  notices: Notice[];
  savedIds: string[];
  today: string;
  onSelect: (id: string) => void;
}

// 다가오는 청약 일정 (날짜별 묶음)
export function Agenda({ notices, savedIds, today, onSelect }: Props) {
  const events = notices
    .flatMap(eventsOf)
    .filter((e) => (e.end ?? e.start) >= today)
    .sort((a, b) => a.start.localeCompare(b.start));
  const byDate = new Map<string, typeof events>();
  for (const e of events) {
    const key = e.start < today ? today : e.start;
    byDate.set(key, [...(byDate.get(key) ?? []), e]);
  }
  const saved = notices.filter((n) => savedIds.includes(n.id));

  return (
    <div className="agenda">
      <div className="agenda-head">
        <p className="muted">관심 공고 {saved.length}건</p>
        <button className="btn primary" disabled={!saved.length} onClick={() => downloadIcs(saved)}>
          📅 관심 공고 일정 캘린더로 받기
        </button>
      </div>
      <p className="muted small">.ics 파일을 열면 폰 캘린더에 일정이 추가되고, 각 일정 전날 오전 9시에 알림이 옵니다.</p>
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
    </div>
  );
}
