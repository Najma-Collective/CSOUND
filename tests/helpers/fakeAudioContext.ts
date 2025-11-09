/* eslint-disable max-classes-per-file */

export class FakeAudioParam {
  value: number;

  readonly events: Array<{
    type: "setValueAtTime" | "setValueCurveAtTime" | "cancelScheduledValues";
    value?: number;
    startTime?: number;
    duration?: number;
    curve?: Float32Array;
  }> = [];

  constructor(initial: number) {
    this.value = initial;
  }

  setValueAtTime(value: number, startTime: number): void {
    this.value = value;
    this.events.push({ type: "setValueAtTime", value, startTime });
  }

  setValueCurveAtTime(curve: Float32Array, startTime: number, duration: number): void {
    if (curve.length > 0) {
      this.value = curve[curve.length - 1];
    }
    this.events.push({ type: "setValueCurveAtTime", curve, startTime, duration });
  }

  cancelScheduledValues(startTime: number): void {
    this.events.push({ type: "cancelScheduledValues", startTime });
  }
}

export class FakeAudioNode {
  readonly context: FakeAudioContext;

  readonly connections: FakeAudioNode[] = [];

  constructor(context: FakeAudioContext) {
    this.context = context;
  }

  connect(destination: FakeAudioNode): FakeAudioNode {
    this.connections.push(destination);
    return destination;
  }

  disconnect(): void {
    this.connections.length = 0;
  }
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain: FakeAudioParam;

  constructor(context: FakeAudioContext, initialGain = 1) {
    super(context);
    this.gain = new FakeAudioParam(initialGain);
  }
}

export class FakeDynamicsCompressorNode extends FakeAudioNode {
  readonly threshold = new FakeAudioParam(0);

  readonly knee = new FakeAudioParam(0);

  readonly ratio = new FakeAudioParam(1);

  readonly attack = new FakeAudioParam(0.1);

  readonly release = new FakeAudioParam(0.25);
}

export class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = "lowpass";

  readonly frequency = new FakeAudioParam(350);

  readonly Q = new FakeAudioParam(1);

  readonly gain = new FakeAudioParam(0);
}

export class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 2048;

  minDecibels = -90;

  maxDecibels = -30;

  smoothingTimeConstant = 0.8;

  private frequencyData: Float32Array = new Float32Array(this.frequencyBinCount);

  private timeDomainData: Uint8Array = new Uint8Array(this.fftSize);

  get frequencyBinCount(): number {
    return this.fftSize / 2;
  }

  setMockFrequencyData(data: Float32Array): void {
    this.frequencyData = data;
  }

  setMockTimeDomainData(data: Uint8Array): void {
    this.timeDomainData = data;
  }

  getFloatFrequencyData(array: Float32Array): void {
    array.set(this.frequencyData);
  }

  getByteTimeDomainData(array: Uint8Array): void {
    array.set(this.timeDomainData);
  }
}

export class FakeAudioBuffer {
  readonly numberOfChannels: number;

  readonly length: number;

  readonly sampleRate: number;

  private readonly channelData: Float32Array[];

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.channelData = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  getChannelData(channel: number): Float32Array {
    return this.channelData[channel];
  }
}

export class FakeAudioBufferSourceNode extends FakeAudioNode {
  buffer: FakeAudioBuffer | null = null;

  loop = false;

  start(): void {
    // no-op
  }

  stop(): void {
    // no-op
  }
}

export class FakeDelayNode extends FakeAudioNode {
  readonly delayTime = new FakeAudioParam(0);
}

export class FakeConvolverNode extends FakeAudioNode {
  buffer: FakeAudioBuffer | null = null;
}

export class FakeOscillatorNode extends FakeAudioNode {
  type: OscillatorType = "sine";

  readonly frequency = new FakeAudioParam(440);

  readonly detune = new FakeAudioParam(0);

  start(): void {
    // no-op
  }

  stop(): void {
    // no-op
  }
}

export class FakePannerNode extends FakeAudioNode {
  panningModel: PanningModelType = "HRTF";

  distanceModel: DistanceModelType = "inverse";

  refDistance = 1;

  maxDistance = 10000;

  rolloffFactor = 1;

  coneInnerAngle = 360;

  coneOuterAngle = 360;

  coneOuterGain = 0;

