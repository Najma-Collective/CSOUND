import { clamp, createMotifIO, midiToFrequency, MotifHandle, DelaySettings } from "./common";

export type RisingHopeOptions = {
  transpose?: number;
  density?: number;
  articulation?: number;
  delay?: DelaySettings;
  getChord?: () => number[];
};

const DEFAULT_CHORD = [57, 60, 64, 67, 71]; // Am9 voiced around middle C.
const NOTE_ROTATION = [0, 1, 2, 3, 4, 2, 5, 3];
const OCTAVE_PATTERN = [0, 0, 0, 0, 0, 1, 1, 1];

export function createRisingHopeMotif(options: RisingHopeOptions = {}): MotifHandle {
  if (typeof window === "undefined") {
    throw new Error("Motifs can only be created in a browser context.");
  }

  const { context, stageGain, output } = createMotifIO(options.delay);

  const articulation = clamp(options.articulation ?? 0.8, 0.2, 1);
  const density = clamp(options.density ?? 1, 0.25, 4);
  const transpose = Math.round(options.transpose ?? 0);

  let isRunning = false;
  let nextNoteTime = context.currentTime;
  let step = 0;
  let schedulerId: number | null = null;
  const activeVoices = new Set<{ oscillator: OscillatorNode; gain: GainNode }>();

  const scheduleAheadTime = 0.2;
  const lookAheadMs = 50;
  const baseInterval = 0.65;

  const getChord = (): number[] => {
    const chord = options.getChord?.() ?? DEFAULT_CHORD;
    return chord.slice().sort((a, b) => a - b);
  };

  const scheduleNote = (time: number) => {
    const chord = getChord();
    const rotationIndex = step % NOTE_ROTATION.length;
    const chordIndex = NOTE_ROTATION[rotationIndex] % chord.length;
    const octaveShift = OCTAVE_PATTERN[rotationIndex];
    const targetMidi = chord[chordIndex] + transpose + octaveShift * 12;

    const oscillator = context.createOscillator();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(midiToFrequency(targetMidi), time);

    const voiceGain = context.createGain();
    const peak = 0.11;
    voiceGain.gain.setValueAtTime(0, time);
    voiceGain.gain.linearRampToValueAtTime(peak, time + 0.03);
    const releaseTime = time + baseInterval * articulation;
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, Math.max(releaseTime, time + 0.1));

    oscillator.connect(voiceGain);
    voiceGain.connect(stageGain);

    oscillator.start(time);
    oscillator.stop(releaseTime + 0.3);

    const voice = { oscillator, gain: voiceGain };
    activeVoices.add(voice);
    oscillator.onended = () => {
      voiceGain.disconnect();
      oscillator.disconnect();
      activeVoices.delete(voice);
    };

    step += 1;
  };

  const scheduler = () => {
    if (!isRunning) {
      return;
    }

    while (nextNoteTime < context.currentTime + scheduleAheadTime) {
      scheduleNote(nextNoteTime);
      const interval = Math.max(0.18, baseInterval / density);
      nextNoteTime += interval;
    }
  };

  return {
    output,
    start: () => {
      if (isRunning) {
        return;
      }

      isRunning = true;
      nextNoteTime = context.currentTime + 0.05;
      step = 0;

      output.gain.cancelScheduledValues(context.currentTime);
      output.gain.setValueAtTime(output.gain.value, context.currentTime);
      output.gain.linearRampToValueAtTime(0.95, context.currentTime + 1.2);

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
      output.gain.linearRampToValueAtTime(0.0001, now + 1.5);

      activeVoices.forEach((voice) => {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0.0001, now + 0.5);
        try {
          voice.oscillator.stop(now + 0.6);
        } catch (error) {
          // Oscillator may already be stopped.
        }
      });

      activeVoices.clear();
    },
  };
}
