import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {ROLL_G, ROLL_HH} from '../core/rollController';
import {ctrl, model, rollActions, useRoll} from '../store/roll';
import {useTheme} from '../theme';
import {haptic} from '../ui/haptics';

const D = 52, GAP = 6, MARGIN = 8;
const WIDTH = 4 * D + 3 * GAP;

/**
 * Floating controls for the selected note(s): Copy, Delete, Snap, More...
 * It is drawn ON TOP of the piano roll (absolute, outside the roll's touch handler), so selecting a note never changes the
 * roll's size. It follows the selection while the view scrolls/zooms and hides while a note is being dragged.
 */
export function NoteMenu({onMore}: {onMore: () => void}) {
  const t = useTheme();
  useRoll(s => s.rev);                         // re-position on every redraw request (scroll, zoom, drag, edit)
  const tool = useRoll(s => s.tool);
  const sel = model.selection();
  if (!sel.length || ctrl.w <= 0 || tool === 'erase' || tool === 'hand') return null;
  const a = ctrl.act;
  if (a && ((a.t === 'move' || a.t === 'size') ? a.mv : a.t === 'new' || a.t === 'lasso' || a.t === 'pan')) return null;

  const x0 = Math.min(...sel.map(n => ctrl.X(n.t))), x1 = Math.max(...sel.map(n => ctrl.X(n.t + n.d)));
  const yTop = Math.min(...sel.map(n => ctrl.Y(n.p))), yBot = Math.max(...sel.map(n => ctrl.Y(n.p) + ctrl.rh));
  if (x1 < ROLL_G || x0 > ctrl.w || yBot < ROLL_HH || yTop > ctrl.h) return null;   // selection scrolled out of view

  let left = (Math.max(x0, ROLL_G) + Math.min(x1, ctrl.w)) / 2 - WIDTH / 2;
  left = Math.max(ROLL_G + 2, Math.min(ctrl.w - WIDTH - 2, left));
  let top = yTop - D - MARGIN;                                   // above the note ...
  if (top < ROLL_HH + 2) top = yBot + MARGIN;                    // ... or below it when there is no room
  top = Math.max(ROLL_HH + 2, Math.min(ctrl.h - D - 2, top));

  const bubble = (label: string, onPress: () => void) => (
    <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={() => { haptic(); onPress(); }}
      style={({pressed}) => ({width: D, height: D, borderRadius: D / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: t.dark ? '#CDCDD9' : '#2A2A33', opacity: pressed ? 0.7 : 0.95, elevation: 6})}>
      <Text style={{color: t.dark ? '#25252D' : '#F3F3F6', fontSize: 12, fontWeight: '800'}} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
  return (
    <View pointerEvents="box-none" style={{position: 'absolute', left, top, width: WIDTH, flexDirection: 'row', gap: GAP}}>
      {bubble('Copy', () => { model.duplicateSelection(); rollActions.edited(); })}
      {bubble('Delete', () => { model.deleteSelection(); rollActions.edited(); })}
      {bubble('Snap', () => { if (model.quantize()) rollActions.edited(); })}
      {bubble('More…', onMore)}
    </View>
  );
}
