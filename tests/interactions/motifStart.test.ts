vi.mock("../../src/audio/context", () => ({
  resumeAudio: vi.fn(),
  getBackgroundFilter: vi.fn(() => null),
}));

vi.mock("../../src/interactions/telemetry", () => ({
  emitTelemetryEvent: vi.fn(),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { InteractionController } from "../../src/interactions/controller";
import type { EntityFactory } from "../../src/visuals/entityFactory";
import type { MotifLayerManager } from "../../src/audio/motifs";
import { resumeAudio } from "../../src/audio/context";
import { emitTelemetryEvent } from "../../src/interactions/telemetry";

type PrivateInteractionController = InteractionController & {
  maybeStartMotifs: () => Promise<void>;
};

const resumeAudioMock = vi.mocked(resumeAudio);
const emitTelemetryEventMock = vi.mocked(emitTelemetryEvent);

function createEntityFactoryStub(): EntityFactory {
  return {
    getFloraEntities: () => [],
    getFaunaEntities: () => [],
    triggerTrajectoryShift: vi.fn(),
  } as unknown as EntityFactory;
}

function createMotifLayerManagerStub(start: () => void): MotifLayerManager {
  return {
    start,
    stop: vi.fn(),
    getActiveChord: () => ({ name: "TestChord", notes: [] }),
    handles: {} as never,
    setIntensity: vi.fn(),
    setGlobalIntensity: vi.fn(),
  } as unknown as MotifLayerManager;
}

describe("InteractionController audio startup", () => {
  beforeEach(() => {
    resumeAudioMock.mockReset();
    emitTelemetryEventMock.mockReset();
  });

  it("retries motif startup after resumeAudio failures", async () => {
    resumeAudioMock.mockRejectedValueOnce(new Error("suspended"));
    resumeAudioMock.mockResolvedValue(undefined);

    const motifStart = vi.fn();
    const motifLayers = createMotifLayerManagerStub(motifStart);

    const controller = new InteractionController({
      canvas: document.createElement("canvas"),
      camera: new THREE.PerspectiveCamera(),
      scene: new THREE.Scene(),
      entityFactory: createEntityFactoryStub(),
      motifLayers,
    });

    const controllerWithPrivateAccess = controller as PrivateInteractionController;
    const initialTelemetryCount = emitTelemetryEventMock.mock.calls.length;

    await controllerWithPrivateAccess.maybeStartMotifs();
    expect(resumeAudioMock).toHaveBeenCalledTimes(1);
    expect(motifStart).not.toHaveBeenCalled();
    expect(emitTelemetryEventMock).toHaveBeenCalledTimes(initialTelemetryCount);

    await controllerWithPrivateAccess.maybeStartMotifs();
    expect(resumeAudioMock).toHaveBeenCalledTimes(2);
    expect(motifStart).toHaveBeenCalledTimes(1);
    expect(emitTelemetryEventMock).toHaveBeenCalledTimes(initialTelemetryCount + 1);

    await controllerWithPrivateAccess.maybeStartMotifs();
    expect(resumeAudioMock).toHaveBeenCalledTimes(2);
    expect(motifStart).toHaveBeenCalledTimes(1);

    controller.dispose();
  });
});
