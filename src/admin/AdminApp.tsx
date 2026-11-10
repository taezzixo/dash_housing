import { useEffect, useMemo, useState } from 'react';
import type { Category, Notice, NoticeFile, Overrides, RunLog } from '../types.ts';
import { CATEGORY_LABEL } from '../types.ts';
import { CRITERIA_VERSIONS } from '../config/criteria.ts';
import { REGIONS } from '../lib/profile.ts';
import { recentlyChanged } from '../lib/filters.ts';
import { todayKST } from '../lib/schedule.ts';
import { accountEnabled, adminStats } from '../lib/account.ts';

// 관리자페이지 (A4 ①조회 + ②수동 보정)
// 서버 없음: 공개 데이터 파일을 읽어 보여주고, 수정은 GitHub에서 overrides.json을 편집한다.
const REPO = 'taezzixo/dash_housing';
const EDIT_OVERRIDES = `https://github.com/${REPO}/edit/main/public/data/overrides.json`;
const ACTIONS = `https://github.com/${REPO}/actions/workflows/deploy.yml`;
const GEO_LABEL: Record<string, string> = { address: '주소 정확', district: '시군구·동 근사', region: '시·도 중심', none: '위치 없음' };

type Section = 'run' | 'quality' | 'changes' | 'manual' | 'members' | 'criteria';

