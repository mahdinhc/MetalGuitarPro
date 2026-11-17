import {PARAM_DEFS, ParamDef, ParamId} from './paramDefs';
import {TUNINGS} from './music';

/**
 * Validation of anything read back from storage. Saved state outlives app versions (parameters get added, ranges and
 * tuning lists change) and can be truncated or hand-edited, so it is NEVER trusted: a bad value must degrade to the
 * default, not crash the launch (which would repeat on every start, because the bad value is persisted).
 * Pure TypeScript so it is covered by tests/core.test.ts.
 */
export type ToneValues = Record<ParamId, number>;
export interface SavedTone { values: ToneValues; preset: string; dirty: boolean; userPresets: Array<{name: string; values: Partial<ToneValues>}> }
export interface SavedUI { themeMode: 'system' | 'dark' | 'light'; haptics: boolean; keepAwake: boolean }

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

export function clampParam(d: ParamDef, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return d.def;
  const c = Math.min(d.max, Math.max(d.min, v));
  return d.step >= 1 ? Math.round(c) : Math.round(c / d.step) * d.step;
}

export function sanitizeValues(raw: unknown, base?: Partial<ToneValues>): ToneValues {
  const src = isObj(raw) ? raw : {};
  const out = {} as ToneValues;
  for (const d of PARAM_DEFS) out[d.id] = clampParam(d, d.id in src ? src[d.id] : base?.[d.id]);
  // selects that index into tables must land inside them
  out.tun = Math.min(TUNINGS.length - 1, Math.max(0, Math.round(out.tun)));
  return out;
}

export function sanitizeTone(raw: unknown): SavedTone | null {
  if (!isObj(raw)) return null;
  const userPresets: SavedTone['userPresets'] = [];
  if (Array.isArray(raw.userPresets)) {
    for (const u of raw.userPresets.slice(0, 200)) {
      if (!isObj(u) || typeof u.name !== 'string' || !u.name.trim() || !isObj(u.values)) continue;
      const vals: Partial<ToneValues> = {};
      for (const d of PARAM_DEFS) if (d.id in u.values) vals[d.id] = clampParam(d, u.values[d.id]);
      userPresets.push({name: u.name.slice(0, 24), values: vals});
    }
  }
  return {
    values: sanitizeValues(raw.values),
    preset: typeof raw.preset === 'string' && raw.preset ? raw.preset.slice(0, 40) : 'Metal',
    dirty: raw.dirty === true,
    userPresets,
  };
}

export function sanitizeUI(raw: unknown): SavedUI | null {
  if (!isObj(raw)) return null;
  const m = raw.themeMode;
  return {
    themeMode: m === 'dark' || m === 'light' || m === 'system' ? m : 'system',
    haptics: typeof raw.haptics === 'boolean' ? raw.haptics : true,
    keepAwake: typeof raw.keepAwake === 'boolean' ? raw.keepAwake : false,
  };
}

/** Parses JSON without throwing. */
export function parseJSON(s: string | null | undefined): unknown {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}
