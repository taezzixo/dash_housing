import { useEffect, useMemo, useRef, useState } from 'react';
import type { Category, Notice, NoticeFile, Overrides, Profile, Verdict } from './types.ts';
import { CATEGORY_LABEL } from './types.ts';
import { bestVerdict, evaluate, matchScore } from './lib/eligibility.ts';
import { clearProfile, DEFAULT_PROFILE, loadProfile, REGIONS, saveProfile } from './lib/profile.ts';
import { clearLocalChecklists } from './lib/account.ts';
import { dday, nextEvent, todayKST } from './lib/schedule.ts';
import type { Bounds, ReceiptStatus } from './lib/filters.ts';
import { AREA_BUCKETS, PRICE_BUCKETS, RECEIPT_LABEL, inBounds, matchArea, matchPrice, receiptStatus, receiptWindow, recentlyChanged } from './lib/filters.ts';
import { complexKey, findRelated, groupByComplex, isReoffer } from './lib/related.ts';
import { nearbyScores } from './lib/score.ts';
import { KakaoMap } from './components/KakaoMap.tsx';
import { NoticeDetail } from './components/NoticeDetail.tsx';
import { ProfileForm } from './components/ProfileForm.tsx';
import { Agenda } from './components/Agenda.tsx';
import { AdSlot } from './components/AdSlot.tsx';
import { SearchBox } from './components/SearchBox.tsx';
import { applyOverrides } from './lib/overrides.ts';
import { UI } from './config/ui.ts';
import { AccountButton, useAccount } from './components/Account.tsx';
import { downloadIcs } from './components/NoticeDetail.tsx';

type Tab = 'map' | 'list' | 'saved' | 'agenda' | 'me';
type StatusFilter = '' | ReceiptStatus; // '' = 접수 전·접수 중 전체. 접수가 끝난 공고(발표·계약 대기 포함)는 '지난 공고' 체크 시에만 표시
const SAVED_KEY = 'dash_housing.saved.v1';
const PAGE = 100;

