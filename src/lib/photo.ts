// The user's background photo: one image, kept in this browser and shared by
// every project (see storedImage.ts), drawn over the whole frame in place of
// the aura. Whether a project uses it, and blurred or not, is part of the
// caption settings.

import { imageStore } from "./storedImage";

const store = imageStore("photo", {
  // Covers a 4K frame.
  raster: 3840,
  maxBytes: 25 * 1024 * 1024,
  tooBig: "Fotoğraf çok büyük (25 MB üstü).",
  unreadable: "Bu dosya resim olarak açılamadı (JPEG, PNG, WebP ya da SVG olmalı).",
});

/** The photo, null when there is none; `ready` once storage has been read. */
export const usePhoto = () => {
  const { image, ready } = store.useImage();
  return { photo: image, ready };
};

export const setPhotoFile = store.set;
export const removePhoto = store.remove;
