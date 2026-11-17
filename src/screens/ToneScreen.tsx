import React, {useState} from 'react';
import {ScrollView, Text, TextInput, View, useWindowDimensions} from 'react-native';
import {Btn, Pill, SectionTitle} from '../ui/Controls';
import {Select} from '../ui/Select';
import {Sheet} from '../ui/Sheet';
import {Slider} from '../ui/Slider';
import {paramDef, useTone} from '../store/tone';
import {CABINETS, PRESETS, TUNINGS} from '../core/music';
import {PARAM_DEFS, ParamId} from '../core/paramDefs';
import {radius, space, useTheme} from '../theme';

function ParamSlider({id}: {id: ParamId}) {
  const d = paramDef(id);
  const v = useTone(s => s.values[id]);
  const set = useTone(s => s.set);
  return <Slider label={d.label} value={v} min={d.min} max={d.max} step={d.step} def={d.def} unit={d.unit} bipolar={d.min < 0 && d.max > 0} onChange={x => set(id, x)} />;
}
function ToggleRow({ids}: {ids: ParamId[]}) {
  const values = useTone(s => s.values);
  const toggle = useTone(s => s.toggle);
  return (
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
      {ids.map(id => <Pill key={id} label={paramDef(id).label} active={values[id] > 0.5} onPress={() => toggle(id)} />)}
    </View>
  );
}
function Card({title, children}: {title: string; children: React.ReactNode}) {
  const t = useTheme();
  return (
    <View style={{backgroundColor: t.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm, borderWidth: 1, borderColor: t.line}}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </View>
  );
}
const ids = (group: string) => PARAM_DEFS.filter(p => p.group === group && p.kind === 'knob' && p.id !== 'bend' && p.id !== 'wah').map(p => p.id);

function SavePreset() {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const save = useTone(s => s.saveUserPreset);
  return (
    <>
      <Btn small icon="content-save-outline" label="Save as preset" onPress={() => { setName(''); setOpen(true); }} />
      <Sheet visible={open} title="Save tone as preset" onClose={() => setOpen(false)} scroll={false}>
        <TextInput value={name} onChangeText={setName} placeholder="Preset name" placeholderTextColor={t.mute} maxLength={24} autoFocus
          style={{minHeight: 52, borderRadius: radius.md, paddingHorizontal: space.md, backgroundColor: t.surface2, color: t.text, fontSize: 16, fontWeight: '700'}} />
        <Btn variant="primary" label="Save" onPress={() => { save(name); setOpen(false); }} style={{marginTop: space.md}} />
      </Sheet>
    </>
  );
}

export function ToneScreen() {
  const t = useTheme();
  const {width} = useWindowDimensions();
  const wide = width >= 700;
  const preset = useTone(s => s.preset), dirty = useTone(s => s.dirty);
  const tun = useTone(s => s.values.tun), cabT = useTone(s => s.values.cabT), mode = useTone(s => s.values.mode);
  const set = useTone(s => s.set);
  const reset = () => { const i = PRESETS.findIndex(p => p.name === preset); if (i >= 0) useTone.getState().applyFactory(i); else { const u = useTone.getState().userPresets.find(p => p.name === preset); if (u) useTone.getState().applyPreset(u.name, u.values); } };

  const instrument = (
    <Card title="Instrument">
      <Select label="Tuning" value={tun} options={TUNINGS.map((x, i) => ({label: x.name, value: i}))} onChange={v => set('tun', v)} />
      <Select label="Cabinet" value={cabT} options={CABINETS.map((x, i) => ({label: x, value: i}))} onChange={v => set('cabT', v)} />
      <Select label="Drag on a string" value={mode} options={[{label: 'Slide', value: 0, hint: 'Glides smoothly between frets'}, {label: 'Legato', value: 1, hint: 'Hammer-on / pull-off'}]} onChange={v => set('mode', v)} />
      <View style={{height: 4}} />
      <ToggleRow ids={['boost', 'cab', 'bridge']} />
    </Card>
  );
  const amp = <Card title="Amp">{ids('amp').map(id => <ParamSlider key={id} id={id} />)}</Card>;
  const feel = (
    <Card title="Strings & feel">
      {ids('str').map(id => <ParamSlider key={id} id={id} />)}
      <ToggleRow ids={['slin', 'spring', 'vib', 'ring', 'harm', 'trem', 'power']} />
    </Card>
  );
  const fx = <Card title="Space & effects">{ids('fx').map(id => <ParamSlider key={id} id={id} />)}</Card>;

  return (
    <ScrollView style={{flex: 1, backgroundColor: t.bg}} contentContainerStyle={{padding: space.md, gap: space.md, paddingBottom: 40}}>
      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm}}>
        <View style={{flexShrink: 1}}>
          <Text style={{color: t.sub, fontSize: 11, fontWeight: '800', letterSpacing: 1}}>PRESET</Text>
          <Text style={{color: t.text, fontSize: 20, fontWeight: '900'}} numberOfLines={1}>{preset}{dirty ? '  •  modified' : ''}</Text>
        </View>
        <View style={{flexDirection: 'row', gap: 8}}>
          {dirty ? <Btn small icon="restore" label="Reset" onPress={reset} /> : null}
          <SavePreset />
        </View>
      </View>
      {wide ? (
        <View style={{flexDirection: 'row', gap: space.md, alignItems: 'flex-start'}}>
          <View style={{flex: 1, gap: space.md}}>{instrument}{fx}</View>
          <View style={{flex: 1, gap: space.md}}>{amp}</View>
          <View style={{flex: 1, gap: space.md}}>{feel}</View>
        </View>
      ) : (<>{instrument}{amp}{feel}{fx}</>)}
    </ScrollView>
  );
}
