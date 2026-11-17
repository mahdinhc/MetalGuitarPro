// Writes the engine event list for a riff exercising every articulation to a raw float32 file.
import {writeFileSync} from 'node:fs';
import {RollModel, buildSequence} from '../src/core/rollModel';
const m = new RollModel();
m.setRiff({bars: 2, bpm: 140, snap: .25, len: .5, n: [
  {p: 40, t: 0, d: .5, v: .9, pm: 1}, {p: 40, t: .5, d: .5, v: .9, pm: 1}, {p: 43, t: 1, d: 1, v: 1, pw: 1, rg: 1},
  {p: 52, t: 2, d: 1, v: .9, sl: 1}, {p: 55, t: 3, d: 1, v: .9, lg: 1}, {p: 57, t: 4, d: 1, v: .9, bd: 2, vb: 1},
  {p: 64, t: 5, d: 1, v: .9, hm: 1}, {p: 45, t: 6, d: 1, v: 1, tr: 1},
]});
const ev = buildSequence(m);
writeFileSync(process.argv[2], Buffer.from(new Float32Array(ev).buffer));
console.log(`${ev.length / 8} events, strings: ${m.notes.map(n => n._a).join(',')}`);
