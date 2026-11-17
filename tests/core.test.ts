// Run with: npx tsx tests/core.test.ts   (pure TypeScript, no React Native needed)
import assert from 'node:assert/strict';
import {RollModel, DEFAULT_RIFF, buildSequence, EV, NF} from '../src/core/rollModel';
import {RollController, ROLL_G, ROLL_HH} from '../src/core/rollController';
import {chordFor, PRESETS, presetValues, TUNINGS} from '../src/core/music';
import {PARAM_DEFS, ENGINE_PARAM_COUNT} from '../src/core/paramDefs';
import {readFileSync} from 'node:fs';

let n = 0; const t = (name: string, f: () => void) => { f(); n++; console.log('PASS', name); };
const mk = () => { const m = new RollModel(); m.setRiff(DEFAULT_RIFF); return m; };

t('default riff is assigned to the low E string, frets 0/3/5/6', () => {
  const m = mk(); const f = m.notes.map(x => [x._a, x._f]);
  assert.deepEqual(f, [[0, 0], [0, 0], [0, 0], [0, 3], [0, 0], [0, 0], [0, 5], [0, 6]]);
});
t('overlapping chord notes spread over strings; pitches below the low string are unplayable', () => {
  const m = new RollModel(); m.setRiff({n: [{p: 52, t: 0, d: 1, v: .8}, {p: 52, t: 0, d: 1, v: .8}, {p: 30, t: 0, d: 1, v: .8}], bars: 1, bpm: 120, snap: .25, len: .5});
  assert.equal(m.notes[0]._a, 0); assert.equal(m.notes[1]._a, 1); assert.equal(m.notes[2]._a, -1); assert.equal(m.notes[1]._f, 7);
});
t('retuning re-assigns strings (Drop A makes pitch 30+ playable)', () => {
  const m = new RollModel(); m.setRiff({n: [{p: 35, t: 0, d: 1, v: .8}], bars: 1, bpm: 120, snap: .25, len: .5});
  assert.equal(m.notes[0]._a, -1); m.setTuning(TUNINGS[6].notes); assert.equal(m.notes[0]._a, 0); assert.equal(m.notes[0]._f, 2);
});
t('manual string choice wins and is dropped when impossible', () => {
  const m = mk(); m.sel = new Set([m.notes[3]]); m.setString(1);   // pitch 43 on A string = fret -2 -> invalid
  assert.equal(m.notes[3].s, undefined);
  const hi = new RollModel(); hi.setRiff({n: [{p: 52, t: 0, d: 1, v: .8}], bars: 1, bpm: 120, snap: .25, len: .5});
  hi.sel = new Set(hi.notes); hi.setString(2); assert.equal(hi.notes[0]._a, 2); assert.equal(hi.notes[0]._f, 2);
});
t('slide link: a slide note links to the adjacent same-string note', () => {
  const m = new RollModel(); m.setRiff({n: [{p: 45, t: 0, d: 1, v: .8, sl: 1}, {p: 47, t: 1, d: 1, v: .8}], bars: 1, bpm: 120, snap: .25, len: .5});
  assert.equal(m.notes[0]._x, m.notes[1]);
  const ev = buildSequence(m); const ons = [], moves = [], offs = [];
  for (let i = 0; i < ev.length; i += EV.STRIDE) { const e = ev.slice(i, i + 8); (e[1] === EV.ON ? ons : e[1] === EV.MOVE ? moves : e[1] === EV.OFF ? offs : []).push(e as never); }
  assert.equal(ons.length, 1); assert.equal(moves.length, 1); assert.equal(offs.length, 1);   // first note is NOT released: it slides
  assert.equal((moves[0] as number[])[6], 1);
});
t('slide/legato targets stay on the same string as the note that links into them', () => {
  const m = new RollModel(); m.setRiff({n: [{p: 52, t: 0, d: 1, v: .8, sl: 1}, {p: 55, t: 1, d: 1, v: .8, lg: 1}, {p: 57, t: 2, d: 1, v: .8}], bars: 1, bpm: 120, snap: .25, len: .5});
  assert.deepEqual(m.notes.map(n => n._a), [0, 0, 0]); assert.equal(m.notes[0]._x, m.notes[1]); assert.equal(m.notes[1]._x, m.notes[2]);
});
t('power chord expands to root+5th+octave with 6 ms stagger; palm mute flag set', () => {
  const m = new RollModel(); m.setRiff({n: [{p: 40, t: 0, d: 1, v: .8, pw: 1, pm: 1}], bars: 1, bpm: 120, snap: .25, len: .5});
  const ev = buildSequence(m); const ons: number[][] = [];
  for (let i = 0; i < ev.length; i += 8) if (ev[i + 1] === EV.ON) ons.push(ev.slice(i, i + 8));
  assert.equal(ons.length, 3); assert.deepEqual(ons.map(e => e[6]), [0, 6, 12]); assert.ok(ons.every(e => (e[5] & NF.MUTE) !== 0));
  assert.deepEqual(ons.map(e => [e[2], e[3]]), [[0, 0], [1, 2], [2, 2]]);
});
t('tremolo picking generates 1/32 repeats with alternating velocity', () => {
  const m = new RollModel(); m.setRiff({n: [{p: 40, t: 0, d: 1, v: 1, tr: 1}], bars: 1, bpm: 120, snap: .25, len: .5});
  const ev = buildSequence(m); const ons: number[][] = [];
  for (let i = 0; i < ev.length; i += 8) if (ev[i + 1] === EV.ON) ons.push(ev.slice(i, i + 8));
  assert.equal(ons.length, 8); assert.ok(Math.abs(ons[1][4] - .8) < 1e-6 && ons[2][4] === 1);
});
t('notes starting after the loop end are not scheduled; bend event is emitted', () => {
  const m = new RollModel(); m.setRiff({n: [{p: 40, t: 0, d: 1, v: 1, bd: 2}, {p: 40, t: 4, d: 1, v: 1}], bars: 1, bpm: 120, snap: .25, len: .5});
  const ev = buildSequence(m); const types = []; for (let i = 0; i < ev.length; i += 8) types.push(ev[i + 1]);
  assert.deepEqual(types.sort(), [EV.ON, EV.OFF, EV.BEND].sort());
});
t('undo/redo restores notes; duplicate grows bars up to 16', () => {
  const m = mk(); const c0 = m.notes.length;
  m.sel = new Set(m.notes); m.duplicateSelection(); assert.equal(m.notes.length, c0 * 2); assert.equal(m.bars, 2);   // fits in the existing 2 bars
  m.duplicateSelection(); assert.equal(m.notes.length, c0 * 3); assert.equal(m.bars, 4);                          // second copy ends at beat 12 -> bars grow
  m.undo(); assert.equal(m.notes.length, c0 * 2); assert.equal(m.bars, 2); m.redo(); assert.equal(m.notes.length, c0 * 3);
});
t('serialisation round-trips without derived fields', () => {
  const m = mk(); const j = m.toJSON(); assert.ok(!j.includes('"_a"')); const m2 = new RollModel(); assert.ok(m2.load(j)); assert.equal(m2.notes.length, m.notes.length);
  assert.equal(new RollModel().load('garbage'), false);
});
t('controller: tap draws a snapped note, drag resizes, erase removes', () => {
  const m = new RollModel(); const calls = {aud: 0, ch: 0};
  const c = new RollController(m, {invalidate() {}, audition() { calls.aud++; }, seek() {}, changed() { calls.ch++; }});
  c.setSize(600, 400); c.ox = 0; c.zx = 100; c.rh = 28; c.oy = (m.hi - 50) * c.rh - 100;
  const x = ROLL_G + 100 * 1.02, y = c.Y(48) + 5;           // slightly after beat 1
  c.down(1, x, y); c.up(1);
  assert.equal(m.notes.length, 1); assert.equal(m.notes[0].p, 48); assert.equal(m.notes[0].t, 1); assert.equal(m.notes[0].d, 0.5); assert.ok(calls.aud >= 1);
  // drag the right edge of the note by one beat (resize handle) -> length 1.5
  const n = m.notes[0]; const ex = c.X(n.t + n.d) - 4, ey = c.Y(n.p) + 5;
  c.down(2, ex, ey); c.move(2, ex + 100, ey); c.up(2); assert.equal(n.d, 1.5);
  c.tool = 'erase'; c.down(3, c.X(n.t) + 10, c.Y(n.p) + 5); c.up(3); assert.equal(m.notes.length, 0);
});
t('controller: pinch zooms time axis; ruler tap seeks', () => {
  const m = mk(); let seeked = -1; const c = new RollController(m, {invalidate() {}, audition() {}, seek(b) { seeked = b; }, changed() {}});
  c.setSize(600, 400); c.zx = 90; c.ox = 0;
  c.down(1, 200, 200); c.down(2, 300, 200); c.move(2, 400, 200);   // fingers 100px -> 200px apart
  assert.ok(Math.abs(c.zx - 180) < 1e-6); c.up(2); c.up(1);
  c.down(5, c.X(2), 10); c.up(5); assert.equal(seeked, 2);
});
t('chordFor builds power chords and clips impossible frets', () => {
  assert.deepEqual(chordFor(0, 3, TUNINGS[0].notes, true), [[0, 3], [1, 5], [2, 5]]);
  assert.equal(chordFor(5, 3, TUNINGS[0].notes, true).length, 1);
});
t('every preset only references real parameters, within range', () => {
  const byId = new Map(PARAM_DEFS.map(p => [p.id, p]));
  for (const p of PRESETS) for (const [k, v] of Object.entries(presetValues(p))) {
    const d = byId.get(k as never)!; assert.ok(d, `${p.name}: unknown param ${k}`); assert.ok(v! >= d.min && v! <= d.max, `${p.name}.${k}=${v} outside ${d.min}..${d.max}`);
  }
});
t('TS param table matches the C++ enum order', () => {
  const h = readFileSync(new URL('../native/cpp/ParamIds.h', import.meta.url), 'utf8');
  const ids = [...h.matchAll(/^\s+P_(\w+),$/gm)].map(m => m[1]);
  const ts = PARAM_DEFS.filter(p => p.index >= 0).sort((a, b) => a.index - b.index).map(p => p.id);
  assert.deepEqual(ids, ts); assert.equal(ids.length, ENGINE_PARAM_COUNT);
});
console.log(`\n${n} core tests passed`);

