import type {ParamId} from './paramDefs';

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const noteName = (midi: number) => NOTE_NAMES[((midi % 12) + 12) % 12];
export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export const MAX_FRET = 22;

export interface Tuning { name: string; short: string; notes: readonly number[] }
export const TUNINGS: readonly Tuning[] = [
  {name: 'Standard  E A D G B E', short: 'Standard', notes: [40, 45, 50, 55, 59, 64]},
  {name: 'Drop D', short: 'Drop D', notes: [38, 45, 50, 55, 59, 64]},
  {name: 'D Standard', short: 'D Std', notes: [38, 43, 48, 53, 57, 62]},
  {name: 'Drop C', short: 'Drop C', notes: [36, 43, 48, 53, 57, 62]},
  {name: 'Half-step down', short: 'E♭', notes: [39, 44, 49, 54, 58, 63]},
  {name: 'Drop B', short: 'Drop B', notes: [35, 42, 47, 52, 56, 61]},
  {name: 'Drop A', short: 'Drop A', notes: [33, 40, 45, 50, 54, 59]},
  {name: 'B Standard', short: 'B Std', notes: [35, 40, 45, 50, 54, 59]},
];

export const CABINETS = [
  '4×12 V30 (modern metal)', '4×12 Greenback (classic)', '2×12 open back', '1×12 vintage combo', 'Studio / near-DI',
] as const;

/** Chord shapes per string low→high; -1 = muted string. */
export const CHORDS: Record<string, readonly number[]> = {
  E: [0, 2, 2, 1, 0, 0], Em: [0, 2, 2, 0, 0, 0], A: [-1, 0, 2, 2, 2, 0], Am: [-1, 0, 2, 2, 1, 0],
  D: [-1, -1, 0, 2, 3, 2], Dm: [-1, -1, 0, 2, 3, 1], G: [3, 2, 0, 0, 0, 3], C: [-1, 3, 2, 0, 1, 0],
  F: [1, 3, 3, 2, 1, 1], Bm: [-1, 2, 4, 4, 3, 2], E5: [0, 2, 2, -1, -1, -1], A5: [-1, 0, 2, 2, -1, -1],
  D5: [-1, -1, 0, 2, 3, -1], G5: [3, 5, 5, -1, -1, -1],
};

/** Chord stamps for the piano roll (semitone offsets above the drawn note). */
export const CHORD_STAMPS: Record<string, readonly number[]> = {
  'Single': [0], 'Power 5': [0, 7], 'Power 5+8': [0, 7, 12], 'Major': [0, 4, 7], 'Minor': [0, 3, 7],
  'Maj7': [0, 4, 7, 11], 'Min7': [0, 3, 7, 10], 'Sus2': [0, 2, 7], 'Sus4': [0, 5, 7], 'Dim': [0, 3, 6],
};

export const SNAPS: ReadonlyArray<{label: string; value: number}> = [
  {label: '1/4', value: 1}, {label: '1/8', value: 0.5}, {label: '1/16', value: 0.25}, {label: '1/32', value: 0.125},
  {label: '1/8 triplet', value: 1 / 3}, {label: '1/16 triplet', value: 1 / 6},
];
export const BAR_OPTIONS = [1, 2, 4, 8, 16] as const;

/** Live chord for a fretted note: with Power chords on, adds the 5th and the octave on the next strings. */
export function chordFor(str: number, fret: number, tuning: readonly number[], power: boolean): Array<[number, number]> {
  const r: Array<[number, number]> = [[str, fret]];
  if (power) {
    const m = tuning[str] + fret;
    ([[str + 1, m + 7], [str + 2, m + 12]] as Array<[number, number]>).forEach(([j, t]) => {
      if (j < 6) {
        const fr = t - tuning[j];
        if (fr >= 0 && fr <= MAX_FRET) r.push([j, fr]);
      }
    });
  }
  return r;
}

// ---------------------------------------------------------------------------------------------------
// Presets. Applying one starts from PRESET_BASE (exactly like the original app), so a preset only needs to
// list what differs. Parameters not in PRESET_BASE (whammy, wah position, slide time...) are left alone.
// ---------------------------------------------------------------------------------------------------
export const PRESET_BASE: Partial<Record<ParamId, number>> = {
  gain: 80, bass: 0, mid: 0, treb: 0, pres: 4, master: 55, gate: 25, pick: 65, sus: 7, room: 10, dly: 0, dtime: 380,
  chor: 0, tight: 50, depth: 30, sag: 30, mfreq: 650, stiff: 30, vrate: 5.5, vdep: 35, tun: 0, cabT: 0, boost: 1,
  cab: 1, bridge: 1, vib: 0, mute: 0, power: 0, ring: 0, harm: 0, trem: 0, wahOn: 0,
};

