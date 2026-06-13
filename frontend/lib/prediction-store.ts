// Zustand slice fed by {"type":"predictions"} WS messages.
// Tracks SC-probability history (gauge sparkline) and staleness vs current lap.
import { create } from "zustand";
import type { PredictionSet } from "./prediction-types";

const SPARK_LEN = 30;

interface PredictionStore {
  prediction: PredictionSet | null;
  scHistory: { lap: number; p1: number }[];
  scHistory5: { lap: number; p5: number }[];
  setPrediction: (p: PredictionSet) => void;
  reset: () => void;
}

export const usePredictionStore = create<PredictionStore>((set) => ({
  prediction: null,
  scHistory: [],
  scHistory5: [],
  setPrediction: (prediction) =>
    set((s) => ({
      prediction,
      scHistory: [
        ...s.scHistory.filter((h) => h.lap !== prediction.lap),
        { lap: prediction.lap, p1: prediction.sc_prob_1lap },
      ].slice(-SPARK_LEN),
      scHistory5: [
        ...s.scHistory5.filter((h) => h.lap !== prediction.lap),
        { lap: prediction.lap, p5: prediction.sc_prob_5laps },
      ].slice(-SPARK_LEN),
    })),
  reset: () => set({ prediction: null, scHistory: [], scHistory5: [] }),
}));

/** Predictions more than 2 laps away (either direction — backwards seek included)
 *  are flagged stale in the UI. */
export function isStale(prediction: PredictionSet | null, currentLap: number): boolean {
  return prediction != null && Math.abs(currentLap - prediction.lap) > 2;
}
