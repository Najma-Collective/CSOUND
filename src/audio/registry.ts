// A lightweight type alias to represent audio disposables.
type Disposable = () => void;

type RegistryEntry = {
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
  disposables: Disposable[];
};

const registry = new Map<string, RegistryEntry>();

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function disconnectNode(node: AudioNode): void {
  try {
    node.disconnect();
  } catch (error) {
    // Some nodes may already be disconnected. Ignore errors silently.
  }
}

function stopSource(source: AudioScheduledSourceNode): void {
  try {
    source.stop();
  } catch (error) {
    // Ignore double stop attempts.
  }
  disconnectNode(source);
}

export type RegisterAudioEntityOptions = {
  nodes?: AudioNode | AudioNode[];
  sources?: AudioScheduledSourceNode | AudioScheduledSourceNode[];
  disposables?: Disposable | Disposable[];
};

export function registerAudioEntity(entityId: string, options: RegisterAudioEntityOptions): void {
  const entry = registry.get(entityId) ?? { nodes: [], sources: [], disposables: [] };
  entry.nodes.push(...toArray(options.nodes));
  entry.sources.push(...toArray(options.sources));
  entry.disposables.push(...toArray(options.disposables));
  registry.set(entityId, entry);
}

export function getRegisteredEntityIds(): string[] {
  return Array.from(registry.keys());
}

export function disposeAudioEntity(entityId: string): void {
  const entry = registry.get(entityId);
  if (!entry) {
    return;
  }

  entry.sources.forEach(stopSource);
  entry.nodes.forEach(disconnectNode);
  entry.disposables.forEach((dispose) => {
    try {
      dispose();
    } catch (error) {
      // Swallow errors to avoid breaking cleanup flow.
    }
  });

  registry.delete(entityId);
}

export function disposeAllAudioEntities(): void {
  getRegisteredEntityIds().forEach(disposeAudioEntity);
}