  readonly positionX = new FakeAudioParam(0);

  readonly positionY = new FakeAudioParam(0);

  readonly positionZ = new FakeAudioParam(0);

  readonly orientationX = new FakeAudioParam(1);

  readonly orientationY = new FakeAudioParam(0);

  readonly orientationZ = new FakeAudioParam(0);
}

export class FakeAudioDestinationNode extends FakeAudioNode {}

let fakeNow = 0;

export class FakeAudioContext {
  readonly currentTime = 0;

  state: AudioContextState = "running";

  readonly sampleRate: number;

  readonly destination: FakeAudioDestinationNode;

  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.destination = new FakeAudioDestinationNode(this);
  }

  createGain(): FakeGainNode {
    return new FakeGainNode(this);
  }

  createDynamicsCompressor(): FakeDynamicsCompressorNode {
    return new FakeDynamicsCompressorNode(this);
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    return new FakeBiquadFilterNode(this);
  }

  createAnalyser(): FakeAnalyserNode {
    return new FakeAnalyserNode(this);
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): FakeAudioBuffer {
    return new FakeAudioBuffer(numberOfChannels, length, sampleRate);
  }

  createBufferSource(): FakeAudioBufferSourceNode {
    return new FakeAudioBufferSourceNode(this);
  }

  createDelay(): FakeDelayNode {
    return new FakeDelayNode(this);
  }

  createConvolver(): FakeConvolverNode {
    return new FakeConvolverNode(this);
  }

  createOscillator(): FakeOscillatorNode {
    return new FakeOscillatorNode(this);
  }

  createPanner(): FakePannerNode {
    return new FakePannerNode(this);
  }

  decodeAudioData(buffer: ArrayBuffer): Promise<FakeAudioBuffer> {
    return Promise.resolve(new FakeAudioBuffer(2, buffer.byteLength, this.sampleRate));
  }

  resume(): Promise<void> {
    this.state = "running";
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    this.state = "suspended";
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.state = "closed";
    return Promise.resolve();
  }
}

let originalWindow: typeof window | undefined;
let originalAudioContext: typeof AudioContext | undefined;
let originalPerformance: Performance | undefined;

export function installFakeAudioContext(sampleRate = 48000): void {
  originalWindow = globalThis.window;
  originalAudioContext = (globalThis as typeof globalThis & { AudioContext?: typeof AudioContext }).AudioContext;
  originalPerformance = globalThis.performance as Performance | undefined;
  fakeNow = 0;

  const fakeContextConstructor = class extends FakeAudioContext {
    constructor() {
      super(sampleRate);
    }
  };

  const fakeWindow: typeof window = {
    ...(originalWindow ?? ({} as Window & typeof globalThis)),
    AudioContext: fakeContextConstructor as unknown as typeof AudioContext,
    webkitAudioContext: fakeContextConstructor as unknown as typeof AudioContext,
    performance: {
      now(): number {
        fakeNow += 16;
        return fakeNow;
      },
    } as unknown as Performance,
  };

  (globalThis as typeof globalThis & { window: typeof window }).window = fakeWindow;
  (globalThis as typeof globalThis & { AudioContext: typeof AudioContext }).AudioContext = fakeContextConstructor as unknown as typeof AudioContext;
  (globalThis as typeof globalThis & { webkitAudioContext: typeof AudioContext }).webkitAudioContext =
    fakeContextConstructor as unknown as typeof AudioContext;
  (globalThis as typeof globalThis & { performance: Performance }).performance = fakeWindow.performance;
}

export function uninstallFakeAudioContext(): void {
  if (originalWindow) {
    (globalThis as typeof globalThis & { window: typeof window }).window = originalWindow;
  } else {
    delete (globalThis as Partial<typeof globalThis>).window;
  }

  if (originalAudioContext) {
    (globalThis as typeof globalThis & { AudioContext: typeof AudioContext }).AudioContext = originalAudioContext;
  } else {
    delete (globalThis as Partial<typeof globalThis>).AudioContext;
  }

  if (originalPerformance) {
    (globalThis as typeof globalThis & { performance: Performance }).performance = originalPerformance;
  } else {
    delete (globalThis as Partial<typeof globalThis>).performance;
  }

  originalWindow = undefined;
  originalAudioContext = undefined;
  originalPerformance = undefined;
}
