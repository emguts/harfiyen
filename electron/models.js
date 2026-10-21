// Models are not shipped in the installer (they are ~1.8 GB). The page asks for
// them at /models/... on its own origin; when a file is not in dist/models the
// request is answered from the public model host instead. From the page's view it
// stays same-origin, so there is no CORS / COEP trouble, and the page keeps
// caching what it downloads (src/worker/modelStore.ts).

import { net } from "electron";

// The host harfiyen.dev itself loads models from (VITE_MODELS_BASE_URL there).
export const MODELS_URL = (process.env.HARFIYEN_MODELS_URL || "https://cdn.harfiyen.dev/models").replace(/\/+$/, "");

export const isModelPath = (pathname) => pathname.startsWith("/models/");

// Models the public host does not carry (yet): their files from Hugging Face, pinned, and their
// manifest as `npm run models` writes it (scripts/prepare_models.py).
const VOCALS_HF = "https://huggingface.co/audiojs/mel-roformer/resolve/c1aba02c00a0bee852d6754fe6ede8164f90a4b3";
const FALLBACK = {
  "/models/mel-roformer/model.json": {
    json: {
      name: "mel-roformer",
      sampleRate: 44100,
      nFft: 2048,
      hop: 441,
      segment: 352800,
      step: 0.5,
      fade: 0.1,
      files: { "mel-roformer.fp16.onnx": 464050097 },
    },
  },
  "/models/mel-roformer/mel-roformer.fp16.onnx": { url: `${VOCALS_HF}/mel-roformer.fp16.onnx` },
};

/** Fetch `/models/<rest>` from the model host. Range requests pass through, so resumed downloads work. */
export async function fetchModel(req, pathname, isolation) {
  const headers = new Headers();
  for (const name of ["range", "if-range", "if-none-match"]) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }
  try {
    let res = await net.fetch(MODELS_URL + pathname.slice("/models".length), { headers });
    const fallback = res.status === 404 && FALLBACK[pathname];
    if (fallback?.json) {
      return new Response(JSON.stringify(fallback.json), { headers: { ...isolation, "Content-Type": "application/json" } });
    }
    if (fallback) res = await net.fetch(fallback.url, { headers });
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
