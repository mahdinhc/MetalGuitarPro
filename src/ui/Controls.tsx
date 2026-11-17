import React from 'react';
import {Pressable, StyleSheet, Text, View, ViewStyle, StyleProp} from 'react-native';
import {radius, space, useStyles, useTheme} from '../theme';
import {Icon} from './Icon';
import {haptic} from './haptics';

// ---- Button ------------------------------------------------------------------------------------------------------
interface BtnProps {
  label?: string; icon?: string; onPress?: () => void; variant?: 'primary' | 'tonal' | 'ghost';
  active?: boolean; disabled?: boolean; small?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string; busy?: boolean;
}
export function Btn({label, icon, onPress, variant = 'tonal', active, disabled, small, style, accessibilityLabel}: BtnProps) {
  const t = useTheme();
  const s = useStyles(tt => StyleSheet.create({
    base: {minHeight: 44, minWidth: 44, paddingHorizontal: 14, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6},
    small: {minHeight: 36, minWidth: 36, paddingHorizontal: 10},
    label: {fontSize: 14, fontWeight: '700', letterSpacing: 0.2},
  }));
  const on = active || variant === 'primary';
  const bg = variant === 'primary' ? t.acc : active ? t.accSoft : variant === 'ghost' ? 'transparent' : t.surface2;
  const fg = variant === 'primary' ? t.onAcc : active ? t.acc : t.text;
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{selected: !!active, disabled: !!disabled}}
      disabled={disabled} onPress={() => { haptic(); onPress?.(); }}
      android_ripple={{color: t.accSoft, borderless: false}}
      style={({pressed}) => [s.base, small && s.small, {backgroundColor: bg, opacity: disabled ? 0.38 : pressed ? 0.8 : 1, borderWidth: on && variant !== 'primary' ? 1 : 0, borderColor: t.acc}, style]}>
      {icon ? <Icon name={icon} size={small ? 20 : 22} color={fg} /> : null}
      {label ? <Text style={[s.label, {color: fg}]} numberOfLines={1}>{label}</Text> : null}
    </Pressable>
  );
}

// ---- Pill (toggle chip) --------------------------------------------------------------------------------------------
export function Pill({label, active, onPress, icon, style}: {label: string; active: boolean; onPress: () => void; icon?: string; style?: StyleProp<ViewStyle>}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="switch" accessibilityState={{checked: active}} accessibilityLabel={label}
      onPress={() => { haptic(); onPress(); }}
      style={({pressed}) => [{minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: active ? t.accSoft : t.surface2, borderWidth: 1, borderColor: active ? t.acc : t.line, opacity: pressed ? 0.8 : 1}, style]}>
      {icon ? <Icon name={icon} size={16} color={active ? t.acc : t.sub} /> : null}
      <Text style={{color: active ? t.acc : t.text, fontSize: 13, fontWeight: '700'}}>{label}</Text>
    </Pressable>
  );
}

// ---- Segmented ------------------------------------------------------------------------------------------------------
export function Segmented<T extends string | number>({options, value, onChange, style}: {
  options: ReadonlyArray<{label: string; value: T; icon?: string}>; value: T; onChange: (v: T) => void; style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View style={[{flexDirection: 'row', backgroundColor: t.surface2, borderRadius: radius.md, padding: 3}, style]} accessibilityRole="tablist">
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} accessibilityRole="tab" accessibilityState={{selected: on}} onPress={() => { haptic(); onChange(o.value); }}
            style={{flex: 1, minHeight: 38, borderRadius: radius.md - 3, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 10, backgroundColor: on ? t.acc : 'transparent'}}>
            {o.icon ? <Icon name={o.icon} size={18} color={on ? t.onAcc : t.sub} /> : null}
            <Text style={{color: on ? t.onAcc : t.sub, fontWeight: '800', fontSize: 13}}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---- Stepper ----------------------------------------------------------------------------------------------------------
export function Stepper({label, value, onChange, min, max, format}: {label?: string; value: number; onChange: (v: number) => void; min: number; max: number; format?: (v: number) => string}) {
  const t = useTheme();
  const s = useStyles(() => StyleSheet.create({row: {flexDirection: 'row', alignItems: 'center', gap: space.xs}, val: {minWidth: 34, textAlign: 'center', fontSize: 16, fontWeight: '800'}, lab: {fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase'}}));
  return (
    <View style={{alignItems: 'center'}}>
      {label ? <Text style={[s.lab, {color: t.sub}]}>{label}</Text> : null}
      <View style={s.row}>
        <Btn small icon="minus" onPress={() => onChange(Math.max(min, value - 1))} disabled={value <= min} accessibilityLabel={`${label ?? 'value'} down`} />
        <Text style={[s.val, {color: t.text}]}>{format ? format(value) : value}</Text>
        <Btn small icon="plus" onPress={() => onChange(Math.min(max, value + 1))} disabled={value >= max} accessibilityLabel={`${label ?? 'value'} up`} />
      </View>
    </View>
  );
}

export function SectionTitle({children}: {children: string}) {
  const t = useTheme();
  return <Text style={{color: t.sub, fontSize: 12, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: space.sm}}>{children}</Text>;
}
