import { useEffect, useMemo, useRef, useState } from 'react';
import type { Category, Notice, NoticeFile, Overrides, Profile, Verdict } from './types.ts';
import { CATEGORY_LABEL } from './types.ts';
import { bestVerdict, evaluate, matchScore } from './lib/eligibility.ts';
import { clearProfile, loadProfile, REGIONS, saveProfile } from './lib/profile.ts';
import { dday, nextEvent, todayKST } from './lib/schedule.ts';
import type { Bounds, ReceiptStatus } from './lib/filters.ts';
import { AREA_BUCKETS, PRICE_BUCKETS, RECEIPT_LABEL, inBounds, matchArea, matchPrice, receiptStatus, receiptWindow, recentlyChanged } from './lib/filters.ts';
import { KakaoMap } from './components/KakaoMap.tsx';
import { NoticeDetail } from './components/NoticeDetail.tsx';
import { ProfileForm } from './components/ProfileForm.tsx';
import { Agenda } from './components/Agenda.tsx';
import { AdSlot } from './components/AdSlot.tsx';
import { applyOverrides } from './lib/overrides.ts';

type Tab = 'map' | 'list' | 'agenda' | 'me';
type StatusFilter = '' | 'active' | ReceiptStatus;
const SAVED_KEY = 'dash_housing.saved.v1';
const PAGE = 100;

function loadSaved(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]');
  } catch {
    return [];
  }
}
const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches;

