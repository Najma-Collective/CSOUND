import { getAudioContext } from "../audio/context";

export type Vec3 = [number, number, number];

export interface TransformUpdate {
  position: Vec3;
  forward?: Vec3;
  up?: Vec3;
  velocity?: Vec3;
  timestamp?: number;
}

export interface TransformEvent {
  entityId: string;
  transform: TransformUpdate;
}

export type TransformEventListener = (event: TransformEvent) => void;

export interface TransformEventSource {
  subscribe(listener: TransformEventListener): () => void;
}

export interface SynchronizationOptions {
  /**
   * Time constant (in seconds) used for exponential smoothing when interpolating
   * between transform updates. Smaller values follow target positions more closely.
   */
  smoothingTimeConstant?: number;
  /**
   * Maximum allowed velocity magnitude (in world units per second) used when
   * clamping doppler-inducing movement. Values above this threshold are
   * softened to avoid excessively large doppler shifts that can lead to
   * unnatural pitch warping.
   */
  maxDopplerVelocity?: number;
  /**
   * Amount of scheduling look-ahead (in seconds) applied when writing to
   * `AudioParam` values. Helps keep the Web Audio graph in lockstep with the
   * render loop.
   */
  lookAheadSeconds?: number;
}

interface EntityState {
  panner: PannerNode;
  targetPosition: Vec3;
  smoothedPosition: Vec3;
  targetForward: Vec3 | null;
  smoothedForward: Vec3 | null;
  targetUp: Vec3 | null;
  smoothedUp: Vec3 | null;
  velocity: Vec3 | null;
  lastUpdateTime: number;
  lastStepTime: number;
  smoothingTimeConstant: number;
  maxDopplerVelocity: number;
  lookAheadSeconds: number;
}

const DEFAULT_SMOOTHING = 0.12;
const DEFAULT_MAX_DOPPLER = 32;
const DEFAULT_LOOKAHEAD = 0.02;

