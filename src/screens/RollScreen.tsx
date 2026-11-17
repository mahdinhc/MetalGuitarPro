import React, {useRef, useState} from 'react';
import {Pressable, ScrollView, Text, View, useWindowDimensions} from 'react-native';
import {RollView} from '../components/RollView';
import {RollInspector} from '../components/RollInspector';
import {Btn, Pill, Segmented} from '../ui/Controls';
import {Select} from '../ui/Select';
import {Sheet} from '../ui/Sheet';
import {Icon} from '../ui/Icon';
import {ctrl, model, rollActions, useRoll} from '../store/roll';
import {BAR_OPTIONS, CHORD_STAMPS, SNAPS} from '../core/music';
import {RIFFS} from '../core/riffs';
import {radius, space, useTheme} from '../theme';
import {haptic} from '../ui/haptics';

/** BPM with hold-to-repeat (accelerating) +/- buttons. */
function BpmControl() {
  const t = useTheme();
  useRoll(s => s.rev);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const start = (dir: number) => {
    haptic(8); let n = 0;
    const tick = () => { rollActions.setBpm(model.bpm + dir * (n > 12 ? 5 : 1)); n++; timer.current = setTimeout(tick, n > 12 ? 60 : n > 4 ? 90 : 220); };
    tick();
  };
  const hold = (dir: number, icon: string, label: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPressIn={() => start(dir)} onPressOut={stop}
      style={{width: 40, height: 40, borderRadius: radius.md, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center'}}>
      <Icon name={icon} size={20} color={t.text} />
    </Pressable>
  );
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
      {hold(-1, 'minus', 'Slower')}
      <View style={{minWidth: 54, alignItems: 'center'}}>
        <Text style={{color: t.text, fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums']}}>{model.bpm}</Text>
        <Text style={{color: t.sub, fontSize: 9, fontWeight: '800', letterSpacing: 1}}>BPM</Text>
      </View>
      {hold(1, 'plus', 'Faster')}
    </View>
  );
}

function RiffMenu() {
  const [open, setOpen] = useState(false);
  const t = useTheme();
  return (
    <>
      <Btn small icon="folder-music-outline" label="Riffs" onPress={() => setOpen(true)} />
      <Sheet visible={open} title="Load a starter riff" onClose={() => setOpen(false)}>
        <Text style={{color: t.sub, marginBottom: space.md}}>Replaces the current riff. You can undo it.</Text>
        {RIFFS.map(r => (
          <Pressable key={r.name} accessibilityRole="button" onPress={() => { model.checkpoint(); rollActions.loadRiff(r.data); setOpen(false); }}
            style={({pressed}) => ({minHeight: 56, padding: space.md, borderRadius: radius.md, marginBottom: 6, backgroundColor: pressed ? t.surface3 : t.surface2})}>
            <Text style={{color: t.text, fontWeight: '800', fontSize: 15}}>{r.name}</Text>
            <Text style={{color: t.sub, fontSize: 12, marginTop: 2}}>{r.hint}</Text>
          </Pressable>
        ))}
      </Sheet>
    </>
  );
}

function Toolbars() {
  const s = useRoll();
  useRoll(x => x.rev);
  const row = {gap: 8, alignItems: 'center' as const, paddingHorizontal: space.md, paddingVertical: 4};
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={row}>
        <Btn variant="primary" icon={s.playing ? 'pause' : 'play'} label={s.playing ? 'Pause' : 'Play'} onPress={rollActions.toggle} style={{minWidth: 104}} />
        <Btn icon="skip-previous" accessibilityLabel="Rewind" onPress={rollActions.rewind} />
        <BpmControl />
        <Pill label="Loop" icon="repeat" active={s.loop} onPress={() => rollActions.setLoop(!s.loop)} />
        <Pill label="Click" icon="metronome" active={s.metro} onPress={() => rollActions.setMetro(!s.metro)} />
        <Btn icon="undo" accessibilityLabel="Undo" disabled={!model.canUndo} onPress={rollActions.undo} />
        <Btn icon="redo" accessibilityLabel="Redo" disabled={!model.canRedo} onPress={rollActions.redo} />
        <Btn icon="export-variant" label={s.exporting ? 'Rendering…' : 'Export WAV'} disabled={s.exporting} onPress={rollActions.exportWav} />
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={row}>
        <Segmented style={{width: 232}} value={s.tool} onChange={rollActions.setTool}
          options={[{label: '', value: 'draw', icon: 'pencil'}, {label: '', value: 'select', icon: 'selection-drag'}, {label: '', value: 'erase', icon: 'eraser'}, {label: '', value: 'hand', icon: 'hand-back-right'}]} />
        <Pill label="Multi" active={s.multi} onPress={() => rollActions.setMulti(!s.multi)} />
        <Btn small label="All" onPress={rollActions.selectAll} />
        <View style={{width: 128}}><Select compact label="Snap" value={model.snap} options={SNAPS.map(o => ({label: o.label, value: o.value}))} onChange={rollActions.setSnap} /></View>
        <View style={{width: 138}}><Select compact label="Chord stamp" value={s.chordName} options={Object.keys(CHORD_STAMPS).map(k => ({label: k, value: k}))} onChange={rollActions.setChord} /></View>
        <View style={{width: 104}}><Select compact label="Bars" value={model.bars} options={BAR_OPTIONS.map(b => ({label: `${b}`, value: b}))} onChange={rollActions.setBars} /></View>
        <RiffMenu />
        <Btn small icon="delete-sweep-outline" label="Clear" onPress={rollActions.clear} />
      </ScrollView>
    </View>
  );
}

export function RollScreen() {
  const t = useTheme();
  const {width, height} = useWindowDimensions();
  const land = width > height;
  const hasSel = useRoll(s => { void s.rev; return model.sel.size > 0; });
  return (
    <View style={{flex: 1, backgroundColor: t.bg}}>
      <Toolbars />
      <View style={{flex: 1, flexDirection: land ? 'row' : 'column'}}>
        <View style={{flex: 1, margin: space.sm, marginTop: 4, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: t.line}}>
          <RollView />
        </View>
        {hasSel ? (
          <View style={{width: land ? 300 : undefined, maxHeight: land ? undefined : height * 0.38, backgroundColor: t.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: land ? 0 : radius.lg, borderWidth: 1, borderColor: t.line}}>
            <RollInspector maxHeight={land ? undefined : height * 0.38} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
void ctrl;