export interface Preset { name: string; tag: string; values: Partial<Record<ParamId, number>> }
export const PRESETS: readonly Preset[] = [
  {name: 'Metal', tag: 'Modern high-gain', values: {gain: 80, bass: 3, mid: -4, treb: 4, pres: 5, pick: 70, sus: 7, room: 10, gate: 30}},
  {name: 'Lead', tag: 'Singing sustain', values: {gain: 90, mid: 2, treb: 2, pres: 3, pick: 55, sus: 11, room: 25, gate: 25, dly: 25, vib: 1}},
  {name: 'Crunch', tag: 'Classic rock edge', values: {gain: 45, bass: 1, mid: 1, treb: 3, pres: 4, boost: 0, pick: 60, sus: 6, room: 12, gate: 5, cabT: 1, sag: 55}},
  {name: 'Clean', tag: 'Glassy and open', values: {gain: 8, treb: 2, pres: 2, boost: 0, pick: 50, sus: 6, room: 20, gate: 0, dly: 10, cabT: 4, tight: 10, sag: 5}},
  {name: 'Slipknot', tag: 'Drop B aggression', values: {tun: 5, gain: 88, bass: 5, mid: -7, treb: 5, pres: 6, mfreq: 500, gate: 45, tight: 80, depth: 50, sag: 20, pick: 85, sus: 6, room: 8}},
  {name: 'Djent', tag: 'Tight and percussive', values: {tun: 6, gain: 75, bass: 2, mid: 1, treb: 5, pres: 7, mfreq: 900, gate: 60, tight: 95, depth: 20, sag: 10, pick: 90, sus: 3, room: 5, stiff: 45}},
  {name: 'Thrash', tag: 'Scooped razor', values: {gain: 65, bass: 4, mid: -8, treb: 5, pres: 6, mfreq: 600, gate: 30, tight: 70, depth: 40, sag: 45, pick: 75, sus: 6, room: 10}},
  {name: 'Death Metal', tag: 'Drop C buzzsaw', values: {tun: 3, gain: 95, bass: 7, mid: -2, treb: 7, pres: 8, mfreq: 800, gate: 55, tight: 60, depth: 60, sag: 15, pick: 60, sus: 5, room: 6}},
  {name: 'Black Metal', tag: 'Icy tremolo wash', values: {gain: 85, bass: -5, mid: 3, treb: 8, pres: 9, mfreq: 1800, gate: 35, tight: 70, depth: 5, sag: 10, pick: 90, sus: 9, room: 45, dly: 12, trem: 1, cabT: 2}},
  {name: 'Doom', tag: 'Slow and enormous', values: {tun: 3, gain: 70, bass: 8, mid: 2, treb: -2, pres: 2, mfreq: 400, gate: 10, tight: 15, depth: 80, sag: 70, pick: 35, sus: 12, room: 25, cabT: 1, ring: 1}},
  {name: 'Nu Metal', tag: 'Down-tuned groove', values: {tun: 6, gain: 70, bass: 5, mid: -3, treb: 4, pres: 5, mfreq: 700, gate: 35, tight: 60, depth: 60, sag: 40, pick: 80, sus: 5, room: 8}},
  {name: 'J-Metal', tag: 'Bright and precise', values: {tun: 1, gain: 78, bass: 1, mid: 1, treb: 6, pres: 7, mfreq: 1100, gate: 35, tight: 75, depth: 25, sag: 20, pick: 85, sus: 7, room: 18, chor: 15, dly: 8}},
  {name: 'Visual Kei', tag: 'Lush lead', values: {gain: 92, bass: 1, mid: 4, treb: 4, pres: 5, mfreq: 1200, gate: 25, tight: 55, depth: 25, sag: 35, pick: 60, sus: 11, room: 30, dly: 22, chor: 20, vib: 1, cabT: 1}},
  {name: 'J-Rock Clean', tag: 'Chorused shimmer', values: {gain: 6, bass: -1, treb: 3, pres: 3, mfreq: 900, gate: 0, tight: 15, depth: 10, sag: 5, pick: 55, sus: 6, room: 25, chor: 70, dly: 12, boost: 0, cabT: 4}},
];

export function presetValues(p: Preset): Partial<Record<ParamId, number>> {
  return {...PRESET_BASE, ...p.values};
}
