import React, {useEffect, useMemo, useState} from 'react';
import {LayoutChangeEvent, View} from 'react-native';
import {Canvas, Picture} from '@shopify/react-native-skia';
import Animated, {useAnimatedStyle, useSharedValue} from 'react-native-reanimated';
import {ROLL_G, ROLL_HH} from '../core/rollController';
import {ctrl, useRoll} from '../store/roll';
import {meter} from '../native/meter';
import {useTheme} from '../theme';
import {drawRoll, makeRollFonts} from './rollDraw';

/** Piano roll canvas. Notes/grid are a Skia picture redrawn on edits; the playhead is a native-driven overlay. */
export function RollView() {
  const t = useTheme();
  const rev = useRoll(s => s.rev);
  const [size, setSize] = useState({w: 0, h: 0});
  const fonts = useMemo(() => makeRollFonts(), []);
  const zx = useSharedValue(ctrl.zx), ox = useSharedValue(ctrl.ox);

  const onLayout = (e: LayoutChangeEvent) => {
    const {width, height} = e.nativeEvent.layout;
    ctrl.setSize(width, height); setSize({w: width, h: height}); useRoll.getState().bump();
  };
  const picture = useMemo(() => (size.w > 0 ? drawRoll(ctrl, size.w, size.h, t, fonts) : null), [rev, size, t, fonts]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { zx.value = ctrl.zx; ox.value = ctrl.ox; });

  const head = useAnimatedStyle(() => {
    const x = ROLL_G + meter.beat.value * zx.value - ox.value;
    return {transform: [{translateX: x - 1}], opacity: x < ROLL_G - 1 || x > size.w ? 0 : 1};
  });

  const touches = (e: {nativeEvent: {changedTouches: Array<{identifier: number; locationX: number; locationY: number}>}}) => e.nativeEvent.changedTouches;
  return (
    <View
      style={{flex: 1, backgroundColor: t.rollBg}} onLayout={onLayout} pointerEvents="box-only"
      accessible accessibilityLabel="Piano roll. Draw notes with a tap, drag to move or resize, pinch to zoom."
      onTouchStart={e => touches(e).forEach(p => ctrl.down(p.identifier, p.locationX, p.locationY))}
      onTouchMove={e => touches(e).forEach(p => ctrl.move(p.identifier, p.locationX, p.locationY))}
      onTouchEnd={e => touches(e).forEach(p => ctrl.up(p.identifier))}
      onTouchCancel={e => touches(e).forEach(p => ctrl.up(p.identifier))}>
      <Canvas style={{flex: 1}} pointerEvents="none">{picture ? <Picture picture={picture} /> : null}</Canvas>
      <Animated.View pointerEvents="none" style={[{position: 'absolute', left: 0, top: ROLL_HH - 6, bottom: 0, width: 2, backgroundColor: t.text}, head]} />
    </View>
  );
}
