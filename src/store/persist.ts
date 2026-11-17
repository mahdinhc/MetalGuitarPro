import AsyncStorage from '@react-native-async-storage/async-storage';
import {Engine} from '../native/engine';
import {useTone} from './tone';
import {useUI} from './ui';
import {model, onRiffDirty, syncSequence, applyTuningToRoll, ctrl} from './roll';
import {parseJSON, sanitizeTone, sanitizeUI} from '../core/sanitize';

export const STORAGE_KEYS = {tone: 'mgp.tone.v1', ui: 'mgp.ui.v1', riff: 'mgp.riff.v1'};
const K = STORAGE_KEYS;

async function readRaw(key: string): Promise<string | null> {
  try { return await AsyncStorage.getItem(key); } catch { return null; }
}

/** Deletes everything the app saved (used by the "Reset" button of the error screen and as the last-resort recovery). */
export async function clearSavedState(): Promise<void> {
  try { await AsyncStorage.multiRemove([K.tone, K.ui, K.riff]); } catch { /* storage unavailable: nothing to clear */ }
}

/** Runs one startup step; a failure is logged and the app carries on with defaults instead of failing to launch. */
function step(name: string, fn: () => void): boolean {
  try { fn(); return true; } catch (e) { console.warn(`[startup] ${name} failed:`, e); return false; }
}

/**
 * Loads saved state, primes the engine with it and starts debounced autosave. Call once before first render.
 * Never throws: every saved value is validated, every step is isolated, and if the saved state turns out to be what
 * breaks startup it is wiped and the defaults are used (a crash loop on a persisted bad value is the worst outcome).
 * Returns false if saved data had to be discarded.
 */
export async function bootstrapState(): Promise<boolean> {
  const [toneRaw, uiRaw, riffRaw] = await Promise.all([readRaw(K.tone), readRaw(K.ui), readRaw(K.riff)]);
  const tone = sanitizeTone(parseJSON(toneRaw));
  const ui = sanitizeUI(parseJSON(uiRaw));
  let clean = true;

  const okTone = step('tone', () => {
    if (tone) useTone.getState().hydrate({values: tone.values, preset: tone.preset, dirty: tone.dirty, userPresets: tone.userPresets});
    else useTone.getState().applyFactory(0);
  });
  if (!okTone) { clean = false; step('tone defaults', () => useTone.getState().applyFactory(0)); }

  step('ui', () => { if (ui) useUI.getState().patch(ui); });
  if (riffRaw && !step('riff', () => { if (!model.load(riffRaw)) throw new Error('riff data not usable'); })) {
    clean = false;
    step('riff reset', () => model.load(null));
  }

  // bring the engine and the roll in line with what was loaded (all native calls are failure-proof, but the roll maths is not)
  step('engine sync', () => {
    useTone.getState().pushAll();
    applyTuningToRoll(useTone.getState().values.tun);
    Engine.setBpm(model.bpm);
    syncSequence();
    const ps = model.notes.map(n => n.p).sort((a, b) => a - b);
    ctrl.centerOn(ps.length ? ps[ps.length >> 1] : 52);
    Engine.setKeepAwake(useUI.getState().keepAwake);
  });

  // ---- autosave (debounced) ------------------------------------------------------------------------------------------------
  const debounce = (fn: () => void, ms: number) => { let t: ReturnType<typeof setTimeout> | null = null; return () => { if (t) clearTimeout(t); t = setTimeout(fn, ms); }; };
  const save = (key: string, make: () => string) => { try { AsyncStorage.setItem(key, make()).catch(() => {}); } catch { /* serialisation or storage error: skip this save */ } };
  const saveTone = debounce(() => save(K.tone, () => { const {values, preset, dirty, userPresets} = useTone.getState(); return JSON.stringify({values, preset, dirty, userPresets}); }), 400);
  const saveUI = debounce(() => save(K.ui, () => { const {themeMode, haptics, keepAwake} = useUI.getState(); return JSON.stringify({themeMode, haptics, keepAwake}); }), 400);
  const saveRiff = debounce(() => save(K.riff, () => model.toJSON()), 600);
  useTone.subscribe((s, p) => {
    if (s.values !== p.values || s.preset !== p.preset || s.userPresets !== p.userPresets) saveTone();
    if (s.values.tun !== p.values.tun) step('retune roll', () => applyTuningToRoll(s.values.tun));
  });
  useUI.subscribe((s, p) => {
    if (s.themeMode !== p.themeMode || s.haptics !== p.haptics || s.keepAwake !== p.keepAwake) saveUI();
    if (s.keepAwake !== p.keepAwake) Engine.setKeepAwake(s.keepAwake);
  });
  onRiffDirty(saveRiff);
  return clean;
}
