import { clamp, createMotifIO, midiToFrequency, MotifHandle, DelaySettings } from "./common";

export type ShimmeringCascadeOptions = {
  transpose?: number;
  density?: number;
  articulation?: number;
  delay?: DelaySettings;
  getChord?: () => number[];
};

const DEFAULT_CHORD = [60, 64, 67, 71, 74];
const PULSE_PATTERN = [0, 2, 4, 1, 3, 5, 2, 4];
const REGISTER_PATTERN = [1, 2, 2, 1, 3, 2, 1, 2];

export function createShimmeringCascadeMotif(options: ShimmeringCascadeOptions = {}): MotifHandle {
  if (typeof window === "undefined") {
    throw new Error("Motifs can only be created in a browser context.");
  }

  const { context, stageGain, output } = createMotifIO(options.delay);

  const articulation = clamp(options.articulation ?? 0.65, 0.15, 1);
  const density = clamp(options.density ?? 1.4, 0.5, 6);
  const transpose = Math.round(options.transpose ?? 12);

  let isRunning = false;
  let nextEventTime = context.currentTime;
  let pulseIndex = 0;
  let schedulerId: number | null = null;
  const activeVoices = new Set<{ oscillator: OscillatorNode; gain: GainNode }>();

  const scheduleAheadTime = 0.15;
  const lookAheadMs = 30;
  const baseInterval = 0.33;

  const getChord = (): number[] => {
    const chord = options.getChord?.() ?? DEFAULT_CHORD;
    return chord.slice().sort((a, b) => a - b);
  };

  const triggerPulse = (time: number) => {
    const chord = getChord();
    const patternIndex = pulseIndex % PULSE_PATTERN.length;
    const chordIndex = PULSE_PATTERN[patternIndex] % chord.length;
    const registerOffset = REGISTER_PATTERN[patternIndex];
    const targetMidi = chord[chordIndex] + transpose + registerOffset * 12;

    const oscillator = context.createOscillator();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(midiToFrequency(targetMidi), time);

    const voiceGain = context.createGain();
    const peak = 0.06;
    voiceGain.gain.setValueAtTime(0, time);
    voiceGain.gain.linearRampToValueAtTime(peak, time + 0.015);
    const releaseTime = time + baseInterval * articulation;
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, Math.max(releaseTime, time + 0.05));

    oscillator.connect(voiceGain);
    voiceGain.connect(stageGain);

    oscillator.start(time);
    oscillator.stop(releaseTime + 0.25);

    const voice = { oscillator, gain: voiceGain };
    activeVoices.add(voice);
    oscillator.onended = () => {
      voiceGain.disconnect();
      oscillator.disconnect();
      activeVoices.delete(voice);
    };

    pulseIndex += 1;
  };

  const scheduler = () => {
    if (!isRunning) {
      return;
    }

    while (nextEventTime < context.currentTime + scheduleAheadTime) {
      triggerPulse(nextEventTime);
      const interval = Math.max(0.08, baseInterval / density);
      nextEventTime += interval;
    }
  };

  return {
    output,
    start: () => {
      if (isRunning) {
        return;
      }

      isRunning = true;
      pulseIndex = 0;
      nextEventTime = context.currentTime + 0.05;

      output.gain.cancelScheduledValues(context.currentTime);
      output.gain.setValueAtTime(output.gain.value, context.currentTime);
      output.gain.linearRampToValueAtTime(0.5, context.currentTime + 0.9);

      schedulerId = window.setInterval(scheduler, lookAheadMs);
    },
    stop: () => {
      if (!isRunning) {
        return;
      }

      isRunning = false;
      if (schedulerId !== null) {
        window.clearInterval(schedulerId);
        schedulerId = null;
      }

      const now = context.currentTime;
      output.gain.cancelScheduledValues(now);
      output.gain.setValueAtTime(output.gain.value, now);
      output.gain.linearRampToValueAtTime(0.0001, now + 0.8);

      activeVoices.forEach((voice) => {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0.0001, now + 0.3);
        try {
          voice.oscillator.stop(now + 0.4);
        } catch (error) {
          // Oscillator may already be stopped.
        }
      });

      activeVoices.clear();
    },
  };
}
