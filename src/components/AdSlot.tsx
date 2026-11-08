import { useEffect } from 'react';

// 구글 애드센스 광고 자리. VITE_ADSENSE_CLIENT / VITE_ADSENSE_SLOT 가 없으면 아무것도 그리지 않음.
const CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
const SLOT = import.meta.env.VITE_ADSENSE_SLOT as string | undefined;
let loaded = false;

export function AdSlot() {
  useEffect(() => {
    if (!CLIENT || !SLOT) return;
    if (!loaded) {
      const s = document.createElement('script');
      s.async = true;
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;
      s.crossOrigin = 'anonymous';
      document.head.appendChild(s);
      loaded = true;
    }
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch {
      /* ignore */
    }
  }, []);
  if (!CLIENT || !SLOT) return null;
  return <ins className="adsbygoogle ad" style={{ display: 'block' }} data-ad-client={CLIENT} data-ad-slot={SLOT} data-ad-format="auto" data-full-width-responsive="true" />;
}
