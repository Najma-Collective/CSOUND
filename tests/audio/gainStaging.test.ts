import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it, vi } from "vitest";
import {
  FakeAudioContext,
  FakeAudioParam,
  installFakeAudioContext,
  uninstallFakeAudioContext,
} from "../helpers/fakeAudioContext";

let contextModule: typeof import("../../src/audio/context");
let environmentModule: typeof import("../../src/systems/environmentMixing");

async function loadModules(): Promise<void> {
  contextModule = await import("../../src/audio/context");
  environmentModule = await import("../../src/systems/environmentMixing");
}

describe("audio gain staging", () => {
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

  it("configures the limiter to enforce broadcast headroom", () => {
    const limiter = contextModule.getLimiter();
    expect(limiter.threshold.value).toBeCloseTo(-3);
    expect(limiter.knee.value).toBeCloseTo(1);
    expect(limiter.ratio.value).toBeCloseTo(20);
    expect(limiter.attack.value).toBeCloseTo(0.003, 3);
    expect(limiter.release.value).toBeCloseTo(0.25);
  });

  it("targets a -1 dBFS master gain for LUFS calibration", () => {
    const masterGain = contextModule.getMasterGain();
    expect(masterGain.gain.value).toBeCloseTo(0.9);
  });

  it("applies headroom when locking to a new environmental state", () => {
    const context = contextModule.getAudioContext() as FakeAudioContext;
    const gainNode = context.createGain();

    const { EnvironmentalCrossfader } = environmentModule;
    const crossfader = new EnvironmentalCrossfader(
      [
        {
          id: "dense-forest",
          gain: gainNode,
          baseGain: 0.75,
        },
      ],
      { context },
    );

    crossfader.setImmediate("dense-forest");

    const headroomDb = 6;
    const expectedGain = (gainNode.gain as FakeAudioParam).value;
    const expectedLinear = 0.75 * 10 ** (-headroomDb / 20);
    expect(expectedGain).toBeCloseTo(expectedLinear);
  });
});
