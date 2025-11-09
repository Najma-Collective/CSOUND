import { getAudioContext, getBackgroundFilter } from "../audio/context";

export type TimelineEvent =
  | "onStart"
  | "onUpdate"
  | "onRepeat"
  | "onComplete"
  | "onReverseComplete";

export type TimelineCallback = (...args: unknown[]) => void;

export interface TimelineLike {
  progress?: () => number;
  totalDuration?: () => number;
  time?: () => number;
  eventCallback: (
    event: TimelineEvent,
    callback?: TimelineCallback | null,
    params?: unknown[],
    scope?: unknown,
  ) => TimelineCallback | undefined;
}

export type EasingFunction = (value: number) => number;

export interface AutomationDefinition {
  param: AudioParam;
  mapValue: (progress: number) => number;
  min?: number;
  max?: number;
  smoothingTime?: number;
}

export interface TimelineAudioOptions {
  lookAheadSeconds?: number;
  clock?: AudioContext;
}

const DEFAULT_LOOKAHEAD = 0.02;
const DEFAULT_EVENTS: TimelineEvent[] = [
  "onStart",
  "onUpdate",
  "onRepeat",
  "onComplete",
  "onReverseComplete",
];

function clamp(value: number, min?: number, max?: number): number {
  let result = value;
  if (typeof min === "number") {
    result = Math.max(min, result);
  }
  if (typeof max === "number") {
    result = Math.min(max, result);
  }
  return result;
}

function getProgress(timeline: TimelineLike): number {
  if (typeof timeline.progress === "function") {
    const value = timeline.progress();
    if (typeof value === "number" && Number.isFinite(value)) {
      return clamp(value, 0, 1);
    }
  }

  const totalDuration = timeline.totalDuration?.();
  const currentTime = timeline.time?.();
  if (
    typeof totalDuration === "number"
    && totalDuration > 0
    && typeof currentTime === "number"
    && Number.isFinite(currentTime)
  ) {
    return clamp(currentTime / totalDuration, 0, 1);
  }

  return 0;
}

function interceptTimeline(
  timeline: TimelineLike,
  events: TimelineEvent[],
  handler: () => void,
): () => void {
  const teardownCallbacks: Array<() => void> = [];

  events.forEach((event) => {
    const previous = timeline.eventCallback(event);
    const wrapped: TimelineCallback = (...args: unknown[]) => {
      handler();
      if (typeof previous === "function") {
        previous.apply(timeline, args);
      }
    };
    timeline.eventCallback(event, wrapped);
    teardownCallbacks.push(() => {
      timeline.eventCallback(event, previous ?? null);
    });
  });

  return () => {
    teardownCallbacks.forEach((teardown) => teardown());
  };
}

export function bindTimelineToAudio(
  timeline: TimelineLike,
  automations: AutomationDefinition[],
  options: TimelineAudioOptions = {},
): () => void {
  const context = options.clock ?? getAudioContext();
  const lookAheadSeconds = options.lookAheadSeconds ?? DEFAULT_LOOKAHEAD;

  const apply = () => {
    const progress = getProgress(timeline);
    const audioTime = context.currentTime + lookAheadSeconds;

    automations.forEach((automation) => {
      const value = clamp(automation.mapValue(progress), automation.min, automation.max);
      const smoothing = automation.smoothingTime ?? 0;
      const param = automation.param;

      param.cancelScheduledValues(audioTime);
      if (smoothing > 0) {
        param.linearRampToValueAtTime(value, audioTime + smoothing);
      } else {
        param.setValueAtTime(value, audioTime);
      }
    });
  };

  const teardown = interceptTimeline(timeline, DEFAULT_EVENTS, apply);
  apply();
  return teardown;
}

export interface FilterSweepConfig {
  minFrequency: number;
  maxFrequency: number;
  easing?: EasingFunction;
  smoothingTime?: number;
}

export function createFilterSweepAutomation(
  filter: BiquadFilterNode = getBackgroundFilter(),
  config: FilterSweepConfig,
): AutomationDefinition {
  const easing = config.easing ?? ((value: number) => value);
  const minFreq = Math.max(0, config.minFrequency);
  const maxFreq = Math.max(minFreq, config.maxFrequency);

  return {
    param: filter.frequency,
    min: minFreq,
    max: maxFreq,
    smoothingTime: config.smoothingTime,
    mapValue: (progress: number) => {
      const eased = clamp(easing(progress), 0, 1);
      const logMin = Math.log10(minFreq || 1);
      const logMax = Math.log10(maxFreq || 1);
      const value = logMin + (logMax - logMin) * eased;
      return 10 ** value;
    },
  };
}

export interface ReverbMixConfig {
  dryGain?: GainNode;
  wetGain: GainNode;
  easing?: EasingFunction;
  smoothingTime?: number;
  maintainEnergy?: boolean;
}

export function createReverbMixAutomations(
  config: ReverbMixConfig,
): AutomationDefinition[] {
  const easing = config.easing ?? ((value: number) => value);
  const smoothing = config.smoothingTime;
  const maintainEnergy = config.maintainEnergy ?? true;

  const wetAutomation: AutomationDefinition = {
    param: config.wetGain.gain,
    min: 0,
    max: 1,
    smoothingTime: smoothing,
    mapValue: (progress: number) => clamp(easing(progress), 0, 1),
  };

  if (!config.dryGain) {
    return [wetAutomation];
  }

  const dryAutomation: AutomationDefinition = {
    param: config.dryGain.gain,
    min: 0,
    max: 1,
    smoothingTime: smoothing,
    mapValue: (progress: number) => {
      const wet = clamp(easing(progress), 0, 1);
      if (!maintainEnergy) {
        return 1 - wet;
      }
      // Constant power crossfade keeps overall perceived loudness stable.
      const angle = (1 - wet) * (Math.PI / 2);
      return Math.cos(angle);
    },
  };

  return [wetAutomation, dryAutomation];
}

export function bindPaletteAndAudio(
  timeline: TimelineLike,
  filterConfig: FilterSweepConfig,
  reverbConfig: ReverbMixConfig,
  options: TimelineAudioOptions = {},
): () => void {
  const automations: AutomationDefinition[] = [
    createFilterSweepAutomation(undefined, filterConfig),
    ...createReverbMixAutomations(reverbConfig),
  ];

  return bindTimelineToAudio(timeline, automations, options);
}

