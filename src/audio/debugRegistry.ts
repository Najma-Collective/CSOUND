export interface SpatialEmitterEntry {
  id: string;
  panner: PannerNode;
}

type SpatialListener = (entries: SpatialEmitterEntry[]) => void;

const spatialEmitters = new Map<string, SpatialEmitterEntry>();
const listeners = new Set<SpatialListener>();

function notifyListeners(): void {
  const snapshot = Array.from(spatialEmitters.values());
  listeners.forEach((listener) => listener(snapshot));
}

export function registerSpatialEmitter(id: string, panner: PannerNode): () => void {
  spatialEmitters.set(id, { id, panner });
  notifyListeners();
  return () => {
    spatialEmitters.delete(id);
    notifyListeners();
  };
}

export function subscribeSpatialEmitters(listener: SpatialListener): () => void {
  listeners.add(listener);
  listener(Array.from(spatialEmitters.values()));
  return () => {
    listeners.delete(listener);
  };
}

export function getSpatialEmittersSnapshot(): SpatialEmitterEntry[] {
  return Array.from(spatialEmitters.values());
}
