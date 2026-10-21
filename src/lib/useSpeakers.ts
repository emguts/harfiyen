import { useCallback, useEffect, useRef, useState } from "react";
import type { Word } from "../engine";
import type { FromSpeakers, ToSpeakers } from "../worker/speakers.worker";
import { decodeWithAudioContext } from "./decodeFallback";
import { fromLabels, type Speakers } from "./speakers";
import type { TimeRange } from "./useTranscriber";

export type SpeakersState =
  | { status: "idle" }
  | { status: "download"; loaded: number; total: number }
  | { status: "running"; phase: "read" | "compare"; done: number }
  | { status: "error"; message: string };

/** What a running job shows: its label and how far along it is (0..1); null when none runs. */
export function speakersProgress(s: SpeakersState): { label: string; value: number } | null {
  if (s.status === "download") {
    const value = s.loaded / (s.total || 1);
    return { label: `Konuşmacı modeli indiriliyor %${Math.floor(value * 100)}`, value };
  }
  if (s.status === "running") {
    // Reading the audio is the first fifth or so of the work.
    const value = s.phase === "read" ? s.done * 0.2 : 0.2 + s.done * 0.8;
    return { label: `${s.phase === "read" ? "Ses okunuyor" : "Sesler karşılaştırılıyor"} %${Math.floor(value * 100)}`, value };
  }
  return null;
}

interface Pending {
  words: Word[];
  file: File;
  span: TimeRange;
  speakers?: number;
  onDone: (s: Speakers) => void;
}

/** Tells the speakers of the open file apart in their own worker. */
export function useSpeakers() {
  const worker = useRef<Worker | null>(null);
  const jobId = useRef(0);
  const pending = useRef<Pending | null>(null);
  const [state, setState] = useState<SpeakersState>({ status: "idle" });

  const ensureWorker = useCallback(() => {
    if (worker.current) return worker.current;
    const w = new Worker(new URL("../worker/speakers.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = async (ev: MessageEvent<FromSpeakers>) => {
      const m = ev.data;
      if (m.jobId !== jobId.current) return;
      switch (m.type) {
        case "download":
          setState({ status: "download", loaded: m.loaded, total: m.total });
          break;
        case "progress":
          setState({ status: "running", phase: m.phase, done: m.done });
          break;
        case "done": {
          const p = pending.current!;
          pending.current = null;
          setState({ status: "idle" });
          p.onDone(fromLabels(p.words, m.labels));
          break;
        }
        case "cancelled":
          setState({ status: "idle" });
          break;
        case "error": {
          const p = pending.current;
          if (m.undecodable && p) {
            // Let the browser's media stack decode the whole file instead, as the transcriber does.
            try {
              const pcm = await decodeWithAudioContext(p.file);
              if (m.jobId !== jobId.current) return;
              w.postMessage(
                { type: "diarize", jobId: m.jobId, pcm, start: p.span.start, end: p.span.end, words: p.words, speakers: p.speakers } satisfies ToSpeakers,
                [pcm.buffer],
              );
            } catch {
              if (m.jobId === jobId.current) setState({ status: "error", message: "Bu dosyanın sesi çözülemedi." });
            }
            return;
          }
          setState({ status: "error", message: m.message });
          break;
        }
      }
    };
    worker.current = w;
    return w;
  }, []);

  useEffect(() => () => worker.current?.terminate(), []);

  /**
   * Who says each of `words` (file times) in `span` of `file`; `speakers`: how many, or undefined to guess.
   * `onDone` gets the result, unless another call or cancel() came first.
   */
  const diarize = useCallback(
    (file: File, span: TimeRange, words: Word[], speakers: number | undefined, onDone: (s: Speakers) => void) => {
      const w = ensureWorker();
      w.postMessage({ type: "cancel", jobId: jobId.current } satisfies ToSpeakers);
      const id = ++jobId.current;
      // Only what the worker needs: the times, and the text for sentence ends.
      const plain = words.map((x) => ({ text: x.text, start: x.start, end: x.end }));
      pending.current = { words: plain, file, span, speakers, onDone };
      setState({ status: "running", phase: "read", done: 0 });
      w.postMessage({ type: "diarize", jobId: id, file, start: span.start, end: span.end, words: plain, speakers } satisfies ToSpeakers);
    },
    [ensureWorker],
  );

  const cancel = useCallback(() => {
    worker.current?.postMessage({ type: "cancel", jobId: jobId.current } satisfies ToSpeakers);
    jobId.current++;
    pending.current = null;
    setState({ status: "idle" });
  }, []);

  return { state, diarize, cancel };
}
