import {chordFor, MAX_FRET} from './music';

/** A note in the piano roll. Underscore fields are derived by assignStrings() and never persisted. */
export interface RollNote {
  p: number;          // MIDI pitch
  t: number;          // start, beats
  d: number;          // length, beats
  v: number;          // velocity 0..1
  pm?: 0 | 1;         // palm mute
  vb?: 0 | 1;         // vibrato
  hm?: 0 | 1;         // harmonic
  sl?: 0 | 1;         // slide into next note
  lg?: 0 | 1;         // hammer-on / pull-off into next note
  bd?: number;        // bend 0..3 semitones
  tr?: 0 | 1;         // tremolo picking
  pw?: 0 | 1;         // power chord
  rg?: 0 | 1;         // let ring
  s?: number;         // manually chosen string (otherwise automatic)
  _a?: number;        // assigned string (-1 = unplayable in this tuning)
  _f?: number;        // assigned fret
  _x?: RollNote | null; // linked next note (slide / legato target)
}

export type FlagKey = 'pm' | 'vb' | 'hm' | 'sl' | 'lg' | 'tr' | 'pw' | 'rg';

export interface RollData { n: Array<Omit<RollNote, '_a' | '_f' | '_x'>>; bars: number; bpm: number; snap: number; len: number }

const strip = (_k: string, v: unknown) => (typeof _k === 'string' && _k[0] === '_' ? undefined : v);

// native engine event layout (see native/cpp/Engine.h)
export const EV = {ON: 0, OFF: 1, MOVE: 2, BEND: 3, VIB_ON: 4, VIB_OFF: 5, STRIDE: 8} as const;
export const NF = {MUTE: 1, HARM: 2, RING: 4, TREM: 8} as const;

export class RollModel {
  notes: RollNote[] = [];
  bars = 2;
  bpm = 120;
  snap = 0.25;
  len = 0.5;
  sel = new Set<RollNote>();
  tuning: readonly number[] = [40, 45, 50, 55, 59, 64];
  private undoStack: string[] = [];
  private redoStack: string[] = [];

  get lo() { return this.tuning[0]; }
  get hi() { return this.tuning[5] + MAX_FRET; }
  get length() { return this.bars * 4; }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  selection() { return [...this.sel]; }

  setTuning(t: readonly number[]) { this.tuning = t; this.assignStrings(); }

  // ---- string assignment: manual string wins, else the lowest free string with fret <= 12 ----------------
  assignStrings() {
    const T = this.tuning;
    const bz: RollNote[][] = [[], [], [], [], [], []];
    const overlaps = (b: RollNote[], n: RollNote) => b.some(q => q.t < n.t + n.d - 1e-6 && n.t < q.t + q.d - 1e-6);
    const ok = (n: RollNote, s: number) => n.p - T[s] >= 0 && n.p - T[s] <= MAX_FRET;
    this.notes.forEach(n => { n._a = -1; n._x = null; });
    const ns = [...this.notes].sort((a, b) => a.t - b.t || b.p - a.p);
    ns.forEach(n => { if (n.s != null) { if (ok(n, n.s)) { n._a = n.s; bz[n.s].push(n); } else delete n.s; } });
    ns.forEach(n => {
      if (n.s != null) return;
      // a slide / hammer-on only works on one string: stay on the string of the note that links into this one
      const lead = ns.find(m => (m.sl || m.lg) && m._a != null && m._a >= 0 && Math.abs(m.t + m.d - n.t) < 0.01);
      if (lead && lead._a != null && ok(n, lead._a) && !overlaps(bz[lead._a], n)) { n._a = lead._a; bz[lead._a].push(n); return; }
      const c = [0, 1, 2, 3, 4, 5].filter(s => ok(n, s));
      const free = c.filter(s => !overlaps(bz[s], n));
      const q = free.length ? free : c;
      const s = q.find(s => n.p - T[s] <= 12) ?? q[0];
      if (s != null) { n._a = s; bz[s].push(n); }
    });
    this.notes.forEach(n => {
      if (n._a == null || n._a < 0) return;
      n._f = n.p - T[n._a];
      if (n.sl || n.lg) n._x = this.notes.find(m => m !== n && m._a === n._a && Math.abs(m.t - n.t - n.d) < 0.01) ?? null;
    });
  }

  // ---- history ---------------------------------------------------------------------------------------------
  private snapshot() { return JSON.stringify({n: this.notes, b: this.bars}, strip); }
  checkpoint() { this.undoStack.push(this.snapshot()); if (this.undoStack.length > 80) this.undoStack.shift(); this.redoStack = []; }
  private restore(s: string) {
    const d = JSON.parse(s);
    this.notes = d.n; this.bars = d.b; this.sel.clear(); this.assignStrings();
  }
  undo() { if (this.undoStack.length) { this.redoStack.push(this.snapshot()); this.restore(this.undoStack.pop()!); return true; } return false; }
  redo() { if (this.redoStack.length) { this.undoStack.push(this.snapshot()); this.restore(this.redoStack.pop()!); return true; } return false; }

