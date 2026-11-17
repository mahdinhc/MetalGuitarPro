import {create} from 'zustand';
import {Engine} from '../native/engine';
import {FretboardController} from '../core/fretboard';
import {TUNINGS} from '../core/music';
import {haptic} from '../ui/haptics';
import {useTone} from './tone';

const vibes: Array<Set<() => void>> = [0, 1, 2, 3, 4, 5].map(() => new Set());
/** Lets string-line components subscribe to "string s was just plucked" for the vibration animation. */
export function onVibe(s: number, fn: () => void) { vibes[s].add(fn); return () => { vibes[s].delete(fn); }; }

export const usePlay = create<{rev: number}>(() => ({rev: 0}));
const repaint = () => usePlay.setState(s => ({rev: s.rev + 1}));

/** The single playing-surface controller: touch handling lives in core/fretboard.ts, audio goes straight to the native engine. */
export const play = new FretboardController(
  {
    noteOn: (s, f, v, fl, d) => Engine.noteOn(s, f, v, fl, d),
    noteOff: (s, fl, d) => Engine.noteOff(s, fl, d),
    move: (s, f, fl) => Engine.move(s, f, fl),
  },
  () => {
    const v = useTone.getState().values;
    return {power: v.power > 0.5, slide: v.mode < 0.5, tuning: TUNINGS[v.tun].notes};
  },
  {paint: repaint, vibe: s => vibes[s].forEach(fn => fn()), buzz: () => haptic(6)},
);
