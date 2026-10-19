// The logo as the compositor draws it, in the player and in the render
// worker alike (no storage or DOM here; see lib/logo.ts for those).

import type { Corner, LogoSettings } from "../captions/style";

/** The image with its settings. */
export type LogoLayer = Omit<LogoSettings, "on"> & { image: ImageBitmap };

/** Where the logo goes on a `width`×`height` frame, in pixels: in its corner, a margin in from the edges. */
export function logoRect(
  width: number,
  height: number,
  image: { width: number; height: number },
  corner: Corner,
  size: number,
) {
  const short = Math.min(width, height);
  const s = (size * short) / Math.max(image.width, image.height);
  const w = image.width * s;
  const h = image.height * s;
  const margin = 0.04 * short;
  return {
    x: corner[1] === "l" ? margin : width - margin - w,
    y: corner[0] === "t" ? margin : height - margin - h,
    w,
    h,
  };
}
