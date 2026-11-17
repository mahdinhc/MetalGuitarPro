import {Vibration} from 'react-native';
import {useUI} from '../store/ui';

/** Short tick on touch. Respects the Haptics setting. */
export function haptic(ms = 8) {
  if (useUI.getState().haptics) Vibration.vibrate(ms);
}
