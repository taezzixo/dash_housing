import { useEffect, useRef, useState } from 'react';
import type { Notice, Verdict } from '../types.ts';
import type { Bounds, ReceiptStatus } from '../lib/filters.ts';
import { receiptStatus } from '../lib/filters.ts';

declare global {
  interface Window {
    kakao: any;
  }
}

const KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
let sdkPromise: Promise<any> | null = null;

function loadSdk(): Promise<any> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KEY}&autoload=false&libraries=clusterer,services`;
    s.onload = () => window.kakao.maps.load(() => resolve(window.kakao));
    s.onerror = () => reject(new Error('카카오맵 SDK 로드 실패 (도메인 등록·키 확인)'));
    document.head.appendChild(s);
  });
  return sdkPromise;
}

// 지도 색은 접수 상태만 뜻한다 (F5). 판정(충족·추가확인·불충족)은 색이 아니라 목록 배지·토글로 표현한다.
export const STATUS_COLOR: Record<ReceiptStatus, string> = {
  upcoming: '#2563eb', // 접수예정: 파랑
  open: '#059669', // 접수중: 초록
  waiting: '#7c3aed', // 발표·계약 대기: 보라
  closed: '#64748b', // 지난 공고: 회색
  unknown: '#0891b2', // 일정확인: 청록
};
export const STATUS_SHORT: Record<ReceiptStatus, string> = {
  upcoming: '접수예정',
  open: '접수중',
  waiting: '계약 대기',
  closed: '지난 공고',
  unknown: '일정확인',
};
const CAT_SHORT: Record<string, string> = {
  APT: '아파트',
  OFFICETEL: '오피스텔',
  REMNDR: '무순위',
  PBL_PVT_RENT: '공공임대',
  OPT: '임의공급',
  LH: 'LH',
  YOUTH: '청년안심',
};

// 클러스터 3단계: 1~9 / 10~29 / 30+ (F1). 단색 계열 농도와 크기만 키운다.
const CLUSTER_STYLES = [
  { size: 34, alpha: 0.72 },
  { size: 44, alpha: 0.86 },
  { size: 56, alpha: 1 },
].map((s) => ({
  width: `${s.size}px`,
  height: `${s.size}px`,
  lineHeight: `${s.size}px`,
  borderRadius: '50%',
  background: `rgba(15, 23, 42, ${s.alpha})`,
  color: '#ffffff',
  textAlign: 'center',
  fontWeight: '700',
  fontSize: '13px',
  border: '2px solid #ffffff',
  boxShadow: '0 1px 6px rgba(0,0,0,.3)',
}));

const LABEL_MAX_LEVEL = 7; // 이 확대 수준 이하에서 단지 라벨 표시
const LABEL_LIMIT = 120; // 한 번에 그리는 라벨 수 상한
const CLUSTER_MIN_LEVEL = 8; // 이 수준 이상에서 클러스터링

function pinSvg(color: string, selected = false) {
  const stroke = selected ? `stroke="#fff" stroke-width="2.5"` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="-2 -2 32 42"><path d="M14 0C6.3 0 0 6.2 0 13.9 0 24.3 14 38 14 38s14-13.7 14-24.1C28 6.2 21.7 0 14 0z" fill="${color}" ${stroke}/><circle cx="14" cy="14" r="5.5" fill="#fff"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function markerImage(kakao: any, color: string, selected: boolean) {
  const w = selected ? 38 : 28;
  const h = selected ? 52 : 38;
  return new kakao.maps.MarkerImage(pinSvg(color, selected), new kakao.maps.Size(w, h), { offset: new kakao.maps.Point(w / 2, h) });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** 라벨: 위쪽 색 띠에 유형·접수 상태, 아래에 단지명 (확대했을 때 표시) */
function buildLabel(n: Notice, st: ReceiptStatus, selected: boolean, dim: boolean, onClick: () => void) {
  const el = document.createElement('div');
  el.className = `pin-label${selected ? ' sel' : ''}${n.geoPrecision && n.geoPrecision !== 'address' ? ' approx' : ''}`;
  el.style.opacity = dim ? '0.3' : '1';
  el.innerHTML = `<div class="pin-head" style="background:${STATUS_COLOR[st]}"><span>${esc(CAT_SHORT[n.category] ?? '')}</span><span>${esc(STATUS_SHORT[st])}</span></div><div class="pin-body">${esc(n.name)}</div><div class="pin-tail" style="border-top-color:${STATUS_COLOR[st]}"></div>`;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

interface Props {
  notices: Notice[];
  verdicts: Map<string, Verdict>;
  pastIds?: Set<string>; // 지난 공고 (흐리게)
  hasProfile?: boolean; // 내 조건 입력 여부
  onlyLikely?: boolean; // 가능성 높음만 보기 (해당 없는 마커는 흐리게)
  today: string;
  selectedId?: string;
  onSelect: (id: string) => void;
  onBoundsChange?: (b: Bounds) => void;
}

export function KakaoMap({ notices, verdicts, pastIds, hasProfile, onlyLikely, today, selectedId, onSelect, onBoundsChange }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const clusterer = useRef<any>(null);
  const markerById = useRef(new Map<string, { mk: any; st: ReceiptStatus; dim: boolean }>());
  const overlays = useRef<any[]>([]);
  const fromMarker = useRef(false);
  const [error, setError] = useState<string | null>(KEY ? null : 'no-key');
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectedRef = useRef(selectedId);
  const latest = useRef({ notices, verdicts, pastIds, onlyLikely, today, selectedId });
  latest.current = { notices, verdicts, pastIds, onlyLikely, today, selectedId };

  // 패널이 열리고 닫히며 지도 크기가 바뀌면 중심을 유지한 채 다시 그림
  useEffect(() => {
    if (!el.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (!map.current) return;
      const c = map.current.getCenter();
      map.current.relayout();
      map.current.setCenter(c);
    });
    ro.observe(el.current);
    return () => ro.disconnect();
  }, []);

  // 현재 조건에 맞는 공고의 상태·판정 치수 (마커·라벨 공통)
  function dimOf(n: Notice) {
    const { verdicts: v, onlyLikely: ol } = latest.current;
    // '가능성 높음만' 켜졌을 때 해당 없는 마커만 흐리게 (지난 공고는 상태 색 회색으로 구분)
    if (ol && v.get(n.id) !== 'likely') return true;
    return false;
  }

  function draw() {
    const kakao = window.kakao;
    if (!kakao || !map.current) return;
    const { notices: list, today: t } = latest.current;
    clusterer.current.clear();
    markerById.current.clear();
    const markers = list
      .filter((n) => n.lat && n.lng)
      .map((n) => {
        const st = receiptStatus(n, t);
        const dim = dimOf(n);
        const sel = n.id === selectedRef.current;
        const mk = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(n.lat, n.lng),
          title: n.name,
          image: markerImage(kakao, STATUS_COLOR[st], sel),
          zIndex: sel ? 10 : 0,
          // 위치가 근사(시·군·구·시도)면 흐리게
          opacity: dim ? 0.25 : n.geoPrecision === 'address' ? 1 : 0.55,
        });
        markerById.current.set(n.id, { mk, st, dim });
        kakao.maps.event.addListener(mk, 'click', () => {
          fromMarker.current = true;
          onSelectRef.current(n.id);
        });
        return mk;
      });
    clusterer.current.addMarkers(markers);
    refreshLabels();
  }

  /** 확대 수준이 충분하면 현재 화면 안 공고에 라벨을 올린다 */
  function refreshLabels() {
    const kakao = window.kakao;
    if (!kakao || !map.current) return;
    for (const o of overlays.current) o.setMap(null);
    overlays.current = [];
    if (map.current.getLevel() > LABEL_MAX_LEVEL) return;
    const { notices: list, today: t, selectedId: sid } = latest.current;
    const b = map.current.getBounds();
    const inView = list
      .filter((n) => n.lat && n.lng && b.contain(new kakao.maps.LatLng(n.lat, n.lng)))
      .sort((a, c) => (a.id === sid ? -1 : c.id === sid ? 1 : 0))
      .slice(0, LABEL_LIMIT);
    for (const n of inView) {
      const st = receiptStatus(n, t);
      const node = buildLabel(n, st, n.id === sid, dimOf(n), () => onSelectRef.current(n.id));
      const ov = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(n.lat, n.lng),
        content: node,
        yAnchor: 1.18,
        zIndex: n.id === sid ? 20 : 5,
      });
      ov.setMap(map.current);
      overlays.current.push(ov);
    }
  }

  useEffect(() => {
    if (!KEY || !el.current) return;
    let cancelled = false;
    loadSdk()
      .then((kakao) => {
        if (cancelled || !el.current) return;
        map.current = new kakao.maps.Map(el.current, { center: new kakao.maps.LatLng(36.4, 127.8), level: 13 });
        map.current.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
        clusterer.current = new kakao.maps.MarkerClusterer({
          map: map.current,
          averageCenter: true,
          minLevel: CLUSTER_MIN_LEVEL,
          minClusterSize: 2,
          gridSize: 60,
          calculator: [10, 30], // 1~9 / 10~29 / 30+
          styles: CLUSTER_STYLES,
        });
        const report = () => {
          const b = map.current.getBounds();
          const sw = b.getSouthWest();
          const ne = b.getNorthEast();
          onBoundsChange?.({ south: sw.getLat(), west: sw.getLng(), north: ne.getLat(), east: ne.getLng() });
          refreshLabels();
        };
        kakao.maps.event.addListener(map.current, 'idle', report);
        report();
        draw();
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notices, verdicts, pastIds, onlyLikely, today]);

  // 선택 표시: 선택한 마커만 크게. 마커로 골랐으면 확대 수준 유지, 목록에서 골랐을 때만 필요 시 확대
  const prevSelected = useRef<string | undefined>(undefined);
  useEffect(() => {
    selectedRef.current = selectedId;
    const kakao = window.kakao;
    if (!kakao || !map.current) return;
    for (const id of [prevSelected.current, selectedId]) {
      const m = id && markerById.current.get(id);
      if (m) {
        const sel = id === selectedId;
        m.mk.setImage(markerImage(kakao, STATUS_COLOR[m.st], sel));
        m.mk.setZIndex(sel ? 10 : 0);
      }
    }
    prevSelected.current = selectedId;
    const n = notices.find((x) => x.id === selectedId);
    const byMarker = fromMarker.current;
    fromMarker.current = false;
    if (!n?.lat) return;
    const pos = new kakao.maps.LatLng(n.lat, n.lng);
    if (!byMarker) {
      const target = n.geoPrecision === 'region' ? 10 : n.geoPrecision === 'district' ? 8 : 5;
      if (map.current.getLevel() > target) map.current.setLevel(target);
    }
    const t = setTimeout(() => {
      if (!map.current.getBounds().contain(pos)) map.current.panTo(pos);
      refreshLabels();
    }, 360);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  if (error === 'no-key') {
    return (
      <div className="map-placeholder">
        <strong>지도 준비 중</strong>
        <p>카카오맵 JavaScript 키(VITE_KAKAO_JS_KEY)를 등록하면 공고 위치가 지도에 표시됩니다.</p>
        <p className="muted">공고 {notices.filter((n) => n.lat).length}건의 좌표가 준비되어 있습니다.</p>
      </div>
    );
  }
  return (
    <div className="map-wrap">
      <div ref={el} className="map" />
      {error && <div className="map-error">{error}</div>}
      <div className="legend">
        {(['upcoming', 'open', 'waiting', 'closed'] as ReceiptStatus[]).map((s) => (
          <span key={s}>
            <i style={{ background: STATUS_COLOR[s] }} />
            {STATUS_SHORT[s]}
          </span>
        ))}
        <span className="sep" />
        <span className="legend-note">
          {hasProfile ? '판정은 목록 배지(✓ 충족 · △ 추가확인 · ✗ 불충족)로 표시' : '내 조건을 입력하면 목록에 ✓ △ ✗ 판정이 표시'}
        </span>
        <span className="sep" />
        <span className="legend-note">흐린 마커 = 위치 근사</span>
      </div>
    </div>
  );
}
