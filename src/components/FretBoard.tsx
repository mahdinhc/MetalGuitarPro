import React, {memo, useEffect, useMemo} from 'react';
import {GestureResponderEvent, LayoutChangeEvent, Text, View} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withSequence, withTiming} from 'react-native-reanimated';
import {play, onVibe, usePlay} from '../store/play';
import {useTone} from '../store/tone';
import {NOTE_NAMES, TUNINGS} from '../core/music';
import {Theme, useTheme} from '../theme';

const THICK = [3.4, 2.8, 2.3, 1.7, 1.3, 1];

function StringLine({s, t, left = 0, right = 0}: {s: number; t: Theme; left?: number; right?: number}) {
  const off = useSharedValue(0);
  useEffect(() => onVibe(s, () => {
    const steps = Array.from({length: 12}, (_, i) => withTiming((i % 2 ? -1 : 1) * 3.2 * (1 - i / 12), {duration: 26}));
    off.value = withSequence(...steps, withTiming(0, {duration: 26}));
  }), [s, off]);
  const st = useAnimatedStyle(() => ({transform: [{translateY: off.value}]}));
  const wound = s < 3;
  return (
    <Animated.View pointerEvents="none" style={[{position: 'absolute', left, right, top: `${(s + 0.5) / 6 * 100}%`, height: THICK[s], marginTop: -THICK[s] / 2, borderRadius: 2,
      backgroundColor: wound ? t.stringWound : t.stringPlain, opacity: 0.95}, st]} />
  );
}

const touches = (e: GestureResponderEvent) => e.nativeEvent.changedTouches;

// ---------------------------------------------------------------------------------------------------------------------
export const Neck = memo(function Neck({onSize}: {onSize?: (w: number, h: number) => void}) {
  const t = useTheme();
  usePlay(s => s.rev);   // repaint whenever the controller changes
  const [size, setSize] = React.useState({w: 0, h: 0});
  const win = play.win, w0 = play.w0, rh = size.h / 6, cw = size.w / win;
  const {on, sh} = play.paintState();
  const rect = useMemo(() => ({left: 0, top: 0, width: size.w, height: size.h}), [size]);

  const layout = (e: LayoutChangeEvent) => {
    const {width, height} = e.nativeEvent.layout;
    setSize({w: width, h: height}); onSize?.(width, height);
  };

  const dots: React.ReactNode[] = [];
  for (let c = 0; c < win; c++) {
    const f = w0 + c, ys = f > 0 && f % 12 === 0 ? [1 / 3, 2 / 3] : [3, 5, 7, 9, 15, 17, 19, 21].includes(f) ? [0.5] : [];
    ys.forEach((y, i) => dots.push(<View key={`d${c}-${i}`} pointerEvents="none" style={{position: 'absolute', left: (c + 0.5) * cw - 6, top: y * size.h - 6, width: 12, height: 12, borderRadius: 6, backgroundColor: t.inlay}} />));
  }
  const marks: React.ReactNode[] = [];
  on.forEach(k => {
    const [s, fr] = k.split(':').map(Number), c = fr - w0;
    if (c < 0 || c >= win) return;
    const d = Math.min(rh, cw) * 0.62;
    marks.push(<View key={`o${k}`} pointerEvents="none" style={{position: 'absolute', left: (c + 0.5) * cw - d / 2, top: (s + 0.5) * rh - d / 2, width: d, height: d, borderRadius: d / 2, backgroundColor: t.acc, shadowColor: t.acc, elevation: 8}} />);
  });
  sh.forEach(k => {
    if (on.has(k)) return;
    const [s, fr] = k.split(':').map(Number), c = fr - w0;
    if (c < 0 || c >= win) return;
    const d = Math.min(rh, cw) * 0.5;
    marks.push(<View key={`h${k}`} pointerEvents="none" style={{position: 'absolute', left: (c + 0.5) * cw - d / 2, top: (s + 0.5) * rh - d / 2, width: d, height: d, borderRadius: d / 2, borderWidth: 2, borderColor: t.acc, opacity: 0.75}} />);
  });

  return (
    <View
      accessible accessibilityLabel="Fretboard. Touch a fret to fret a note; drag along a string to slide." pointerEvents="box-only" onLayout={layout}
      style={{flex: 1, backgroundColor: t.board, borderRadius: 10, overflow: 'hidden'}}
      onTouchStart={e => touches(e).forEach(p => play.neckDown(p.identifier, p.locationX, p.locationY, rect))}
      onTouchMove={e => touches(e).forEach(p => play.neckMove(p.identifier, p.locationX, p.locationY, rect))}
      onTouchEnd={e => touches(e).forEach(p => play.neckUp(p.identifier))}
      onTouchCancel={e => touches(e).forEach(p => play.neckUp(p.identifier))}>
      {Array.from({length: win - 1}, (_, i) => <View key={`w${i}`} pointerEvents="none" style={{position: 'absolute', left: (i + 1) * cw - 1, top: 0, bottom: 0, width: 2, backgroundColor: t.fret}} />)}
      {w0 === 0 ? <View pointerEvents="none" style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, backgroundColor: t.nut}} /> : null}
      {play.capo > 0 && play.capo >= w0 && play.capo < w0 + win
        ? <View pointerEvents="none" style={{position: 'absolute', left: (play.capo - w0) * cw, width: cw, top: 0, bottom: 0, backgroundColor: t.accSoft, borderLeftWidth: 3, borderLeftColor: t.acc}} /> : null}
      {dots}
      {[0, 1, 2, 3, 4, 5].map(s => <StringLine key={s} s={s} t={t} />)}
      {marks}
    </View>
  );
});

