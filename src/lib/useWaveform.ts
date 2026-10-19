import { useEffect, useRef, useState } from "react";
import type { FromWave, ToWave } from "../worker/wave.worker";

/**
 * The file's waveform (peaks per PEAK_STEP), read in a worker as soon as the
 * file opens and filled in as it is read; null before the first part arrives,
 * or when this browser cannot read the file's audio here.
 */
export function useWaveform(file: File | null): Float32Array | null {
  const worker = useRef<Worker | null>(null);
  const nextId = useRef(1);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);

  useEffect(() => () => worker.current?.terminate(), []);

  useEffect(() => {
    setPeaks(null);
    if (!file) {
      worker.current?.postMessage({ type: "stop" } satisfies ToWave);
      return;
    }
    const w = (worker.current ??= new Worker(new URL("../worker/wave.worker.ts", import.meta.url), { type: "module" }));
    const id = nextId.current++;
    w.onmessage = (ev: MessageEvent<FromWave>) => {
      const m = ev.data;
      if (m.id !== id) return;
      setPeaks("error" in m ? null : m.peaks);
    };
    w.postMessage({ type: "read", id, file } satisfies ToWave);
  }, [file]);

  return peaks;
}
