import { useMemo, useRef, useState } from 'react';
import type { Notice } from '../types.ts';
import { CATEGORY_LABEL } from '../types.ts';
import { RECEIPT_LABEL, receiptStatus } from '../lib/filters.ts';

interface Props {
  q: string;
  setQ: (q: string) => void;
  notices: Notice[]; // 지금 보이는 공고 (지난 공고 체크 여부 반영)
  archive: Notice[] | null; // 지난 공고 (체크 안 했을 때만 — 결과 없을 때 안내용)
  today: string;
  onPick: (id: string) => void;
  onShowPast: () => void;
}

const MAX = 6;

function matches(n: Notice, q: string) {
  return `${n.name} ${n.address ?? ''} ${n.region ?? ''}`.includes(q);
}

/** 검색어 부분을 <mark>로 강조 */
function Hl({ text, q }: { text: string; q: string }) {
  const i = text.indexOf(q);
  if (!q || i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

// 검색창: 입력하면 아래에 공고 후보(이름 강조 + 지역/유형/상태 경로)를 보여 주고, 없으면 다음 행동을 안내한다.
// 목록 필터는 그대로 함께 적용된다. 키보드: ↑↓ 이동, Enter 선택, Esc 닫기.
export function SearchBox({ q, setQ, notices, archive, today, onPick, onShowPast }: Props) {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const qq = q.trim();
  const hits = useMemo(() => (qq ? notices.filter((n) => matches(n, qq)) : []), [notices, qq]);
  const pastHits = useMemo(() => (qq && archive ? archive.filter((n) => matches(n, qq)).length : 0), [archive, qq]);
  const shown = hits.slice(0, MAX);
  const show = open && qq.length > 0;

  const pick = (id: string) => {
    setOpen(false);
    input.current?.blur();
    onPick(id);
  };

  return (
    <div className={`search-box${show ? ' open' : ''}`}>
      <span className="search-ic" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      </span>
      <input
        ref={input}
        type="search"
        placeholder="단지명·지역 검색"
        aria-label="단지명·지역 검색"
        role="combobox"
        aria-expanded={show}
        aria-controls="search-results"
        aria-autocomplete="list"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setCur(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setOpen(false); return; }
          if (!shown.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setCur((c) => (c + 1) % shown.length); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setCur((c) => (c - 1 + shown.length) % shown.length); }
          if (e.key === 'Enter' && show) { e.preventDefault(); pick(shown[cur].id); }
        }}
      />
      {q && <button type="button" className="search-clear" aria-label="검색어 지우기" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQ(''); input.current?.focus(); }}>×</button>}
      {show && (
        <div className="search-pop" id="search-results" role="listbox" aria-label="검색 결과">
          {shown.length > 0 ? (
            <>
              <div className="search-sec">공고 {hits.length > MAX ? `${MAX}+` : hits.length}건 · 목록에도 적용됨</div>
              {shown.map((n, i) => {
                const st = receiptStatus(n, today);
                return (
                  <button key={n.id} type="button" role="option" aria-selected={i === cur} className={i === cur ? 'on' : ''}
                    onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setCur(i)} onClick={() => pick(n.id)}>
                    <span className="search-name"><Hl text={n.name} q={qq} /></span>
                    <span className="search-path">{n.region ?? '-'} / {CATEGORY_LABEL[n.category]} / {RECEIPT_LABEL[st]}{n.address && n.address.includes(qq) && !n.name.includes(qq) ? <> · <Hl text={n.address} q={qq} /></> : ''}</span>
                  </button>
                );
              })}
            </>
          ) : (
            <div className="search-empty">
              <b>검색 결과가 없습니다</b>
              <p>단지명 일부나 시·군·구 이름(예: 중랑구, 화성)으로 찾아보세요. 다른 필터가 켜져 있으면 결과가 줄어듭니다.</p>
              {pastHits > 0 && (
                <button type="button" className="btn dark small-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => { onShowPast(); }}>
                  지난 공고에서 {pastHits}건 보기
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
