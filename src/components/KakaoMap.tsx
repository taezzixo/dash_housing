import { useEffect, useRef, useState } from 'react';
import type { Notice, Verdict } from '../types.ts';
import type { Bounds } from '../lib/filters.ts';

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

const COLOR: Record<Verdict | 'none', string> = {
  likely: '#16a34a',
  check: '#d97706',
  no: '#9ca3af',
  none: '#2563eb',
};

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

interface Props {
  notices: Notice[];
  verdicts: Map<string, Verdict>;
  pastIds?: Set<string>; // 지난 공고 (회색·흐리게)
  hasProfile?: boolean; // 내 조건 입력 여부 (범례 표시용)
  selectedId?: string;
  onSelect: (id: string) => void;
  onBoundsChange?: (b: Bounds) => void;
}

export function KakaoMap({ notices, verdicts, pastIds, hasProfile, selectedId, onSelect, onBoundsChange }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const clusterer = useRef<any>(null);
  const markerById = useRef(new Map<string, { mk: any; color: string }>());
  const fromMarker = useRef(false); // 마커를 직접 눌러 선택했는지 (이때는 확대 수준을 바꾸지 않음)
  const [error, setError] = useState<string | null>(KEY ? null : 'no-key');
  // 마커 클릭 시 항상 최신 onSelect를 호출 (같은 마커 재클릭 = 닫기 토글)
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

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

  useEffect(() => {
    if (!KEY || !el.current) return;
    let cancelled = false;
    loadSdk()
      .then((kakao) => {
        if (cancelled || !el.current) return;
        map.current = new kakao.maps.Map(el.current, { center: new kakao.maps.LatLng(36.4, 127.8), level: 13 });
        map.current.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
        clusterer.current = new kakao.maps.MarkerClusterer({ map: map.current, averageCenter: true, minLevel: 9 });
        // 지도 이동이 끝날 때마다 보이는 영역을 알려 목록과 연동 (D2)
        const report = () => {
          const b = map.current.getBounds();
          const sw = b.getSouthWest();
          const ne = b.getNorthEast();
          onBoundsChange?.({ south: sw.getLat(), west: sw.getLng(), north: ne.getLat(), east: ne.getLng() });
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

  function draw() {
    const kakao = window.kakao;
    if (!kakao || !map.current) return;
    clusterer.current.clear();
    markerById.current.clear();
    const markers = notices
      .filter((n) => n.lat && n.lng)
      .map((n) => {
        const past = !!pastIds?.has(n.id);
        const v = past ? 'no' : verdicts.get(n.id) ?? 'none';
        const sel = n.id === selectedRef.current;
        const mk = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(n.lat, n.lng),
          title: n.name,
          image: markerImage(kakao, COLOR[v], sel),
          zIndex: sel ? 10 : 0,
          // 위치 신뢰도가 낮은(시군구·시도 중심) 마커는 흐리게
          opacity: past ? 0.45 : n.geoPrecision === 'address' ? 1 : 0.55,
        });
        markerById.current.set(n.id, { mk, color: COLOR[v] });
        kakao.maps.event.addListener(mk, 'click', () => {
          fromMarker.current = true;
          onSelectRef.current(n.id);
        });
        return mk;
      });
    clusterer.current.addMarkers(markers);
  }

  useEffect(draw, [notices, verdicts, pastIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // 선택 표시: 선택된 마커만 크게. 마커로 선택했으면 확대 수준 유지, 목록에서 선택했으면 필요할 때만 확대(축소는 안 함)
  const selectedRef = useRef(selectedId);
  const prevSelected = useRef<string | undefined>(undefined);
  useEffect(() => {
    selectedRef.current = selectedId;
    const kakao = window.kakao;
    if (!kakao || !map.current) return;
    for (const id of [prevSelected.current, selectedId]) {
      const m = id && markerById.current.get(id);
      if (m) {
        const sel = id === selectedId;
        m.mk.setImage(markerImage(kakao, m.color, sel));
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
    // 오른쪽 패널이 열리며 지도 폭이 줄어든 뒤, 마커가 화면 밖이면 그때만 이동
    const t = setTimeout(() => {
      if (!map.current.getBounds().contain(pos)) map.current.panTo(pos);
    }, 360);
    return () => clearTimeout(t);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

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
        {hasProfile ? (
          <>
            <span><Pin color={COLOR.likely} />조건 충족</span>
            <span><Pin color={COLOR.check} />추가 확인</span>
            <span><Pin color={COLOR.no} />불충족</span>
          </>
        ) : (
          <span><Pin color={COLOR.none} />공고 <small>(내 조건 입력 시 색으로 구분)</small></span>
        )}
        <span className="sep" />
        <span><Pin color="#64748b" />정확한 위치</span>
        <span><Pin color="#64748b" faded />근사 위치</span>
      </div>
    </div>
  );
}

function Pin({ color, faded }: { color: string; faded?: boolean }) {
  return (
    <svg width="10" height="14" viewBox="0 0 28 38" style={{ opacity: faded ? 0.45 : 1 }} aria-hidden="true">
      <path d="M14 0C6.3 0 0 6.2 0 13.9 0 24.3 14 38 14 38s14-13.7 14-24.1C28 6.2 21.7 0 14 0z" fill={color} />
      <circle cx="14" cy="14" r="5.5" fill="#fff" />
    </svg>
  );
}
