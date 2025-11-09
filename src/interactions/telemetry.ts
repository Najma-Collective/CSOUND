export type TelemetryEnvironment = "staging" | "production";

type TelemetryAttributeValue = string | number | boolean | null;

export interface TelemetryEvent {
  name: TelemetryEventName;
  attributes?: Record<string, TelemetryAttributeValue>;
}

export type TelemetryEventName =
  | "session_start"
  | "flora_bloom"
  | "fauna_drag"
  | "background_shift"
  | "motif_started";

export interface TelemetryConfig {
  endpoint: string;
  environment: TelemetryEnvironment;
  sampleRate: number;
  debug?: boolean;
}

interface ImportMetaWithEnv extends ImportMeta {
  env?: Record<string, string | undefined>;
}

function resolveEnvironment(): TelemetryEnvironment {
  const importMetaEnv = (import.meta as ImportMetaWithEnv).env ?? {};
  const raw =
    importMetaEnv.CSOUND_ENVIRONMENT ??
    (typeof process !== "undefined" ? process.env?.CSOUND_ENVIRONMENT : undefined) ??
    "staging";
  const normalized = raw.toLowerCase();
  return normalized === "production" ? "production" : "staging";
}

function resolveEndpoint(): string {
  const importMetaEnv = (import.meta as ImportMetaWithEnv).env ?? {};
  return (
    importMetaEnv.CSOUND_TELEMETRY_ENDPOINT ??
    (typeof process !== "undefined" ? process.env?.CSOUND_TELEMETRY_ENDPOINT : undefined) ??
    ""
  );
}

function resolveSampleRate(): number {
  const importMetaEnv = (import.meta as ImportMetaWithEnv).env ?? {};
  const raw =
    importMetaEnv.CSOUND_TELEMETRY_SAMPLE_RATE ??
    (typeof process !== "undefined" ? process.env?.CSOUND_TELEMETRY_SAMPLE_RATE : undefined);
  if (!raw) return 1;
  const parsed = Number.parseFloat(raw);
  if (Number.isNaN(parsed)) return 1;
  return Math.min(Math.max(parsed, 0), 1);
}

const sessionId = (() => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
})();

const state: TelemetryConfig = {
  endpoint: resolveEndpoint(),
  environment: resolveEnvironment(),
  sampleRate: resolveSampleRate(),
  debug: false,
};

export function configureTelemetry(partial: Partial<TelemetryConfig>): void {
  if (partial.endpoint !== undefined) {
    state.endpoint = partial.endpoint;
  }
  if (partial.environment !== undefined) {
    state.environment = partial.environment;
  }
  if (partial.sampleRate !== undefined) {
    state.sampleRate = Math.min(Math.max(partial.sampleRate, 0), 1);
  }
  if (partial.debug !== undefined) {
    state.debug = partial.debug;
  }
}

export function getTelemetryConfig(): TelemetryConfig {
  return { ...state };
}

function shouldSample(): boolean {
  if (state.sampleRate >= 1) {
    return true;
  }
  return Math.random() <= state.sampleRate;
}

async function dispatch(event: TelemetryEvent): Promise<void> {
  if (!state.endpoint) {
    if (state.debug) {
      // eslint-disable-next-line no-console
      console.debug("[telemetry] Endpoint not configured, skipping", event);
    }
    return;
  }

  const payload = {
    sessionId,
    environment: state.environment,
    timestamp: new Date().toISOString(),
    name: event.name,
    attributes: event.attributes ?? {},
  };
  const body = JSON.stringify(payload);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const sent = navigator.sendBeacon(state.endpoint, body);
    if (!sent && state.debug) {
      // eslint-disable-next-line no-console
      console.debug("[telemetry] navigator.sendBeacon rejected payload", payload);
    }
    return;
  }

  if (typeof fetch !== "undefined") {
    try {
      await fetch(state.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body,
        keepalive: true,
      });
    } catch (error) {
      if (state.debug) {
        // eslint-disable-next-line no-console
        console.debug("[telemetry] fetch failed", error);
      }
    }
  }
}

export function emitTelemetryEvent(event: TelemetryEvent): void {
  if (!shouldSample()) {
    return;
  }

  if (state.debug) {
    // eslint-disable-next-line no-console
    console.debug("[telemetry]", event.name, event.attributes ?? {});
  }

  void dispatch(event);
}
