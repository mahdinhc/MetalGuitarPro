import React from 'react';
import {View} from 'react-native';
import Animated, {useAnimatedStyle} from 'react-native-reanimated';
import {meter} from '../native/meter';
import {useTheme} from '../theme';

/** Output peak meter (dB scale, -48..0). Driven by a shared value, so it never re-renders React. */
export function PeakMeter({width = 64, height = 6}: {width?: number; height?: number}) {
  const t = useTheme();
  const fill = useAnimatedStyle(() => {
    const db = 20 * Math.log10(Math.max(meter.peak.value, 1e-4));
    return {width: Math.max(0, Math.min(1, (db + 48) / 48)) * width, backgroundColor: db > -3 ? '#FF4D4D' : db > -12 ? '#FFB020' : '#3DDC84'};
  });
  return (
    <View accessibilityLabel="Output level" style={{width, height, borderRadius: height / 2, backgroundColor: t.surface3, overflow: 'hidden'}}>
      <Animated.View style={[{height}, fill]} />
    </View>
  );
}
