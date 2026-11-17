import React, {useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {radius, space, useTheme} from '../theme';
import {Icon} from './Icon';
import {Sheet} from './Sheet';
import {haptic} from './haptics';

export interface Option<T> { label: string; value: T; hint?: string }

/** Labelled row that opens a sheet with the options. Works well with a thumb, unlike a tiny dropdown. */
export function Select<T extends string | number>({label, value, options, onChange, compact}: {label: string; value: T; options: ReadonlyArray<Option<T>>; onChange: (v: T) => void; compact?: boolean}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const cur = options.find(o => o.value === value);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${cur?.label ?? ''}`} onPress={() => { haptic(); setOpen(true); }}
        style={({pressed}) => ({minHeight: compact ? 44 : 52, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: t.surface2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', opacity: pressed ? 0.8 : 1})}>
        <View style={{flexShrink: 1}}>
          <Text style={{color: t.sub, fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase'}}>{label}</Text>
          <Text style={{color: t.text, fontSize: 15, fontWeight: '700'}} numberOfLines={1}>{cur?.label ?? '—'}</Text>
        </View>
        <Icon name="chevron-down" size={22} color={t.sub} />
      </Pressable>
      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        {options.map(o => {
          const on = o.value === value;
          return (
            <Pressable key={String(o.value)} accessibilityRole="radio" accessibilityState={{selected: on}} onPress={() => { haptic(); onChange(o.value); setOpen(false); }}
              style={({pressed}) => ({minHeight: 52, paddingHorizontal: space.md, borderRadius: radius.md, marginBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: on ? t.accSoft : pressed ? t.surface3 : t.surface2, borderWidth: 1, borderColor: on ? t.acc : 'transparent'})}>
              <View style={{flexShrink: 1}}>
                <Text style={{color: on ? t.acc : t.text, fontSize: 15, fontWeight: '700'}}>{o.label}</Text>
                {o.hint ? <Text style={{color: t.sub, fontSize: 12, marginTop: 1}}>{o.hint}</Text> : null}
              </View>
              {on ? <Icon name="check" size={20} color={t.acc} /> : null}
            </Pressable>
          );
        })}
      </Sheet>
    </>
  );
}
