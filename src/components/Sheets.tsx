import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {Btn, Pill, SectionTitle, Segmented} from '../ui/Controls';
import {Icon} from '../ui/Icon';
import {Sheet} from '../ui/Sheet';
import {useTone} from '../store/tone';
import {useUI} from '../store/ui';
import {PRESETS, presetValues} from '../core/music';
import {Values} from '../store/tone';
import {radius, space, useTheme} from '../theme';
import {Engine} from '../native/engine';

export function PresetSheet() {
  const t = useTheme();
  const open = useUI(s => s.presetSheet);
  const preset = useTone(s => s.preset);
  const user = useTone(s => s.userPresets);
  const close = () => useUI.getState().patch({presetSheet: false});
  const card = (name: string, tag: string, on: boolean, apply: () => void, del?: () => void) => (
    <Pressable key={name} accessibilityRole="button" accessibilityState={{selected: on}} onPress={() => { apply(); close(); }}
      style={({pressed}) => ({width: '48.5%', minHeight: 72, padding: space.md, borderRadius: radius.md, backgroundColor: on ? t.accSoft : pressed ? t.surface3 : t.surface2, borderWidth: 1, borderColor: on ? t.acc : 'transparent', justifyContent: 'space-between'})}>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'}}>
        <Text style={{color: on ? t.acc : t.text, fontWeight: '900', fontSize: 15, flexShrink: 1}} numberOfLines={1}>{name}</Text>
        {del ? <Pressable accessibilityLabel={`Delete ${name}`} hitSlop={10} onPress={del}><Icon name="close-circle-outline" size={18} color={t.mute} /></Pressable> : null}
      </View>
      <Text style={{color: t.sub, fontSize: 12}} numberOfLines={1}>{tag}</Text>
    </Pressable>
  );
  return (
    <Sheet visible={open} title="Tones" onClose={close}>
      <SectionTitle>Factory</SectionTitle>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between'}}>
        {PRESETS.map(p => card(p.name, p.tag, preset === p.name, () => useTone.getState().applyPreset(p.name, presetValues(p) as Partial<Values>)))}
      </View>
      {user.length ? (
        <>
          <View style={{height: space.lg}} />
          <SectionTitle>Yours</SectionTitle>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between'}}>
            {user.map(u => card(u.name, 'Saved tone', preset === u.name, () => useTone.getState().applyPreset(u.name, u.values), () => useTone.getState().deleteUserPreset(u.name)))}
          </View>
        </>
      ) : null}
    </Sheet>
  );
}

export function SettingsSheet() {
  const t = useTheme();
  const open = useUI(s => s.settingsSheet);
  const ui = useUI();
  const row = (k: string, v: string) => (
    <View key={k} style={{flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6}}>
      <Text style={{color: t.sub, fontSize: 14}}>{k}</Text><Text style={{color: t.text, fontSize: 14, fontWeight: '700'}}>{v}</Text>
    </View>
  );
  const a = ui.audio;
  return (
    <Sheet visible={open} title="Settings" onClose={() => ui.patch({settingsSheet: false})}>
      <SectionTitle>Appearance</SectionTitle>
      <Segmented value={ui.themeMode} onChange={m => ui.patch({themeMode: m})} options={[{label: 'System', value: 'system'}, {label: 'Dark', value: 'dark'}, {label: 'Light', value: 'light'}]} />
      <View style={{height: space.lg}} />
      <SectionTitle>Playing</SectionTitle>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
        <Pill label="Touch haptics" active={ui.haptics} onPress={() => ui.patch({haptics: !ui.haptics})} />
        <Pill label="Keep screen on" active={ui.keepAwake} onPress={() => ui.patch({keepAwake: !ui.keepAwake})} />
      </View>
      <View style={{height: space.lg}} />
      <SectionTitle>Audio engine</SectionTitle>
      {a && a.ok ? (
        <>
          {row('Output', `${a.api}${a.exclusive ? ' · exclusive' : ''}`)}
          {row('Sample rate', `${a.sampleRate} Hz`)}
          {row('Burst / buffer', `${a.framesPerBurst} / ${a.bufferFrames} frames`)}
          {row('Output latency', ui.latencyMs > 0 ? `${ui.latencyMs.toFixed(1)} ms` : `${a.latencyMs.toFixed(1)} ms`)}
          {row('Underruns', `${ui.xruns}`)}
        </>
      ) : <Text style={{color: t.sub}}>{Engine.available ? 'Audio engine is not running.' : 'Native audio engine not available in this build.'}</Text>}
      <Text style={{color: t.mute, fontSize: 12, marginTop: space.sm}}>
        Tip: wired headphones or the phone speaker give the lowest latency. Bluetooth adds 100+ ms regardless of the app.
      </Text>
      <View style={{height: space.lg}} />
      <Btn label="Restart audio" icon="restart" onPress={() => { Engine.stop(); setTimeout(() => Engine.start().then(i => ui.patch({audio: i})).catch(() => {}), 150); }} />
    </Sheet>
  );
}
