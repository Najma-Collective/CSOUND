import { captureAnalyserSnapshot } from "./analysis";
import { getSpatialEmittersSnapshot, registerSpatialEmitter, subscribeSpatialEmitters } from "./debugRegistry";

export interface AudioDebugOverlayOptions {
  parent?: HTMLElement;
  refreshIntervalMs?: number;
}

interface OverlayState {
  container: HTMLDivElement;
  canvas: HTMLCanvasElement;
  stereoLabel: HTMLDivElement;
  spatialList: HTMLUListElement;
  rafId: number | null;
  unsubscribeSpatial: (() => void) | null;
  refreshInterval: number;
  lastFrameTime: number;
}

let overlayState: OverlayState | null = null;
let spatialEmitterCounter = 0;

function getRootDocument(): Document | null {
  if (typeof document === "undefined") {
    return null;
  }
  return document;
}

function ensureCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  return context;
}

function drawFrequencyData(ctx: CanvasRenderingContext2D, frequency: Float32Array): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const barWidth = ctx.canvas.width / frequency.length;
  frequency.forEach((value, index) => {
    const normalized = Math.max(-100, Math.min(0, value));
    const magnitude = ((normalized + 100) / 100) * ctx.canvas.height;
    const x = index * barWidth;
    ctx.fillStyle = "rgba(0, 200, 255, 0.8)";
    ctx.fillRect(x, ctx.canvas.height - magnitude, barWidth * 0.9, magnitude);
  });
}

function computeStereoBalance(timeDomain: Uint8Array): { left: number; right: number } {
  const midpoint = timeDomain.length / 2;
  let left = 0;
  let right = 0;
  for (let i = 0; i < timeDomain.length; i += 1) {
    const sample = (timeDomain[i] - 128) / 128;
    const power = sample * sample;
    if (i < midpoint) {
      left += power;
    } else {
      right += power;
    }
  }
  const leftAvg = Math.sqrt(left / midpoint);
  const rightAvg = Math.sqrt(right / midpoint);
  return { left: leftAvg, right: rightAvg };
}

function formatStereoLabel(left: number, right: number): string {
  const balance = right === 0 ? 0 : 20 * Math.log10(left / right);
  const clamped = Math.max(-24, Math.min(24, balance));
  const direction = clamped > 1 ? "L" : clamped < -1 ? "R" : "C";
  return `Stereo Balance: ${direction} (${left.toFixed(2)} : ${right.toFixed(2)})`;
}

function updateSpatialList(list: HTMLUListElement): void {
  const emitters = getSpatialEmittersSnapshot();
  list.innerHTML = "";
  emitters.forEach((entry) => {
    const item = document.createElement("li");
    const px = (entry.panner.positionX as unknown as { value: number }).value;
    const py = (entry.panner.positionY as unknown as { value: number }).value;
    const pz = (entry.panner.positionZ as unknown as { value: number }).value;
    item.textContent = `${entry.id}: (${px.toFixed(2)}, ${py.toFixed(2)}, ${pz.toFixed(2)})`;
    list.appendChild(item);
  });
}

function updateOverlay(): void {
  if (!overlayState) {
    return;
  }

  const documentRef = getRootDocument();
  if (!documentRef) {
    return;
  }

  const now = performance.now();
  if (now - overlayState.lastFrameTime < overlayState.refreshInterval) {
    overlayState.rafId = window.requestAnimationFrame(updateOverlay);
    return;
  }
  overlayState.lastFrameTime = now;

  const snapshot = captureAnalyserSnapshot();
  const ctx = ensureCanvasContext(overlayState.canvas);
  if (ctx) {
    drawFrequencyData(ctx, snapshot.post.frequency);
  }
  const stereo = computeStereoBalance(snapshot.post.timeDomain);
  overlayState.stereoLabel.textContent = formatStereoLabel(stereo.left, stereo.right);
  updateSpatialList(overlayState.spatialList);

  overlayState.rafId = window.requestAnimationFrame(updateOverlay);
}

function createOverlayElements(options: AudioDebugOverlayOptions): OverlayState | null {
  const documentRef = getRootDocument();
  if (!documentRef) {
    return null;
  }

  const container = documentRef.createElement("div");
  container.id = "audio-debug-overlay";
  container.style.position = "fixed";
  container.style.right = "16px";
  container.style.bottom = "16px";
  container.style.width = "320px";
  container.style.padding = "12px";
  container.style.background = "rgba(10, 10, 10, 0.85)";
  container.style.color = "#fff";
  container.style.fontFamily = "monospace";
  container.style.fontSize = "12px";
  container.style.borderRadius = "8px";
  container.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.4)";
  container.style.zIndex = "10000";

  const title = documentRef.createElement("div");
  title.textContent = "Audio Debug Overlay";
  title.style.fontWeight = "bold";
  title.style.marginBottom = "8px";
  container.appendChild(title);

  const canvas = documentRef.createElement("canvas");
  canvas.width = 300;
  canvas.height = 120;
  canvas.style.width = "100%";
  canvas.style.height = "120px";
  canvas.style.background = "rgba(255, 255, 255, 0.05)";
  canvas.style.borderRadius = "4px";
  container.appendChild(canvas);

  const stereoLabel = documentRef.createElement("div");
  stereoLabel.style.marginTop = "8px";
  stereoLabel.textContent = "Stereo Balance: C (0.00 : 0.00)";
  container.appendChild(stereoLabel);

  const spatialHeader = documentRef.createElement("div");
  spatialHeader.textContent = "Spatial Emitters";
  spatialHeader.style.marginTop = "8px";
  spatialHeader.style.fontWeight = "bold";
  container.appendChild(spatialHeader);

  const spatialList = documentRef.createElement("ul");
  spatialList.style.listStyle = "none";
  spatialList.style.padding = "0";
  spatialList.style.margin = "4px 0 0";
  spatialList.style.maxHeight = "120px";
  spatialList.style.overflowY = "auto";
  container.appendChild(spatialList);

  const parent = options.parent ?? documentRef.body;
  parent.appendChild(container);

  return {
    container,
    canvas,
    stereoLabel,
    spatialList,
    rafId: null,
    unsubscribeSpatial: null,
    refreshInterval: Math.max(16, options.refreshIntervalMs ?? 250),
    lastFrameTime: 0,
  };
}

export function enableAudioDebugOverlay(options: AudioDebugOverlayOptions = {}): () => void {
  if (overlayState) {
    return () => disableAudioDebugOverlay();
  }

  const state = createOverlayElements(options);
  if (!state) {
    return () => undefined;
  }

  overlayState = state;
  overlayState.unsubscribeSpatial = subscribeSpatialEmitters(() => {
    if (!overlayState) {
      return;
    }
    updateSpatialList(overlayState.spatialList);
  });
  overlayState.rafId = window.requestAnimationFrame(updateOverlay);

  return () => disableAudioDebugOverlay();
}

export function disableAudioDebugOverlay(): void {
  if (!overlayState) {
    return;
  }
  if (overlayState.rafId !== null) {
    window.cancelAnimationFrame(overlayState.rafId);
  }
  overlayState.unsubscribeSpatial?.();
  overlayState.container.remove();
  overlayState = null;
}

export function registerDebugSpatialEmitter(panner: PannerNode, explicitId?: string): () => void {
  spatialEmitterCounter += 1;
  const id = explicitId ?? `spatial-${spatialEmitterCounter}`;
  return registerSpatialEmitter(id, panner);
}
