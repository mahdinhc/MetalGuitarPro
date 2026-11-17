import {NativeEventEmitter, NativeModules} from 'react-native';
import {ENGINE_PARAM_COUNT, PARAM_DEFS, ParamId} from '../core/paramDefs';

export interface AudioInfo {
  ok: boolean; sampleRate: number; framesPerBurst: number; bufferFrames: number; latencyMs: number; api: string; exclusive: boolean;
}
export interface MeterEvent {
  peak: number; cpu: number; beat: number; playing: boolean; xruns: number; bufferFrames: number; latencyMs: number;
}
export interface ExportResult { path: string; frames: number; seconds: number }

interface Native {
  start(): Promise<AudioInfo>; stop(): void; setKeepAwake(on: boolean): void;
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

const ENGINE_DEFS = PARAM_DEFS.filter(p => p.index >= 0);
/** Values in native-engine order (what `setParams` and `exportWav` expect). */
export function toEngineArray(values: Record<ParamId, number>): number[] {
  const a = new Array<number>(ENGINE_PARAM_COUNT).fill(0);
  ENGINE_DEFS.forEach(p => { a[p.index] = values[p.id]; });
  return a;
}

/**
 * Typed facade over the native module. Every call is a no-op if the module is missing (unit tests, previews),
 * so UI code never has to guard against it.
 */
export const Engine = {
  available: !!M,
  start: (): Promise<AudioInfo> => M ? M.start() : Promise.resolve({ok: false, sampleRate: 0, framesPerBurst: 0, bufferFrames: 0, latencyMs: 0, api: 'none', exclusive: false}),
  stop: () => { M?.stop(); },
  setKeepAwake: (on: boolean) => { M?.setKeepAwake(on); },
  setParam: (index: number, v: number) => { if (index >= 0) M?.setParam(index, v); },
  setParams: (v: number[]) => { M?.setParams(v); },
  setTuning: (t: readonly number[]) => { M?.setTuning([...t]); },
  noteOn: (s: number, f: number, vel: number, flags = 0, delayMs = 0) => { M?.noteOn(s, f, vel, flags, delayMs); },
  noteOff: (s: number, flags = 0, delayMs = 0) => { M?.noteOff(s, flags, delayMs); },
  move: (s: number, f: number, flags: number) => { M?.move(s, f, flags); },
  muteAll: (ms = 30) => { M?.muteAll(ms); },
  setSequence: (ev: number[], length: number, loop: boolean) => { M?.setSequence(ev, length, loop); },
  play: (beat: number) => { M?.play(beat); },
  stopPlay: () => { M?.stopPlay(); },
  seek: (beat: number) => { M?.seek(beat); },
  setBpm: (bpm: number) => { M?.setBpm(bpm); },
  setMetronome: (on: boolean) => { M?.setMetronome(on); },
  exportWav: (params: number[], tuning: readonly number[], ev: number[], length: number, bpm: number, loops: number, name: string): Promise<ExportResult> =>
    M ? M.exportWav(params, [...tuning], ev, length, bpm, loops, name) : Promise.reject(new Error('Audio engine not available')),
  onMeter(cb: (e: MeterEvent) => void): () => void {
    if (!M) return () => {};
    const sub = new NativeEventEmitter(NativeModules.MetalEngine).addListener('mgpMeter', cb);
    return () => sub.remove();
  },
};
