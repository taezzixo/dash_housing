import type { Notice, Overrides } from '../types.ts';

/** 관리자 보정 적용: 숨김 → 수정 → 수동 공고 추가 */
export function applyOverrides(notices: Notice[], ov: Overrides | null | undefined): Notice[] {
  if (!ov) return notices;
  const hide = new Set(ov.hide ?? []);
  const out = notices
    .filter((n) => !hide.has(n.id))
    .map((n) => {
      const p = ov.patch?.[n.id];
      return p ? { ...n, ...p, geoPrecision: p.geoPrecision ?? (p.lat !== undefined ? 'address' : n.geoPrecision) } : n;
    });
  const ids = new Set(out.map((n) => n.id));
  for (const m of ov.manual ?? []) {
    if (!m?.id || !m.name || ids.has(m.id) || hide.has(m.id)) continue;
    out.push({ ...m, source: m.source ?? 'manual', category: m.category ?? 'LH', dates: m.dates ?? {}, manual: true });
  }
  return out;
}
