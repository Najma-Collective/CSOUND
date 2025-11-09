import { getAudioContext, getMasterGain } from "../audio/context";

export interface EnvironmentalStateConfig {
  id: string;
  gain: GainNode;
  baseGain?: number;
  connectToMaster?: boolean;
}

export type CrossfadeCurve = "linear" | "constant-power";

export interface EnvironmentalMixOptions {
  headroomDb?: number;
  defaultDuration?: number;
  curve?: CrossfadeCurve;
  context?: AudioContext;
}

export interface TransitionOptions {
  duration?: number;
  curve?: CrossfadeCurve;
  fromStateId?: string | null;
}

interface InternalState {
  gain: GainNode;
  baseGain: number;
}

function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}

function createCurve(
  samples: number,
  generator: (t: number) => number,
  scale: number,
): Float32Array {
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const t = samples === 1 ? 1 : i / (samples - 1);
    curve[i] = generator(t) * scale;
  }
  return curve;
}

function getWeights(curve: CrossfadeCurve, t: number): { from: number; to: number } {
  if (curve === "constant-power") {
    return {
      from: Math.cos((t * Math.PI) / 2),
      to: Math.sin((t * Math.PI) / 2),
    };
  }

  return {
    from: 1 - t,
    to: t,
  };
}

export class EnvironmentalCrossfader {
  private readonly context: AudioContext;

  private readonly states = new Map<string, InternalState>();

  private readonly headroom: number;

  private readonly defaultDuration: number;

  private readonly defaultCurve: CrossfadeCurve;

  private activeStateId: string | null = null;

  constructor(states: EnvironmentalStateConfig[], options: EnvironmentalMixOptions = {}) {
    this.context = options.context ?? getAudioContext();
    const headroomDb = options.headroomDb ?? 6;
    this.headroom = dbToLinear(-Math.abs(headroomDb));
    this.defaultDuration = options.defaultDuration ?? 3;
    this.defaultCurve = options.curve ?? "constant-power";

    states.forEach((state) => {
      this.addState(state);
    });
  }

  addState(state: EnvironmentalStateConfig): void {
    const baseGain = Math.max(0, state.baseGain ?? 1);
    if (state.connectToMaster !== false) {
      state.gain.connect(getMasterGain());
    }
    this.states.set(state.id, { gain: state.gain, baseGain });
    state.gain.gain.setValueAtTime(0, this.context.currentTime);
  }

  removeState(stateId: string): void {
    const entry = this.states.get(stateId);
    if (!entry) {
      return;
    }
    entry.gain.disconnect();
    this.states.delete(stateId);
    if (this.activeStateId === stateId) {
      this.activeStateId = null;
    }
  }

  getActiveState(): string | null {
    return this.activeStateId;
  }

  transitionTo(stateId: string, options: TransitionOptions = {}): { startTime: number; endTime: number } {
    const target = this.states.get(stateId);
    if (!target) {
      throw new Error(`Unknown environmental state: ${stateId}`);
    }

    const duration = options.duration ?? this.defaultDuration;
    const curve = options.curve ?? this.defaultCurve;
    const fromId = options.fromStateId ?? this.activeStateId;
    const fromState = fromId ? this.states.get(fromId) ?? null : null;
    const startTime = this.context.currentTime;
    const endTime = startTime + Math.max(0, duration);
    const sampleCount = duration > 0 ? Math.max(4, Math.ceil(duration / 0.02)) : 2;

    this.states.forEach((state, id) => {
      state.gain.gain.cancelScheduledValues(startTime);
      if (id !== stateId && id !== fromId) {
        state.gain.gain.setValueAtTime(0, startTime);
      }
    });

    if (duration <= 0) {
      if (fromState && fromId !== stateId) {
        fromState.gain.gain.setValueAtTime(0, startTime);
      }
      target.gain.gain.setValueAtTime(target.baseGain * this.headroom, startTime);
      this.activeStateId = stateId;
      return { startTime, endTime: startTime };
    }

    const targetCurve = createCurve(
      sampleCount,
      (t) => getWeights(curve, t).to,
      target.baseGain * this.headroom,
    );
    target.gain.gain.setValueCurveAtTime(targetCurve, startTime, duration);

    if (fromState && fromId !== stateId) {
      const fromCurve = createCurve(
        sampleCount,
        (t) => getWeights(curve, t).from,
        fromState.baseGain * this.headroom,
      );
      fromState.gain.gain.setValueCurveAtTime(fromCurve, startTime, duration);
      fromState.gain.gain.setValueAtTime(0, endTime);
    }

    this.states.forEach((state, id) => {
      if (id !== stateId && id !== fromId) {
        state.gain.gain.setValueAtTime(0, startTime);
      }
    });

    this.activeStateId = stateId;
    return { startTime, endTime };
  }

  setImmediate(stateId: string): void {
    this.transitionTo(stateId, { duration: 0 });
  }
}

export function createEnvironmentalCrossfader(
  states: EnvironmentalStateConfig[],
  options: EnvironmentalMixOptions = {},
): EnvironmentalCrossfader {
  return new EnvironmentalCrossfader(states, options);
}

