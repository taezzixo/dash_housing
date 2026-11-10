import type { Notice, NoticeModel, Overrides } from '../types.ts';

/** 주택형 보정: 같은 type은 값을 덮어쓰고, 없는 type은 뒤에 추가 */
export function mergeModels(base: NoticeModel[] | undefined, patch: (Partial<NoticeModel> & { type: string })[]): NoticeModel[] {
  const out = (base ?? []).map((m) => ({ ...m }));
  for (const p of patch) {
    if (!p?.type) continue;
    const i = out.findIndex((m) => m.type === p.type);
    if (i >= 0) out[i] = { ...out[i], ...p };
    else out.push({ ...p });
  }
  return out;
}

/** 관리자 보정 적용: 숨김 → 수정 → 수동 공고 추가 */
export function applyOverrides(notices: Notice[], ov: Overrides | null | undefined): Notice[] {
  if (!ov) return notices;
  const hide = new Set(ov.hide ?? []);
  const out = notices
    .filter((n) => !hide.has(n.id))
    .map((n) => {
      const p = ov.patch?.[n.id];
      if (!p) return n;
      const { models: pm, ...rest } = p;
      return { ...n, ...rest, models: pm ? mergeModels(n.models, pm) : n.models, geoPrecision: p.geoPrecision ?? (p.lat !== undefined ? 'address' : n.geoPrecision) };
    });
  const ids = new Set(out.map((n) => n.id));
  for (const m of ov.manual ?? []) {
    if (!m?.id || !m.name || ids.has(m.id) || hide.has(m.id)) continue;
    out.push({ ...m, source: m.source ?? 'manual', category: m.category ?? 'LH', dates: m.dates ?? {}, manual: true });
  }
  return out;
}