function now(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function cloneVec3(vec: Vec3): Vec3 {
  return [vec[0], vec[1], vec[2]];
}

function length(vec: Vec3): number {
  return Math.hypot(vec[0], vec[1], vec[2]);
}

function scale(vec: Vec3, scalar: number): Vec3 {
  return [vec[0] * scalar, vec[1] * scalar, vec[2] * scalar];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function normalize(vec: Vec3): Vec3 {
  const len = length(vec);
  if (len === 0) {
    return [0, 0, 0];
  }
  return scale(vec, 1 / len);
}

function smoothValue(current: number, target: number, alpha: number): number {
  return current + (target - current) * alpha;
}

function smoothVec(current: Vec3, target: Vec3, alpha: number): Vec3 {
  return [
    smoothValue(current[0], target[0], alpha),
    smoothValue(current[1], target[1], alpha),
    smoothValue(current[2], target[2], alpha),
  ];
}

function clampVelocity(delta: Vec3, dtSeconds: number, maxVelocity: number): {
  velocity: Vec3;
  clampedDelta: Vec3;
} {
  if (dtSeconds <= 0) {
    return { velocity: [0, 0, 0], clampedDelta: [0, 0, 0] };
  }

  const rawVelocity = scale(delta, 1 / dtSeconds);
  const speed = length(rawVelocity);
  if (speed === 0 || speed <= maxVelocity) {
    return { velocity: rawVelocity, clampedDelta: delta };
  }

  const limitedVelocity = scale(rawVelocity, maxVelocity / speed);
  return { velocity: limitedVelocity, clampedDelta: scale(limitedVelocity, dtSeconds) };
}

export class SpatialSynchronizationSystem {
  private readonly context: AudioContext;

  private readonly entities = new Map<string, EntityState>();

  constructor(context: AudioContext = getAudioContext()) {
    this.context = context;
  }

  registerEntity(entityId: string, panner: PannerNode, options: SynchronizationOptions = {}): void {
    const smoothingTimeConstant = options.smoothingTimeConstant ?? DEFAULT_SMOOTHING;
    const maxDopplerVelocity = Math.max(0, options.maxDopplerVelocity ?? DEFAULT_MAX_DOPPLER);
    const lookAheadSeconds = Math.max(0, options.lookAheadSeconds ?? DEFAULT_LOOKAHEAD);
    const currentTime = now();

    const defaultPosition: Vec3 = [
      panner.positionX.value,
      panner.positionY.value,
      panner.positionZ.value,
    ];

    const state: EntityState = {
      panner,
      targetPosition: cloneVec3(defaultPosition),
      smoothedPosition: cloneVec3(defaultPosition),
      targetForward: null,
      smoothedForward: null,
      targetUp: null,
      smoothedUp: null,
      velocity: null,
      lastUpdateTime: currentTime,
      lastStepTime: currentTime,
      smoothingTimeConstant,
      maxDopplerVelocity,
      lookAheadSeconds,
    };

    this.entities.set(entityId, state);
  }

  unregisterEntity(entityId: string): void {
    this.entities.delete(entityId);
  }

  updateEntityTransform(entityId: string, transform: TransformUpdate): void {
    const state = this.entities.get(entityId);
    if (!state) {
      return;
    }

    const timestamp = transform.timestamp ?? now();
    const dtSeconds = (timestamp - state.lastUpdateTime) / 1000;

    if (dtSeconds > 0) {
      const delta = subtract(transform.position, state.targetPosition);
      const { velocity, clampedDelta } = clampVelocity(delta, dtSeconds, state.maxDopplerVelocity);
      state.velocity = transform.velocity ?? velocity;
      state.targetPosition = add(state.targetPosition, clampedDelta);
    } else {
      state.targetPosition = cloneVec3(transform.position);
      if (transform.velocity) {
        state.velocity = cloneVec3(transform.velocity);
      }
    }

    if (transform.forward) {
      state.targetForward = normalize(transform.forward);
      if (!state.smoothedForward) {
        state.smoothedForward = cloneVec3(state.targetForward);
      }
    }

    if (transform.up) {
      state.targetUp = normalize(transform.up);
      if (!state.smoothedUp) {
        state.smoothedUp = cloneVec3(state.targetUp);
      }
    }

    state.lastUpdateTime = timestamp;
  }

  step(frameTime?: number): void {
    const timestamp = frameTime ?? now();

    this.entities.forEach((state) => {
      const deltaSeconds = (timestamp - state.lastStepTime) / 1000;
      const alpha = state.smoothingTimeConstant <= 0
        ? 1
        : 1 - Math.exp(-deltaSeconds / state.smoothingTimeConstant);

      state.smoothedPosition = smoothVec(state.smoothedPosition, state.targetPosition, alpha);

      const audioTime = this.context.currentTime + state.lookAheadSeconds;
      state.panner.positionX.cancelScheduledValues(audioTime);
      state.panner.positionY.cancelScheduledValues(audioTime);
      state.panner.positionZ.cancelScheduledValues(audioTime);
      state.panner.positionX.setValueAtTime(state.smoothedPosition[0], audioTime);
      state.panner.positionY.setValueAtTime(state.smoothedPosition[1], audioTime);
      state.panner.positionZ.setValueAtTime(state.smoothedPosition[2], audioTime);

      if (state.targetForward && state.smoothedForward) {
        state.smoothedForward = smoothVec(state.smoothedForward, state.targetForward, alpha);
        state.panner.orientationX.setValueAtTime(state.smoothedForward[0], audioTime);
        state.panner.orientationY.setValueAtTime(state.smoothedForward[1], audioTime);
        state.panner.orientationZ.setValueAtTime(state.smoothedForward[2], audioTime);
      }

      if (state.targetUp && state.smoothedUp && "orientationY" in state.panner) {
        state.smoothedUp = smoothVec(state.smoothedUp, state.targetUp, alpha);
        if ((state.panner as unknown as { upX?: AudioParam }).upX) {
          const typed = state.panner as unknown as { upX: AudioParam; upY: AudioParam; upZ: AudioParam };
          typed.upX.setValueAtTime(state.smoothedUp[0], audioTime);
          typed.upY.setValueAtTime(state.smoothedUp[1], audioTime);
          typed.upZ.setValueAtTime(state.smoothedUp[2], audioTime);
        }
      }

      if (state.velocity) {
        const velocity = state.velocity;
        const speed = length(velocity);
        if (speed > state.maxDopplerVelocity) {
          const scaled = scale(velocity, state.maxDopplerVelocity / speed);
          state.velocity = scaled;
        }

        const pannerAny = state.panner as unknown as { setVelocity?: (x: number, y: number, z: number) => void };
        if (typeof pannerAny.setVelocity === "function") {
          pannerAny.setVelocity(state.velocity[0], state.velocity[1], state.velocity[2]);
        }
      }

      state.lastStepTime = timestamp;
    });
  }

  connectSource(source: TransformEventSource): () => void {
    const listener: TransformEventListener = ({ entityId, transform }) => {
      this.updateEntityTransform(entityId, transform);
    };

    return source.subscribe(listener);
  }
}

export function wireTransformStream(
  source: TransformEventSource,
  system: SpatialSynchronizationSystem,
): () => void {
  return system.connectSource(source);
}