export const StrumZone = memo(function StrumZone({width}: {width: number}) {
  const t = useTheme();
  const [h, setH] = React.useState(0);
  const rect = useMemo(() => ({left: 0, top: 0, width, height: h}), [width, h]);
  return (
    <View
      accessible accessibilityLabel="Strum zone. Swipe across the strings to strum; the far edge palm-mutes." pointerEvents="box-only"
      onLayout={e => setH(e.nativeEvent.layout.height)}
      style={{width, backgroundColor: t.zone, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: t.line}}
      onTouchStart={e => touches(e).forEach(p => play.zoneDown(p.identifier, p.locationX, p.locationY, e.nativeEvent.timestamp, rect))}
      onTouchMove={e => touches(e).forEach(p => play.zoneMove(p.identifier, p.locationX, p.locationY, e.nativeEvent.timestamp))}
      onTouchEnd={e => touches(e).forEach(p => play.zoneUp(p.identifier))}
      onTouchCancel={e => touches(e).forEach(p => play.zoneUp(p.identifier))}>
      <View pointerEvents="none" style={{position: 'absolute', right: 0, top: 0, bottom: 0, width: '20%', backgroundColor: t.accSoft}} />
      {[0, 1, 2, 3, 4, 5].map(s => <StringLine key={s} s={s} t={t} />)}
      {h > 0 ? (
        <Text pointerEvents="none" numberOfLines={1}
          style={{position: 'absolute', width: h, height: width * 0.2, left: width * 0.9 - h / 2, top: h / 2 - width * 0.1, color: t.acc, fontSize: 9, fontWeight: '900', letterSpacing: 2.5, textAlign: 'center', textAlignVertical: 'center', transform: [{rotate: '90deg'}], opacity: 0.9}}>
          PALM MUTE
        </Text>
      ) : null}
    </View>
  );
});

/** Fret numbers above the neck and string names beside it. */
export const FretNumbers = memo(function FretNumbers({width}: {width: number}) {
  const t = useTheme();
  usePlay(s => s.rev);
  const win = play.win;
  return (
    <View style={{flexDirection: 'row', width, height: 20}} pointerEvents="none">
      {Array.from({length: win}, (_, c) => (
        <Text key={c} style={{flex: 1, textAlign: 'center', color: play.w0 + c === play.capo && play.capo > 0 ? t.acc : t.mute, fontSize: 11, fontWeight: '800'}}>{play.w0 + c}</Text>
      ))}
    </View>
  );
});

export const StringLabels = memo(function StringLabels() {
  const t = useTheme();
  const tun = useTone(s => s.values.tun);
  const T = TUNINGS[tun].notes;
  return (
    <View style={{width: 26}} pointerEvents="none">
      {T.map((m, i) => (
        <View key={i} style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
          <Text style={{fontSize: 12, fontWeight: '900', color: i < 3 ? t.stringWound : t.sub}}>{NOTE_NAMES[m % 12]}</Text>
        </View>
      ))}
    </View>
  );
});
