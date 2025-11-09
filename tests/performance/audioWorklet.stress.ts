/*
 * Stress test harness for manually exercising audio worklet topologies.
 *
 * The script intentionally avoids coupling to the production scheduler so that it can run in
 * isolation via `tsx` or `ts-node`. Metrics are derived from `performance.now()` calls that mimic
 * worklet render cycles and GC observations through `FinalizationRegistry`.
 */

interface StressEntity {
  id: number;
  nodeRefs: WeakRef<object>[];
}

export interface AudioWorkletStressOptions {
  entityCount?: number;
  iterations?: number;
  frameBudgetMs?: number;
  onIteration?: (iteration: number, metrics: IterationMetrics) => void;
}

export interface IterationMetrics {
  spawnTimeMs: number;
  averageProcessTimeMs: number;
  cpuLoadPercentage: number;
  collectedNodes: number;
}

export interface StressTestResult {
  options: Required<AudioWorkletStressOptions>;
  metrics: IterationMetrics[];
  summary: {
    peakCpuLoad: number;
    worstFrameTime: number;
    totalCollectedNodes: number;
  };
}

const defaultOptions: Required<AudioWorkletStressOptions> = {
  entityCount: 256,
  iterations: 120,
  frameBudgetMs: 16.67,
  onIteration: () => undefined,
};

function createEntities(count: number): StressEntity[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    nodeRefs: [],
  }));
}

function simulateWorkletProcess(entity: StressEntity): number {
  const start = performance.now();
  for (let i = 0; i < 32; i += 1) {
    const node = { entityId: entity.id, tick: i };
    entity.nodeRefs.push(new WeakRef(node));
  }
  return performance.now() - start;
}

function trackGarbageCollection(entities: StressEntity[]): number {
  let collected = 0;
  const registry = new FinalizationRegistry(() => {
    collected += 1;
  });
  entities.forEach((entity) => {
    entity.nodeRefs.forEach((ref) => {
      const target = ref.deref();
      if (target) {
        registry.register(target, null);
      }
    });
    entity.nodeRefs = [];
  });
  // Hint the GC. Not guaranteed but provides pressure during manual runs.
  (globalThis as { gc?: () => void }).gc?.();
  return collected;
}

export async function runAudioWorkletStressTest(
  options: AudioWorkletStressOptions = {},
): Promise<StressTestResult> {
  const resolved: Required<AudioWorkletStressOptions> = { ...defaultOptions, ...options };
  const metrics: IterationMetrics[] = [];
  const entities = createEntities(resolved.entityCount);

  for (let iteration = 0; iteration < resolved.iterations; iteration += 1) {
    const spawnStart = performance.now();
    const frameDurations: number[] = [];

    entities.forEach((entity) => {
      const duration = simulateWorkletProcess(entity);
      frameDurations.push(duration);
    });

    const spawnTimeMs = performance.now() - spawnStart;
    const averageProcessTimeMs =
      frameDurations.reduce((sum, duration) => sum + duration, 0) / frameDurations.length;
    const cpuLoadPercentage = Math.min(100, (averageProcessTimeMs / resolved.frameBudgetMs) * 100);
    const collectedNodes = trackGarbageCollection(entities);

    const iterationMetrics: IterationMetrics = {
      spawnTimeMs,
      averageProcessTimeMs,
      cpuLoadPercentage,
      collectedNodes,
    };

    metrics.push(iterationMetrics);
    resolved.onIteration(iteration, iterationMetrics);

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const summary = metrics.reduce(
    (acc, entry) => ({
      peakCpuLoad: Math.max(acc.peakCpuLoad, entry.cpuLoadPercentage),
      worstFrameTime: Math.max(acc.worstFrameTime, entry.spawnTimeMs),
      totalCollectedNodes: acc.totalCollectedNodes + entry.collectedNodes,
    }),
    { peakCpuLoad: 0, worstFrameTime: 0, totalCollectedNodes: 0 },
  );

  return {
    options: resolved,
    metrics,
    summary,
  };
}

if (typeof process !== "undefined" && process.argv?.[1]) {
  const executedFromCli = import.meta.url === new URL(process.argv[1], "file:").href;
  if (executedFromCli) {
    void runAudioWorkletStressTest().then((result) => {
      console.log("Audio worklet stress summary", result.summary);
    });
  }
}
