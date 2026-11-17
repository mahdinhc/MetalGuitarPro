import {DEFAULT_RIFF, RollData} from './rollModel';

type N = RollData['n'][number];
const n = (p: number, t: number, d: number, extra: Partial<N> = {}): N => ({p, t, d, v: 0.85, ...extra});

/** Starter riffs for the roll's "Load riff" menu. */
export const RIFFS: ReadonlyArray<{name: string; hint: string; data: RollData}> = [
  {name: 'Gallop', hint: 'Palm-muted gallop, 120 BPM', data: DEFAULT_RIFF},
  {
    name: 'Thrash gallop', hint: 'Fast 16th gallop with a power-chord hit, 180 BPM',
    data: {bars: 2, bpm: 180, snap: 0.25, len: 0.25, n: [
      ...Array.from({length: 8}, (_, b) => [n(40, b, 0.25, {pm: 1, v: 0.8}), n(40, b + 0.25, 0.25, {pm: 1, v: 0.7}), n(b % 4 === 3 ? 43 : 40, b + 0.5, 0.25, {v: 0.95}), n(40, b + 0.75, 0.25, {pm: 1, v: 0.75})]).flat(),
      n(45, 6, 2, {pw: 1, v: 1, rg: 1}),
    ].filter(x => !(x.t >= 6 && x.t < 8 && x.p === 40))},
  },
  {
    name: 'Djent chug', hint: 'Syncopated palm-muted chugs, 110 BPM',
    data: {bars: 2, bpm: 110, snap: 0.25, len: 0.25, n: [0, 0.75, 1.5, 2.5, 3, 4, 4.75, 5.5, 6.5, 7].map((t, i) => n(i % 5 === 4 ? 43 : 40, t, 0.25, {pm: 1, v: 0.95})).concat([n(45, 7.5, 0.5, {pw: 1, v: 1})])},
  },
  {
    name: 'Doom crawl', hint: 'Slow, ringing power chords, 70 BPM',
    data: {bars: 4, bpm: 70, snap: 1, len: 4, n: [n(40, 0, 4, {pw: 1, rg: 1, v: 0.95}), n(43, 4, 3, {pw: 1, rg: 1, v: 0.95}), n(45, 8, 4, {pw: 1, rg: 1, v: 0.95}), n(43, 12, 3, {pw: 1, rg: 1, v: 0.9})]},
  },
  {
    name: 'Lead lick', hint: 'Slides, hammer-ons, bends and vibrato, 100 BPM',
    data: {bars: 2, bpm: 100, snap: 0.5, len: 0.5, n: [
      n(64, 0, 0.5), n(67, 0.5, 0.5), n(69, 1, 1, {sl: 1}), n(71, 2, 1, {vb: 1}), n(69, 3, 0.5), n(67, 3.5, 0.5),
      n(64, 4, 1.5, {vb: 1}), n(62, 5.5, 0.5, {lg: 1}), n(64, 6, 2, {bd: 2, vb: 1}),
    ]},
  },
];
