import {ClipOp, matchFont, PaintStyle, Skia, SkFont, SkPicture} from '@shopify/react-native-skia';
import {Platform} from 'react-native';
import {ROLL_G, ROLL_HH, RollController} from '../core/rollController';
import {NOTE_NAMES} from '../core/music';
import type {RollNote} from '../core/rollModel';
import type {Theme} from '../theme';

export interface RollFonts { bold: SkFont | null; small: SkFont | null }
export function makeRollFonts(): RollFonts {
  const family = Platform.select({ios: 'Helvetica', default: 'sans-serif'}) as string;
  const mk = (size: number, weight: 'bold' | 'normal') => { try { return matchFont({fontFamily: family, fontSize: size, fontWeight: weight}); } catch { return null; } };
  return {bold: mk(11, 'bold'), small: mk(9, 'bold')};
}

const BLACK = new Set([1, 3, 6, 8, 10]);
const paint = Skia.Paint();
paint.setAntiAlias(true);

function fill(cv: ReturnType<ReturnType<typeof Skia.PictureRecorder>['beginRecording']>, color: string, x: number, y: number, w: number, h: number) {
  paint.setStyle(PaintStyle.Fill); paint.setColor(Skia.Color(color)); cv.drawRect(Skia.XYWHRect(x, y, w, h), paint);
}

const GLYPH: Array<[keyof RollNote, string]> = [['pm', 'M'], ['vb', '~'], ['hm', '<>'], ['sl', '/'], ['lg', '^'], ['tr', 'tr'], ['pw', '5'], ['rg', 'R']];
export const noteGlyphs = (n: RollNote) => GLYPH.filter(([k]) => n[k]).map(([, g]) => g).join('') + (n.bd ? 'b' : '');

