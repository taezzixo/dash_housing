import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../types.ts';
import {
  accountEnabled, clearLocalChecklists, deleteAccount, loadRemote, mergeOnLogin, readLocalChecklists,
  saveRemote, sb, signIn, signOut, writeLocalChecklists,
} from '../lib/account.ts';

type Status = 'idle' | 'saving' | 'saved' | 'error';
const FIN_KEY = 'dash_housing.includeFinancial';

/** 로그인 상태 + 자동 동기화. 로그인 중에는 내 조건·관심 공고·서류 체크가 바뀔 때마다 계정에 저장 */
export function useAccount(opts: {
  profile: Profile;
  touched: boolean;
  saved: string[];
  apply: (s: { profile: Profile; saved: string[]; touched: boolean }) => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [includeFinancial, setIncludeFinancialState] = useState(() => sessionStorage.getItem(FIN_KEY) === '1');
  const [checkTick, setCheckTick] = useState(0);
  const ready = useRef(false); // 로그인 직후 합치기가 끝나야 자동 저장 시작
  const latest = useRef(opts);
  latest.current = opts;

  const save = async (fin = includeFinancial) => {
    const s = session ?? (await (await sb()).auth.getSession()).data.session;
    if (!s) return;
    setStatus('saving');
    try {
      const o = latest.current;
      await saveRemote(s.user.id, o.profile, fin, o.saved, readLocalChecklists());
      setStatus('saved');
      setLastSaved(new Date());
    } catch {
      setStatus('error');
    }
  };

  // 세션 감시
  useEffect(() => {
    if (!accountEnabled) return;
    let unsub: (() => void) | undefined;
    let alive = true;
    sb().then((c) => {
      if (!alive) return;
      c.auth.getSession().then(({ data }) => setSession(data.session));
      const { data } = c.auth.onAuthStateChange((_e, s) => setSession(s));
      unsub = () => data.subscription.unsubscribe();
    });
    return () => {
      alive = false;
      unsub?.();
    };
  }, []);

  // 로그인되면: 서버 값 불러와 합치고, 로그인 직후라면 바로 저장
  useEffect(() => {
    if (!session) {
      ready.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const remote = await loadRemote();
        if (cancelled) return;
        const o = latest.current;
        const m = mergeOnLogin({ profile: o.profile, touched: o.touched, saved: o.saved, checklists: readLocalChecklists() }, remote);
        writeLocalChecklists(m.checklists);
        o.apply({ profile: m.profile, saved: m.saved, touched: m.touched });
        const fin = remote.exists ? remote.includeFinancial || includeFinancial : includeFinancial;
        setIncludeFinancialState(fin);
        ready.current = true;
        if (sessionStorage.getItem('dash_housing.pendingSave') || !remote.exists) {
          sessionStorage.removeItem('dash_housing.pendingSave');
          setTimeout(() => save(fin), 0);
        } else {
          setStatus('saved');
        }
      } catch {
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 서류 체크 변경 알림 (NoticeDetail에서 발생)
  useEffect(() => {
    const on = () => setCheckTick((t) => t + 1);
    window.addEventListener('dash:checklist', on);
    return () => window.removeEventListener('dash:checklist', on);
  }, []);

  // 자동 저장 (1.5초 모아서)
  useEffect(() => {
    if (!session || !ready.current) return;
    const t = setTimeout(() => save(), 1500);
    return () => clearTimeout(t);
  }, [opts.profile, opts.saved, checkTick, session]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    enabled: accountEnabled,
    session,
    status,
    lastSaved,
    includeFinancial,
    setIncludeFinancial: (on: boolean) => {
      setIncludeFinancialState(on);
      sessionStorage.setItem(FIN_KEY, on ? '1' : '0');
      if (session) save(on);
    },
    saveNow: () => save(),
    signIn: (provider: 'kakao' | 'google', fin: boolean) => {
      sessionStorage.setItem(FIN_KEY, fin ? '1' : '0');
      return signIn(provider);
    },
    signOut: async (clearDevice: boolean) => {
      await signOut();
      if (clearDevice) {
        clearLocalChecklists();
        try {
          localStorage.removeItem('dash_housing.profile.v1');
          localStorage.removeItem('dash_housing.saved.v1');
        } catch {
          /* ignore */
        }
        location.reload();
      }
    },
    deleteAccount: async () => {
      await deleteAccount();
      location.reload();
    },
  };
}

export type AccountApi = ReturnType<typeof useAccount>;

/** 헤더 오른쪽 위 버튼 */
export function AccountButton({ acc }: { acc: AccountApi }) {
  const [open, setOpen] = useState(false);
  if (!acc.enabled) return null;
  const label = !acc.session
    ? '💾 내 정보 저장'
    : acc.status === 'saving' ? '저장 중…'
      : acc.status === 'error' ? '⚠️ 저장 실패'
        : `✓ 저장됨${acc.lastSaved ? ` ${acc.lastSaved.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : ''}`;
  return (
    <div className="account">
      <button className={`btn ${acc.session ? '' : 'primary'}`} onClick={() => setOpen((o) => !o)}>{label}</button>
      {open && (acc.session ? <AccountMenu acc={acc} onClose={() => setOpen(false)} /> : <ConsentDialog acc={acc} onClose={() => setOpen(false)} />)}
    </div>
  );
}

function ConsentDialog({ acc, onClose }: { acc: AccountApi; onClose: () => void }) {
  const [agree, setAgree] = useState(false);
  const [fin, setFin] = useState(false);
  return (
    <div className="popover" role="dialog" aria-label="내 정보 저장">
      <b>내 정보 저장</b>
      <p className="small muted">로그인하면 내 조건·관심 공고·서류 체크가 계정에 저장되어 어느 기기에서든 불러올 수 있습니다. 이메일·전화번호는 받지 않고, 로그인 서비스의 고유번호로만 구분합니다.</p>
      <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>(필수) 자격 판정·맞춤 공고 제공을 위해 내 조건·관심 공고·서류 체크를 저장하는 데 동의합니다. 탈퇴하면 즉시 삭제됩니다.</span></label>
      <label className="check"><input type="checkbox" checked={fin} onChange={(e) => setFin(e.target.checked)} /><span>(선택) 소득·자산 금액도 계정에 저장합니다. 선택하지 않으면 이 기기에만 남습니다.</span></label>
      <div className="row">
        <button className="btn kakao" disabled={!agree} onClick={() => acc.signIn('kakao', fin)}>카카오로 시작</button>
        <button className="btn" disabled={!agree} onClick={() => acc.signIn('google', fin)}>Google로 시작</button>
      </div>
      <p className="small muted"><a href="/privacy" target="_blank" rel="noreferrer">개인정보처리방침</a> · <button className="link small" onClick={onClose}>닫기</button></p>
    </div>
  );
}

function AccountMenu({ acc, onClose }: { acc: AccountApi; onClose: () => void }) {
  const provider = acc.session?.user.app_metadata?.provider === 'kakao' ? '카카오' : acc.session?.user.app_metadata?.provider === 'google' ? 'Google' : '';
  return (
    <div className="popover" role="menu">
      <b>{provider} 계정으로 저장 중</b>
      <p className="small muted">내 조건·관심 공고·서류 체크가 바뀌면 자동 저장됩니다.</p>
      <label className="check"><input type="checkbox" checked={acc.includeFinancial} onChange={(e) => acc.setIncludeFinancial(e.target.checked)} /><span>소득·자산 금액도 계정에 저장</span></label>
      <div className="row">
        <button className="btn" onClick={() => acc.saveNow()}>지금 저장</button>
        <button className="btn" onClick={() => { onClose(); acc.signOut(false); }}>로그아웃</button>
        <button className="btn" onClick={() => { onClose(); acc.signOut(true); }}>로그아웃 + 이 기기 정보 지우기</button>
      </div>
      <button className="link small danger-text" onClick={() => { if (confirm('계정과 저장된 정보를 모두 삭제할까요? 되돌릴 수 없습니다.')) acc.deleteAccount(); }}>회원 탈퇴 (즉시 삭제)</button>
    </div>
  );
}
