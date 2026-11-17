import React from 'react';
import MCI from 'react-native-vector-icons/MaterialCommunityIcons';
import type {StyleProp, TextStyle} from 'react-native';

export function Icon({name, size = 22, color, style}: {name: string; size?: number; color: string; style?: StyleProp<TextStyle>}) {
  return <MCI name={name} size={size} color={color} style={style} />;
}
