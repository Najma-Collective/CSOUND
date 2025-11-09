import { getAnalysers } from "./context";

export interface SingleAnalyserSnapshot {
  frequency: Float32Array;
  timeDomain: Uint8Array;
}

export interface AnalyserSnapshot {
  pre: SingleAnalyserSnapshot;
  post: SingleAnalyserSnapshot;
}

function captureSingleAnalyserSnapshot(analyser: AnalyserNode): SingleAnalyserSnapshot {
  const frequencyData = new Float32Array(analyser.frequencyBinCount);
  const timeDomainData = new Uint8Array(analyser.fftSize);
  analyser.getFloatFrequencyData(frequencyData);
  analyser.getByteTimeDomainData(timeDomainData);
  return {
    frequency: frequencyData,
    timeDomain: timeDomainData,
  };
}

export function captureAnalyserSnapshot(): AnalyserSnapshot {
  const { pre, post } = getAnalysers();
  return {
    pre: captureSingleAnalyserSnapshot(pre),
    post: captureSingleAnalyserSnapshot(post),
  };
}
