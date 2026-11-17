import React from 'react';
import {Modal, Pressable, ScrollView, Text, View, useWindowDimensions} from 'react-native';
import {radius, space, useTheme} from '../theme';
import {Btn} from './Controls';

/** Bottom sheet (centered card in landscape). Tapping the scrim or the close button dismisses it. */
export function Sheet({visible, title, onClose, children, scroll = true}: {visible: boolean; title: string; onClose: () => void; children: React.ReactNode; scroll?: boolean}) {
  const t = useTheme();
  const {width, height} = useWindowDimensions();
  const land = width > height;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>
      <Pressable style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: land ? 'center' : 'flex-end', alignItems: 'center'}} onPress={onClose} accessibilityLabel="Close">
        <Pressable onPress={() => {}} style={{width: land ? Math.min(560, width - 48) : '100%', maxHeight: height * (land ? 0.92 : 0.86), backgroundColor: t.surface,
          borderTopLeftRadius: radius.lg + 4, borderTopRightRadius: radius.lg + 4, borderBottomLeftRadius: land ? radius.lg + 4 : 0, borderBottomRightRadius: land ? radius.lg + 4 : 0, paddingTop: space.md, paddingBottom: space.lg}}>
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingBottom: space.sm}}>
            <Text style={{color: t.text, fontSize: 18, fontWeight: '800'}} accessibilityRole="header">{title}</Text>
            <Btn small variant="ghost" icon="close" onPress={onClose} accessibilityLabel="Close" />
          </View>
          {scroll ? <ScrollView contentContainerStyle={{paddingHorizontal: space.lg, paddingBottom: space.md}} keyboardShouldPersistTaps="handled">{children}</ScrollView>
            : <View style={{paddingHorizontal: space.lg}}>{children}</View>}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
