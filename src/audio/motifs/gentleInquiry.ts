import { clamp, createMotifIO, midiToFrequency, MotifHandle, DelaySettings } from "./common";

export type GentleInquiryOptions = {
  transpose?: number;
  density?: number;
  articulation?: number;
  delay?: DelaySettings;
  getChord?: () => number[];
};

const DEFAULT_CHORD = [55, 59, 62, 67, 71];
const MOTIF_CELLS: Array<{ indices: number[]; spread: number }> = [
  { indices: [0], spread: 0 },
  { indices: [2], spread: 0 },
  { indices: [1], spread: 0 },
  { indices: [3], spread: 0 },
  { indices: [0, 2], spread: 1 },
  { indices: [1, 4], spread: 1 },
  { indices: [2], spread: 0 },
];

export function createGentleInquiryMotif(options: GentleInquiryOptions = {}): MotifHandle {
  if (typeof window === "undefined") {
    throw new Error("Motifs can only be created in a browser context.");
  }

  const { context, stageGain, output } = createMotifIO(options.delay);

  const articulation = clamp(options.articulation ?? 0.9, 0.2, 1.2);
  const density = clamp(options.density ?? 0.85, 0.2, 2.5);
  const transpose = Math.round(options.transpose ?? 0);

  let isRunning = false;
  let nextEventTime = context.currentTime;
  let cellIndex = 0;
  let schedulerId: number | null = null;
  const activeVoices = new Set<{ oscillator: OscillatorNode; gain: GainNode }>();

  const scheduleAheadTime = 0.5;
  const lookAheadMs = 80;
  const baseInterval = 1.35;

  const getChord = (): number[] => {
    const chord = options.getChord?.() ?? DEFAULT_CHORD;
    return chord.slice().sort((a, b) => a - b);
  };

  const triggerCell = (time: number) => {
    const chord = getChord();
    const motifCell = MOTIF_CELLS[cellIndex % MOTIF_CELLS.length];
    const probability = clamp(density, 0, 1);

    if (Math.random() > probability) {
      cellIndex += 1;
      return;
    }

    motifCell.indices.forEach((rawIndex, partIdx) => {
      const chordIndex = rawIndex % chord.length;
      const octaveShift = Math.floor(rawIndex / chord.length) + motifCell.spread;
      const targetMidi = chord[chordIndex] + transpose + octaveShift * 12;

      const oscillator = context.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(midiToFrequency(targetMidi), time);
      oscillator.detune.setValueAtTime((partIdx - motifCell.indices.length / 2) * 4, time);

      const voiceGain = context.createGain();
      const peak = 0.08 - partIdx * 0.012;
      voiceGain.gain.setValueAtTime(0, time);
      voiceGain.gain.linearRampToValueAtTime(Math.max(0.02, peak), time + 0.08);
      const releaseTime = time + baseInterval * articulation;
      voiceGain.gain.linearRampToValueAtTime(0, Math.max(releaseTime, time + 0.4));

      oscillator.connect(voiceGain);
      voiceGain.connect(stageGain);

      oscillator.start(time);
      oscillator.stop(releaseTime + 0.8);

      const voice = { oscillator, gain: voiceGain };
      activeVoices.add(voice);
      oscillator.onended = () => {
        voiceGain.disconnect();
        oscillator.disconnect();
        activeVoices.delete(voice);
      };
    });

    cellIndex += 1;
  };

  const scheduler = () => {
    if (!isRunning) {
      return;
    }

    while (nextEventTime < context.currentTime + scheduleAheadTime) {
      triggerCell(nextEventTime);
      const interval = Math.max(0.45, baseInterval / Math.max(0.1, density));
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
      cellIndex = 0;
      nextEventTime = context.currentTime + 0.1;

      output.gain.cancelScheduledValues(context.currentTime);
      output.gain.setValueAtTime(output.gain.value, context.currentTime);
      output.gain.linearRampToValueAtTime(0.65, context.currentTime + 1.6);

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
      output.gain.linearRampToValueAtTime(0.0001, now + 1.2);

      activeVoices.forEach((voice) => {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0.0001, now + 0.6);
        try {
          voice.oscillator.stop(now + 0.8);
        } catch (error) {
          // Oscillator may already be stopped.
        }
      });

      activeVoices.clear();
    },
  };
}