export default function AdminApp() {
  const [file, setFile] = useState<NoticeFile | null>(null);
  const [log, setLog] = useState<RunLog | null>(null);
  const [ov, setOv] = useState<Overrides | null>(null);
  const [sec, setSec] = useState<Section>('run');
  const today = todayKST();

  useEffect(() => {
    const get = (p: string) => fetch(`${import.meta.env.BASE_URL}data/${p}`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    get('notices.json').then(setFile);
    get('run-log.json').then(setLog);
    get('overrides.json').then(setOv);
  }, []);

  const notices = file?.notices ?? [];
  return (
    <div className="admin">
      <header>
        <h1>청약맵 관리자</h1>
        <p className="muted small">
          데이터 갱신 {file ? new Date(file.generatedAt).toLocaleString('ko-KR') : '-'} · 공고 {notices.length.toLocaleString()}건
          {file?.sample && ' · ⚠️ 샘플 데이터'}
        </p>
        <div className="row">
          <a className="btn" href={ACTIONS} target="_blank" rel="noreferrer">▶ 수집 지금 실행 (GitHub Actions)</a>
          <a className="btn" href={EDIT_OVERRIDES} target="_blank" rel="noreferrer">✏️ 보정 파일 수정 (GitHub)</a>
          <a className="btn" href="/">← 사이트로</a>
        </div>
      </header>
      <nav className="admin-tabs">
        {([['run', '수집 현황'], ['quality', '데이터 품질'], ['changes', '변경 감지'], ['manual', '수동 보정'], ['members', '회원'], ['criteria', '판정 기준']] as const).map(([k, l]) => (
          <button key={k} className={sec === k ? 'on' : ''} onClick={() => setSec(k)}>{l}</button>
        ))}
      </nav>
      <main>
        {sec === 'run' && <RunPanel log={log} />}
        {sec === 'quality' && <QualityPanel notices={notices} />}
        {sec === 'changes' && <ChangesPanel notices={notices} today={today} />}
        {sec === 'manual' && <ManualPanel ov={ov} notices={notices} />}
        {sec === 'members' && <MembersPanel notices={notices} />}
        {sec === 'criteria' && <CriteriaPanel />}
      </main>
    </div>
  );
}

function RunPanel({ log }: { log: RunLog | null }) {
  if (!log) return <p className="muted">수집 기록이 아직 없습니다. 다음 자동 수집(매일 06:17) 이후 표시됩니다.</p>;
  const r = log.last;
  return (
    <>
      <div className={`status ${r.ok ? 'ok' : 'bad'}`}>
        <b>{r.ok ? '✅ 마지막 수집 정상' : '⚠️ 마지막 수집에 실패한 출처가 있음'}</b>
        <span>{new Date(r.runAt).toLocaleString('ko-KR')} · {r.durationSec}초 · 진행 {r.total.toLocaleString()}건 · 지난 공고 보관 {(r.archived ?? 0).toLocaleString()}건 · 오늘 일정 변경 {r.changedToday ?? 0} · 사라짐 {r.removedToday ?? 0}</span>
      </div>
      <div className="cards">
        {r.sources.map((s) => (
          <div key={s.id} className={`card ${s.ok ? '' : 'bad'}`}>
            <b>{s.label}</b>
            <span className="big">{s.ok ? `${s.count.toLocaleString()}건` : '실패'}</span>
            {s.error && <code className="err">{s.error}</code>}
          </div>
        ))}
      </div>
      <h3>최근 실행 기록</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>실행 시각</th><th>결과</th><th>총 건수</th><th>일정 변경</th><th>사라짐</th><th>실패 출처</th></tr></thead>
          <tbody>
            {log.history.map((h) => (
              <tr key={h.runAt}>
                <td>{new Date(h.runAt).toLocaleString('ko-KR')}</td>
                <td>{h.ok ? '정상' : '일부 실패'}</td>
                <td>{h.total.toLocaleString()}</td>
                <td>{h.changedToday ?? 0}</td>
                <td>{h.removedToday ?? 0}</td>
                <td>{h.sources.filter((s) => !s.ok).map((s) => s.label).join(', ') || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function QualityPanel({ notices }: { notices: Notice[] }) {
  const [filter, setFilter] = useState<string>('none');
  const dist = useMemo(() => {
    const m: Record<string, number> = {};
    for (const n of notices) m[n.geoPrecision ?? 'none'] = (m[n.geoPrecision ?? 'none'] ?? 0) + 1;
    return m;
  }, [notices]);
  const issues = useMemo(() => {
    const m: Record<string, number> = {};
    for (const n of notices) for (const x of n.issues ?? []) m[x] = (m[x] ?? 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [notices]);
  const list = filter.startsWith('issue:')
    ? notices.filter((n) => n.issues?.includes(filter.slice(6)))
    : notices.filter((n) => (n.geoPrecision ?? 'none') === filter);
  return (
    <>
      <h3>지도 위치 정확도</h3>
      <div className="cards">
        {['address', 'district', 'region', 'none'].map((k) => (
          <button key={k} className={`card ${filter === k ? 'sel' : ''}`} onClick={() => k !== 'address' && setFilter(k)}>
            <b>{GEO_LABEL[k]}</b><span className="big">{(dist[k] ?? 0).toLocaleString()}</span>
          </button>
        ))}
      </div>
      <h3>정합성 점검 (빠진 정보·일정 순서 이상)</h3>
      <div className="cards">
        {issues.map(([k, v]) => (
          <button key={k} className={`card ${filter === 'issue:' + k ? 'sel' : ''}`} onClick={() => setFilter('issue:' + k)}>
            <b>{k}</b><span className="big">{v.toLocaleString()}</span>
          </button>
        ))}
        {!issues.length && <p className="muted small">점검 결과가 아직 없습니다 (다음 수집 후 표시).</p>}
      </div>
      <p className="muted small">
        위치를 고치려면 "보정값 복사"를 눌러 GitHub의 overrides.json `patch`에 붙여넣고 좌표를 고칩니다(카카오맵에서 위치를 길게 누르면 좌표 확인).
        일정·주소가 빠진 공고는 원문을 보고 patch에 address 등을 넣을 수 있습니다.
      </p>
      <List notices={list.slice(0, 200)} action={(n) => <CopyBtn text={`"${n.id}": { "lat": ${n.lat ?? 0}, "lng": ${n.lng ?? 0}, "note": "" },`} label="보정값 복사" />} />
      {list.length > 200 && <p className="muted small">상위 200건만 표시</p>}
    </>
  );
}

function ChangesPanel({ notices, today }: { notices: Notice[]; today: string }) {
  const changed = notices.filter((n) => recentlyChanged(n, today));
  const removed = notices.filter((n) => n.removedAt);
  const corrected = notices.filter((n) => n.corrected);
  return (
    <>
      <h3>일정 변경 (최근 14일) {changed.length}건</h3>
      <List notices={changed} extra={(n) => n.changes!.slice(-3).map((c, i) => <div key={i} className="small muted">{c.at} {c.field}: {c.from} → {c.to ?? '삭제'}</div>)} />
      <h3>취소·삭제 의심 {removed.length}건</h3>
      <p className="muted small">출처 목록에서 사라졌지만 일정이 남아 있던 공고입니다. 원문을 확인해서 실제로 취소됐으면 숨김 처리하세요.</p>
      <List notices={removed} action={(n) => <CopyBtn text={`"${n.id}",`} label="숨김 id 복사" />} />
      <h3>정정 공고 {corrected.length}건</h3>
      <List notices={corrected.slice(0, 100)} />
    </>
  );
}

const EMPTY_MANUAL = { name: '', subType: 'SH 행복주택', region: '서울', address: '', announce: '', receiptStart: '', receiptEnd: '', winner: '', url: '', category: 'LH' as Category };

function ManualPanel({ ov, notices }: { ov: Overrides | null; notices: Notice[] }) {
  const [f, setF] = useState(EMPTY_MANUAL);
  const id = `manual-${(f.announce || todayKST()).replaceAll('-', '')}-${Math.abs([...f.name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) % 100000}`;
  const snippet = JSON.stringify(
    {
      id,
      category: f.category,
      subType: f.subType || undefined,
      name: f.name,
      region: f.region,
      address: f.address || undefined,
      url: f.url || undefined,
      dates: Object.fromEntries(Object.entries({ announce: f.announce, receiptStart: f.receiptStart, receiptEnd: f.receiptEnd, winner: f.winner }).filter(([, v]) => v)),
    },
    null,
    2,
  );
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const manual = ov?.manual ?? [];
  return (
    <>
      <div className="cards">
        <div className="card"><b>숨김</b><span className="big">{ov?.hide?.length ?? 0}</span></div>
        <div className="card"><b>위치·내용 수정</b><span className="big">{Object.keys(ov?.patch ?? {}).length}</span></div>
        <div className="card"><b>수동 등록</b><span className="big">{manual.length}</span></div>
      </div>

      <h3>수동 공고 등록 (SH·GH 등 자동 수집이 안 되는 공고)</h3>
      <ol className="small muted">
        <li>아래 양식을 채우고 "JSON 복사"를 누릅니다.</li>
        <li>"보정 파일 수정 (GitHub)"을 열어 <code>"manual": [ ]</code> 대괄호 안에 붙여넣습니다. 여러 개면 쉼표로 구분합니다.</li>
        <li>Commit changes를 누르면 1~2분 뒤 사이트에 반영됩니다. 주소를 넣으면 다음 수집 때 좌표를 찾습니다.</li>
      </ol>
      <div className="form">
        <label>공고명<input value={f.name} onChange={set('name')} placeholder="예: 2026년 SH 행복주택 입주자 모집" /></label>
        <label>유형
          <select value={f.category} onChange={set('category')}>{(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select>
        </label>
        <label>세부유형<input value={f.subType} onChange={set('subType')} list="rent-subtypes" placeholder="예: SH 행복주택" />
          <datalist id="rent-subtypes">
            {/* F12: SH·GH 임대는 자동 수집하지 않으므로 수동 등록 시 유형 이름을 통일한다 */}
            {['SH', 'GH'].flatMap((o) => ['행복주택', '국민임대', '장기전세', '매입임대', '영구임대'].map((t) => <option key={o + t} value={`${o} ${t}`} />))}
          </datalist>
        </label>
        <label>지역<select value={f.region} onChange={set('region')}>{REGIONS.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label>주소<input value={f.address} onChange={set('address')} placeholder="서울특별시 OO구 OO동 123" /></label>
        <label>공고일<input type="date" value={f.announce} onChange={set('announce')} /></label>
        <label>접수 시작<input type="date" value={f.receiptStart} onChange={set('receiptStart')} /></label>
        <label>접수 마감<input type="date" value={f.receiptEnd} onChange={set('receiptEnd')} /></label>
        <label>당첨 발표<input type="date" value={f.winner} onChange={set('winner')} /></label>
        <label>원문 URL<input value={f.url} onChange={set('url')} placeholder="https://..." /></label>
      </div>
      <pre className="snippet">{snippet}</pre>
      <div className="row">
        <CopyBtn text={snippet} label="JSON 복사" disabled={!f.name} />
        <a className="btn" href={EDIT_OVERRIDES} target="_blank" rel="noreferrer">보정 파일 열기 (GitHub)</a>
      </div>

      <h3>현재 수동 등록 공고</h3>
      <List notices={notices.filter((n) => n.manual)} />
    </>
  );
}

// 회원 통계 (집계만, 개인별 내용은 보지 않음)
function MembersPanel({ notices }: { notices: Notice[] }) {
  const [st, setSt] = useState<Record<string, any> | null | undefined>(undefined);
  useEffect(() => {
    adminStats().then(setSt).catch(() => setSt(null));
  }, []);
  if (!accountEnabled) return <p className="muted">계정 저장 기능이 꺼져 있습니다. Supabase 설정 후 표시됩니다 (docs/ACCOUNT.md).</p>;
  if (st === undefined) return <p className="muted">불러오는 중…</p>;
  if (!st) return <p className="muted">통계를 불러오지 못했습니다. supabase/schema.sql 실행 여부를 확인하세요.</p>;
  const name = (id: string) => notices.find((n) => n.id === id)?.name ?? id;
  return (
    <>
      <div className="cards">
        <div className="card"><b>가입자</b><span className="big">{st.members}</span></div>
        <div className="card"><b>최근 7일 접속</b><span className="big">{st.members_7d}</span></div>
        <div className="card"><b>소득·자산 서버 저장</b><span className="big">{st.with_financial}</span></div>
        <div className="card"><b>관심 공고 저장 수</b><span className="big">{st.saved_total}</span></div>
      </div>
      <h3>많이 저장된 공고 TOP 10</h3>
      <ol className="small">{(st.top_saved ?? []).map((t: any) => <li key={t.notice_id}>{name(t.notice_id)} — {t.cnt}명</li>)}</ol>
      <h3>회원 거주지 분포</h3>
      <p className="small">{Object.entries(st.regions ?? {}).map(([k, v]) => `${k || '미입력'} ${v}`).join(' · ') || '-'}</p>
      <p className="muted small">개인별 조건·소득은 관리자도 볼 수 없도록 집계만 제공합니다.</p>
    </>
  );
}

function CriteriaPanel() {
  return (
    <>
      <p className="muted small">판정 기준은 <code>src/config/criteria.ts</code>에서 관리합니다. 기준이 바뀌면 새 버전을 맨 앞에 추가하세요(기존 버전은 지우지 않음).</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>버전</th><th>적용 시작(모집공고일)</th><th>값 확인일</th><th>월평균소득 3인 이하</th><th>출처</th></tr></thead>
          <tbody>
            {CRITERIA_VERSIONS.map((c) => (
              <tr key={c.id}><td>{c.id}</td><td>{c.effectiveFrom}</td><td>{c.checkedAt}</td><td>{c.monthlyIncome100[3]}만원</td><td>{c.source}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function List({ notices, action, extra }: { notices: Notice[]; action?: (n: Notice) => React.ReactNode; extra?: (n: Notice) => React.ReactNode }) {
  if (!notices.length) return <p className="muted small">해당 없음</p>;
  return (
    <ul className="alist">
      {notices.map((n) => (
        <li key={n.id}>
          <div>
            <a href={`/?id=${encodeURIComponent(n.id)}`} target="_blank" rel="noreferrer">{n.name}</a>
            <div className="small muted">{CATEGORY_LABEL[n.category]} · {n.region ?? '-'} · {n.address ?? '주소 없음'} · <code>{n.id}</code></div>
            {extra?.(n)}
          </div>
          {action?.(n)}
        </li>
      ))}
    </ul>
  );
}

function CopyBtn({ text, label, disabled }: { text: string; label: string; disabled?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn" disabled={disabled} onClick={async () => {
      try {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      } catch {
        prompt('복사하세요', text);
      }
    }}>{done ? '복사됨 ✓' : label}</button>
  );
}
