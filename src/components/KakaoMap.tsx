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

function pinSvg(color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38"><path d="M14 0C6.3 0 0 6.2 0 13.9 0 24.3 14 38 14 38s14-13.7 14-24.1C28 6.2 21.7 0 14 0z" fill="${color}"/><circle cx="14" cy="14" r="5.5" fill="#fff"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

interface Props {
  notices: Notice[];
  verdicts: Map<string, Verdict>;
  selectedId?: string;
  onSelect: (id: string) => void;
  onBoundsChange?: (b: Bounds) => void;
}

export function KakaoMap({ notices, verdicts, selectedId, onSelect, onBoundsChange }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const clusterer = useRef<any>(null);
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
    const markers = notices
      .filter((n) => n.lat && n.lng)
      .map((n) => {
        const v = verdicts.get(n.id) ?? 'none';
        const mk = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(n.lat, n.lng),
          title: n.name,
          image: new kakao.maps.MarkerImage(pinSvg(COLOR[v]), new kakao.maps.Size(28, 38), { offset: new kakao.maps.Point(14, 38) }),
          // 위치 신뢰도가 낮은(시군구·시도 중심) 마커는 흐리게
          opacity: n.geoPrecision === 'address' ? 1 : 0.55,
        });
        kakao.maps.event.addListener(mk, 'click', () => onSelectRef.current(n.id));
        return mk;
      });
    clusterer.current.addMarkers(markers);
  }

  useEffect(draw, [notices, verdicts]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const kakao = window.kakao;
    const n = notices.find((x) => x.id === selectedId);
    if (!kakao || !map.current || !n?.lat) return;
    map.current.setLevel(n.geoPrecision === 'region' ? 10 : n.geoPrecision === 'district' ? 8 : 5);
    map.current.panTo(new kakao.maps.LatLng(n.lat, n.lng));
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
        <span><i style={{ background: COLOR.likely }} />조건 충족</span>
        <span><i style={{ background: COLOR.check }} />추가 확인</span>
        <span><i style={{ background: COLOR.no }} />불충족</span>
        <span><i style={{ background: COLOR.none, opacity: 0.55 }} />위치 근사</span>
      </div>
    </div>
  );
}
