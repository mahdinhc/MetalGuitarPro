import {create} from 'zustand';
import {Engine, toEngineArray} from '../native/engine';
import {PARAM_DEFS, ParamDef, ParamId} from '../core/paramDefs';
import {PRESETS, presetValues, TUNINGS} from '../core/music';

export type Values = Record<ParamId, number>;
export interface UserPreset { name: string; values: Partial<Values> }

const DEFS = new Map<ParamId, ParamDef>(PARAM_DEFS.map(p => [p.id, p]));
export const paramDef = (id: ParamId) => DEFS.get(id)!;
export const defaultValues = (): Values => Object.fromEntries(PARAM_DEFS.map(p => [p.id, p.def])) as Values;

/** Parameters that change while playing (hold buttons, whammy, wah): they never mark the preset as modified. */
const LIVE: ReadonlySet<ParamId> = new Set<ParamId>(['mute', 'vib', 'bend', 'wah', 'wahOn']);
/** Excluded when saving a user preset (performance position, not tone). */
const NOT_IN_PRESET: ReadonlySet<ParamId> = new Set<ParamId>(['bend']);

interface ToneState {
  values: Values;
  preset: string;        // name of the preset the values started from
  dirty: boolean;        // tweaked since
  userPresets: UserPreset[];
  set(id: ParamId, v: number): void;
  toggle(id: ParamId): void;
  applyPreset(name: string, v: Partial<Values>): void;
  applyFactory(index: number): void;
  stepPreset(delta: number): void;
  saveUserPreset(name: string): void;
  deleteUserPreset(name: string): void;
  hydrate(p: Partial<Pick<ToneState, 'values' | 'preset' | 'dirty' | 'userPresets'>>): void;
  pushAll(): void;
}

const clampTo = (d: ParamDef, v: number) => {
  const c = Math.min(d.max, Math.max(d.min, v));
  return d.step >= 1 ? Math.round(c) : Math.round(c / d.step) * d.step;
};

export const useTone = create<ToneState>((set, get) => ({
  values: defaultValues(), preset: 'Metal', dirty: false, userPresets: [],

  set: (id, raw) => {
    const d = paramDef(id), v = clampTo(d, raw);
    if (get().values[id] === v) return;
    Engine.setParam(d.index, v);
    if (id === 'tun') Engine.setTuning(TUNINGS[v].notes);
    set(s => ({values: {...s.values, [id]: v}, dirty: s.dirty || !LIVE.has(id)}));
  },
  toggle: id => get().set(id, get().values[id] > 0.5 ? 0 : 1),

  applyPreset: (name, v) => {
    const merged = {...get().values, ...v} as Values;
    set({values: merged, preset: name, dirty: false});
    get().pushAll();
  },
  applyFactory: i => { const p = PRESETS[(i + PRESETS.length) % PRESETS.length]; get().applyPreset(p.name, presetValues(p) as Partial<Values>); },
  stepPreset: delta => {
    const {preset, userPresets} = get();
    const i = PRESETS.findIndex(p => p.name === preset);
    if (i >= 0) return get().applyFactory(i + delta);
    const j = userPresets.findIndex(p => p.name === preset);
    const all = userPresets.length;
    if (j >= 0 && all) { const u = userPresets[(j + delta + all) % all]; get().applyPreset(u.name, u.values); } else get().applyFactory(0);
  },
  saveUserPreset: name => {
    const clean = name.trim().slice(0, 24) || 'My tone';
    const values: Partial<Values> = {};
    PARAM_DEFS.forEach(p => { if (!NOT_IN_PRESET.has(p.id)) values[p.id] = get().values[p.id]; });
    set(s => ({userPresets: [...s.userPresets.filter(u => u.name !== clean), {name: clean, values}], preset: clean, dirty: false}));
  },
  deleteUserPreset: name => set(s => ({userPresets: s.userPresets.filter(u => u.name !== name)})),

  hydrate: p => set(p),
  /** Sends every parameter (and the tuning) to the engine. Used after presets and on startup. */
  pushAll: () => {
    const v = get().values;
    Engine.setParams(toEngineArray(v));
    Engine.setTuning(TUNINGS[v.tun].notes);
  },
}));