  // ---- edits (each one checkpoints itself and re-assigns strings) ------------------------------------------
  private edit(fn: (n: RollNote) => void, notes = this.selection()) {
    if (!notes.length) return false;
    this.checkpoint(); notes.forEach(fn); this.assignStrings(); return true;
  }
  clear() { this.checkpoint(); this.notes = []; this.sel.clear(); }
  deleteSelection() { this.checkpoint(); this.notes = this.notes.filter(n => !this.sel.has(n)); this.sel.clear(); this.assignStrings(); }
  addNotes(ns: RollNote[]) { this.notes.push(...ns); this.sel = new Set(ns); this.assignStrings(); }
  duplicateSelection() {
    const s = this.selection(); if (!s.length) return;
    this.checkpoint();
    const t0 = Math.min(...s.map(n => n.t)), sh = Math.ceil(Math.max(...s.map(n => n.t + n.d)) - t0 - 1e-6);
    const cp = s.map(n => ({...n, t: n.t + sh}));
    const end = Math.max(...cp.map(n => n.t + n.d));
    while (this.length < end && this.bars < 16) this.bars *= 2;
    this.notes.push(...cp); this.sel = new Set(cp); this.assignStrings();
  }
  transpose(semi: number) {
    return this.edit(n => { n.p = Math.min(this.hi, Math.max(this.lo, n.p + semi)); delete n.s; });
  }
  toggleFlag(k: FlagKey) {
    const s = this.selection(); const on = s.length > 0 && s.every(n => n[k]);
    return this.edit(n => {
      n[k] = on ? 0 : 1;
      if (!on) { if (k === 'sl') n.lg = 0; if (k === 'lg') n.sl = 0; }
    });
  }
  setLength(d: number) { this.len = d; return this.edit(n => { n.d = d; }); }
  cycleBend() { return this.edit(n => { n.bd = (((n.bd ?? 0) | 0) + 1) % 4; }); }
  setString(s: number) { return this.edit(n => { if (s < 0) delete n.s; else n.s = s; }); }
  setBars(b: number) { this.checkpoint(); this.bars = b; }
  /** Velocity drags checkpoint once at the start (call checkpoint() yourself) and then mutate directly. */
  setVelocity(v: number) { this.selection().forEach(n => { n.v = v; }); }

  // ---- persistence -----------------------------------------------------------------------------------------
  toJSON(): string {
    return JSON.stringify({n: this.notes, bars: this.bars, bpm: this.bpm, snap: this.snap, len: this.len}, strip);
  }
  load(json: string | null): boolean {
    if (!json) return false;
    try {
      const d = JSON.parse(json) as RollData;
      if (!d || !Array.isArray(d.n)) return false;
      this.notes = d.n.filter(n => Number.isFinite(n.p) && Number.isFinite(n.t) && Number.isFinite(n.d)).map(n => ({...n, v: Number.isFinite(n.v) ? n.v : 0.85}));
      this.bars = d.bars || 2; this.bpm = d.bpm || 120; this.snap = d.snap || 0.25; this.len = d.len || 0.5;
      this.sel.clear(); this.undoStack = []; this.redoStack = []; this.assignStrings();
      return true;
    } catch { return false; }
  }
  setRiff(d: RollData) { this.load(JSON.stringify(d)); }
}

export const DEFAULT_RIFF: RollData = {
  n: [[40, 0], [40, .5], [40, 1], [43, 1.5], [40, 2], [40, 2.5], [45, 3], [46, 3.5]]
    .map(([p, t]) => ({p, t, d: .5, v: .9, pm: (p === 40 ? 1 : 0) as 0 | 1})),
  bars: 2, bpm: 120, snap: 0.25, len: 0.5,
};

/**
 * Flattens the riff into the engine's event list (stride 8: beat, type, string, fret, velocity, flags, arg, id).
 * The engine plays it sample-accurately inside the audio callback, so JS timers are never involved.
 */
export function buildSequence(model: RollModel): number[] {
  const out: number[] = [];
  const push = (beat: number, type: number, str: number, fret: number, vel: number, flags: number, arg: number, id: number) =>
    out.push(beat, type, str, fret, vel, flags, arg, id);
  const L = model.length, T = model.tuning;
  model.notes.forEach((n, i) => {
    if (n._a == null || n._a < 0 || n._f == null || n.t >= L) return;
    const si = n._a, fr = n._f, v = n.v || 0.85;
    const flags = (n.pm ? NF.MUTE : 0) | (n.hm ? NF.HARM : 0) | (n.rg ? NF.RING : 0);
    const list = n.pw ? chordFor(si, fr, T, true) : ([[si, fr]] as Array<[number, number]>);
    const prev = model.notes.find(m => m._x === n);
    if (n.vb) push(n.t, EV.VIB_ON, 0, 0, 0, 0, 0, i);
    if (prev) {
      push(n.t, EV.MOVE, si, fr, 0, flags, prev.sl ? 1 : 0, i);
    } else {
      const picks = [0];
      if (n.tr) for (let j = 1; j * 0.125 < n.d - 0.01; j++) picks.push(j);
      picks.forEach(j => list.forEach(([s, f], k) => push(n.t + j * 0.125, EV.ON, s, f, v * (j % 2 ? 0.8 : 1), flags, k * 6, i)));
      if (n.bd) push(n.t + Math.min(0.3 * n.d, 0.5), EV.BEND, si, fr, 0, 0, n.bd, i);
    }
    const off = n.t + n.d * 0.97;
    if (n.vb) push(off, EV.VIB_OFF, 0, 0, 0, 0, 0, i);
    if (!n._x) list.forEach(([s]) => push(off, EV.OFF, s, 0, 0, flags, 0, i));
  });
  return out;
}
