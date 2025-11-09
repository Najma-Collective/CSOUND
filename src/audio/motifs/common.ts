import { getAudioContext, getMasterGain } from "../context";

export type DelaySettings = {
  time?: number;
  feedback?: number;
  mix?: number;
};

export type MotifHandle = {
  start: () => void;
  stop: () => void;
  output: GainNode;
};

export type MotifIO = {
  context: AudioContext;
  stageGain: GainNode;
  output: GainNode;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function createMotifIO(delay?: DelaySettings): MotifIO {
  const context = getAudioContext();
  const output = context.createGain();
  output.gain.value = 0;

  const stageGain = context.createGain();
  stageGain.gain.value = 1;

  applyDelayNetwork(context, stageGain, output, delay);
  output.connect(getMasterGain());

  return { context, stageGain, output };
}

export function applyDelayNetwork(
  context: AudioContext,
  source: AudioNode,
  destination: AudioNode,
  settings?: DelaySettings,
): void {
  if (!settings) {
    source.connect(destination);
    return;
  }

  const delayNode = context.createDelay(3);
  delayNode.delayTime.value = clamp(settings.time ?? 0.25, 0.01, 3);

  const feedbackGain = context.createGain();
  feedbackGain.gain.value = clamp(settings.feedback ?? 0.35, 0, 0.95);

  const wetGain = context.createGain();
  wetGain.gain.value = clamp(settings.mix ?? 0.35, 0, 1);

  const dryGain = context.createGain();
  dryGain.gain.value = 1 - wetGain.gain.value;

  source.connect(dryGain);
  dryGain.connect(destination);

  source.connect(delayNode);
  delayNode.connect(wetGain);
  wetGain.connect(destination);

  delayNode.connect(feedbackGain);
  feedbackGain.connect(delayNode);
}
