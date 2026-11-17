import {NativeEventEmitter, NativeModules} from 'react-native';
import {ENGINE_PARAM_COUNT, PARAM_DEFS, ParamId} from '../core/paramDefs';

export interface AudioInfo {
  ok: boolean; sampleRate: number; framesPerBurst: number; bufferFrames: number; latencyMs: number; api: string; exclusive: boolean;
  error?: string;
}
export interface MeterEvent {
  peak: number; cpu: number; beat: number; playing: boolean; xruns: number; bufferFrames: number; latencyMs: number;
}
export interface ExportResult { path: string; frames: number; seconds: number }

interface Native {
  start(): Promise<AudioInfo>; stop(): void; setKeepAwake(on: boolean): void;
  getStatus?(): Promise<{loaded: boolean; error?: string | null; sdk: number}>;
  setParam(i: number, v: number): boolean; setParams(v: number[]): boolean; setTuning(t: number[]): boolean;
  noteOn(s: number, f: number, vel: number, flags: number, delayMs: number): boolean;
  noteOff(s: number, flags: number, delayMs: number): boolean;
  move(s: number, f: number, flags: number): boolean;
  muteAll(ms: number): boolean;
  setSequence(ev: number[], length: number, loop: boolean): boolean;
  play(beat: number): boolean; stopPlay(): boolean; seek(beat: number): boolean;
  setBpm(bpm: number): boolean; setMetronome(on: boolean): boolean;
  exportWav(params: number[], tuning: number[], ev: number[], length: number, bpm: number, loops: number, name: string): Promise<ExportResult>;
}

const M: Native | undefined = (NativeModules as {MetalEngine?: Native}).MetalEngine;
const NONE: AudioInfo = {ok: false, sampleRate: 0, framesPerBurst: 0, bufferFrames: 0, latencyMs: 0, api: 'none', exclusive: false};

const ENGINE_DEFS = PARAM_DEFS.filter(p => p.index >= 0);
/** Values in native-engine order (what `setParams` and `exportWav` expect). */
export function toEngineArray(values: Record<ParamId, number>): number[] {
  const a = new Array<number>(ENGINE_PARAM_COUNT).fill(0);
  ENGINE_DEFS.forEach(p => { const v = values[p.id]; a[p.index] = Number.isFinite(v) ? v : p.def; });
  return a;
}

/** The native bridge only understands finite numbers; anything else (NaN, undefined, strings) becomes `def`. */
const n = (v: unknown, def = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : def);
const arr = (a: readonly number[]): number[] => Array.from(a, v => n(v));

let lastError = '';
let errCount = 0;
/** Runs one native call; a failure is logged and swallowed so a broken bridge can never crash a touch handler. */
function call<T>(what: string, fn: () => T, fallback: T): T {
  try { return fn(); } catch (e) {
    lastError = `${what}: ${(e as Error)?.message ?? e}`;
    if (errCount++ < 5) console.warn('[MetalEngine]', lastError);
    return fallback;
  }
}

/**
 * Typed facade over the native module. Every call is a no-op if the module is missing or throws (unit tests, previews,
 * a library that failed to load), so UI code never has to guard against it.
 */
export const Engine = {
  available: !!M,
  lastError: () => lastError,
  start: async (): Promise<AudioInfo> => {
    if (!M) return {...NONE, error: 'Native audio module is not part of this build'};
    try { return (await M.start()) ?? NONE; } catch (e) { return {...NONE, error: (e as Error)?.message ?? String(e)}; }
  },
  status: async () => { try { return M?.getStatus ? await M.getStatus() : null; } catch { return null; } },
  stop: () => { call('stop', () => M?.stop(), undefined); },
  setKeepAwake: (on: boolean) => { call('setKeepAwake', () => M?.setKeepAwake(!!on), undefined); },
  setParam: (index: number, v: number) => { if (index >= 0 && Number.isFinite(v)) call('setParam', () => M?.setParam(index, v), undefined); },
  setParams: (v: number[]) => { call('setParams', () => M?.setParams(arr(v)), undefined); },
  setTuning: (t: readonly number[]) => { call('setTuning', () => M?.setTuning(arr(t)), undefined); },
  noteOn: (s: number, f: number, vel: number, flags = 0, delayMs = 0) => { call('noteOn', () => M?.noteOn(n(s), n(f), n(vel, 0.85), n(flags), n(delayMs)), undefined); },
  noteOff: (s: number, flags = 0, delayMs = 0) => { call('noteOff', () => M?.noteOff(n(s), n(flags), n(delayMs)), undefined); },
  move: (s: number, f: number, flags: number) => { call('move', () => M?.move(n(s), n(f), n(flags)), undefined); },
  muteAll: (ms = 30) => { call('muteAll', () => M?.muteAll(n(ms, 30)), undefined); },
  setSequence: (ev: number[], length: number, loop: boolean) => { call('setSequence', () => M?.setSequence(arr(ev), n(length, 4), !!loop), undefined); },
  play: (beat: number) => { call('play', () => M?.play(n(beat)), undefined); },
  stopPlay: () => { call('stopPlay', () => M?.stopPlay(), undefined); },
  seek: (beat: number) => { call('seek', () => M?.seek(n(beat)), undefined); },
  setBpm: (bpm: number) => { call('setBpm', () => M?.setBpm(n(bpm, 120)), undefined); },
  setMetronome: (on: boolean) => { call('setMetronome', () => M?.setMetronome(!!on), undefined); },
  exportWav: (params: number[], tuning: readonly number[], ev: number[], length: number, bpm: number, loops: number, name: string): Promise<ExportResult> =>
    M ? M.exportWav(arr(params), arr(tuning), arr(ev), n(length, 4), n(bpm, 120), n(loops, 1), String(name)) : Promise.reject(new Error('Audio engine not available')),
  onMeter(cb: (e: MeterEvent) => void): () => void {
    if (!M) return () => {};
    try {
      const sub = new NativeEventEmitter(NativeModules.MetalEngine).addListener('mgpMeter', (e: MeterEvent) => {
        try { cb(e); } catch (err) { console.warn('[MetalEngine] meter handler', err); }
      });
      return () => { try { sub.remove(); } catch { /* already gone */ } };
    } catch (e) {
      console.warn('[MetalEngine] cannot subscribe to meter events', e);
      return () => {};
    }
  },
};
