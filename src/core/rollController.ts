import {RollModel, RollNote} from './rollModel';

export const ROLL_G = 46;   // piano-key column width
export const ROLL_HH = 26;  // bar ruler height

export type Tool = 'draw' | 'select' | 'erase' | 'hand';

export interface RollHooks {
  /** request a redraw */ invalidate(): void;
  /** play a short preview of a pitch */ audition(pitch: number): void;
  /** move the playhead (beats) */ seek(beat: number): void;
  /** notes/selection changed (persist, sync engine, refresh inspector) */ changed(): void;
}

type Act =
  | {t: 'seek'} | {t: 'key'; p: number} | {t: 'erase'}
  | {t: 'pan'; x: number; y: number; ox: number; oy: number}
  | {t: 'lasso'; x: number; y: number; cx: number; cy: number}
  | {t: 'new'; t0: number; p: number; d: number; x: number}
  | {t: 'move' | 'size'; n: RollNote; x: number; y: number; was: boolean; mv?: boolean; lp?: number;
     o: Array<{m: RollNote; t: number; d: number; p: number}>};

interface Gesture { dx: number; dy: number; cx: number; cy: number; zx: number; rh: number; ox: number; oy: number }

export class RollController {
  tool: Tool = 'draw';
  multi = false;
  chord: readonly number[] = [0];
  // view
  ox = 0; oy = 0; zx = 90; rh = 28; w = 0; h = 0;
  pos = 0;          // playhead, beats
  playing = false;
  act: Act | null = null;
  private ptr = new Map<number, [number, number]>();
  private gst: Gesture | null = null;

  constructor(readonly model: RollModel, private hooks: RollHooks) {}

  // ---- geometry ---------------------------------------------------------------------------------------------
  X = (t: number) => ROLL_G + t * this.zx - this.ox;
  Y = (p: number) => ROLL_HH + (this.model.hi - p) * this.rh - this.oy;
  bt = (x: number) => (x - ROLL_G + this.ox) / this.zx;
  pt = (y: number) => this.model.hi - Math.floor((y - ROLL_HH + this.oy) / this.rh);
  snapTo = (v: number, mode: 'round' | 'floor' = 'round') => Math[mode](v / this.model.snap + 1e-6) * this.model.snap;

  setSize(w: number, h: number) {
    const first = !this.w;
    this.w = w; this.h = h;
    if (first) this.centerOn(this.medianPitch());
    this.clampView();
  }
  private medianPitch() {
    const ps = this.model.notes.map(n => n.p).sort((a, b) => a - b);
    return ps.length ? ps[Math.floor(ps.length / 2)] : 52;
  }
  centerOn(pitch: number) { this.oy = (this.model.hi - pitch) * this.rh - (this.h - ROLL_HH) / 2; this.clampView(); }
  clampView() {
    const m = this.model;
    this.ox = Math.min(Math.max(0, this.ox), Math.max(0, m.length * this.zx + 60 - (this.w - ROLL_G)));
    this.oy = Math.min(Math.max(0, this.oy), Math.max(0, (m.hi - m.lo + 1) * this.rh - (this.h - ROLL_HH)));
  }
  /** Keep the playhead on screen while playing. Returns true if the view scrolled. */
  follow(): boolean {
    const x = this.X(this.pos);
    if (x > this.w - 30 || x < ROLL_G) { this.ox = this.pos * this.zx - (this.w - ROLL_G) * 0.15; this.clampView(); return true; }
    return false;
  }

  // ---- hit testing ------------------------------------------------------------------------------------------
  private hitNote(x: number, y: number): [RollNote, boolean] | undefined {
    const ns = this.model.notes;
    for (let i = ns.length - 1; i >= 0; i--) {
      const n = ns[i], x0 = this.X(n.t), x1 = this.X(n.t + n.d), y0 = this.Y(n.p);
      if (y >= y0 && y < y0 + this.rh && x >= x0 - 4 && x <= x1 + 6) return [n, x > x1 - Math.min(22, (x1 - x0) * 0.45)];
    }
    return undefined;
  }
  private seekTo(x: number) {
    this.pos = Math.min(this.model.length, Math.max(0, this.snapTo(this.bt(x))));
    this.hooks.seek(this.pos); this.hooks.invalidate();
  }
  private erase(x: number, y: number) {
    const h = this.hitNote(x, y);
    if (h) {
      const m = this.model;
      m.notes.splice(m.notes.indexOf(h[0]), 1); m.sel.delete(h[0]); m.assignStrings();
      this.hooks.changed(); this.hooks.invalidate();
    }
  }