/** Records one frame of the piano roll. Everything is derived from the controller, so drawing is a pure function. */
export function drawRoll(c: RollController, w: number, h: number, t: Theme, f: RollFonts): SkPicture {
  const rec = Skia.PictureRecorder();
  const cv = rec.beginRecording(Skia.XYWHRect(0, 0, w, h));
  const m = c.model, rh = c.rh, hi = m.hi, lo = m.lo;
  const text = (s: string, x: number, y: number, color: string, font: SkFont | null) => {
    if (!font) return; paint.setStyle(PaintStyle.Fill); paint.setColor(Skia.Color(color)); cv.drawText(s, x, y, paint, font);
  };
  const line = (x0: number, y0: number, x1: number, y1: number, color: string, wd = 1) => {
    paint.setStyle(PaintStyle.Stroke); paint.setStrokeWidth(wd); paint.setColor(Skia.Color(color)); cv.drawLine(x0, y0, x1, y1, paint); paint.setStyle(PaintStyle.Fill);
  };

  fill(cv, t.rollBg, 0, 0, w, h);
  cv.save();
  cv.clipRect(Skia.XYWHRect(ROLL_G, ROLL_HH, w - ROLL_G, h - ROLL_HH), ClipOp.Intersect, true);

  // pitch rows
  const pTop = Math.min(hi, c.pt(ROLL_HH) + 1), pBot = Math.max(lo, c.pt(h) - 1);
  for (let p = pTop; p >= pBot; p--) {
    const y = c.Y(p);
    fill(cv, BLACK.has(p % 12) ? t.rollBlack : t.rollBg, ROLL_G, y, w - ROLL_G, rh);
    if (p % 12 === 0) line(ROLL_G, y + rh, w, y + rh, t.rollBeat);
  }
  // time grid
  const L = m.length, step = m.snap, endX = c.X(L);
  const t0 = Math.max(0, Math.floor(c.bt(ROLL_G) / step) * step), t1 = Math.min(L, c.bt(w) + step);
  const fine = step * c.zx >= 9;
  for (let tt = t0, i = Math.round(t0 / step); tt <= t1 + 1e-6; tt = (++i) * step) {
    const x = c.X(tt), isBeat = Math.abs(tt - Math.round(tt)) < 1e-6, isBar = isBeat && Math.round(tt) % 4 === 0;
    if (isBar) line(x, ROLL_HH, x, h, t.rollBeat, 1.5);
    else if (isBeat) line(x, ROLL_HH, x, h, t.rollGrid, 1);
    else if (fine) line(x, ROLL_HH, x, h, t.rollGrid, 0.5);
  }
  // beyond the loop end
  if (endX < w) fill(cv, t.dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.12)', endX, ROLL_HH, w - endX, h - ROLL_HH);
  line(endX, ROLL_HH, endX, h, t.acc, 2);

  // notes
  const drawNote = (n: RollNote, ghost = false) => {
    const x0 = c.X(n.t), x1 = c.X(n.t + n.d);
    if (x1 < ROLL_G || x0 > w) return;
    const y = c.Y(n.p), sel = m.sel.has(n), bad = (n._a ?? 0) < 0 && !ghost;
    const rr = Skia.RRectXY(Skia.XYWHRect(x0 + 0.5, y + 1, Math.max(4, x1 - x0 - 1), rh - 2), 4, 4);
    paint.setStyle(PaintStyle.Fill);
    paint.setColor(Skia.Color(bad ? t.danger : t.acc));
    paint.setAlphaf(ghost ? 0.35 : bad ? 0.55 : 0.45 + 0.55 * Math.min(1, n.v));
    cv.drawRRect(rr, paint); paint.setAlphaf(1);
    if (sel || ghost) { paint.setStyle(PaintStyle.Stroke); paint.setStrokeWidth(2); paint.setColor(Skia.Color(t.dark ? '#FFFFFF' : '#1A1815')); cv.drawRRect(rr, paint); paint.setStyle(PaintStyle.Fill); }
    if (x1 - x0 > 12 && !ghost) fill(cv, 'rgba(255,255,255,0.45)', x1 - 4, y + 4, 2, rh - 8);   // resize handle
    if (x1 - x0 > 22 && rh >= 18 && !ghost) {
      const label = bad ? '×' : `${n._f ?? ''}`;
      text(label, x0 + 5, y + rh / 2 + 4, '#FFFFFF', f.bold);
      const g = noteGlyphs(n);
      if (g && x1 - x0 > 40) text(g, x0 + 5 + label.length * 7 + 4, y + rh / 2 + 3, 'rgba(255,255,255,0.85)', f.small);
    }
  };
  m.notes.forEach(n => drawNote(n));

  // note being drawn (ghost chord) and lasso
  const a = c.act;
  if (a?.t === 'new') c.chord.forEach(i => drawNote({p: a.p + i, t: a.t0, d: a.d, v: 0.85}, true));
  if (a?.t === 'lasso') {
    const x = Math.min(a.x, a.cx), y = Math.min(a.y, a.cy), ww = Math.abs(a.cx - a.x), hh = Math.abs(a.cy - a.y);
    fill(cv, t.accSoft, x, y, ww, hh);
    paint.setStyle(PaintStyle.Stroke); paint.setStrokeWidth(1); paint.setColor(Skia.Color(t.acc)); cv.drawRect(Skia.XYWHRect(x, y, ww, hh), paint); paint.setStyle(PaintStyle.Fill);
  }
  cv.restore();

  // key column
  cv.save();
  cv.clipRect(Skia.XYWHRect(0, ROLL_HH, ROLL_G, h - ROLL_HH), ClipOp.Intersect, true);
  fill(cv, t.surface, 0, ROLL_HH, ROLL_G, h - ROLL_HH);
  const open = new Set(m.tuning);
  for (let p = pTop; p >= pBot; p--) {
    const y = c.Y(p), black = BLACK.has(p % 12);
    fill(cv, black ? t.surface3 : t.surface2, 0, y + 0.5, black ? ROLL_G * 0.66 : ROLL_G - 1, rh - 1);
    if (p % 12 === 0 || open.has(p)) text(`${NOTE_NAMES[p % 12]}${Math.floor(p / 12) - 1}`, ROLL_G - 25, y + rh / 2 + 3.5, open.has(p) ? t.acc : t.sub, f.small);
  }
  cv.restore();

  // ruler
  fill(cv, t.surface, 0, 0, w, ROLL_HH);
  cv.save();
  cv.clipRect(Skia.XYWHRect(ROLL_G, 0, w - ROLL_G, ROLL_HH), ClipOp.Intersect, true);
  for (let b = Math.max(0, Math.floor(c.bt(ROLL_G))); b <= Math.min(L, Math.ceil(c.bt(w))); b++) {
    const x = c.X(b), bar = b % 4 === 0;
    line(x, bar ? 2 : ROLL_HH - 8, x, ROLL_HH, bar ? t.sub : t.mute, 1);
    if (bar && b < L) text(`${b / 4 + 1}`, x + 4, 17, t.text, f.bold);
  }
  cv.restore();
  line(0, ROLL_HH, w, ROLL_HH, t.line);
  line(ROLL_G, 0, ROLL_G, h, t.line);
  return rec.finishRecordingAsPicture();
}