function loadSaved(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]');
  } catch {
    return [];
  }
}
// 최종 수집 시각 표기 (한국 시간, F7)
function fmtKST(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 16)}`;
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
  // 계정 저장 (Supabase 설정 시에만 활성): 로그인하면 서버 값과 합치고 이후 자동 저장
  const acc = useAccount({
    profile,
    touched,
    saved,
    apply: (x) => {
      setProfile(x.profile);
      setSaved(x.saved);
      setTouched(x.touched);
    },
  });

  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Category | ''>('');
  const [region, setRegion] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [showPast, setShowPast] = useState(false);
  const [archive, setArchive] = useState<Notice[] | null>(null);
  const [overrides, setOverrides] = useState<Overrides | null>(null);
  const [area, setArea] = useState('');
  const [price, setPrice] = useState('');
  const [onlyMatch, setOnlyMatch] = useState(false);
  const [onlyLikely, setOnlyLikely] = useState(false); // 가능성 높음만 보기 (지도 흐림 + 목록)
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
      .then(([file, ov]: [NoticeFile, Overrides | null]) => {
        setOverrides(ov);
        setData({ ...file, notices: applyOverrides(file.notices, ov) });
      })
      .catch((e) => setLoadError(String(e.message ?? e)));
  }, []);

  // 지난 공고(보관 파일)는 첫 화면이 뜬 뒤 천천히 불러온다 — 지난 공고 보기·같은 단지 이전 공고 연결에 사용
  useEffect(() => {
    if (!data || archive) return;
    const t = setTimeout(() => {
      fetch(`${import.meta.env.BASE_URL}data/archive.json`, { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : { notices: [] }))
        .then((a: { notices: Notice[] }) => {
          const ids = new Set(data.notices.map((n) => n.id));
          const hide = new Set(overrides?.hide ?? []);
          setArchive(applyOverrides((a.notices ?? []).filter((n) => !ids.has(n.id) && !hide.has(n.id)), { patch: overrides?.patch }));
        })
        .catch(() => setArchive([]));
    }, showPast ? 0 : 1500);
    return () => clearTimeout(t);
  }, [data, archive, showPast, overrides]);

  // 날짜가 바뀐 뒤 탭으로 돌아오면 새로 불러온다 (매일 06:17 수집 데이터 + 오늘 기준 접수 상태 갱신)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && todayKST() !== today) location.reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [today]);

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

  const current = data?.notices ?? [];
  const allNotices = useMemo(() => (archive?.length ? [...current, ...archive] : current), [current, archive]);
  const notices = showPast ? allNotices : current;
  const verdicts = useMemo(() => {
    const m = new Map<string, Verdict>();
    if (!touched) return m;
    for (const n of allNotices) m.set(n.id, bestVerdict(evaluate(n, profile)));
    return m;
  }, [allNotices, profile, touched]);

  // 지도 외 조건으로 거른 목록 (지도 마커용)
  const baseFiltered = useMemo(() => {
    const qq = q.trim();
    const ab = AREA_BUCKETS.find((b) => b.key === area)!;
    const pb = PRICE_BUCKETS.find((b) => b.key === price)!;
    const list = notices.filter((n) => {
      if (cat && n.category !== cat) return false;
      if (region && n.region !== region) return false;
      if (qq && !`${n.name} ${n.address ?? ''} ${n.region ?? ''}`.includes(qq)) return false;
      const st = receiptStatus(n, today);
      // 기본: 청약 접수일이 지난 공고는 숨김 (날짜는 매일 오늘 기준으로 다시 계산)
      if (status ? st !== status : !showPast && (st === 'closed' || st === 'waiting')) return false;
      if (!matchArea(n, ab) || !matchPrice(n, pb)) return false;
      return true;
    });
    return list;
  }, [notices, q, cat, region, status, showPast, area, price, today]);
  // 맞춤 검색: 불충족 제외 + 매칭 점수순 (맞춤 패널 개수는 제외 전 목록 기준)
  const filtered = useMemo(() => {
    if (!(onlyMatch && touched)) return baseFiltered;
    return baseFiltered.filter((n) => verdicts.get(n.id) !== 'no').sort((a, b) => matchScore(b, profile) - matchScore(a, profile));
  }, [baseFiltered, onlyMatch, touched, verdicts, profile]);

  // 목록: 지도 영역 연동 (D2)
  const listed = useMemo(() => (syncMap && bounds ? filtered.filter((n) => inBounds(n, bounds)) : filtered), [filtered, syncMap, bounds]);
  // F9: 같은 단지 공고는 1건으로 묶는다 (대표: 접수중 → 접수예정 → 일정확인 → 계약 대기 → 지난 공고)
  const groups = useMemo(() => groupByComplex(listed, (n) => STATUS_RANK[receiptStatus(n, today)]), [listed, today]);
  useEffect(() => setLimit(PAGE), [groups.length]);
  // 일정 탭 캘린더: 접수 상태와 무관하게 유형·지역·검색 조건만 적용 (지난 달 막대도 보이도록 보관 공고 포함)
  const calNotices = useMemo(() => {
    const qq = q.trim();
    return allNotices.filter((n) => (!cat || n.category === cat) && (!region || n.region === region) && (!qq || `${n.name} ${n.address ?? ''} ${n.region ?? ''}`.includes(qq)));
  }, [allNotices, cat, region, q]);

  // 보기 필터만 초기화 (저장된 내 조건·관심 공고는 건드리지 않음)
  const activeCount = [q.trim() !== '', cat !== '', region !== '', status !== '', area !== '', price !== '', showPast, onlyMatch, onlyLikely].filter(Boolean).length;
  const resetFilters = () => {
    setQ('');
    setCat('');
    setRegion('');
    setStatus('');
    setArea('');
    setPrice('');
    setShowPast(false);
    setOnlyMatch(false);
    setOnlyLikely(false);
  };

  const selected = allNotices.find((n) => n.id === selectedId);
  const related = useMemo(() => (selected ? findRelated(selected, allNotices) : []), [selected, allNotices]);
  const nearby = useMemo(() => (selected ? nearbyScores(selected, allNotices) : null), [selected, allNotices]);
  // 관심 저장한 단지의 추가모집·무순위 공고 표시용
  const savedKeys = useMemo(() => new Set(allNotices.filter((n) => saved.includes(n.id)).map((n) => complexKey(n.name))), [allNotices, saved]);
  const pastIds = useMemo(() => new Set(notices.filter((n) => ['closed', 'waiting'].includes(receiptStatus(n, today))).map((n) => n.id)), [notices, today]);
  // 같은 공고(마커·카드)를 다시 누르면 닫힘. 데스크톱에서 패널이 닫혀 있었다면 다시 닫아 지도를 넓힌다
  // 탭을 바꾸면 오른쪽 패널을 맨 위부터 보여준다 (맞춤 검색 결과 요약이 먼저 보이도록)
  const sideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    sideRef.current?.scrollTo({ top: 0 });
  }, [tab, onlyMatch]);
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
  // 탭 (F3): 모바일은 하단 탭(지도·공고·관심·일정·내 조건), PC는 오른쪽 패널 위 탭 + 패널 접기 버튼
  const pickTab = (k: Tab) => {
    if (!desktop) {
      setTab(k);
      setSelectedId(undefined);
      return;
    }
    detailOpenedSide.current = false;
    // 탭이 패널 위에 있으므로 같은 탭을 다시 눌러도 패널을 닫지 않는다 (닫기는 › 버튼)
    if (k === 'map') {
      setSideOpen(false);
      setSelectedId(undefined);
      return;
    }
    setTab(k);
    setSelectedId(undefined);
    setSideOpen(true);
  };
  const toggleSave = (id: string) => setSaved((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const closeSide = () => {
    detailOpenedSide.current = false;
    setSideOpen(false);
    setSelectedId(undefined);
  };
  const TABS = ([['map', '🗺️', '지도'], ['list', '📋', '공고'], ['saved', '⭐', `관심${saved.length ? ` ${saved.length}` : ''}`], ['agenda', '📅', '일정'], ['me', '👤', '내 조건']] as const)
    .filter(([k]) => !desktop || k !== 'map'); // PC는 지도가 항상 보이므로 '지도' 탭 대신 패널 접기 버튼
  const tabOn = (k: Tab) => (desktop ? sideOpen && tab === k : tab === k);
  const tabButtons = TABS.map(([k, ic, label]) => (
    <button key={k} className={tabOn(k) ? 'on' : ''} aria-pressed={tabOn(k)} onClick={() => pickTab(k)}>
      <span>{ic}</span>{label}
    </button>
  ));

  return (
    <div className={`app${UI.editorial ? ' ed' : ''}`}>
      <header className="top">
        <div className="brand">
          <span className="logo">🏠</span>
          <div>
            <p className="eyebrow">전국 청약 공고 지도</p>
            <h1>청약맵 <span className="beta-tag">베타</span></h1>
            <p className="muted small tagline">전국 청약 공고 지도 · 내 조건 맞춤 매칭</p>
          </div>
        </div>
        <AccountButton acc={acc} />
        {data?.sample && <div className="banner">샘플 데이터 표시 중 (실제 공고 아님)</div>}
      </header>

      <div className="toolbar">
        <SearchBox q={q} setQ={setQ} notices={notices} archive={showPast ? null : archive} today={today}
          onPick={(id) => { if (!notices.some((n) => n.id === id)) setShowPast(true); select(id); }} onShowPast={() => setShowPast(true)} />
      <div className="filters">
        <select value={cat} onChange={(e) => setCat(e.target.value as Category | '')} aria-label="공급 유형">
          <option value="">전체 유형</option>
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="지역">
          <option value="">전국</option>
          {REGIONS.map((r) => <option key={r}>{r}</option>)}
        </select>
        <select value={status} onChange={(e) => { const v = e.target.value as StatusFilter; setStatus(v); if (v === 'closed' || v === 'waiting') setShowPast(true); }} aria-label="접수 상태">
          <option value="">전체 (지난 공고 제외)</option>
          <option value="upcoming">접수예정</option>
          <option value="open">접수중</option>
          <option value="waiting">발표·계약 대기</option>
          <option value="closed">발표·계약까지 끝난 공고</option>
        </select>
        <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="면적">
          {AREA_BUCKETS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
        </select>
        <select value={price} onChange={(e) => setPrice(e.target.value)} aria-label="가격">
          {PRICE_BUCKETS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
        </select>
        <label className="check" title="청약 접수가 끝난 공고(발표·계약 대기 + 최근 1년 지난 공고)를 함께 표시합니다. 경쟁률·당첨가점 참고용">
          <input type="checkbox" checked={showPast} onChange={(e) => { setShowPast(e.target.checked); if (!e.target.checked && (status === 'closed' || status === 'waiting')) setStatus(''); }} />
          지난 공고{showPast && archive === null ? ' (불러오는 중)' : ''}
        </label>
        <label className="check" title="조건 충족(✓) 공고만 강조하고 나머지는 흐리게">
          <input type="checkbox" checked={onlyLikely} disabled={!touched} onChange={(e) => setOnlyLikely(e.target.checked)} />
          가능성 높음만
        </label>
        <label className="check">
          <input type="checkbox" checked={onlyMatch} onChange={(e) => { setOnlyMatch(e.target.checked); if (e.target.checked && !touched) pickTab('me'); }} />
          내 조건 매칭순
        </label>
      </div>
      </div>

      {activeCount > 0 && (
        <div className="reset-bar">
          <span className="small muted">필터 {activeCount}개 적용 중</span>
          <button className="link small" onClick={resetFilters}>초기화</button>
        </div>
      )}
      <main className={`body tab-${tab} ${sideOpen ? 'side-open' : 'side-closed'}${UI.fadeBottom ? ' fade' : ''}`}>
        {desktop && (
          <nav className="side-tabs" aria-label="패널 전환">
            {tabButtons}
            <button className="side-close" onClick={closeSide} aria-label="패널 접기 (지도 넓게)" title="패널 접기 (지도 넓게)">›</button>
          </nav>
        )}
        <section className="pane-map">
          {desktop && !sideOpen && (
            <button className="side-open-btn" onClick={() => pickTab(tab)} aria-label="목록 패널 열기">‹ 목록 열기</button>
          )}
          <KakaoMap notices={filtered} verdicts={verdicts} pastIds={pastIds} hasProfile={touched} onlyLikely={onlyLikely && touched} today={today} selectedId={selectedId} onSelect={select} onBoundsChange={setBounds} />
        </section>

        <section className="pane-side" ref={sideRef}>
          {tab === 'agenda' ? (
            <Agenda notices={calNotices} savedIds={saved} today={today} onSelect={select} />
          ) : tab === 'saved' ? (
            <SavedList notices={allNotices.filter((n) => saved.includes(n.id))} today={today} verdicts={verdicts}
              selectedId={selectedId} onSelect={select} onUnsave={toggleSave} onBrowse={() => pickTab('list')} />
          ) : tab === 'me' ? (
            <ProfileForm
              profile={profile}
              persisted={persisted}
              onChange={(p) => { setProfile(p); setTouched(true); }}
              onPersist={(on) => { setPersisted(on); if (on) saveProfile(profile); else clearProfile(); }}
              onReset={() => { setProfile(DEFAULT_PROFILE); setTouched(false); }}
              onDeleteAll={() => {
                setProfile(DEFAULT_PROFILE);
                setTouched(false);
                setPersisted(false);
                setSaved([]);
                clearProfile();
                clearLocalChecklists();
                setOnlyLikely(false);
              }}
              onSearch={() => {
                // 입력한 조건으로 맞춤 공고 검색: 진행·예정 공고 중 불충족 제외, 매칭 점수순
                setTouched(true);
                setOnlyMatch(true);
                setStatus('');
                setSyncMap(false);
                pickTab('list');
              }}
            />
          ) : (
            <div className="list">
              <MatchPanel notices={baseFiltered} verdicts={verdicts} touched={touched} today={today}
                onSelect={select} onEditProfile={() => pickTab('me')} />
              <div className="list-head">
                <span className="muted small eyebrow-row">
                  공고 {groups.length.toLocaleString()}건{groups.length !== listed.length && ` (같은 단지 묶음 · 전체 ${listed.length.toLocaleString()}건)`}
                  {data && !data.sample && ` · 최종 수집 ${fmtKST(data.generatedAt)}`}
                </span>
                {bounds && (
                  <label className="check small">
                    <input type="checkbox" checked={syncMap} onChange={(e) => setSyncMap(e.target.checked)} />
                    지도 영역만
                  </label>
                )}
              </div>
              {loadError && <p className="error">데이터를 불러오지 못했습니다: {loadError}</p>}
              {groups.slice(0, limit).map(({ lead: n, others }, i) => (
                <NoticeCard key={n.id} n={n} today={today} verdict={verdicts.get(n.id)} saved={saved.includes(n.id)}
                  savedComplex={!saved.includes(n.id) && isReoffer(n) && savedKeys.has(complexKey(n.name))} more={others.length} idx={i + 1}
                  active={n.id === selectedId || others.some((o) => o.id === selectedId)} onClick={() => select(n.id)} ad={i === 4} />
              ))}
              {groups.length > limit && (
                <button className="btn more" onClick={() => setLimit((l) => l + PAGE)}>더 보기 ({(groups.length - limit).toLocaleString()}건 남음)</button>
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
            onEditProfile={() => pickTab('me')} related={related} onSelectRelated={(id) => setSelectedId(id)} nearby={nearby} />
        )}
      </main>

      {!desktop && <nav className="tabs" aria-label="화면 전환">{tabButtons}</nav>}

      <footer className="app-foot">
        <span>© 2026 Taezzi · Built Nov 2026<span className="foot-long"> · Data: Applyhome (REB), LH, Seoul Housing Portal</span></span>
        <span><span className="foot-long">For reference only — verify with official notices · </span><a href={`${import.meta.env.BASE_URL}privacy`}>Privacy</a> · <a href={`${import.meta.env.BASE_URL}terms`}>Terms</a></span>
      </footer>
    </div>
  );
}

// 관심 공고 탭: 저장한 공고만 모아 보기
function SavedList({ notices, today, verdicts, selectedId, onSelect, onUnsave, onBrowse }: {
  notices: Notice[]; today: string; verdicts: Map<string, Verdict>; selectedId?: string;
  onSelect: (id: string) => void; onUnsave: (id: string) => void; onBrowse: () => void;
}) {
  const sorted = [...notices].sort((a, b) => (nextEvent(a, today)?.start ?? '9999').localeCompare(nextEvent(b, today)?.start ?? '9999'));
  return (
    <div className="list">
      <div className="panel">
        <div className="panel-head"><b>⭐ 관심 공고 {notices.length}건</b></div>
        <p className="small muted" style={{ margin: '0 0 8px' }}>공고 상세에서 "관심 공고 저장"을 누르면 여기에 모입니다. 이 기기 브라우저에 저장됩니다.</p>
        <button className="btn primary" disabled={!notices.length} onClick={() => downloadIcs(notices)}>📅 관심 공고 일정 캘린더로 받기</button>
      </div>
      {!notices.length && (
        <div className="empty">
          <p className="muted">아직 저장한 공고가 없습니다.</p>
          <button className="btn" onClick={onBrowse}>공고 둘러보기</button>
        </div>
      )}
      {sorted.map((n) => (
        <div key={n.id} className="saved-row">
          <NoticeCard n={n} today={today} verdict={verdicts.get(n.id)} saved active={n.id === selectedId} onClick={() => onSelect(n.id)} ad={false} />
          <button className="icon-btn unsave" aria-label="관심 해제" title="관심 해제" onClick={() => onUnsave(n.id)}>✕</button>
        </div>
      ))}
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

// 지난 공고 카드 요약: 공고일 + 1순위 최고 경쟁률·최저 당첨가점
function pastSummary(n: Notice): string {
  const parts = [`${n.dates.announce ?? ''} 공고`];
  const rates = (n.competition ?? []).map((c) => c.local?.rate ?? c.other?.rate).filter((r): r is number => r !== undefined && r > 0);
  if (rates.length) parts.push(`1순위 최고 ${Math.max(...rates).toFixed(1)}:1`);
  const mins = (n.scores ?? []).map((x) => x.min).filter((x): x is number => x !== undefined);
  if (mins.length) parts.push(`최저 가점 ${Math.min(...mins)}점`);
  return parts.join(' · ');
}

const V_LABEL = { likely: '조건 충족', check: '추가 확인', no: '조건 불충족' } as const;
const V_ICON = { likely: '✓', check: '△', no: '✗' } as const;
const STATUS_RANK: Record<ReceiptStatus, number> = { open: 0, upcoming: 1, unknown: 2, waiting: 3, closed: 4 };

function NoticeCard({ n, today, verdict, saved, savedComplex, more = 0, idx, active, onClick, ad }: {
  n: Notice; today: string; verdict?: Verdict; saved: boolean; savedComplex?: boolean; more?: number; idx?: number; active: boolean; onClick: () => void; ad: boolean;
}) {
  const next = nextEvent(n, today);
  const dd = next ? dday(next.start, today) : null;
  const st = receiptStatus(n, today);
  return (
    <>
      <button className={`card ${active ? 'active' : ''} ${st === 'closed' || st === 'waiting' ? 'past' : ''}`} onClick={onClick}>
        <div className="card-top">
          <span className="tag">{CATEGORY_LABEL[n.category]}</span>
          {n.subType && <span className="tag soft">{n.subType}</span>}
          <span className={`tag st-${st}`}>{RECEIPT_LABEL[st]}</span>
          {savedComplex && <span className="tag hot">관심 단지 추가모집</span>}
          {n.manual && <span className="tag soft">수동 등록</span>}
          {n.removedAt && <span className="tag danger">취소·삭제 의심</span>}
          {!n.removedAt && recentlyChanged(n, today) && <span className="tag warn">일정 변경</span>}
          {!n.removedAt && !recentlyChanged(n, today) && n.corrected && <span className="tag warn">정정</span>}
          {more > 0 && <span className="tag more" title="같은 단지의 다른 공고(정정·무순위 등)는 상세 맨 아래에서 볼 수 있습니다">같은 단지 +{more}건</span>}
          {verdict && <span className={`pill ${verdict}`}>{V_ICON[verdict]} {V_LABEL[verdict]}</span>}
          {saved && <span className="star">★</span>}
        </div>
        <b className="card-title">{n.name}</b>
        {idx !== undefined && <span className="card-idx" aria-hidden="true">{String(idx).padStart(2, '0')}</span>}
        <span className="muted small">{n.address ?? n.region}</span>
        {next && (
          <span className="next">
            {next.kind} {next.start.slice(5).replace('-', '.')}
            <em>{dd !== null && dd <= 0 ? '진행중' : `D-${dd}`}</em>
          </span>
        )}
        {!next && st === 'closed' && <span className="muted small">{pastSummary(n)}</span>}
      </button>
      {ad && <AdSlot />}
    </>
  );
}
