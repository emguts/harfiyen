// Models are not shipped in the installer (they are ~1.8 GB). The page asks for
// them at /models/... on its own origin; when a file is not in dist/models the
// request is answered from the public model host instead. From the page's view it
// stays same-origin, so there is no CORS / COEP trouble, and the page keeps
// caching what it downloads (src/worker/modelStore.ts).

import { net } from "electron";

// The host harfiyen.dev itself loads models from (VITE_MODELS_BASE_URL there).
export const MODELS_URL = (process.env.HARFIYEN_MODELS_URL || "https://cdn.harfiyen.dev/models").replace(/\/+$/, "");

export const isModelPath = (pathname) => pathname.startsWith("/models/");

/** Fetch `/models/<rest>` from the model host. Range requests pass through, so resumed downloads work. */
export async function fetchModel(req, pathname, isolation) {
  const headers = new Headers();
  for (const name of ["range", "if-range", "if-none-match"]) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }
  try {
    const res = await net.fetch(MODELS_URL + pathname.slice("/models".length), { headers });
    const out = new Headers(res.headers);
    // net.fetch hands over a decoded body; the original length/encoding no longer describe it.
    if (out.has("content-encoding")) {
      out.delete("content-encoding");
      out.delete("content-length");
    }
    for (const [k, v] of Object.entries(isolation)) out.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
  } catch {
    return new Response("Model sunucusuna ulaşılamadı", { status: 502, headers: isolation });
  }
}
