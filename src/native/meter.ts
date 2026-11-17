import {Easing, makeMutable, withTiming} from 'react-native-reanimated';

/**
 * Live values fed by the native 30 Hz event. They are Reanimated shared values, so animating meters and the
 * playhead never triggers a React re-render and the JS thread stays free for touch handling.
 */
export const meter = {
  peak: makeMutable(0),   // 0..1 output peak (decays)
  cpu: makeMutable(0),    // audio callback load, 0..1
  beat: makeMutable(0),   // transport position in beats (smoothly interpolated)
};

let lastBeat = 0;
export function pushMeter(peak: number, cpu: number, beat: number, playing: boolean, bpm: number) {
  meter.peak.value = Math.max(peak, meter.peak.value * 0.82);
  meter.cpu.value = cpu;
  if (playing) {
    // interpolate across the 33 ms gap so the playhead glides instead of stepping
    if (beat < lastBeat - 0.5) meter.beat.value = beat;                       // loop wrap: jump
    else meter.beat.value = withTiming(beat + 0.036 * bpm / 60, {duration: 36, easing: Easing.linear});
  } else if (Math.abs(beat - lastBeat) > 1e-6) meter.beat.value = beat;
  lastBeat = beat;
}
export function setBeat(beat: number) { lastBeat = beat; meter.beat.value = beat; }
