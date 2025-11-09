import { MathUtils } from "three";

export type InteractionConfig = {
  flora: {
    hoverRadius: number;
    bloomCooldownMs: number;
    hoverEase: number;
    motifFadeSeconds: number;
  };
  fauna: {
    dragRadius: number;
    directionSmoothing: number;
    motifIntensityRange: [number, number];
    motifRampSeconds: number;
    maxDragDelta: number;
    cooldownMs: number;
  };
  background: {
    dragEasing: number;
    hueShiftRange: [number, number];
    saturationRange: [number, number];
    lightnessRange: [number, number];
    audioFrequencyRange: [number, number];
    audioQRange: [number, number];
    cooldownMs: number;
  };
  pointer: {
    smoothing: number;
    idleCooldownMs: number;
  };
};

const defaultConfig: InteractionConfig = {
  flora: {
    hoverRadius: 1.9,
    bloomCooldownMs: 1800,
    hoverEase: 0.18,
    motifFadeSeconds: 1.5,
  },
  fauna: {
    dragRadius: 2.4,
    directionSmoothing: 0.16,
    motifIntensityRange: [0.35, 1.05],
    motifRampSeconds: 1.3,
    maxDragDelta: 2.2,
    cooldownMs: 160,
  },
  background: {
    dragEasing: 0.12,
    hueShiftRange: [-0.085, 0.085],
    saturationRange: [-0.12, 0.1],
    lightnessRange: [-0.07, 0.08],
    audioFrequencyRange: [520, 2600],
    audioQRange: [0.6, 1.4],
    cooldownMs: 180,
  },
  pointer: {
    smoothing: 0.22,
    idleCooldownMs: 420,
  },
};

let activeConfig: InteractionConfig = cloneConfig(defaultConfig);

function cloneConfig(config: InteractionConfig): InteractionConfig {
  return JSON.parse(JSON.stringify(config)) as InteractionConfig;
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<unknown>
    ? T[K]
    : T[K] extends object
    ? DeepPartial<T[K]>
    : T[K];
};

function mergeConfig<T extends Record<string, unknown>>(
  target: T,
  source: DeepPartial<T>,
): T {
  Object.entries(source).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    const targetValue = target[key as keyof T];
    if (
      targetValue &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue) &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      target[key as keyof T] = mergeConfig(
        { ...(targetValue as Record<string, unknown>) },
        value as Record<string, unknown>,
      ) as T[keyof T];
    } else {
      target[key as keyof T] = value as T[keyof T];
    }
  });

  return target;
}

export function getInteractionConfig(): InteractionConfig {
  return activeConfig;
}

export function updateInteractionConfig(
  overrides: DeepPartial<InteractionConfig>,
): InteractionConfig {
  activeConfig = mergeConfig({ ...activeConfig }, overrides);
  return activeConfig;
}

export function resetInteractionConfig(): InteractionConfig {
  activeConfig = cloneConfig(defaultConfig);
  return activeConfig;
}

export function clampInteractionValue(
  value: number,
  [min, max]: [number, number],
): number {
  return MathUtils.clamp(value, min, max);
}

