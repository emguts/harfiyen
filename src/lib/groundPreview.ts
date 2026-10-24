// What the style cards show behind their text: one small still of the
// project's own ground (its video's picture, the photo or the aura), drawn by
// the compositor as the player draws it, blur and all. One JPEG for every
// card, made only while the cards are on screen and only when the ground
// changes, never while playing.

import { useEffect, useRef, useState } from "react";
import { shownPhoto, shownPicture, type CaptionSettings } from "../captions/style";
import { historyAt, paletteById, usesHistory, type AuraLevels } from "../render/aura";
import { createCompositor, type Compositor, type Picture } from "../render/compositor";

export interface GroundPreview {
  /** The still, as an object URL; null until it is made (the cards show their own ground then). */
  url: string | null;
  /** The picture or the photo as drawn, as it is or blurred; null for the aura. */
  ground: "video" | "blur" | null;
}

/** The still's long side, in pixels: sharp on a card at 2× density. */
const LONG = 384;
/** A voice mid-sentence, so the aura shows some movement. */
const LEVELS: AuraLevels = { low: 0.55, mid: 0.6, high: 0.45, punch: 0.15 };
/** The aura's clock for the still: any moment; a fixed one keeps it the same. */
const TIME = 7;

/** One compositor for every still, so its pipelines are built once. */
let shared: Promise<{ canvas: OffscreenCanvas; compositor: Compositor }> | null = null;
/** Stills are made one at a time on it. */
let queue: Promise<unknown> = Promise.resolve();

function still(picture: Picture, blur: boolean, width: number, height: number): Promise<Blob> {
  const run = async () => {
    shared ??= (async () => {
      const canvas = new OffscreenCanvas(2, 2);
      return { canvas, compositor: await createCompositor(canvas) };
    })();
    const { canvas, compositor } = await shared;
    compositor.resize(width, height);
    compositor.setBlur(blur);
    compositor.render(picture, null);
    // Taken at once: a WebGPU canvas lets go of its picture after the task.
    const out = new OffscreenCanvas(width, height);
    out.getContext("bitmaprenderer")!.transferFromImageBitmap(canvas.transferToImageBitmap());
    return out.convertToBlob({ type: "image/jpeg", quality: 0.82 });
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}

/**
 * The still for the style cards. `video` is the media element when the file has a picture, and
 * `src` the file it plays: the element stays when another file opens. `photo` is the user's photo
 * when this project uses it. Nothing is made while `active` is false.
 */
export function useGroundPreview({
  active,
  settings,
  video,
  src,
  photo,
}: {
  active: boolean;
  settings: CaptionSettings;
  video: HTMLVideoElement | null;
  src: string | null;
  photo: ImageBitmap | null;
}): GroundPreview {
  const shownPic = shownPicture(settings, !!video);
  const photoPic = shownPic ? null : shownPhoto(settings, !!photo);
  const ground = shownPic ?? photoPic;
  const palette = settings.aura;
  const style = settings.auraStyle ?? "aura";
  const [url, setUrl] = useState<string | null>(null);
  // Let go of the last still when a new one replaces it, and when the cards go for good.
  const shown = useRef<string | null>(null);
  useEffect(() => () => void (shown.current && URL.revokeObjectURL(shown.current)), []);
  /** Bumped when the video gets a frame it did not have. */
  const [frameTick, setFrameTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    let picture: Picture;
    let width = LONG;
    let height = Math.round((LONG * 9) / 16);
    if (shownPic && video) {
      // No frame yet (just opened, or seeking): once there is one.
      if (video.readyState < 2 || !video.videoWidth) {
        const again = () => setFrameTick((n) => n + 1);
        video.addEventListener("loadeddata", again, { once: true });
        video.addEventListener("seeked", again, { once: true });
        return () => {
          video.removeEventListener("loadeddata", again);
          video.removeEventListener("seeked", again);
        };
      }
      const k = LONG / Math.max(video.videoWidth, video.videoHeight);
      width = Math.round(video.videoWidth * k);
      height = Math.round(video.videoHeight * k);
      picture = video;
    } else if (photoPic && photo) {
      picture = { kind: "photo", image: photo };
    } else {
      picture = {
        kind: "aura",
        time: TIME,
        levels: LEVELS,
        palette: paletteById(palette).colors,
        style,
        history: usesHistory(style) ? historyAt(() => LEVELS, TIME) : undefined,
      };
    }
    let live = true;
    const show = (next: string | null) => {
      const old = shown.current;
      shown.current = next;
      setUrl(next);
      if (old) URL.revokeObjectURL(old);
    };
    still(picture, ground === "blur", width, height).then(
      (blob) => live && show(URL.createObjectURL(blob)),
      // Without a still the cards keep their own ground.
      () => live && show(null),
    );
    return () => {
      live = false;
    };
  }, [active, shownPic, photoPic, ground, video, src, photo, palette, style, frameTick]);

  return { url, ground };
}
