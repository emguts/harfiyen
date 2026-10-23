// The user's logo: one image, kept in this browser and shared by every
// project (see storedImage.ts). Where it sits, how big and how solid is part
// of the caption settings (LogoSettings).

import { imageStore } from "./storedImage";

const store = imageStore("logo", {
  // Sharp at 4K at the largest logo size.
  raster: 1024,
  maxBytes: 10 * 1024 * 1024,
  tooBig: "Logo dosyası çok büyük (10 MB üstü).",
  unreadable: "Bu dosya resim olarak açılamadı (PNG, SVG, WebP ya da JPEG olmalı).",
});

/** The logo, null when there is none; `ready` once storage has been read. */
export const useLogo = () => {
  const { image, ready } = store.useImage();
  return { logo: image, ready };
};

export const setLogoFile = store.set;
export const removeLogo = store.remove;
