import React from 'react';
import {ScrollView, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {FretNumbers, Neck, StrumZone, StringLabels} from '../components/FretBoard';
import {Btn, Pill, Segmented, Stepper} from '../ui/Controls';
import {Slider} from '../ui/Slider';
import {Engine} from '../native/engine';
import {play, usePlay} from '../store/play';
import {useTone} from '../store/tone';
import {CHORDS} from '../core/music';
import {space, useStyles, useTheme} from '../theme';
import {haptic} from '../ui/haptics';

/** Button that is active only while a finger is on it (multi-touch safe: raw touch events, no responder). */
function HoldButton({label, onHold}: {label: string; onHold: (down: boolean) => void}) {
  const t = useTheme();
  const [down, setDown] = React.useState(false);
  const set = (d: boolean) => { if (d) haptic(10); setDown(d); onHold(d); };
  return (
    <View accessibilityRole="button" accessibilityLabel={label} onTouchStart={() => set(true)} onTouchEnd={() => set(false)} onTouchCancel={() => set(false)}
      style={{flex: 1, minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: down ? t.acc : t.surface2, borderWidth: 1, borderColor: down ? t.acc : t.line}}>
      <Text style={{color: down ? t.onAcc : t.text, fontWeight: '800', fontSize: 13}}>{label}</Text>
    </View>
  );
}

function ChordRow() {
  const rev = usePlay(s => s.rev); void rev;
  const names = ['Free', ...Object.keys(CHORDS)];
  const cur = names.find(n => (n === 'Free' ? !play.shape : CHORDS[n] === play.shape)) ?? 'Free';
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 6, paddingVertical: 2}} style={{flexGrow: 0}}>
      {names.map(n => <Pill key={n} label={n} active={n === cur} onPress={() => play.setShape(n === 'Free' ? null : CHORDS[n])} />)}
    </ScrollView>
  );
}

function Perf() {
  const v = useTone(s => s.values);
  const set = useTone(s => s.set);
  const holdParam = (id: 'mute' | 'vib') => {
    let prev = 0;
    return (d: boolean) => { if (d) { prev = useTone.getState().values[id]; set(id, 1); } else set(id, prev); };
  };
  const pm = React.useMemo(() => holdParam('mute'), []);   // eslint-disable-line react-hooks/exhaustive-deps
  const vb = React.useMemo(() => holdParam('vib'), []);    // eslint-disable-line react-hooks/exhaustive-deps
  const springRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const stopSpring = () => { if (springRef.current) { clearInterval(springRef.current); springRef.current = null; } };
  const release = () => {
    if (useTone.getState().values.spring < 0.5) return;
    stopSpring();
    springRef.current = setInterval(() => {   // same exponential spring-back as the original (x0.75 every 20 ms)
      const b = useTone.getState().values.bend * 0.75;
      if (Math.abs(b) < 0.03) { set('bend', 0); stopSpring(); } else set('bend', b);
    }, 20);
  };
  React.useEffect(() => stopSpring, []);
  const s = useStyles(() => StyleSheet.create({row: {flexDirection: 'row', gap: space.sm}}));
  return (
    <View style={{gap: space.sm}}>
      <View style={s.row}>
        <HoldButton label="PALM MUTE" onHold={pm} />
        <HoldButton label="VIBRATO" onHold={vb} />
        <View style={{flex: 1}}><Btn label="Mute all" icon="volume-off" onPress={() => { Engine.muteAll(30); play.cancelAll(); }} style={{flex: 1}} /></View>
      </View>
      <Slider label="Whammy" value={v.bend} min={-6} max={2} step={0.1} def={0} bipolar unit="st" onStart={stopSpring} onEnd={release} onChange={x => set('bend', x)} />
      <View style={{flexDirection: 'row', gap: space.sm, alignItems: 'flex-end'}}>
        <View style={{flex: 1}}><Slider label="Wah" value={v.wah} min={0} max={100} def={50} onChange={x => set('wah', x)} /></View>
        <Pill label="Wah" active={v.wahOn > 0.5} onPress={() => useTone.getState().toggle('wahOn')} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 6}} style={{flexGrow: 0}}>
        <Pill label="Power chords" active={v.power > 0.5} onPress={() => useTone.getState().toggle('power')} />
        <Pill label="Let ring" active={v.ring > 0.5} onPress={() => useTone.getState().toggle('ring')} />
        <Pill label="Harmonics" active={v.harm > 0.5} onPress={() => useTone.getState().toggle('harm')} />
        <Pill label="Tremolo pick" active={v.trem > 0.5} onPress={() => useTone.getState().toggle('trem')} />
      </ScrollView>
    </View>
  );
}

export function PlayScreen() {
  const t = useTheme();
  const {width, height} = useWindowDimensions();
  const land = width > height;
  usePlay(s => s.rev);
  const [neckW, setNeckW] = React.useState(0);
  const zoneW = Math.max(88, Math.min(150, width * (land ? 0.1 : 0.26)));
  // choose how many frets fit: about 48 dp per fret, clamped
  React.useEffect(() => {
    if (!neckW) return;
    const win = Math.max(5, Math.min(12, Math.floor(neckW / 48)));
    if (win !== play.win) play.setWindow(play.w0, win);
  }, [neckW]);

  const main = (
    <View style={{flex: 1, gap: space.sm}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: space.md}}>
        <Segmented style={{width: 170}} value={play.mode} onChange={m => play.setMode(m)} options={[{label: 'Strum', value: 'strum'}, {label: 'Lead', value: 'lead'}]} />
        <View style={{flex: 1}}>
          <Slider compact label={`Position  ${play.w0}–${play.w0 + play.win - 1}`} value={play.w0} min={0} max={play.maxW0} step={1} def={0} onChange={x => play.setWindow(x)} />
        </View>
        <Stepper label="Capo" value={play.capo} min={0} max={9} onChange={c => play.setCapo(c)} />
      </View>
      <ChordRow />
      <View style={{flex: 1}}>
        <View style={{flexDirection: 'row'}}>
          <View style={{width: 32}} />   {/* 26 string-label column + 6 gap */}
          <FretNumbers width={neckW} />
        </View>
        <View style={{flex: 1, flexDirection: 'row', gap: 6}}>
          <StringLabels />
          <Neck onSize={w => setNeckW(w)} />
          <StrumZone width={zoneW} />
        </View>
      </View>
    </View>
  );

  return (
    <View style={{flex: 1, flexDirection: land ? 'row' : 'column', padding: space.md, gap: space.md, backgroundColor: t.bg}}>
      {main}
      {land ? <ScrollView style={{width: Math.min(300, width * 0.32), flexGrow: 0}} contentContainerStyle={{paddingBottom: 4}}><Perf /></ScrollView> : <Perf />}
    </View>
  );
}
