import {useMemo} from 'react';
import {useColorScheme} from 'react-native';
import {useUI} from './store/ui';

export interface Theme {
  dark: boolean;
  bg: string; surface: string; surface2: string; surface3: string; line: string;
  text: string; sub: string; mute: string;
  acc: string; accSoft: string; onAcc: string; ok: string; warn: string; danger: string;
  board: string; boardEdge: string; fret: string; nut: string; stringPlain: string; stringWound: string; inlay: string; zone: string;
  rollBg: string; rollRowAlt: string; rollBlack: string; rollGrid: string; rollBeat: string;
}

export const darkTheme: Theme = {
  dark: true,
  bg: '#0A0A0C', surface: '#141418', surface2: '#1D1D23', surface3: '#272730', line: '#2D2D37',
  text: '#F3F3F6', sub: '#A0A0AD', mute: '#5E5E6B',
  acc: '#FF5A36', accSoft: 'rgba(255,90,54,0.16)', onAcc: '#FFFFFF', ok: '#3DDC84', warn: '#FFB020', danger: '#FF4D4D',
  board: '#17120E', boardEdge: '#0C0907', fret: '#6F685C', nut: '#D8D1C2', stringPlain: '#D2CEC5', stringWound: '#B9975C',
  inlay: 'rgba(255,255,255,0.13)', zone: '#101014',
  rollBg: '#0F0F13', rollRowAlt: '#14141A', rollBlack: '#0B0B0E', rollGrid: '#23232B', rollBeat: '#34343F',
};

export const lightTheme: Theme = {
  dark: false,
  bg: '#F3F1ED', surface: '#FFFFFF', surface2: '#F0EDE7', surface3: '#E4E0D8', line: '#D9D4CA',
  text: '#1A1815', sub: '#69635A', mute: '#A29B8F',
  acc: '#E5421D', accSoft: 'rgba(229,66,29,0.12)', onAcc: '#FFFFFF', ok: '#1E9E55', warn: '#C77C00', danger: '#D63030',
  board: '#3A2A1F', boardEdge: '#25190F', fret: '#9C9484', nut: '#EDE6D6', stringPlain: '#E6E2D8', stringWound: '#CDA866',
  inlay: 'rgba(255,255,255,0.22)', zone: '#2B2018',
  rollBg: '#FAF8F5', rollRowAlt: '#F2EFEA', rollBlack: '#EAE6DF', rollGrid: '#E0DBD2', rollBeat: '#C9C3B7',
};

export function useTheme(): Theme {
  const mode = useUI(s => s.themeMode);
  const sys = useColorScheme();
  return mode === 'system' ? (sys === 'light' ? lightTheme : darkTheme) : mode === 'light' ? lightTheme : darkTheme;
}

/** Memoised style factory: `const s = useStyles(t => StyleSheet.create({...}))`. */
export function useStyles<T>(factory: (t: Theme) => T): T {
  const t = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(t), [t]);
}

export const space = {xs: 4, sm: 8, md: 12, lg: 16, xl: 24};
export const radius = {sm: 8, md: 12, lg: 18, pill: 999};