  // ---- pointer events (ids are the platform's touch identifiers) -------------------------------------------------
  down(id: number, x: number, y: number) {
    const m = this.model;
    this.ptr.set(id, [x, y]);
    if (this.ptr.size > 1) {            // second finger: cancel any drag, start pinch / pan
      const a = this.act;
      if (a && (a.t === 'move' || a.t === 'size') && a.mv) a.o.forEach(({m: n, t, d, p}) => { n.t = t; n.d = d; n.p = p; });
      this.act = null;
      const q = [...this.ptr.values()];
      this.gst = {dx: Math.abs(q[0][0] - q[1][0]), dy: Math.abs(q[0][1] - q[1][1]), cx: (q[0][0] + q[1][0]) / 2, cy: (q[0][1] + q[1][1]) / 2,
        zx: this.zx, rh: this.rh, ox: this.ox, oy: this.oy};
      m.assignStrings(); this.hooks.invalidate(); return;
    }
    if (y < ROLL_HH) { this.act = {t: 'seek'}; this.seekTo(x); return; }
    if (x < ROLL_G) { const p = this.pt(y); this.act = {t: 'key', p}; this.hooks.audition(p); return; }
    const h = this.hitNote(x, y);
    if (this.tool === 'hand') this.act = {t: 'pan', x, y, ox: this.ox, oy: this.oy};
    else if (this.tool === 'erase') { m.checkpoint(); this.act = {t: 'erase'}; this.erase(x, y); }
    else if (h) {
      const [n, resize] = h, was = m.sel.has(n);
      if (!was) { if (!this.multi) m.sel = new Set(); m.sel.add(n); }
      this.act = {t: resize ? 'size' : 'move', n, x, y, was, o: m.selection().map(q => ({m: q, t: q.t, d: q.d, p: q.p}))};
      if (!resize) this.hooks.audition(n.p);
      this.hooks.changed();
    } else if (this.tool === 'select') {
      if (!this.multi) m.sel = new Set();
      this.act = {t: 'lasso', x, y, cx: x, cy: y}; this.hooks.changed();
    } else {
      const p = this.pt(y), t0 = Math.max(0, this.snapTo(this.bt(x), 'floor'));
      if (p < m.lo || p > m.hi || t0 >= m.length) return;
      if (!this.multi) m.sel = new Set();
      this.act = {t: 'new', t0, p, d: m.len, x}; this.hooks.audition(p); this.hooks.changed();
    }
    this.hooks.invalidate();
  }

  move(id: number, x: number, y: number) {
    if (!this.ptr.has(id)) return;
    this.ptr.set(id, [x, y]);
    const m = this.model;
    if (this.gst) {
      const q = [...this.ptr.values()]; if (q.length < 2) return;
      const dx = Math.abs(q[0][0] - q[1][0]), dy = Math.abs(q[0][1] - q[1][1]), cx = (q[0][0] + q[1][0]) / 2, cy = (q[0][1] + q[1][1]) / 2, g = this.gst;
      if (g.dx > 40) this.zx = Math.min(300, Math.max(24, g.zx * dx / g.dx));
      if (g.dy > 40) this.rh = Math.min(52, Math.max(16, g.rh * dy / g.dy));
      this.ox = (g.cx - ROLL_G + g.ox) / g.zx * this.zx - (cx - ROLL_G);
      this.oy = (g.cy - ROLL_HH + g.oy) / g.rh * this.rh - (cy - ROLL_HH);
      this.clampView(); this.hooks.invalidate(); return;
    }
    const a = this.act; if (!a) return;
    switch (a.t) {
      case 'pan': this.ox = a.ox - (x - a.x); this.oy = a.oy - (y - a.y); this.clampView(); break;
      case 'seek': this.seekTo(x); break;
      case 'key': { const p = this.pt(y); if (p !== a.p) { a.p = p; this.hooks.audition(p); } break; }
      case 'erase': this.erase(x, y); break;
      case 'lasso': a.cx = x; a.cy = y; break;
      case 'new': if (Math.abs(x - a.x) > 8) a.d = Math.max(m.snap, this.snapTo(this.bt(x)) - a.t0); break;
      default: {
        if (!a.mv) { if (Math.abs(x - a.x) < 6 && Math.abs(y - a.y) < 6) return; a.mv = true; m.checkpoint(); }
        if (a.t === 'size') {
          const dd = this.snapTo((x - a.x) / this.zx);
          a.o.forEach(({m: n, d}) => { n.d = Math.max(m.snap, d + dd); });
        } else {
          const dt = this.snapTo((x - a.x) / this.zx), dp = -Math.round((y - a.y) / this.rh);
          a.o.forEach(({m: n, t, p}) => {
            n.t = Math.max(0, t + dt);
            const np = Math.min(m.hi, Math.max(m.lo, p + dp));
            if (np !== n.p) { delete n.s; n.p = np; }
          });
          if (a.n.p !== a.lp) { a.lp = a.n.p; this.hooks.audition(a.n.p); }
        }
        m.assignStrings();
      }
    }
    this.hooks.invalidate();
  }

  up(id: number) {
    if (!this.ptr.has(id)) return;
    this.ptr.delete(id);
    const m = this.model;
    if (this.gst) { if (this.ptr.size < 2) this.gst = null; this.act = null; return; }
    const a = this.act; this.act = null;
    if (!a) return;
    if (a.t === 'new') {
      m.checkpoint();
      const ns: RollNote[] = this.chord.map(i => ({p: a.p + i, t: a.t0, d: a.d, v: 0.85})).filter(n => n.p <= m.hi);
      m.notes.push(...ns); m.sel = new Set(ns); m.len = a.d;
    } else if (a.t === 'lasso') {
      const x0 = Math.min(a.x, a.cx), x1 = Math.max(a.x, a.cx), y0 = Math.min(a.y, a.cy), y1 = Math.max(a.y, a.cy);
      m.notes.forEach(n => { if (this.X(n.t + n.d) >= x0 && this.X(n.t) <= x1 && this.Y(n.p) + this.rh >= y0 && this.Y(n.p) <= y1) m.sel.add(n); });
    } else if (a.t === 'move' || a.t === 'size') {
      if (!a.mv && this.multi && a.was) m.sel.delete(a.n);
      if (a.mv && a.t === 'size') m.len = a.n.d;
    } else return;
    m.assignStrings(); this.hooks.changed(); this.hooks.invalidate();
  }

  cancelAll() { this.ptr.clear(); this.gst = null; this.act = null; }
}
