import { useCallback, useEffect, useRef, useState } from "react";
import { buildCues, cueText, READING_RULES } from "./cues";
import type { Word } from "../engine";
import { dubWav, type DubClip } from "../tts/dub";
import { RATE } from "../tts/ema";
import type { FromTts, ToTts, Voice, VoiceModel } from "../worker/tts.worker";

export type { Voice, VoiceModel };
export const DEFAULT_VOICE: Voice = { model: "ema", pitch: 0, seed: 0 };

export const sameVoice = (a: Voice, b: Voice) => a.model === b.model && a.pitch === b.pitch && a.seed === b.seed;
/** Read when the transcript has no line yet. */
const SAMPLE = "Merhaba, seslendirme bu sesle yapılacak.";

/** A short sample of the voice: model download, then synthesis, then playback. */
export type PreviewState =
  | { status: "idle" }
  | { status: "download"; loaded: number; total: number }
  | { status: "running" }
  | { status: "playing" };

export type DubState =
  | { status: "idle" }
  | { status: "download"; loaded: number; total: number }
  | { status: "running"; done: number; total: number }
  /** `words` and `voice` are what it was made from, to tell when it is out of date. */
  | { status: "done"; clips: DubClip[]; url: string; words: Word[]; voice: Voice; elapsed: number }
  | { status: "error"; message: string };

/** Reads the transcript aloud with the chosen voice model in its own worker, one line at a time. */
export function useDubber() {
  const worker = useRef<Worker | null>(null);
  const jobId = useRef(0);
  const pending = useRef<{ words: Word[]; duration: number; voice: Voice } | null>(null);
  const [state, setState] = useState<DubState>({ status: "idle" });
  // Previews run alongside a finished dub without touching it, so they count their own jobs; the worker sees
  // them as negative ids.
  const previewId = useRef(0);
  const sample = useRef<HTMLAudioElement | null>(null);
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });

  const stopSample = useCallback(() => {
    const a = sample.current;
    if (!a) return;
    a.pause();
    URL.revokeObjectURL(a.src);
    sample.current = null;
  }, []);

  const ensureWorker = useCallback(() => {
    if (worker.current) return worker.current;
    const w = new Worker(new URL("../worker/tts.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev: MessageEvent<FromTts>) => {
      const m = ev.data;
      if (m.jobId < 0) {
        if (m.jobId !== -previewId.current) return;
        if (m.type === "download") setPreview({ status: "download", loaded: m.loaded, total: m.total });
        else if (m.type === "error") setPreview({ status: "idle" });
        else if (m.type === "preview") {
          const a = new Audio(URL.createObjectURL(dubWav([{ start: 0, audio: m.audio }], m.audio.length / RATE)));
          a.onended = () => {
            stopSample();
            setPreview({ status: "idle" });
          };
          sample.current = a;
          setPreview({ status: "playing" });
          void a.play().catch(() => a.onended?.(new Event("ended")));
        }
        return;
      }
      if (m.jobId !== jobId.current) return;
      switch (m.type) {
        case "download":
          setState({ status: "download", loaded: m.loaded, total: m.total });
          break;
        case "progress":
          setState({ status: "running", done: m.done, total: m.total });
          break;
        case "done": {
          const { words, duration, voice } = pending.current!;
          const url = URL.createObjectURL(dubWav(m.clips, duration));
          setState({ status: "done", clips: m.clips, url, words, voice, elapsed: m.elapsed });
          break;
        }
        case "cancelled":
          setState({ status: "idle" });
          break;
        case "error":
          setState({ status: "error", message: m.message });
          break;
      }
    };
    worker.current = w;
    return w;
  }, [stopSample]);

  useEffect(
    () => () => {
      worker.current?.terminate();
      stopSample();
    },
    [stopSample],
  );

  // Free the previous result when it is replaced.
  const url = state.status === "done" ? state.url : null;
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const dub = useCallback(
    (words: Word[], duration: number, voice: Voice) => {
      const id = ++jobId.current;
      pending.current = { words, duration, voice };
      setState({ status: "running", done: 0, total: 0 });
      const lines = buildCues(words, READING_RULES).map((c) => ({ start: c.start, end: c.end, text: cueText(c) }));
      ensureWorker().postMessage({ type: "dub", jobId: id, lines, duration, voice } satisfies ToTts);
    },
    [ensureWorker],
  );

  /** Reads the first line of the transcript with `voice`; a second call while one runs stops it. */
  const listen = useCallback(
    (words: Word[], voice: Voice) => {
      stopSample();
      const id = ++previewId.current;
      // A sample already on its way is dropped when it arrives: its id is out of date.
      if (preview.status !== "idle") {
        setPreview({ status: "idle" });
        return;
      }
      const first = buildCues(words, READING_RULES)[0];
      const text = (first && cueText(first).trim()) || SAMPLE;
      setPreview({ status: "running" });
      ensureWorker().postMessage({ type: "preview", jobId: -id, text, voice } satisfies ToTts);
    },
    [ensureWorker, stopSample, preview.status],
  );

  const cancel = useCallback(() => {
    worker.current?.postMessage({ type: "cancel", jobId: jobId.current } satisfies ToTts);
    jobId.current++;
    setState({ status: "idle" });
  }, []);

  const reset = useCallback(() => {
    jobId.current++;
    setState({ status: "idle" });
  }, []);

  return { state, dub, cancel, reset, preview, listen };
}

/**
 * Plays the dub in step with the media element, which goes silent meanwhile. The media element stays the clock:
 * the dub follows its play, pause, seek, rate and mute.
 */
export function useDubPlayback(el: HTMLMediaElement | null, url: string | null, on: boolean) {
  useEffect(() => {
    if (!el || !url || !on) return;
    const dub = new Audio(url);
    const sync = () => {
      dub.playbackRate = el.playbackRate;
      dub.muted = el.muted;
      if (Math.abs(dub.currentTime - el.currentTime) > 0.15) dub.currentTime = el.currentTime;
      if (el.paused) dub.pause();
      else void dub.play().catch(() => {});
    };
    const events = ["play", "pause", "ended", "seeked", "ratechange", "volumechange", "timeupdate"];
    events.forEach((e) => el.addEventListener(e, sync));
    el.volume = 0;
    sync();
    return () => {
      events.forEach((e) => el.removeEventListener(e, sync));
      dub.pause();
      dub.removeAttribute("src");
      el.volume = 1;
    };
  }, [el, url, on]);
}