// ---- fretboard controller -------------------------------------------------------------------------------------------
import {FretboardController} from '../src/core/fretboard';
const rig = (power = false) => {
  const log: string[] = [];
  const a = {noteOn: (s: number, f: number, v: number, fl: number, d: number) => log.push(`on s${s} f${f} v${v.toFixed(2)} fl${fl} d${d}`),
    noteOff: (s: number) => log.push(`off s${s}`), move: (s: number, f: number, fl: number) => log.push(`mv s${s} f${f} fl${fl}`)};
  const fb = new FretboardController(a, () => ({power, slide: true, tuning: TUNINGS[0].notes}), {paint() {}, vibe() {}, buzz() {}}, () => 0.5);
  return {log, fb, neck: {left: 0, top: 0, width: 700, height: 600}, zone: {left: 700, top: 0, width: 200, height: 600}};
};
const fbtests = () => {
  t('fretboard: swiping across the zone plucks every string crossed, faster swipe = louder', () => {
    const {log, fb, zone} = rig(); fb.zoneDown(1, 750, 50, 0, zone); fb.zoneMove(1, 750, 350, 20); fb.zoneUp(1);
    const ons = log.filter(l => l.startsWith('on')); assert.equal(ons.length, 4);          // rows 0,1,2,3
    assert.deepEqual(ons.map(l => l.split(' ')[1]), ['s0', 's1', 's2', 's3']);
    assert.ok(parseFloat(ons[1].split('v')[1].split(' ')[0]) > 0.8);                          // 300px in 20ms -> fast -> capped at 1.15
  });
  t('fretboard: far edge of the zone palm-mutes (flag 1); chord shape strums down/up with stagger', () => {
    const r = rig(); r.fb.zoneDown(1, 890, 50, 0, r.zone); assert.match(r.log[0], /fl1/);
    const c = rig(); c.fb.setShape([0, 2, 2, 0, 0, 0]); c.fb.zoneDown(1, 750, 50, 0, c.zone);   // top half = down-stroke
    assert.equal(c.log.length, 6); assert.deepEqual(c.log.map(l => l.split(' ')[1]), ['s0', 's1', 's2', 's3', 's4', 's5']); assert.match(c.log[5], /d40/);
    const u = rig(); u.fb.setShape([0, 2, 2, 0, 0, 0]); u.fb.zoneDown(1, 750, 500, 0, u.zone); assert.equal(u.log[0].split(' ')[1], 's5');
  });
  t('fretboard: muted strings in a shape stay silent; capo raises the shape', () => {
    const r = rig(); r.fb.setShape([-1, 0, 2, 2, 2, 0]); r.fb.setCapo(2); r.fb.zoneDown(1, 750, 50, 0, r.zone);
    assert.equal(r.log.filter(l => l.startsWith('on')).length, 5); assert.match(r.log[0], /s1 f2/);
  });
  t('fretboard: strum mode fretting only moves ringing strings (flag 2); dragging slides', () => {
    const r = rig(); r.fb.neckDown(1, 50, 20, r.neck);                       // string 0, fret 0 col
    assert.deepEqual(r.log, ['mv s0 f0 fl2']); r.log.length = 0;
    r.fb.neckMove(1, 250, 20, r.neck); assert.match(r.log[0], /mv s0 f2 fl3/);   // slide to fret 2, ringing-only
    r.log.length = 0; r.fb.neckUp(1); assert.deepEqual(r.log, ['mv s0 f0 fl2']);   // pull-off to open
  });
  t('fretboard: lead mode plucks on touch, drags along the string, releases on lift; power chord adds 5th+octave', () => {
    const r = rig(true); r.fb.setMode('lead'); r.fb.neckDown(1, 250, 20, r.neck);   // fret 2, string 0
    assert.deepEqual(r.log.filter(l => l.startsWith('on')).map(l => l.split(' ').slice(1, 3).join(' ')), ['s0 f2', 's1 f4', 's2 f4']);
    r.log.length = 0; r.fb.neckMove(1, 450, 20, r.neck); assert.equal(r.log.length, 3); assert.match(r.log[0], /s0 f4 fl1/);
    r.log.length = 0; r.fb.neckUp(1); assert.deepEqual(r.log, ['off s0', 'off s1', 'off s2']);
  });
  t('fretboard: window clamps to the 22-fret neck', () => { const r = rig(); r.fb.setWindow(99); assert.equal(r.fb.w0, 16); });
};
fbtests();
console.log(`${n} tests total`);
