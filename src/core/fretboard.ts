import {chordFor, MAX_FRET} from './music';
import {NF} from './rollModel';

export interface PlayAudio {
  noteOn(str: number, fret: number, vel: number, flags: number, delayMs: number): void;
  noteOff(str: number, flags: number, delayMs: number): void;
  /** flags: bit0 slide (else legato), bit1 only-if-ringing */
  move(str: number, fret: number, flags: number): void;
}
export interface PlayParams { power: boolean; slide: boolean; tuning: readonly number[] }
export interface Rect { left: number; top: number; width: number; height: number }
export interface PlayHooks { paint(): void; vibe(str: number): void; buzz(): void }

type Pair = [number, number];
interface Finger { s: number; f: number; list?: Pair[] }
interface StrumPtr { y: number; t: number; row: number; r: Rect; chord: boolean; v: number }

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const CAPO_MAX = 9;

/**
 * The playing surface: multi-touch fretting (hammer-on / pull-off / slide on ringing strings), swipe-to-strum
 * with swipe-speed velocity, chord shapes with up/down strums, and lead mode. Port of the original app's logic;
 * all timing (string stagger) is delegated to the native engine via per-note delays, so no JS timers are used.
 */
export class FretboardController {
  win = 7;
  w0 = 0;
  capo = 0;
  mode: 'strum' | 'lead' = 'strum';
  shape: readonly number[] | null = null;
  readonly fingers = new Map<number, Finger>();
  private strums = new Map<number, StrumPtr>();

  constructor(private audio: PlayAudio, private params: () => PlayParams, private hooks: PlayHooks, private rnd: () => number = Math.random) {}

  // ---- state ------------------------------------------------------------------------------------------------------
  get maxW0() { return Math.max(0, MAX_FRET + 1 - this.win); }
  setWindow(w0: number, win = this.win) { this.win = win; this.w0 = clamp(Math.round(w0), 0, this.maxW0); this.hooks.paint(); }
  setCapo(c: number) { this.capo = clamp(c, 0, CAPO_MAX); this.hooks.paint(); }
  setShape(s: readonly number[] | null) { this.shape = s; this.hooks.paint(); }
  setMode(m: 'strum' | 'lead') { this.mode = m; this.fingers.clear(); this.hooks.paint(); }

  /** Fret that string `s` currently sounds at, or null if the chord shape mutes it. */
  eff(s: number): number | null {
    let m = -1;
    this.fingers.forEach(f => { if (f.s === s && f.f > m) m = f.f; });
    if (m >= 0) return Math.max(m, this.capo);
    if (this.shape) return this.shape[s] < 0 ? null : this.shape[s] + this.capo;
    return this.capo;
  }

  /** Cells to highlight: "s:fret" keys for pressed fingers and for the chord-shape guide. */
  paintState() {
    const on = new Set<string>(), sh = new Set<string>();
    this.fingers.forEach(f => (f.list ?? [[f.s, f.f] as Pair]).forEach(([s, fr]) => on.add(`${s}:${fr}`)));
    this.shape?.forEach((fr, s) => { if (fr >= 0) sh.add(`${s}:${fr + this.capo}`); });
    return {on, sh};
  }

  // ---- helpers ----------------------------------------------------------------------------------------------------
  private rowAt(y: number, r: Rect) { return clamp(Math.floor((y - r.top) / r.height * 6), 0, 5); }
  private cellAt(x: number, y: number, r: Rect): Pair {
    return [this.rowAt(y, r), this.w0 + clamp(Math.floor((x - r.left) / r.width * this.win), 0, this.win - 1)];
  }
  private pluck(s: number, f: number, vel: number, flags: number, delay: number) {
    this.audio.noteOn(s, f, vel, flags, delay); this.hooks.vibe(s);
  }
  private ringMove(s: number, slide: boolean) {
    const f = this.eff(s);
    if (f !== null) this.audio.move(s, f, (slide ? 1 : 0) | 2);
  }
  private hit(s: number, vel: number, x: number, r: Rect | null, delay = 0) {
    const f = this.eff(s); if (f === null) return;
    const p = this.params();
    const flags = r && x > r.left + r.width * 0.8 ? NF.MUTE : 0;   // far edge of the strum zone = palm mute
    const list: Pair[] = this.shape ? [[s, f]] : chordFor(s, f, p.tuning, p.power);
    list.forEach(([a, b], k) => this.pluck(a, b, vel, flags, delay + k * 6));
  }
  private chordStrum(down: boolean, v: number, x: number, r: Rect) {
    (down ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 0]).forEach((s, k) => this.hit(s, v * (0.9 + 0.1 * this.rnd()), x, r, k * 8));
  }

  // ---- strum zone ---------------------------------------------------------------------------------------------------
  zoneDown(id: number, x: number, y: number, t: number, r: Rect) {
    const row = this.rowAt(y, r);
    this.strums.set(id, {y, t, row, r, chord: !!this.shape, v: 0.8});
    if (this.shape) this.chordStrum(y < r.top + r.height / 2, 0.85, x, r); else this.hit(row, 0.8, x, r);
  }
  zoneMove(id: number, x: number, y: number, t: number) {
    const p = this.strums.get(id); if (!p || p.chord) return;
    const row = this.rowAt(y, p.r), dt = Math.max(1, t - p.t);
    p.v = clamp(0.5 + Math.abs(y - p.y) / dt * 0.45, 0.55, 1.15);
    p.y = y; p.t = t;
    let k = 0;
    while (p.row !== row) { p.row += row > p.row ? 1 : -1; this.hit(p.row, p.v, x, p.r, k++ * 6); }
  }
  zoneUp(id: number) { this.strums.delete(id); }

  // ---- fretting hand --------------------------------------------------------------------------------------------------
  neckDown(id: number, x: number, y: number, r: Rect) {
    const [s, f] = this.cellAt(x, y, r), p = this.params();
    this.hooks.buzz();
    if (this.mode === 'lead') {
      const list = chordFor(s, f, p.tuning, p.power);
      this.fingers.set(id, {s, f, list});
      list.forEach(([a, b], k) => this.pluck(a, b, 0.85, 0, k * 9));
    } else {
      this.fingers.set(id, {s, f});
      this.ringMove(s, false);
    }
    this.hooks.paint();
  }
  neckMove(id: number, x: number, y: number, r: Rect) {
    const st = this.fingers.get(id); if (!st) return;
    const [s, f] = this.cellAt(x, y, r), slide = this.params().slide;
    if (s === st.s && f === st.f) return;
    if (this.mode === 'lead') {
      if (s !== st.s || !st.list) return;
      const d = f - st.f, nl = st.list.map(([a, b]) => [a, b + d] as Pair);
      if (nl.some(([, b]) => b < 0 || b > MAX_FRET)) return;
      st.list.forEach(([a], k) => this.audio.move(a, nl[k][1], slide ? 1 : 0));
      st.list = nl; st.f = f;
    } else {
      const o = st.s; st.s = s; st.f = f;
      if (s === o) this.ringMove(s, slide); else { this.ringMove(o, false); this.ringMove(s, false); }
    }
    this.hooks.paint();
  }
  neckUp(id: number) {
    const st = this.fingers.get(id); if (!st) return;
    this.fingers.delete(id);
    if (this.mode === 'lead') st.list?.forEach(([s]) => this.audio.noteOff(s, 0, 0)); else this.ringMove(st.s, false);
    this.hooks.paint();
  }
  cancelAll() {
    [...this.fingers.keys()].forEach(id => this.neckUp(id)); this.strums.clear();
  }
}
