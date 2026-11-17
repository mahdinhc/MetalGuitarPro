import {create} from 'zustand';
import {Engine, toEngineArray} from '../native/engine';
import {setBeat} from '../native/meter';
import {RollController, Tool} from '../core/rollController';
import {buildSequence, DEFAULT_RIFF, RollData, RollModel} from '../core/rollModel';
import {CHORD_STAMPS, TUNINGS} from '../core/music';
import {useTone} from './tone';
import {useUI} from './ui';

export const model = new RollModel();
model.setRiff(DEFAULT_RIFF);

let persistHook: (() => void) | null = null;
export const onRiffDirty = (fn: () => void) => { persistHook = fn; };

interface RollState {
  rev: number;            // bumped on every change that needs a redraw
  playing: boolean;
  metro: boolean;
  loop: boolean;
  tool: Tool;
  multi: boolean;
  chordName: string;
  exporting: boolean;
  bump(): void;
  setPlaying(p: boolean): void;
}

export const useRoll = create<RollState>((set) => ({
  rev: 0, playing: false, metro: false, loop: true, tool: 'draw', multi: false, chordName: 'Single', exporting: false,
  bump: () => set(s => ({rev: s.rev + 1})),
  setPlaying: playing => set(s => (s.playing === playing ? s : {playing})),
}));

// ---- engine sync -----------------------------------------------------------------------------------------------------------
let syncTimer: ReturnType<typeof setTimeout> | null = null;
export function syncSequence() {
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  Engine.setSequence(buildSequence(model), model.length, useRoll.getState().loop);
  Engine.setBpm(model.bpm);
}
/** Coalesces rapid edits (drags) into at most one engine update per 50 ms. */
function requestSync() { if (!syncTimer) syncTimer = setTimeout(syncSequence, 50); }

function audition(pitch: number) {
  const T = model.tuning;
  const s = [0, 1, 2, 3, 4, 5].filter(i => pitch - T[i] >= 0 && pitch - T[i] <= 22);
  if (!s.length) return;
  const i = s.find(k => pitch - T[k] <= 12) ?? s[0];
  Engine.noteOn(i, pitch - T[i], 0.85, 0, 0);
  Engine.noteOff(i, 0, 320);
}

export const ctrl = new RollController(model, {
  invalidate: () => useRoll.getState().bump(),
  audition,
  seek: beat => { setBeat(beat); if (useRoll.getState().playing) Engine.seek(beat); },
  changed: () => { useRoll.getState().bump(); requestSync(); persistHook?.(); },
});

// ---- transport / editing actions --------------------------------------------------------------------------------------------
export const rollActions = {
  play() {
    if (!useRoll.getState().loop && ctrl.pos >= model.length - 0.01) { ctrl.pos = 0; setBeat(0); }   // restart a finished one-shot
    syncSequence();
    Engine.setMetronome(useRoll.getState().metro);
    Engine.play(ctrl.pos);
    useRoll.getState().setPlaying(true);
  },
  pause() { Engine.stopPlay(); useRoll.getState().setPlaying(false); },
  toggle() { useRoll.getState().playing ? rollActions.pause() : rollActions.play(); },
  rewind() { ctrl.pos = 0; setBeat(0); if (useRoll.getState().playing) Engine.seek(0); ctrl.ox = 0; ctrl.clampView(); useRoll.getState().bump(); },
  setBpm(bpm: number) { model.bpm = Math.min(260, Math.max(40, Math.round(bpm))); Engine.setBpm(model.bpm); useRoll.getState().bump(); persistHook?.(); },
  setLoop(on: boolean) { useRoll.setState({loop: on}); syncSequence(); },
  setMetro(on: boolean) { useRoll.setState({metro: on}); Engine.setMetronome(on); },
  setTool(tool: Tool) { ctrl.tool = tool; useRoll.setState({tool}); },
  setMulti(on: boolean) { ctrl.multi = on; useRoll.setState({multi: on}); },
  setChord(name: string) { ctrl.chord = CHORD_STAMPS[name]; useRoll.setState({chordName: name}); },
  setSnap(v: number) { model.snap = v; useRoll.getState().bump(); persistHook?.(); },
  setBars(b: number) { model.setBars(b); ctrl.clampView(); rollActions.changed(); },
  undo() { if (model.undo()) rollActions.changed(); },
  redo() { if (model.redo()) rollActions.changed(); },
  clear() { model.clear(); rollActions.changed(); },
  selectAll() { model.sel = new Set(model.notes); useRoll.getState().bump(); },
  loadRiff(d: RollData) { model.setRiff(d); Engine.setBpm(model.bpm); ctrl.pos = 0; setBeat(0); ctrl.ox = 0; ctrl.centerOn(median()); rollActions.changed(); },
  changed() { useRoll.getState().bump(); requestSync(); persistHook?.(); },
  /** Escape hatch for inspector edits that already mutated the model. */
  edited() { rollActions.changed(); },
  async exportWav() {
    if (useRoll.getState().exporting) return;
    if (!model.notes.some(n => n._a != null && n._a >= 0)) { useUI.getState().showToast('Draw some notes first'); return; }
    useRoll.setState({exporting: true});
    try {
      const v = useTone.getState().values;
      const name = `MetalGuitarPro-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
      const r = await Engine.exportWav(toEngineArray(v), TUNINGS[v.tun].notes, buildSequence(model), model.length, model.bpm, 2, name);
      useUI.getState().showToast(`Saved ${r.seconds.toFixed(1)} s to ${r.path}`);
    } catch (e) {
      useUI.getState().showToast(`Export failed: ${(e as Error).message}`);
    } finally { useRoll.setState({exporting: false}); }
  },
  /** Called with every native meter event while the app is active. */
  onTransport(beat: number, playing: boolean) {
    const s = useRoll.getState();
    s.setPlaying(playing);
    if (playing) { ctrl.pos = beat; if (ctrl.follow()) s.bump(); }
  },
};

function median() { const p = model.notes.map(n => n.p).sort((a, b) => a - b); return p.length ? p[p.length >> 1] : 52; }

export function applyTuningToRoll(tun: number) {
  model.setTuning(TUNINGS[tun].notes);
  ctrl.clampView(); useRoll.getState().bump(); syncSequence();
}
