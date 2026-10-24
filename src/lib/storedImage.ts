// One image of the user's, kept in this browser (IndexedDB) and shared by
// every project: the logo, the background photo. Each is drawn by the
// compositor in the player and in the export alike; it travels to the render
// worker as an ImageBitmap, rasterised here so SVGs work there too.

import { useSyncExternalStore } from "react";
import { deleteAsset, getAsset, saveAsset, stripExt, type AssetKey } from "./projectStore";

export interface UserImage {
  name: string;
  /** For the preview in the panel. */
  url: string;
  bitmap: ImageBitmap;
}

export interface ImageStore {
  /** The image, null when there is none; `ready` once storage has been read. */
  useImage: () => { image: UserImage | null; ready: boolean };
  /** Check, store and use a file. Throws with a message for the user. */
  set: (file: File) => Promise<void>;
  remove: () => Promise<void>;
}

/**
 * The store for one image. `raster` is the bitmap's long side: SVGs are drawn at it,
 * other images only made smaller. Files above `maxBytes` are refused with `tooBig`.
 */
export function imageStore(
  key: AssetKey,
  { raster, maxBytes, tooBig, unreadable }: { raster: number; maxBytes: number; tooBig: string; unreadable: string },
): ImageStore {
  let state: { image: UserImage | null; ready: boolean } = { image: null, ready: false };
  const subscribers = new Set<() => void>();

  const publish = (image: UserImage | null) => {
    const old = state.image;
    if (old && old !== image) {
      URL.revokeObjectURL(old.url);
      // The player may draw it once more before it hears of the new one.
      setTimeout(() => old.bitmap.close(), 1000);
    }
    state = { image, ready: true };
    for (const f of subscribers) f();
  };

  const subscribe = (f: () => void) => {
    subscribers.add(f);
    return () => void subscribers.delete(f);
  };

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
      const scale = svg ? raster / Math.max(w, h) : Math.min(1, raster / Math.max(w, h));
      return await createImageBitmap(img, {
        resizeWidth: Math.max(1, Math.round(w * scale)),
        resizeHeight: Math.max(1, Math.round(h * scale)),
        resizeQuality: "high",
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const toImage = async (name: string, blob: Blob): Promise<UserImage> => ({
    name,
    url: URL.createObjectURL(blob),
    bitmap: await rasterise(blob),
  });

  getAsset(key)
    .then(async (l) => publish(l ? await toImage(l.name, l.blob) : null))
    .catch(() => publish(null));

  return {
    useImage: () => useSyncExternalStore(subscribe, () => state),
    set: async (file) => {
      if (file.size > maxBytes) throw new Error(tooBig);
      let image: UserImage;
      try {
        image = await toImage(stripExt(file.name), file);
      } catch {
        throw new Error(unreadable);
      }
      await saveAsset(key, { name: image.name, blob: file });
      publish(image);
    },
    remove: async () => {
      await deleteAsset(key);
      publish(null);
    },
  };
}
