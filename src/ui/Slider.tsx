import React, {useCallback, useRef, useState} from 'react';
import {LayoutChangeEvent, StyleSheet, Text, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {runOnJS} from 'react-native-reanimated';
import {useTheme} from '../theme';

interface Props {
  label?: string; value: number; min: number; max: number; step?: number; def?: number; unit?: string;
  onChange: (v: number) => void; onStart?: () => void; onEnd?: () => void;
  /** fill from the middle of the track (for -x..+x parameters) */ bipolar?: boolean;
  format?: (v: number) => string; compact?: boolean;
}

/** Horizontal slider: drag or tap to set, double-tap to reset to the default. Plays nicely inside ScrollViews. */
export function Slider({label, value, min, max, step = 1, def, unit, onChange, onStart, onEnd, bipolar, format, compact}: Props) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const wRef = useRef(0);
  const onLayout = (e: LayoutChangeEvent) => { wRef.current = e.nativeEvent.layout.width; setW(e.nativeEvent.layout.width); };
  const THUMB = 24;

  const setFromX = useCallback((x: number) => {
    const usable = Math.max(1, wRef.current - THUMB);
    const f = Math.min(1, Math.max(0, (x - THUMB / 2) / usable));
    let v = min + f * (max - min);
    v = Math.round(v / step) * step;
    onChange(Math.min(max, Math.max(min, +v.toFixed(4))));
  }, [min, max, step, onChange]);
  const reset = useCallback(() => { if (def != null) onChange(def); }, [def, onChange]);
  const start = useCallback(() => onStart?.(), [onStart]);
  const end = useCallback(() => onEnd?.(), [onEnd]);

  const pan = Gesture.Pan().activeOffsetX([-5, 5]).failOffsetY([-16, 16])
    .onStart(e => { runOnJS(start)(); runOnJS(setFromX)(e.x); })   // only once the drag is recognised, so scrolling over a slider never moves it
    .onUpdate(e => { runOnJS(setFromX)(e.x); })
    .onFinalize(() => { runOnJS(end)(); });
  const tap = Gesture.Tap().maxDistance(10).maxDuration(300)
    .onEnd(e => { runOnJS(start)(); runOnJS(setFromX)(e.x); runOnJS(end)(); });
  const dbl = Gesture.Tap().numberOfTaps(2).maxDistance(12).onEnd((_e, ok) => { if (ok) runOnJS(reset)(); });
  const gesture = Gesture.Simultaneous(Gesture.Race(pan, tap), dbl);

  const f = (value - min) / (max - min || 1);
  const x = THUMB / 2 + f * Math.max(0, w - THUMB);
  const zero = THUMB / 2 + ((0 - min) / (max - min || 1)) * Math.max(0, w - THUMB);
  const from = bipolar ? Math.min(x, zero) : THUMB / 2, to = bipolar ? Math.max(x, zero) : x;
  const txt = format ? format(value) : `${+value.toFixed(2)}${unit ? ' ' + unit : ''}`;
  return (
    <View style={{paddingVertical: compact ? 2 : 6}} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{min, max, now: value, text: txt}}
      accessibilityActions={[{name: 'increment'}, {name: 'decrement'}]}
      onAccessibilityAction={e => onChange(Math.min(max, Math.max(min, value + (e.nativeEvent.actionName === 'increment' ? step : -step) * (max - min > 40 ? 5 : 1))))}>
      {label ? (
        <View style={styles.row}>
          <Text style={[styles.label, {color: t.sub}]} numberOfLines={1}>{label}</Text>
          <Text style={[styles.value, {color: t.text}]}>{txt}</Text>
        </View>
      ) : null}
      <GestureDetector gesture={gesture}>
        <View style={styles.hit} onLayout={onLayout} collapsable={false}>
          <View style={[styles.track, {backgroundColor: t.surface3}]} />
          <View style={[styles.fill, {left: from, width: Math.max(0, to - from), backgroundColor: t.acc}]} />
          {bipolar ? <View style={[styles.mid, {left: zero - 1, backgroundColor: t.mute}]} /> : null}
          <View style={[styles.thumb, {left: x - THUMB / 2, backgroundColor: t.text, borderColor: t.acc}]} />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2},
  label: {fontSize: 13, fontWeight: '700', flexShrink: 1},
  value: {fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums']},
  hit: {height: 40, justifyContent: 'center'},
  track: {position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 3},
  fill: {position: 'absolute', height: 6, borderRadius: 3},
  mid: {position: 'absolute', width: 2, height: 14, borderRadius: 1},
  thumb: {position: 'absolute', width: 24, height: 24, borderRadius: 12, borderWidth: 3},
});
