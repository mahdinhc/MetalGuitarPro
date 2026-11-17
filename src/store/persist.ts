import AsyncStorage from '@react-native-async-storage/async-storage';
import {Engine} from '../native/engine';
import {defaultValues, useTone, Values} from './tone';
import {useUI} from './ui';
import {model, onRiffDirty, rollActions, syncSequence, useRoll, applyTuningToRoll} from './roll';
import {PARAM_DEFS} from '../core/paramDefs';
import {ctrl} from './roll';

const K = {tone: 'mgp.tone.v1', ui: 'mgp.ui.v1', riff: 'mgp.riff.v1'};

async function readJSON<T>(key: string): Promise<T | null> {
  try { const s = await AsyncStorage.getItem(key); return s ? (JSON.parse(s) as T) : null; } catch { return null; }
}

/** Loads saved state, primes the engine with it and starts debounced autosave. Call once before first render. */
export async function bootstrapState(): Promise<void> {
  const [tone, ui, riff] = await Promise.all([
    readJSON<{values: Partial<Values>; preset: string; dirty: boolean; userPresets: never[]}>(K.tone),
    readJSON<{themeMode: 'system' | 'dark' | 'light'; haptics: boolean; keepAwake: boolean}>(K.ui),
    AsyncStorage.getItem(K.riff).catch(() => null),
  ]);
  if (tone) {
    const values = {...defaultValues(), ...tone.values} as Values;
    PARAM_DEFS.forEach(p => { const v = values[p.id]; if (!Number.isFinite(v)) values[p.id] = p.def; });
    useTone.getState().hydrate({values, preset: tone.preset ?? 'Metal', dirty: !!tone.dirty, userPresets: tone.userPresets ?? []});
  } else useTone.getState().applyFactory(0);
  if (ui) useUI.getState().patch({themeMode: ui.themeMode ?? 'system', haptics: ui.haptics ?? true, keepAwake: ui.keepAwake ?? false});
  if (riff) model.load(riff);
  // bring the engine and the roll in line with what was loaded
  useTone.getState().pushAll();
  applyTuningToRoll(useTone.getState().values.tun);
  Engine.setBpm(model.bpm);
  syncSequence();
  ctrl.centerOn(model.notes.length ? [...model.notes].sort((a, b) => a.p - b.p)[model.notes.length >> 1].p : 52);
  Engine.setKeepAwake(useUI.getState().keepAwake);

  // ---- autosave (debounced) ------------------------------------------------------------------------------------------------
  const debounce = (fn: () => void, ms: number) => { let t: ReturnType<typeof setTimeout> | null = null; return () => { if (t) clearTimeout(t); t = setTimeout(fn, ms); }; };
  const saveTone = debounce(() => { const {values, preset, dirty, userPresets} = useTone.getState(); AsyncStorage.setItem(K.tone, JSON.stringify({values, preset, dirty, userPresets})).catch(() => {}); }, 400);
  const saveUI = debounce(() => { const {themeMode, haptics, keepAwake} = useUI.getState(); AsyncStorage.setItem(K.ui, JSON.stringify({themeMode, haptics, keepAwake})).catch(() => {}); }, 400);
  const saveRiff = debounce(() => { AsyncStorage.setItem(K.riff, model.toJSON()).catch(() => {}); }, 600);
  useTone.subscribe((s, p) => {
    if (s.values !== p.values || s.preset !== p.preset || s.userPresets !== p.userPresets) saveTone();
    if (s.values.tun !== p.values.tun) applyTuningToRoll(s.values.tun);
  });
  useUI.subscribe((s, p) => {
    if (s.themeMode !== p.themeMode || s.haptics !== p.haptics || s.keepAwake !== p.keepAwake) saveUI();
    if (s.keepAwake !== p.keepAwake) Engine.setKeepAwake(s.keepAwake);
  });
  onRiffDirty(saveRiff);
  void rollActions; void useRoll;
}
