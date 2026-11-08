import { useEffect, useMemo, useState } from 'react';
import type { Category, Notice, NoticeFile, Profile, Verdict } from './types.ts';
import { CATEGORY_LABEL } from './types.ts';
import { bestVerdict, evaluate, matchScore } from './lib/eligibility.ts';
import { clearProfile, loadProfile, REGIONS, saveProfile } from './lib/profile.ts';
import { dday, nextEvent, todayKST } from './lib/schedule.ts';
import { KakaoMap } from './components/KakaoMap.tsx';
import { NoticeDetail } from './components/NoticeDetail.tsx';
import { ProfileForm } from './components/ProfileForm.tsx';
import { Agenda } from './components/Agenda.tsx';
import { AdSlot } from './components/AdSlot.tsx';

type Tab = 'map' | 'list' | 'agenda' | 'me';
const SAVED_KEY = 'dash_housing.saved.v1';

function loadSaved(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export default function App() {
  const [data, setData] = useState<NoticeFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('map');
  const [selectedId, setSelectedId] = useState<string>();
  const initial = useMemo(loadProfile, []);
  const [profile, setProfile] = useState<Profile>(initial.profile);
  const [persisted, setPersisted] = useState(initial.persisted);
  const [touched, setTouched] = useState(initial.persisted);
  const [saved, setSaved] = useState<string[]>(loadSaved);

  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Category | ''>('');
  const [region, setRegion] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [onlyMatch, setOnlyMatch] = useState(false);
  const today = todayKST();

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/notices.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setLoadError(String(e.message ?? e)));
  }, []);

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

  const filtered = useMemo(() => {
    const qq = q.trim();
    let list = notices.filter((n) => {
      if (cat && n.category !== cat) return false;
      if (region && n.region !== region) return false;
      if (qq && !`${n.name} ${n.address ?? ''} ${n.region ?? ''}`.includes(qq)) return false;
      if (onlyOpen) {
        const last = n.dates.contractEnd ?? n.dates.receiptEnd ?? n.dates.rank2End ?? n.dates.rank1End ?? n.dates.winner ?? n.dates.announce;
        if (last && last < today) return false;
      }
      if (onlyMatch && touched && verdicts.get(n.id) === 'no') return false;
      return true;
    });
    if (touched && onlyMatch) list = [...list].sort((a, b) => matchScore(b, profile) - matchScore(a, profile));
    return list;
  }, [notices, q, cat, region, onlyOpen, onlyMatch, touched, verdicts, profile, today]);

  const selected = notices.find((n) => n.id === selectedId);
  const select = (id: string) => setSelectedId(id);
  const toggleSave = (id: string) => setSaved((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const matchCount = touched ? notices.filter((n) => verdicts.get(n.id) === 'likely').length : 0;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo">🏠</span>
          <div>
            <h1>청약맵</h1>
            <p className="muted small">전국 청약 공고 지도 · 내 조건 맞춤 매칭</p>
          </div>
        </div>
        {data?.sample && <div className="banner">샘플 데이터 표시 중 (실제 공고 아님)</div>}
      </header>

      <div className="filters">
        <input type="search" placeholder="단지명·지역 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value as Category | '')}>
          <option value="">전체 유형</option>
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <select value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">전국</option>
          {REGIONS.map((r) => <option key={r}>{r}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />진행·예정만</label>
        <label className="check">
          <input type="checkbox" checked={onlyMatch} onChange={(e) => { setOnlyMatch(e.target.checked); if (e.target.checked && !touched) setTab('me'); }} />
          내 조건 매칭순
        </label>
      </div>

      <main className={`body tab-${tab}`}>
        <section className="pane-map">
          <KakaoMap notices={filtered} verdicts={verdicts} selectedId={selectedId} onSelect={select} />
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
              <p className="muted small list-count">
                공고 {filtered.length}건{touched && ` · 지원 가능성 높음 ${matchCount}건`}
                {data && ` · 갱신 ${data.generatedAt.slice(0, 10)}`}
              </p>
              {loadError && <p className="error">데이터를 불러오지 못했습니다: {loadError}</p>}
              {filtered.map((n, i) => (
                <NoticeCard key={n.id} n={n} today={today} verdict={verdicts.get(n.id)} saved={saved.includes(n.id)}
                  active={n.id === selectedId} onClick={() => select(n.id)} ad={i === 4} />
              ))}
            </div>
          )}
        </section>

        {selected && (
          <NoticeDetail notice={selected} profile={profile} hasProfile={touched} today={today}
            saved={saved.includes(selected.id)} onToggleSave={() => toggleSave(selected.id)} onClose={() => setSelectedId(undefined)}
            onEditProfile={() => { setSelectedId(undefined); setTab('me'); }} />
        )}
      </main>

      <nav className="tabs" aria-label="화면 전환">
        {([['map', '🗺️', '지도'], ['list', '📋', '공고'], ['agenda', '📅', '일정'], ['me', '👤', '내 조건']] as const).map(([k, ic, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><span>{ic}</span>{label}</button>
        ))}
      </nav>
    </div>
  );
}

const V_LABEL = { likely: '지원 가능성 높음', check: '확인 필요', no: '조건 미충족' } as const;

function NoticeCard({ n, today, verdict, saved, active, onClick, ad }: {
  n: Notice; today: string; verdict?: Verdict; saved: boolean; active: boolean; onClick: () => void; ad: boolean;
}) {
  const next = nextEvent(n, today);
  const dd = next ? dday(next.start, today) : null;
  return (
    <>
      <button className={`card ${active ? 'active' : ''}`} onClick={onClick}>
        <div className="card-top">
          <span className="tag">{CATEGORY_LABEL[n.category]}</span>
          {n.subType && <span className="tag soft">{n.subType}</span>}
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
