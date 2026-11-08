import { useEffect, useRef, useState } from 'react';
import type { Notice, Verdict } from '../types.ts';

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
}

export function KakaoMap({ notices, verdicts, selectedId, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const clusterer = useRef<any>(null);
  const [error, setError] = useState<string | null>(KEY ? null : 'no-key');

  useEffect(() => {
    if (!KEY || !el.current) return;
    let cancelled = false;
    loadSdk()
      .then((kakao) => {
        if (cancelled || !el.current) return;
        map.current = new kakao.maps.Map(el.current, { center: new kakao.maps.LatLng(36.4, 127.8), level: 13 });
        map.current.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
        clusterer.current = new kakao.maps.MarkerClusterer({ map: map.current, averageCenter: true, minLevel: 9 });
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
        });
        kakao.maps.event.addListener(mk, 'click', () => onSelect(n.id));
        return mk;
      });
    clusterer.current.addMarkers(markers);
  }

  useEffect(draw, [notices, verdicts]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const kakao = window.kakao;
    const n = notices.find((x) => x.id === selectedId);
    if (!kakao || !map.current || !n?.lat) return;
    map.current.setLevel(n.geoPrecision === 'region' ? 9 : 5);
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
        <span><i style={{ background: COLOR.likely }} />지원 가능성 높음</span>
        <span><i style={{ background: COLOR.check }} />확인 필요</span>
        <span><i style={{ background: COLOR.no }} />어려움</span>
      </div>
    </div>
  );
}
