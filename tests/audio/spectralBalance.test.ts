import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it, vi } from "vitest";
import { FakeAnalyserNode, installFakeAudioContext, uninstallFakeAudioContext } from "../helpers/fakeAudioContext";

let contextModule: typeof import("../../src/audio/context");
let analysisModule: typeof import("../../src/audio/analysis");
let nodesModule: typeof import("../../src/audio/nodes");
let registryModule: typeof import("../../src/audio/debugRegistry");

async function loadModules(): Promise<void> {
  contextModule = await import("../../src/audio/context");
  analysisModule = await import("../../src/audio/analysis");
  nodesModule = await import("../../src/audio/nodes");
  registryModule = await import("../../src/audio/debugRegistry");
}

describe("spectral balance instrumentation", () => {
  beforeAll(() => {
    installFakeAudioContext();
  });

  beforeEach(async () => {
    vi.resetModules();
    await loadModules();
  });

  afterEach(() => {
    contextModule.disposeAudioContext();
  });

  afterAll(() => {
    uninstallFakeAudioContext();
  });

  it("captures analyser snapshots for pre and post master chains", () => {
    const { pre, post } = contextModule.getAnalysers();
    const preAnalyser = pre as unknown as FakeAnalyserNode;
    const postAnalyser = post as unknown as FakeAnalyserNode;

    const preFrequency = new Float32Array(preAnalyser.frequencyBinCount).fill(-60);
    const preTimeDomain = new Uint8Array(preAnalyser.fftSize).fill(128);
    const postFrequency = new Float32Array(postAnalyser.frequencyBinCount).fill(-12);
    const postTimeDomain = new Uint8Array(postAnalyser.fftSize).fill(140);

    preAnalyser.setMockFrequencyData(preFrequency);
    preAnalyser.setMockTimeDomainData(preTimeDomain);
    postAnalyser.setMockFrequencyData(postFrequency);
    postAnalyser.setMockTimeDomainData(postTimeDomain);

    const snapshot = analysisModule.captureAnalyserSnapshot();

    expect(Array.from(snapshot.pre.frequency)).toEqual(Array.from(preFrequency));
    expect(Array.from(snapshot.post.frequency)).toEqual(Array.from(postFrequency));
    expect(Array.from(snapshot.pre.timeDomain)).toEqual(Array.from(preTimeDomain));
    expect(Array.from(snapshot.post.timeDomain)).toEqual(Array.from(postTimeDomain));
  });

  it("links background filter output to the pre-fader analyser", () => {
    const backgroundFilter = contextModule.getBackgroundFilter();
    const { pre } = contextModule.getAnalysers();
    const connections = (backgroundFilter as { connections: AudioNode[] }).connections ?? [];
    expect(connections).toContain(pre);
  });

  it("registers spatial emitters for debug visualisation", () => {
    const { createSpatialPanner } = nodesModule;
    const { getSpatialEmittersSnapshot } = registryModule;

    const { unregisterDebug } = createSpatialPanner({
      position: [1, 0, 0],
      debugId: "test-node",
    });

    const snapshot = getSpatialEmittersSnapshot();
    expect(snapshot.some((entry) => entry.id === "test-node")).toBe(true);

    unregisterDebug?.();
    const afterCleanup = getSpatialEmittersSnapshot();
    expect(afterCleanup.some((entry) => entry.id === "test-node")).toBe(false);
  });
});
