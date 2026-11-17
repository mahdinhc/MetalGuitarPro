import {create} from 'zustand';
import type {AudioInfo} from '../native/engine';

export type Tab = 'play' | 'roll' | 'tone';
export type ThemeMode = 'system' | 'dark' | 'light';

interface UIState {
  tab: Tab;
  themeMode: ThemeMode;
  haptics: boolean;
  keepAwake: boolean;
  presetSheet: boolean;
  settingsSheet: boolean;
  toast: {id: number; text: string} | null;
  audio: AudioInfo | null;
  xruns: number;
  latencyMs: number;
  setTab(t: Tab): void;
  patch(p: Partial<Pick<UIState, 'themeMode' | 'haptics' | 'keepAwake' | 'presetSheet' | 'settingsSheet' | 'audio' | 'xruns' | 'latencyMs'>>): void;
  showToast(text: string): void;
}

let toastId = 0;
export const useUI = create<UIState>((set) => ({
  tab: 'play', themeMode: 'system', haptics: true, keepAwake: false,
  presetSheet: false, settingsSheet: false, toast: null, audio: null, xruns: 0, latencyMs: 0,
  setTab: tab => set({tab}),
  patch: p => set(p),
  showToast: text => { const id = ++toastId; set({toast: {id, text}}); setTimeout(() => { if (useUI.getState().toast?.id === id) set({toast: null}); }, 2600); },
}));