export default function App() {
  const [data, setData] = useState<NoticeFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 데스크톱은 지도+오른쪽 패널, 모바일은 탭 전환
  const desktop = useMemo(isDesktop, []);
  const [tab, setTab] = useState<Tab>(desktop ? 'list' : 'map');
  const [sideOpen, setSideOpen] = useState(true);
  const detailOpenedSide = useRef(false); // 닫혀 있던 패널을 공고 상세가 연 경우
  // 공유·검색 유입용 딥링크: /?id=공고ID
  const [selectedId, setSelectedId] = useState<string | undefined>(() => new URLSearchParams(location.search).get('id') ?? undefined);
  const initial = useMemo(loadProfile, []);
  const [profile, setProfile] = useState<Profile>(initial.profile);
  const [persisted, setPersisted] = useState(initial.persisted);
  const [touched, setTouched] = useState(initial.persisted);
  const [saved, setSaved] = useState<string[]>(loadSaved);

  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Category | ''>('');
  const [region, setRegion] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [area, setArea] = useState('');
  const [price, setPrice] = useState('');
  const [onlyMatch, setOnlyMatch] = useState(false);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [syncMap, setSyncMap] = useState(isDesktop);
  const [limit, setLimit] = useState(PAGE);
  const today = todayKST();

  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    Promise.all([
      fetch(`${base}data/notices.json`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))),
      fetch(`${base}data/overrides.json`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([file, ov]: [NoticeFile, Overrides | null]) => setData({ ...file, notices: applyOverrides(file.notices, ov) }))
      .catch((e) => setLoadError(String(e.message ?? e)));
  }, []);

  // 선택한 공고를 주소창에 반영 (공유 가능한 링크)
  useEffect(() => {
    const u = new URL(location.href);
    if (selectedId) u.searchParams.set('id', selectedId);
    else u.searchParams.delete('id');
    history.replaceState(null, '', u);
  }, [selectedId]);

  useEffect(() => {
    if (persisted) saveProfile(profile);
  }, [profile, persisted]);
  useEffect(() => {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    } catch {
      /* ignore */
    }
  }, [saved]);

  const notices = data?.notices ?? [];
  const verdicts = useMemo(() => {
    const m = new Map<string, Verdict>();
    if (!touched) return m;
    for (const n of notices) m.set(n.id, bestVerdict(evaluate(n, profile)));
    return m;
  }, [notices, profile, touched]);

  // 지도 외 조건으로 거른 목록 (지도 마커용)
  const filtered = useMemo(() => {
    const qq = q.trim();
    const ab = AREA_BUCKETS.find((b) => b.key === area)!;
    const pb = PRICE_BUCKETS.find((b) => b.key === price)!;
    let list = notices.filter((n) => {
      if (cat && n.category !== cat) return false;
      if (region && n.region !== region) return false;
      if (qq && !`${n.name} ${n.address ?? ''} ${n.region ?? ''}`.includes(qq)) return false;
      if (status) {
        const st = receiptStatus(n, today);
        if (status === 'active' ? st === 'closed' : st !== status) return false;
      }
      if (!matchArea(n, ab) || !matchPrice(n, pb)) return false;
      if (onlyMatch && touched && verdicts.get(n.id) === 'no') return false;
      return true;
    });
    if (touched && onlyMatch) list = [...list].sort((a, b) => matchScore(b, profile) - matchScore(a, profile));
    return list;
  }, [notices, q, cat, region, status, area, price, onlyMatch, touched, verdicts, profile, today]);

  // 목록: 지도 영역 연동 (D2)
  const listed = useMemo(() => (syncMap && bounds ? filtered.filter((n) => inBounds(n, bounds)) : filtered), [filtered, syncMap, bounds]);
  useEffect(() => setLimit(PAGE), [listed.length]);

  const selected = notices.find((n) => n.id === selectedId);
  // 같은 공고(마커·카드)를 다시 누르면 닫힘. 데스크톱에서 패널이 닫혀 있었다면 다시 닫아 지도를 넓힌다
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const closeDetail = () => {
    setSelectedId(undefined);
    if (detailOpenedSide.current) {
      setSideOpen(false);
      detailOpenedSide.current = false;
    }
  };
  const select = (id: string) => {
    if (selectedRef.current === id) return closeDetail();
    if (desktop && !sideOpen) {
      detailOpenedSide.current = true;
      setSideOpen(true);
    }
    setSelectedId(id);
  };
  // 탭: 데스크톱에서 '지도' 또는 이미 열린 탭을 다시 누르면 패널을 닫아 지도를 가득 채운다
  const pickTab = (k: Tab) => {
    if (!desktop) {
      setTab(k);
      setSelectedId(undefined);
      return;
    }
    detailOpenedSide.current = false;
    if (k === 'map' || (k === tab && sideOpen && !selectedId)) {
      setSideOpen(false);
      setSelectedId(undefined);
      return;
    }
    setTab(k);
    setSelectedId(undefined);
    setSideOpen(true);
  };
  const toggleSave = (id: string) => setSaved((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo">🏠</span>
          <div>
            <h1>청약맵 <span className="beta-tag">베타</span></h1>
            <p className="muted small">전국 청약 공고 지도 · 내 조건 맞춤 매칭</p>
          </div>
        </div>
        {data?.sample && <div className="banner">샘플 데이터 표시 중 (실제 공고 아님)</div>}
      </header>

      <div className="filters">
        <input type="search" placeholder="단지명·지역 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value as Category | '')} aria-label="공급 유형">
          <option value="">전체 유형</option>
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="지역">
          <option value="">전국</option>
          {REGIONS.map((r) => <option key={r}>{r}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="접수 상태">
          <option value="active">진행·예정</option>
          <option value="upcoming">접수예정</option>
          <option value="open">접수중</option>
          <option value="closed">접수마감</option>
          <option value="">전체 상태</option>
        </select>
        <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="면적">
          {AREA_BUCKETS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
        </select>
        <select value={price} onChange={(e) => setPrice(e.target.value)} aria-label="가격">
          {PRICE_BUCKETS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={onlyMatch} onChange={(e) => { setOnlyMatch(e.target.checked); if (e.target.checked && !touched) pickTab('me'); }} />
          내 조건 매칭순
        </label>
      </div>

      <main className={`body tab-${tab} ${sideOpen ? 'side-open' : 'side-closed'}`}>
        <section className="pane-map">
          <KakaoMap notices={filtered} verdicts={verdicts} selectedId={selectedId} onSelect={select} onBoundsChange={setBounds} />
        </section>

        <section className="pane-side">
          {tab === 'agenda' ? (
            <Agenda notices={notices} savedIds={saved} today={today} onSelect={select} />
          ) : tab === 'me' ? (
            <ProfileForm
              profile={profile}
              persisted={persisted}
              onChange={(p) => { setProfile(p); setTouched(true); }}
              onPersist={(on) => { setPersisted(on); if (on) saveProfile(profile); else clearProfile(); }}
            />
          ) : (
            <div className="list">
              <MatchPanel notices={filtered} verdicts={verdicts} touched={touched} today={today}
                onSelect={select} onEditProfile={() => pickTab('me')} />
              <div className="list-head">
                <span className="muted small">
                  공고 {listed.length.toLocaleString()}건
                  {data && !data.sample && ` · 갱신 ${new Date(data.generatedAt).toLocaleDateString('ko-KR')}`}
                </span>
                {bounds && (
                  <label className="check small">
                    <input type="checkbox" checked={syncMap} onChange={(e) => setSyncMap(e.target.checked)} />
                    지도 영역만
                  </label>
                )}
              </div>
              {loadError && <p className="error">데이터를 불러오지 못했습니다: {loadError}</p>}
              {listed.slice(0, limit).map((n, i) => (
                <NoticeCard key={n.id} n={n} today={today} verdict={verdicts.get(n.id)} saved={saved.includes(n.id)}
                  active={n.id === selectedId} onClick={() => select(n.id)} ad={i === 4} />
              ))}
              {listed.length > limit && (
                <button className="btn more" onClick={() => setLimit((l) => l + PAGE)}>더 보기 ({(listed.length - limit).toLocaleString()}건 남음)</button>
              )}
              {!listed.length && data && (
                <p className="muted empty">
                  조건에 맞는 공고가 없습니다.{syncMap && bounds && filtered.length > 0 && ' 지도를 축소하거나 "지도 영역만"을 꺼보세요.'}
                </p>
              )}
              <footer className="site-foot muted small">출처: {data?.sources.join(', ')}</footer>
            </div>
          )}
        </section>

        {selected && (
          <NoticeDetail notice={selected} profile={profile} hasProfile={touched} today={today}
            saved={saved.includes(selected.id)} onToggleSave={() => toggleSave(selected.id)} onClose={closeDetail}
            onEditProfile={() => pickTab('me')} />
        )}
      </main>

      <nav className="tabs" aria-label="화면 전환">
        {([['map', '🗺️', '지도'], ['list', '📋', '공고'], ['agenda', '📅', '일정'], ['me', '👤', '내 조건']] as const).map(([k, ic, label]) => (
          <button key={k} className={(desktop ? (k === 'map' ? !sideOpen : sideOpen && tab === k) : tab === k) ? 'on' : ''}
            aria-pressed={desktop ? (k === 'map' ? !sideOpen : sideOpen && tab === k) : tab === k} onClick={() => pickTab(k)}>
            <span>{ic}</span>{label}
          </button>
        ))}
      </nav>

      <footer className="app-foot">
        <span>© 2026 Taezzi · Built Nov 2026<span className="foot-long"> · Data: Applyhome (REB), LH, Seoul Housing Portal</span></span>
        <span><span className="foot-long">For reference only — verify with official notices · </span><a href={`${import.meta.env.BASE_URL}privacy`}>Privacy</a> · <a href={`${import.meta.env.BASE_URL}terms`}>Terms</a></span>
      </footer>
    </div>
  );
}

// 맞춤 패널 (D3): 충족/확인/불충족 개수 + 마감 임박
function MatchPanel({ notices, verdicts, touched, today, onSelect, onEditProfile }: {
  notices: Notice[]; verdicts: Map<string, Verdict>; touched: boolean; today: string;
  onSelect: (id: string) => void; onEditProfile: () => void;
}) {
  if (!touched) {
    return (
      <div className="panel cta">
        <b>내 조건으로 지원 가능한 공고 찾기</b>
        <p className="small">나이·통장·소득을 입력하면 공고마다 지원 가능 여부를 알려드려요. 입력값은 이 기기에만 저장됩니다.</p>
        <button className="btn primary" onClick={onEditProfile}>내 조건 입력</button>
      </div>
    );
  }
  const count = { likely: 0, check: 0, no: 0 };
  for (const n of notices) count[verdicts.get(n.id) ?? 'no']++;
  const soon = notices
    .filter((n) => verdicts.get(n.id) !== 'no' && receiptStatus(n, today) !== 'closed')
    .map((n) => ({ n, end: receiptWindow(n).end }))
    .filter((x) => x.end && dday(x.end, today) >= 0 && dday(x.end, today) <= 3)
    .sort((a, b) => a.end!.localeCompare(b.end!));
  return (
    <div className="panel">
      <div className="panel-head"><b>내 맞춤 현황</b><span className="beta-tag">베타</span></div>
      <div className="counts">
        <div className="count likely"><b>{count.likely}</b><span>조건 충족</span></div>
        <div className="count check"><b>{count.check}</b><span>추가 확인</span></div>
        <div className="count no"><b>{count.no}</b><span>불충족</span></div>
      </div>
      {soon.length > 0 && (
        <div className="soon">
          <span className="small"><b>⏰ 접수 마감 임박</b> (3일 이내) {soon.length}건</span>
          <ul>
            {soon.slice(0, 3).map(({ n, end }) => (
              <li key={n.id}>
                <button className="link" onClick={() => onSelect(n.id)}>
                  <em>{dday(end!, today) === 0 ? '오늘 마감' : `D-${dday(end!, today)}`}</em> {n.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const V_LABEL = { likely: '조건 충족', check: '추가 확인', no: '조건 불충족' } as const;

function NoticeCard({ n, today, verdict, saved, active, onClick, ad }: {
  n: Notice; today: string; verdict?: Verdict; saved: boolean; active: boolean; onClick: () => void; ad: boolean;
}) {
  const next = nextEvent(n, today);
  const dd = next ? dday(next.start, today) : null;
  const st = receiptStatus(n, today);
  return (
    <>
      <button className={`card ${active ? 'active' : ''}`} onClick={onClick}>
        <div className="card-top">
          <span className="tag">{CATEGORY_LABEL[n.category]}</span>
          {n.subType && <span className="tag soft">{n.subType}</span>}
          <span className={`tag st-${st}`}>{RECEIPT_LABEL[st]}</span>
          {n.manual && <span className="tag soft">수동 등록</span>}
          {n.removedAt && <span className="tag danger">취소·삭제 의심</span>}
          {!n.removedAt && recentlyChanged(n, today) && <span className="tag warn">일정 변경</span>}
          {!n.removedAt && !recentlyChanged(n, today) && n.corrected && <span className="tag warn">정정</span>}
          {verdict && <span className={`pill ${verdict}`}>{V_LABEL[verdict]}</span>}
          {saved && <span className="star">★</span>}
        </div>
        <b className="card-title">{n.name}</b>
        <span className="muted small">{n.address ?? n.region}</span>
        {next && (
          <span className="next">
            {next.kind} {next.start.slice(5).replace('-', '.')}
            <em>{dd !== null && dd <= 0 ? '진행중' : `D-${dd}`}</em>
          </span>
        )}
      </button>
      {ad && <AdSlot />}
    </>
  );
}
