import React from 'react';
import {ScrollView, Text, View} from 'react-native';
import {Btn, Pill, SectionTitle} from '../ui/Controls';
import {Slider} from '../ui/Slider';
import {FlagKey} from '../core/rollModel';
import {model, rollActions, useRoll} from '../store/roll';
import {noteName, TUNINGS} from '../core/music';
import {useTone} from '../store/tone';
import {space, useTheme} from '../theme';

const LENGTHS: Array<[string, number]> = [['1/32', 0.125], ['1/16', 0.25], ['1/8', 0.5], ['1/4', 1], ['1/2', 2], ['1', 4]];
const FLAGS: Array<[FlagKey, string]> = [['pm', 'Palm mute'], ['vb', 'Vibrato'], ['hm', 'Harmonic'], ['sl', 'Slide →'], ['lg', 'Hammer/pull →'], ['tr', 'Tremolo'], ['pw', 'Power chord'], ['rg', 'Let ring']];
const BEND_LABEL = ['Bend', 'Bend ½', 'Bend full', 'Bend 1½'];

/** Edits the selected notes. Every action goes through the model (which checkpoints for undo) and re-syncs the engine. */
export function RollInspector({maxHeight}: {maxHeight?: number}) {
  const t = useTheme();
  useRoll(s => s.rev);
  const tun = useTone(s => s.values.tun);
  const sel = model.selection();
  if (!sel.length) return null;
  const first = sel[0];
  const done = (ok: boolean) => { if (ok) rollActions.edited(); };
  const allHave = (k: FlagKey) => sel.every(n => n[k]);
  const T = TUNINGS[tun].notes;
  const bd = sel.every(n => (n.bd ?? 0) === (first.bd ?? 0)) ? first.bd ?? 0 : 0;
  const title = sel.length === 1 ? `${noteName(first.p)}${Math.floor(first.p / 12) - 1}${first._a != null && first._a >= 0 ? `  ·  string ${6 - first._a}, fret ${first._f}` : '  ·  not playable in this tuning'}` : `${sel.length} notes selected`;
  return (
    <ScrollView style={{maxHeight, flexGrow: 0}} contentContainerStyle={{padding: space.md, gap: space.md}} showsVerticalScrollIndicator={false}>
      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm}}>
        <Text style={{color: t.text, fontWeight: '800', fontSize: 15, flexShrink: 1}} numberOfLines={1}>{title}</Text>
        <View style={{flexDirection: 'row', gap: 6}}>
          <Btn small icon="content-copy" accessibilityLabel="Duplicate" onPress={() => { model.duplicateSelection(); rollActions.edited(); }} />
          <Btn small icon="delete-outline" accessibilityLabel="Delete" onPress={() => { model.deleteSelection(); rollActions.edited(); }} />
        </View>
      </View>
      <View>
        <SectionTitle>Pitch</SectionTitle>
        <View style={{flexDirection: 'row', gap: 6}}>
          {([[-12, '−12'], [-1, '−1'], [1, '+1'], [12, '+12']] as Array<[number, string]>).map(([d, l]) => <Btn key={d} small label={l} style={{flex: 1}} onPress={() => done(model.transpose(d))} />)}
        </View>
      </View>
      <View>
        <SectionTitle>Length</SectionTitle>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
          {LENGTHS.map(([l, v]) => <Pill key={l} label={l} active={sel.every(n => Math.abs(n.d - v) < 1e-6)} onPress={() => done(model.setLength(v))} />)}
        </View>
      </View>
      <Slider label="Velocity" value={first.v} min={0.1} max={1} step={0.01} def={0.85} format={v => `${Math.round(v * 100)}%`}
        onStart={() => model.checkpoint()} onChange={v => { model.setVelocity(v); rollActions.edited(); }} />
      <View>
        <SectionTitle>Articulation</SectionTitle>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
          {FLAGS.map(([k, l]) => <Pill key={k} label={l} active={allHave(k)} onPress={() => done(model.toggleFlag(k))} />)}
          <Pill label={BEND_LABEL[bd]} active={bd > 0} onPress={() => done(model.cycleBend())} />
        </View>
      </View>
      <View>
        <SectionTitle>String</SectionTitle>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
          <Pill label="Auto" active={sel.every(n => n.s == null)} onPress={() => done(model.setString(-1))} />
          {[5, 4, 3, 2, 1, 0].map(s => <Pill key={s} label={`${6 - s}  ${noteName(T[s])}`} active={sel.every(n => n.s === s)} onPress={() => done(model.setString(s))} />)}
        </View>
      </View>
    </ScrollView>
  );
}
