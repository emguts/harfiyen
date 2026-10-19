// The user's logo: one image, kept in this browser (IndexedDB) and shared by
// every project. Where it sits, how big and how solid is part of the caption
// settings (LogoSettings). The image is drawn by the compositor in the
// player and in the export alike; it travels to the render worker as an
// ImageBitmap, rasterised here so SVG logos work there too.

import { useSyncExternalStore } from "react";
import { deleteLogo, getLogo, saveLogo, stripExt } from "./projectStore";

/** Logo files above this are refused. */
const MAX_BYTES = 10 * 1024 * 1024;
/** The bitmap's long side: sharp at 4K at the largest logo size. */
const RASTER = 1024;

export interface Logo {
  name: string;
  /** For the preview in the panel. */
  url: string;
  bitmap: ImageBitmap;
}

let state: { logo: Logo | null; ready: boolean } = { logo: null, ready: false };
const subscribers = new Set<() => void>();

function publish(logo: Logo | null) {
  const old = state.logo;
  if (old && old !== logo) {
    URL.revokeObjectURL(old.url);
    // The player may draw it once more before it hears of the new one.
    setTimeout(() => old.bitmap.close(), 1000);
  }
  state = { logo, ready: true };
  for (const f of subscribers) f();
}

const subscribe = (f: () => void) => {
  subscribers.add(f);
  return () => void subscribers.delete(f);
};

/** The logo, null when there is none; `ready` once storage has been read. */
export const useLogo = () => useSyncExternalStore(subscribe, () => state);

/** The image at RASTER on its long side (SVGs drawn at that size, other images only made smaller). */
async function rasterise(blob: Blob): Promise<ImageBitmap> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    // An SVG without a size of its own reports none (or 300×150): draw it square-ish then.
    const w = img.naturalWidth || 512;
    const h = img.naturalHeight || 512;
    const svg = blob.type === "image/svg+xml";
    const scale = svg ? RASTER / Math.max(w, h) : Math.min(1, RASTER / Math.max(w, h));
    return await createImageBitmap(img, {
      resizeWidth: Math.max(1, Math.round(w * scale)),
      resizeHeight: Math.max(1, Math.round(h * scale)),
      resizeQuality: "high",
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function toLogo(name: string, blob: Blob): Promise<Logo> {
  return { name, url: URL.createObjectURL(blob), bitmap: await rasterise(blob) };
}

getLogo()
  .then(async (l) => publish(l ? await toLogo(l.name, l.blob) : null))
  .catch(() => publish(null));

/** Check, store and use an image as the logo. Throws with a message for the user. */
export async function setLogoFile(file: File): Promise<void> {
  if (file.size > MAX_BYTES) throw new Error("Logo dosyası çok büyük (10 MB üstü).");
  let logo: Logo;
  try {
    logo = await toLogo(stripExt(file.name), file);
  } catch {
    throw new Error("Bu dosya resim olarak açılamadı (PNG, SVG, WebP ya da JPEG olmalı).");
  }
  await saveLogo({ name: logo.name, blob: file });
  publish(logo);
}

export async function removeLogo() {
  await deleteLogo();
  publish(null);
}
