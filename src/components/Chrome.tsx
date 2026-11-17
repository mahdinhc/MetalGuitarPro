import React from 'react';
import {Pressable, Text, View, useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Animated, {useAnimatedStyle} from 'react-native-reanimated';
import {Icon} from '../ui/Icon';
import {PeakMeter} from '../ui/Meter';
import {Tab, useUI} from '../store/ui';
import {useTone} from '../store/tone';
import {meter} from '../native/meter';
import {radius, space, useTheme} from '../theme';
import {haptic} from '../ui/haptics';

export function TopBar() {
  const t = useTheme();
  const preset = useTone(s => s.preset), dirty = useTone(s => s.dirty);
  const {width} = useWindowDimensions();
  const step = useTone(s => s.stepPreset);
  const cpu = useAnimatedStyle(() => ({width: Math.min(1, meter.cpu.value) * 28, backgroundColor: meter.cpu.value > 0.6 ? '#FF4D4D' : t.sub}));
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, height: 52, gap: space.sm}}>
      <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: t.acc}} />
      {width > 520 ? <Text style={{color: t.text, fontWeight: '900', letterSpacing: 1.6, fontSize: 13}}>METAL GUITAR PRO</Text> : null}
      <View style={{flex: 1}} />
      <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: t.surface2, borderRadius: radius.pill, height: 40}}>
        <Pressable accessibilityLabel="Previous tone" hitSlop={6} onPress={() => { haptic(); step(-1); }} style={{width: 36, alignItems: 'center'}}><Icon name="chevron-left" size={22} color={t.sub} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Tone: ${preset}. Open tone list`} onPress={() => { haptic(); useUI.getState().patch({presetSheet: true}); }} style={{minWidth: 96, maxWidth: 160, alignItems: 'center'}}>
          <Text style={{color: t.text, fontWeight: '800', fontSize: 14}} numberOfLines={1}>{preset}{dirty ? ' •' : ''}</Text>
        </Pressable>
        <Pressable accessibilityLabel="Next tone" hitSlop={6} onPress={() => { haptic(); step(1); }} style={{width: 36, alignItems: 'center'}}><Icon name="chevron-right" size={22} color={t.sub} /></Pressable>
      </View>
      <View style={{gap: 5, alignItems: 'flex-end'}}>
        <PeakMeter width={52} height={5} />
        <View style={{width: 28, height: 3, borderRadius: 2, backgroundColor: t.surface3}}><Animated.View style={[{height: 3, borderRadius: 2}, cpu]} /></View>
      </View>
      <Pressable accessibilityLabel="Settings" onPress={() => { haptic(); useUI.getState().patch({settingsSheet: true}); }} style={{width: 44, height: 44, alignItems: 'center', justifyContent: 'center'}}>
        <Icon name="cog-outline" size={24} color={t.sub} />
      </Pressable>
    </View>
  );
}

const TABS: Array<{id: Tab; label: string; icon: string}> = [
  {id: 'play', label: 'Play', icon: 'guitar-electric'},
  {id: 'roll', label: 'Riff', icon: 'piano'},
  {id: 'tone', label: 'Tone', icon: 'tune-variant'},
];

export function NavBar({vertical}: {vertical?: boolean}) {
  const t = useTheme();
  const tab = useUI(s => s.tab);
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="tablist" style={{flexDirection: vertical ? 'column' : 'row', backgroundColor: t.surface, borderTopWidth: vertical ? 0 : 1, borderRightWidth: vertical ? 1 : 0, borderColor: t.line,
      paddingBottom: vertical ? 0 : insets.bottom, justifyContent: vertical ? 'center' : 'space-around', width: vertical ? 76 : undefined}}>
      {TABS.map(x => {
        const on = tab === x.id;
        return (
          <Pressable key={x.id} accessibilityRole="tab" accessibilityState={{selected: on}} onPress={() => { haptic(); useUI.getState().setTab(x.id); }}
            style={{flex: vertical ? undefined : 1, height: vertical ? 78 : 62, alignItems: 'center', justifyContent: 'center', gap: 2}}>
            <View style={{paddingHorizontal: 18, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: on ? t.accSoft : 'transparent'}}>
              <Icon name={x.icon} size={24} color={on ? t.acc : t.sub} />
            </View>
            <Text style={{color: on ? t.acc : t.sub, fontSize: 11, fontWeight: '800'}}>{x.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toast() {
  const t = useTheme();
  const toast = useUI(s => s.toast);
  if (!toast) return null;
  return (
    <View pointerEvents="none" style={{position: 'absolute', left: 16, right: 16, bottom: 84, alignItems: 'center'}}>
      <View style={{backgroundColor: t.text, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10, maxWidth: 520}}>
        <Text style={{color: t.bg, fontWeight: '700'}}>{toast.text}</Text>
      </View>
    </View>
  );
}
