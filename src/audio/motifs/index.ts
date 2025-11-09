import { clamp, MotifHandle } from "./common";
import { createGentleInquiryMotif, GentleInquiryOptions } from "./gentleInquiry";
import { createRisingHopeMotif, RisingHopeOptions } from "./risingHope";
import { createShimmeringCascadeMotif, ShimmeringCascadeOptions } from "./shimmeringCascade";

export type ProgressionChord = {
  name: string;
  notes: number[];
};

const PROGRESSION: ProgressionChord[] = [
  { name: "Am9", notes: [57, 60, 64, 67, 71] },
  { name: "Gmaj7", notes: [55, 59, 62, 66, 71] },
  { name: "Cmaj7", notes: [60, 64, 67, 71, 74] },
  { name: "Fmaj7", notes: [53, 57, 60, 64, 69] },
];

export type MotifLayeringOptions = {
  risingHope?: RisingHopeOptions;
  gentleInquiry?: GentleInquiryOptions;
  shimmeringCascade?: ShimmeringCascadeOptions;
  chordDurationSeconds?: number;
};

export type MotifLayerManager = {
  start: () => void;
  stop: () => void;
  getActiveChord: () => ProgressionChord;
  handles: {
    risingHope: MotifHandle;
    gentleInquiry: MotifHandle;
    shimmeringCascade: MotifHandle;
  };
};

export function createMotifLayerManager(options: MotifLayeringOptions = {}): MotifLayerManager {
  if (typeof window === "undefined") {
    throw new Error("Motif layering is only available in a browser context.");
  }

  let chordIndex = 0;
  let currentChord = PROGRESSION[chordIndex];
  let chordTimer: number | null = null;
  let isRunning = false;

  const getChordNotes = () => currentChord.notes;

  const risingHopeHandle = createRisingHopeMotif({
    ...options.risingHope,
    getChord: getChordNotes,
  });

  const gentleInquiryHandle = createGentleInquiryMotif({
    ...options.gentleInquiry,
    getChord: getChordNotes,
  });

  const shimmeringCascadeHandle = createShimmeringCascadeMotif({
    ...options.shimmeringCascade,
    getChord: getChordNotes,
  });

  const handles = {
    risingHope: risingHopeHandle,
    gentleInquiry: gentleInquiryHandle,
    shimmeringCascade: shimmeringCascadeHandle,
  } as const;

  const chordDuration = clamp(options.chordDurationSeconds ?? 12, 4, 32);

  const advanceChord = () => {
    chordIndex = (chordIndex + 1) % PROGRESSION.length;
    currentChord = PROGRESSION[chordIndex];
  };

  return {
    handles: {
      risingHope: risingHopeHandle,
      gentleInquiry: gentleInquiryHandle,
      shimmeringCascade: shimmeringCascadeHandle,
    },
    start: () => {
      if (isRunning) {
        return;
      }

      isRunning = true;
      currentChord = PROGRESSION[chordIndex];

      Object.values(handles).forEach((handle) => {
        handle.start();
      });

      if (chordTimer === null) {
        chordTimer = window.setInterval(advanceChord, chordDuration * 1000);
      }
    },
    stop: () => {
      if (!isRunning) {
        return;
      }

      isRunning = false;
      Object.values(handles).forEach((handle) => {
        handle.stop();
      });

      if (chordTimer !== null) {
        window.clearInterval(chordTimer);
        chordTimer = null;
      }
    },
    getActiveChord: () => currentChord,
  };
}
