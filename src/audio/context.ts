const isBrowser = typeof window !== "undefined";

type AudioContextConstructor = typeof AudioContext;

type AudioGraph = {
  context: AudioContext;
  masterGain: GainNode;
  limiter: DynamicsCompressorNode;
  preAnalyser: AnalyserNode;
  postAnalyser: AnalyserNode;
};

let audioGraph: AudioGraph | null = null;

function createAudioContext(): AudioGraph {
  if (!isBrowser) {
    throw new Error("Web Audio API is only available in the browser environment.");
  }

  const AudioContextClass: AudioContextConstructor | undefined =
    window.AudioContext ?? (window as typeof window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error("Web Audio API is not supported in this environment.");
  }

  const context = new AudioContextClass();

  const masterGain = context.createGain();
  masterGain.gain.value = 0.9;

  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 1;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const preAnalyser = context.createAnalyser();
  preAnalyser.fftSize = 2048;
  preAnalyser.smoothingTimeConstant = 0.8;

  const postAnalyser = context.createAnalyser();
  postAnalyser.fftSize = 2048;
  postAnalyser.smoothingTimeConstant = 0.8;

  masterGain.connect(limiter);
  masterGain.connect(preAnalyser);
  limiter.connect(context.destination);
  limiter.connect(postAnalyser);

  audioGraph = {
    context,
    masterGain,
    limiter,
    preAnalyser,
    postAnalyser,
  };

  return audioGraph;
}

function ensureAudioGraph(): AudioGraph {
  if (audioGraph) {
    return audioGraph;
  }

  return createAudioContext();
}

export function getAudioContext(): AudioContext {
  return ensureAudioGraph().context;
}

export function getMasterGain(): GainNode {
  return ensureAudioGraph().masterGain;
}

export function getLimiter(): DynamicsCompressorNode {
  return ensureAudioGraph().limiter;
}

export function getAnalysers(): { pre: AnalyserNode; post: AnalyserNode } {
  const { preAnalyser, postAnalyser } = ensureAudioGraph();
  return { pre: preAnalyser, post: postAnalyser };
}

export async function resumeAudio(): Promise<void> {
  const { context } = ensureAudioGraph();
  if (context.state === "suspended") {
    await context.resume();
  }
}

export async function suspendAudio(): Promise<void> {
  const { context } = ensureAudioGraph();
  if (context.state === "running") {
    await context.suspend();
  }
}

export function disposeAudioContext(): void {
  if (!audioGraph) {
    return;
  }

  const { context, masterGain, limiter, preAnalyser, postAnalyser } = audioGraph;

  masterGain.disconnect();
  limiter.disconnect();
  preAnalyser.disconnect();
  postAnalyser.disconnect();

  if (context.state !== "closed") {
    context.close().catch(() => {
      /* noop */
    });
  }

  audioGraph = null;
}

