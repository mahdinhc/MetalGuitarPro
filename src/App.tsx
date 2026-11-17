import React, {useEffect, useMemo, useState} from 'react';
import {StatusBar, Text, View, useWindowDimensions} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {Engine} from './native/engine';
import {pushMeter} from './native/meter';
import {bootstrapState, clearSavedState} from './store/persist';
import {model, rollActions} from './store/roll';
import {useUI} from './store/ui';
import {useTheme} from './theme';
import {ErrorBoundary} from './ErrorBoundary';
import {NavBar, TopBar, Toast} from './components/Chrome';
import {PresetSheet, SettingsSheet} from './components/Sheets';
import {PlayScreen} from './screens/PlayScreen';
import {ToneScreen} from './screens/ToneScreen';

/**
 * The piano roll is the only screen that needs Skia. It is loaded on first use inside its own error boundary, so a Skia
 * problem on some device disables the Riff tab (with a message) instead of preventing the whole app from starting.
 */
function RollTab() {
  const Screen = useMemo(() => (require('./screens/RollScreen') as typeof import('./screens/RollScreen')).RollScreen, []);
  return <Screen />;
}

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
          {/* keyed by tab: switching tab after an error gives the next screen a clean boundary */}
          <ErrorBoundary key={tab} inline label={tab === 'play' ? 'Play screen' : tab === 'roll' ? 'Piano roll' : 'Tone screen'} onReset={clearSavedState}>
            {tab === 'play' ? <PlayScreen /> : tab === 'roll' ? <RollTab /> : <ToneScreen />}
          </ErrorBoundary>
        </View>
      </View>
      {land ? null : <NavBar />}
      <PresetSheet />
      <SettingsSheet />
      <Toast />
    </View>
  );
}

/** Never let a JS error that escaped every boundary (a timer, a promise, an event handler) close the app in release builds. */
function installGlobalErrorHandler() {
  const g = globalThis as unknown as {ErrorUtils?: {getGlobalHandler(): (e: Error, fatal?: boolean) => void; setGlobalHandler(h: (e: Error, fatal?: boolean) => void): void}};
  const eu = g.ErrorUtils;
  if (!eu || __DEV__) return;            // in development keep the red box
  const previous = eu.getGlobalHandler();
  eu.setGlobalHandler((error, isFatal) => {
    console.error('[uncaught]', isFatal ? 'fatal' : 'non-fatal', error);
    try { useUI.getState().showToast(`Error: ${String(error?.message ?? error).slice(0, 120)}`); } catch { previous(error, false); }
  });
}
installGlobalErrorHandler();

function Root() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      let clean = true;
      try { clean = await bootstrapState(); } catch (e) {
        // bootstrapState isolates its own steps, so this is truly unexpected: drop saved data and run on defaults
        console.warn('[startup] bootstrapState threw', e);
        clean = false;
        await clearSavedState();
      }
      if (!alive) return;
      setReady(true);                       // the UI always appears, with or without working audio
      if (!clean) useUI.getState().showToast('Saved settings were damaged and have been reset');

      const info = await Engine.start();    // never rejects
      if (!alive) return;
      useUI.getState().patch({audio: info});
      if (!info.ok) {
        const status = await Engine.status();
        const why = info.error ?? status?.error ?? Engine.lastError();
        useUI.getState().showToast(Engine.available ? `No audio output${why ? `: ${why}` : ''}` : 'Audio engine missing from this build');
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

export default function App() {
  return <ErrorBoundary onReset={clearSavedState}><Root /></ErrorBoundary>;
}
