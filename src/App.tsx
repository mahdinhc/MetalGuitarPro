import React, {useEffect, useState} from 'react';
import {StatusBar, Text, View, useWindowDimensions} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {Engine} from './native/engine';
import {pushMeter} from './native/meter';
import {bootstrapState} from './store/persist';
import {model, rollActions} from './store/roll';
import {useUI} from './store/ui';
import {useTheme} from './theme';
import {NavBar, TopBar, Toast} from './components/Chrome';
import {PresetSheet, SettingsSheet} from './components/Sheets';
import {PlayScreen} from './screens/PlayScreen';
import {RollScreen} from './screens/RollScreen';
import {ToneScreen} from './screens/ToneScreen';

function Shell() {
  const t = useTheme();
  const tab = useUI(s => s.tab);
  const {width, height} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const land = width > height;
  return (
    <View style={{flex: 1, backgroundColor: t.bg, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right}}>
      <StatusBar barStyle={t.dark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent hidden={land} />
      <TopBar />
      <View style={{flex: 1, flexDirection: land ? 'row' : 'column'}}>
        {land ? <NavBar vertical /> : null}
        <View style={{flex: 1}}>
          {tab === 'play' ? <PlayScreen /> : tab === 'roll' ? <RollScreen /> : <ToneScreen />}
        </View>
      </View>
      {land ? null : <NavBar />}
      <PresetSheet />
      <SettingsSheet />
      <Toast />
    </View>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      await bootstrapState();
      if (!alive) return;
      setReady(true);
      try {
        const info = await Engine.start();
        useUI.getState().patch({audio: info});
        if (!info.ok && Engine.available) useUI.getState().showToast('Could not open the audio output');
      } catch (e) {
        useUI.getState().showToast(`Audio error: ${(e as Error).message}`);
      }
    })();
    // 30 Hz from the native side: meters, playhead, transport state, latency/underruns
    const off = Engine.onMeter(e => {
      pushMeter(e.peak, e.cpu, e.beat, e.playing, model.bpm);
      rollActions.onTransport(e.beat, e.playing);
      const ui = useUI.getState();
      if (e.xruns !== ui.xruns || Math.abs(e.latencyMs - ui.latencyMs) > 0.5) ui.patch({xruns: e.xruns, latencyMs: e.latencyMs});
    });
    return () => { alive = false; off(); };
  }, []);

  if (!ready) {
    return <View style={{flex: 1, backgroundColor: '#0A0A0C', alignItems: 'center', justifyContent: 'center'}}><Text style={{color: '#FF5A36', fontWeight: '900', letterSpacing: 3}}>METAL GUITAR PRO</Text></View>;
  }
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider><Shell /></SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
