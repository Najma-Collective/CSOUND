import { getAudioContext, getMasterGain } from "./context";
import { registerDebugSpatialEmitter } from "./debugTools";

type NoiseType = "white" | "pink" | "brown";

type OscillatorOptions = {
  type?: OscillatorType;
  frequency?: number;
  gain?: number;
  detune?: number;
};

type NoiseOptions = {
  type?: NoiseType;
  duration?: number;
  loop?: boolean;
  gain?: number;
};

type ReverbOptions = {
  wet?: number;
  dry?: number;
  preDelaySeconds?: number;
};

type PannerOptions = {
  position?: [number, number, number];
  orientation?: [number, number, number];
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
  coneInnerAngle?: number;
  coneOuterAngle?: number;
  coneOuterGain?: number;
  debugId?: string;
  enableDebugTracking?: boolean;
};

function connectToMaster(node: AudioNode): void {
  node.connect(getMasterGain());
}

export function createOscillatorNode(options: OscillatorOptions = {}): {
  oscillator: OscillatorNode;
  output: GainNode;
  start: () => void;
  stop: () => void;
} {
  const context = getAudioContext();
  const masterGain = getMasterGain();

  const oscillator = context.createOscillator();
  oscillator.type = options.type ?? "sine";
  oscillator.frequency.value = options.frequency ?? 440;
  oscillator.detune.value = options.detune ?? 0;

  const gain = context.createGain();
  gain.gain.value = options.gain ?? 0.2;

  oscillator.connect(gain);
  gain.connect(masterGain);

  const start = () => {
    if (oscillator.context.state === "suspended") {
      void oscillator.context.resume();
    }

    oscillator.start();
  };

  const stop = () => {
    try {
      oscillator.stop();
    } catch (error) {
      // Ignore multiple stop calls.
    }
    oscillator.disconnect();
    gain.disconnect();
  };

  return { oscillator, output: gain, start, stop };
}

export function createNoiseSource(options: NoiseOptions = {}): {
  bufferSource: AudioBufferSourceNode;
  output: GainNode;
  start: () => void;
  stop: () => void;
} {
  const context = getAudioContext();
  const masterGain = getMasterGain();

  const duration = options.duration ?? 2;
  const buffer = context.createBuffer(1, duration * context.sampleRate, context.sampleRate);
  const data = buffer.getChannelData(0);

  switch (options.type ?? "white") {
    case "white":
      for (let i = 0; i < data.length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      break;
    case "pink": {
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;
      let b4 = 0;
      let b5 = 0;
      let b6 = 0;
      for (let i = 0; i < data.length; i += 1) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;
        data[i] = pink * 0.11;
      }
      break;
    }
    case "brown": {
      let lastOut = 0;
      for (let i = 0; i < data.length; i += 1) {
        const white = Math.random() * 2 - 1;
        const brown = (lastOut + 0.02 * white) / 1.02;
        lastOut = brown;
        data[i] = brown * 3.5;
      }
      break;
    }
  }

  const bufferSource = context.createBufferSource();
  bufferSource.buffer = buffer;
  bufferSource.loop = options.loop ?? true;

  const gain = context.createGain();
  gain.gain.value = options.gain ?? 0.2;

  bufferSource.connect(gain);
  gain.connect(masterGain);

  const start = () => {
    bufferSource.start();
  };

  const stop = () => {
    try {
      bufferSource.stop();
    } catch (error) {
      // Ignore multiple stop calls.
    }
    bufferSource.disconnect();
    gain.disconnect();
  };

  return { bufferSource, output: gain, start, stop };
}

export async function loadConvolutionReverb(
  impulseUrl: string,
  options: ReverbOptions = {}
): Promise<{
  convolver: ConvolverNode;
  dry: GainNode;
  wet: GainNode;
  connectInput: (input: AudioNode) => void;
}> {
  const context = getAudioContext();
  const masterGain = getMasterGain();

  const response = await fetch(impulseUrl);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await context.decodeAudioData(arrayBuffer);

  const convolver = context.createConvolver();
  convolver.buffer = audioBuffer;

  const dry = context.createGain();
  dry.gain.value = options.dry ?? 0.5;

  const wet = context.createGain();
  wet.gain.value = options.wet ?? 0.5;

  const preDelaySeconds = options.preDelaySeconds ?? 0;
  let preDelayNode: DelayNode | null = null;
  if (preDelaySeconds > 0) {
    preDelayNode = context.createDelay();
    preDelayNode.delayTime.value = preDelaySeconds;
    preDelayNode.connect(convolver);
  }

  convolver.connect(wet);
  wet.connect(masterGain);
  dry.connect(masterGain);

  const connectInput = (input: AudioNode) => {
    if (preDelayNode) {
      input.connect(preDelayNode);
    } else {
      input.connect(convolver);
    }
    input.connect(dry);
  };

  return { convolver, dry, wet, connectInput };
}

export function createSpatialPanner(options: PannerOptions = {}): {
  panner: PannerNode;
  output: GainNode;
  unregisterDebug?: () => void;
} {
  const context = getAudioContext();
  const panner = context.createPanner();

  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";

  const [x, y, z] = options.position ?? [0, 0, 0];
  panner.positionX.value = x;
  panner.positionY.value = y;
  panner.positionZ.value = z;

  if (options.orientation) {
    const [ox, oy, oz] = options.orientation;
    panner.orientationX.value = ox;
    panner.orientationY.value = oy;
    panner.orientationZ.value = oz;
  }

  if (typeof options.refDistance === "number") {
    panner.refDistance = options.refDistance;
  }
  if (typeof options.maxDistance === "number") {
    panner.maxDistance = options.maxDistance;
  }
  if (typeof options.rolloffFactor === "number") {
    panner.rolloffFactor = options.rolloffFactor;
  }
  if (typeof options.coneInnerAngle === "number") {
    panner.coneInnerAngle = options.coneInnerAngle;
  }
  if (typeof options.coneOuterAngle === "number") {
    panner.coneOuterAngle = options.coneOuterAngle;
  }
  if (typeof options.coneOuterGain === "number") {
    panner.coneOuterGain = options.coneOuterGain;
  }

  const output = context.createGain();
  output.gain.value = 1;

  panner.connect(output);
  connectToMaster(output);

  let unregisterDebug: (() => void) | undefined;
  if (options.enableDebugTracking !== false) {
    unregisterDebug = registerDebugSpatialEmitter(panner, options.debugId);
  }

  return { panner, output, unregisterDebug };
}

