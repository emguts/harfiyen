// The frame that is shown and exported, e.g. an upright 9:16 frame for
// Reels made from a landscape video. Either the frame is filled with a slice
// of the picture (the rest is cut away), or the whole picture is fitted into
// the frame over a black or blurred backdrop. Kept as fractions of the
// displayed picture (after rotation), so it survives a smaller export size
// and a relinked file; turned into pixels only for the export.

/** A fixed shape, or "free" for any. */
export type Aspect = "free" | "9:16" | "4:5" | "1:1" | "16:9";
type Fixed = Exclude<Aspect, "free">;
/** Fill the frame with a slice of the picture, or fit all of it inside the frame. */
export type Fit = "fill" | "fit";
/** What shows around a fitted picture: black, or the picture itself blurred. */
export type Backdrop = "black" | "blur";

export interface Crop {
  aspect: Aspect;
  /** Top-left corner and size of the slice, as fractions of the displayed picture (fill only). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Fit needs a fixed shape; a free frame always fills. */
  fit: Fit;
  backdrop: Backdrop;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How the compositor lays the picture on the frame: `src` of the picture
 * (fractions) drawn into `dst` of the frame (fractions); with a backdrop,
 * `cover` of the picture blurred over the whole frame first.
 */
export interface Placement {
  src: Rect;
  dst: Rect;
  cover: Rect;
  backdrop: Backdrop | null;
}

export const ASPECTS: { value: Aspect; label: string; title: string }[] = [
  { value: "free", label: "Serbest", title: "Serbest: köşelerden ve kenarlardan istediğin gibi" },
  { value: "9:16", label: "9:16", title: "Dikey: Reels, Shorts, TikTok" },
  { value: "4:5", label: "4:5", title: "Instagram gönderisi" },
  { value: "1:1", label: "1:1", title: "Kare" },
  { value: "16:9", label: "16:9", title: "Yatay: YouTube" },
];

/** Width over height. */
export const RATIO: Record<Fixed, number> = { "9:16": 9 / 16, "4:5": 4 / 5, "1:1": 1, "16:9": 16 / 9 };

/** The smallest crop side, in pixels of the picture. */
const MIN_PX = 64;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The whole picture. */
export const wholeCrop = (aspect: Aspect = "free"): Crop => ({
  aspect,
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  fit: "fill",
  backdrop: "blur",
});

const WHOLE: Rect = { x: 0, y: 0, w: 1, h: 1 };

/**
 * The largest `aspect` slice of a `width`×`height` picture, centred on
 * (`cx`, `cy`) as far as the picture allows. Free is the whole picture.
 */
export function cropFor(aspect: Aspect, width: number, height: number, cx = 0.5, cy = 0.5): Crop {
  if (aspect === "free") return wholeCrop();
  const ratio = RATIO[aspect];
  const pw = Math.min(width, height * ratio);
  return moveCrop({ ...wholeCrop(aspect), w: pw / width, h: pw / ratio / height }, cx, cy);
}

/** The crop moved so its centre is at (`cx`, `cy`), kept inside the picture. */
export function moveCrop(c: Crop, cx: number, cy: number): Crop {
  return { ...c, x: clamp(cx - c.w / 2, 0, 1 - c.w), y: clamp(cy - c.h / 2, 0, 1 - c.h) };
}

/** Whole picture: nothing is cut away. */
export const isWhole = (c: Crop) => c.w > 0.999 && c.h > 0.999;

/** A side or corner of the crop box ("nw" is top left), or the box itself. */
export type Handle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/**
 * The crop `start` with a handle dragged by (`dx`, `dy`), fractions of the
 * picture. A fixed shape keeps its shape: its corners grow from the opposite
 * corner, as far as the pointer reaches on either axis. Never leaves the
 * picture, never below MIN_PX.
 */
export function dragCrop(start: Crop, handle: Handle, dx: number, dy: number, width: number, height: number): Crop {
  const c = start;
  if (handle === "move") return { ...c, x: clamp(c.x + dx, 0, 1 - c.w), y: clamp(c.y + dy, 0, 1 - c.h) };
  const minW = Math.min(1, MIN_PX / width);
  const minH = Math.min(1, MIN_PX / height);
  const east = handle.includes("e");
  const west = handle.includes("w");
  const north = handle.includes("n");
  const south = handle.includes("s");

  if (c.aspect !== "free" && handle.length === 2) {
    const ratio = RATIO[c.aspect];
    // The opposite corner stays put.
    const ax = east ? c.x : c.x + c.w;
    const ay = south ? c.y : c.y + c.h;
    const px = (east ? c.x + c.w : c.x) + dx;
    const py = (south ? c.y + c.h : c.y) + dy;
    const reachW = Math.max(0, east ? px - ax : ax - px) * width;
    const reachH = Math.max(0, south ? py - ay : ay - py) * height;
    const roomW = (east ? 1 - ax : ax) * width;
    const roomH = (south ? 1 - ay : ay) * height;
    const pw = clamp(Math.max(reachW, reachH * ratio), Math.max(MIN_PX, MIN_PX * ratio), Math.min(roomW, roomH * ratio));
    const w = pw / width;
    const h = pw / ratio / height;
    return { ...c, x: east ? ax : ax - w, y: south ? ay : ay - h, w, h };
  }

  // A fixed shape has only corner handles; an edge handle reaching here is treated as free.
  let l = c.x;
  let r = c.x + c.w;
  let t = c.y;
  let b = c.y + c.h;
  if (east) r = clamp(r + dx, l + minW, 1);
  if (west) l = clamp(l + dx, 0, r - minW);
  if (south) b = clamp(b + dy, t + minH, 1);
  if (north) t = clamp(t + dy, 0, b - minH);
  return { ...c, x: l, y: t, w: r - l, h: b - t };
}

/** The crop in pixels of a `width`×`height` picture; the size is even, as encoders want. */
export function cropPixels(c: Crop, width: number, height: number) {
  const w = Math.max(2, Math.round((c.w * width) / 2) * 2);
  const h = Math.max(2, Math.round((c.h * height) / 2) * 2);
  const left = clamp(Math.round(c.x * width), 0, width - w);
  const top = clamp(Math.round(c.y * height), 0, height - h);
  return { left, top, width: w, height: h };
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** The picture centred in a frame of `ratio`: the part of the frame it fills (contain), or the part of it that fills the frame (cover). */
function fitted(ratio: number, width: number, height: number) {
  const picture = width / height;
  const wider = picture > ratio;
  const contain: Rect = wider
    ? { x: 0, y: (1 - ratio / picture) / 2, w: 1, h: ratio / picture }
    : { x: (1 - picture / ratio) / 2, y: 0, w: picture / ratio, h: 1 };
  const cover: Rect = wider
    ? { x: (1 - ratio / picture) / 2, y: 0, w: ratio / picture, h: 1 }
    : { x: 0, y: (1 - picture / ratio) / 2, w: 1, h: picture / ratio };
  return { contain, cover };
}

/**
 * What a crop of a `width`×`height` picture comes to. `size` is the frame
 * in pixels (even): the slice when filling; when fitting, a frame of the
 * shape whose long side is the picture's, so nothing is scaled down. `crop`
 * is the slice in pixels for the decoder (fill only), `placement` how the
 * compositor lays the picture out, `none` when the picture shows as it is.
 */
export function framing(c: Crop, width: number, height: number) {
  if (c.fit === "fit" && c.aspect !== "free") {
    const ratio = RATIO[c.aspect];
    const long = Math.max(width, height);
    const size = ratio >= 1 ? { width: even(long), height: even(long / ratio) } : { width: even(long * ratio), height: even(long) };
    const { contain, cover } = fitted(ratio, width, height);
    const none = Math.abs(width / height / ratio - 1) < 0.002;
    const placement: Placement = { src: WHOLE, dst: contain, cover, backdrop: c.backdrop };
    return { size, ratio, crop: null, placement, none };
  }
  const px = cropPixels(c, width, height);
  const none = isWhole(c);
  const placement: Placement = { src: { x: c.x, y: c.y, w: c.w, h: c.h }, dst: WHOLE, cover: WHOLE, backdrop: null };
  return {
    size: { width: px.width, height: px.height },
    ratio: c.aspect === "free" ? px.width / px.height : RATIO[c.aspect],
    crop: none ? null : px,
    placement,
    none,
  };
}

/** A crop read back from a project; null when missing or not a crop. */
export function readCrop(x: unknown): Crop | null {
  const c = x as Partial<Crop> | null;
  const frac = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
  if (!c || !ASPECTS.some((a) => a.value === c.aspect)) return null;
  if (!frac(c.x) || !frac(c.y) || !frac(c.w) || !frac(c.h) || !c.w || !c.h) return null;
  return {
    aspect: c.aspect!,
    x: c.x,
    y: c.y,
    w: c.w,
    h: c.h,
    fit: c.fit === "fit" ? "fit" : "fill",
    backdrop: c.backdrop === "black" ? "black" : "blur",
  };
}
