// Models are not shipped in the installer (they are ~1.8 GB). The page asks for
// them at /models/... on its own origin and the main process answers: from
// <userData>/models when the file is there, otherwise from the public model host,
// writing it to that folder as it streams to the page. From the page's view it
// stays same-origin, so there is no CORS / COEP trouble.
//
// The page's own Cache API is not used in the desktop app (src/worker/modelStore.ts):
// it is per origin, so the dev server and the built app each kept a copy and
// downloaded everything twice. This folder is shared by both.
//
// A file being downloaded is <name>.part; a cut-short download resumes from its
// end with a Range request. A model.json is fetched fresh every time (offline,
// the stored copy answers), and a stored file whose size no longer matches it is
// dropped, so an updated model is downloaded again.

import { existsSync, statSync } from "node:fs";
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, sep } from "node:path";
import { app, net } from "electron";

// The host harfiyen.dev itself loads models from (VITE_MODELS_BASE_URL there).
export const MODELS_URL = (process.env.HARFIYEN_MODELS_URL || "https://cdn.harfiyen.dev/models").replace(/\/+$/, "");

export const STORE = join(app.getPath("userData"), "models");

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

/** The page's list of stored files, and where it sends files from its old cache. */
const LIST = "/models/.store";

class HttpError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

/** The stored file for /models/<rest>, or null if the path leaves the folder. */
function storePath(pathname) {
  let rest;
  try {
    rest = decodeURIComponent(pathname.slice("/models/".length));
  } catch {
    return null;
  }
  const path = normalize(join(STORE, rest));
  const rel = relative(STORE, path);
  if (!rel || rel.startsWith("..") || isAbsolute(rel) || rel.endsWith(".part") || rel.endsWith(".import")) return null;
  return path;
}

/** GET /models/<rest> from the model host, or from FALLBACK when the host does not have it. */
async function remote(pathname, headers = {}, signal) {
  const res = await net.fetch(MODELS_URL + pathname.slice("/models".length), { headers, signal });
  const fallback = res.status === 404 && FALLBACK[pathname];
  if (fallback?.json) return new Response(JSON.stringify(fallback.json), { headers: { "Content-Type": "application/json" } });
  if (fallback) return net.fetch(fallback.url, { headers, signal });
  return res;
}

/** Drop stored files of this model whose size is not the manifest's, and parts longer than it. */
async function prune(dir, files) {
  for (const [name, size] of Object.entries(files ?? {})) {
    const file = join(dir, name);
    for (const [path, ok] of [
      [file, (n) => n === size],
      [`${file}.part`, (n) => n < size],
    ]) {
      const st = await stat(path).catch(() => null);
      if (st && !ok(st.size)) await rm(path, { force: true });
    }
  }
}

/** A model.json: fresh from the host, stored for offline use; the stored copy when the host cannot be reached. */
async function manifest(pathname, file) {
  try {
    const res = await remote(pathname);
    if (!res.ok) throw new HttpError(res.status);
    const text = await res.text();
    const json = JSON.parse(text);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
    await prune(dirname(file), json.files);
    return { body: text, hit: false };
  } catch (e) {
    if (existsSync(file)) return { body: await readFile(file, "utf8"), hit: true };
    throw e instanceof HttpError ? e : new HttpError(502);
  }
}

// ---- downloads ----

/**
 * Files being written, by path. Every request for one reads it as it grows, so
 * a file is downloaded once however many ask for it. Stored files get the same
 * shape, already done.
 */
const downloads = new Map();

const wake = (d) => {
  for (const w of d.waiters) w();
  d.waiters.clear();
};

function stored(file) {
  const size = statSync(file).size;
  return { file, part: file, total: size, written: size, done: true, error: null, waiters: new Set(), readers: 0, head: Promise.resolve() };
}

/** Start (or join) the download of this file. Its `head` resolves once the host answered and writing began. */
function download(pathname, file) {
  let d = downloads.get(file);
  if (!d) {
    d = {
      file,
      part: `${file}.part`,
      total: null,
      written: 0,
      done: false,
      error: null,
      waiters: new Set(),
      readers: 0,
      abort: new AbortController(),
    };
    d.head = new Promise((resolve, reject) => {
      d.began = resolve;
      d.failed = reject;
    });
    d.head.catch(() => {});
    downloads.set(file, d);
    void run(d, pathname);
  }
  return d;
}

async function run(d, pathname) {
  let fh;
  let started = false;
  try {
    await mkdir(dirname(d.file), { recursive: true });
    let have = (await stat(d.part).catch(() => null))?.size ?? 0;
    const res = await remote(pathname, have ? { Range: `bytes=${have}-` } : {}, d.abort.signal);
    if (res.status === 206) {
      d.total = Number(res.headers.get("content-range")?.split("/")[1]) || null;
    } else if (res.ok) {
      have = 0; // the host sent the whole file
      // net.fetch hands over a decoded body; a compressed one's length does not describe it.
      d.total = res.headers.has("content-encoding") ? null : Number(res.headers.get("content-length")) || null;
    } else {
      throw new HttpError(res.status === 416 ? 502 : res.status);
    }
    fh = await open(d.part, have ? "r+" : "w");
    d.written = have;
    started = true;
    d.began();
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await fh.write(value, 0, value.length, d.written);
      d.written += value.length;
      wake(d);
    }
    await fh.close();
    fh = null;
    if (d.total !== null && d.written !== d.total) throw new Error(`${d.written} bayt geldi, ${d.total} bekleniyordu`);
    d.total = d.written;
    await rename(d.part, d.file);
    d.done = true;
  } catch (e) {
    d.error = e;
    if (!started) d.failed(e);
  } finally {
    await fh?.close().catch(() => {});
    downloads.delete(d.file);
    wake(d);
  }
}

/** Bytes start..end-1 of a file, read as it is written. When the last reader of an unfinished download goes, it stops; the part stays. */
function reader(d, start, end) {
  let pos = start;
  let fh = null;
  let done = false;
  d.readers++;
  const release = async () => {
    if (done) return;
    done = true;
    await fh?.close().catch(() => {});
    if (--d.readers === 0 && !d.done && !d.error) d.abort?.abort();
  };
  return new ReadableStream({
    type: "bytes",
    async pull(ctl) {
      try {
        for (;;) {
          if (d.error && !d.done) throw d.error;
          const last = end ?? (d.done ? d.written : Infinity);
          if (pos >= last) {
            await release();
            ctl.close();
            return;
          }
          const upto = Math.min(last, d.written);
          if (pos < upto) {
            // Opened on the part while it is written; the handle survives its rename.
            fh ??= await open(existsSync(d.part) ? d.part : d.file, "r");
            const buf = new Uint8Array(Math.min(1 << 20, upto - pos));
            const { bytesRead } = await fh.read(buf, 0, buf.length, pos);
            if (!bytesRead) throw new Error("dosya beklenenden kısa");
            pos += bytesRead;
            ctl.enqueue(buf.subarray(0, bytesRead));
            return;
          }
          await new Promise((r) => d.waiters.add(r));
        }
      } catch (e) {
        await release();
        ctl.error(e);
      }
    },
    cancel: release,
  });
}

/** Byte range from a Range header, or null for the whole file; "bad" if it cannot be served. */
function range(header, total) {
  const m = /^bytes=(\d+)-(\d*)$/.exec(header ?? "");
  if (!m || total === null) return null;
  const start = Number(m[1]);
  const end = m[2] ? Math.min(Number(m[2]) + 1, total) : total;
  return start < total && start < end ? { start, end } : "bad";
}

async function serveFile(req, pathname, file, isolation) {
  const d = existsSync(file) && !downloads.has(file) ? stored(file) : download(pathname, file);
  const hit = d.done;
  await d.head;
  const headers = { ...isolation, "Content-Type": "application/octet-stream", "Accept-Ranges": "bytes", "X-Model-Store": hit ? "hit" : "miss" };
  const r = range(req.headers.get("range"), d.total);
  if (r === "bad") return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${d.total}` } });
  if (r) {
    headers["Content-Range"] = `bytes ${r.start}-${r.end - 1}/${d.total}`;
    headers["Content-Length"] = String(r.end - r.start);
    return new Response(reader(d, r.start, r.end), { status: 206, headers });
  }
  if (d.total !== null) headers["Content-Length"] = String(d.total);
  return new Response(reader(d, 0, d.total ?? undefined), { status: 200, headers });
}

// ---- managed from the page ----

/** Every file under a models folder, as the page addresses it, with its size. */
async function list(base, dir = base) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await list(base, path)));
    else if (!/\.(part|import)$/.test(e.name)) {
      out.push({ path: `/models/${relative(base, path).split(sep).map(encodeURIComponent).join("/")}`, size: (await stat(path)).size });
    }
  }
  return out;
}

/**
 * PUT /models/<rest>?offset=N&total=T: one piece of a file the page had in its
 * old cache, sent in order. Written to <name>.import, which becomes the file
 * with its last piece, unless a download got there first.
 */
async function importPiece(req, file) {
  const q = new URL(req.url).searchParams;
  const offset = Number(q.get("offset"));
  const total = Number(q.get("total"));
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(total) || offset < 0 || total <= 0) return 400;
  if (existsSync(file)) return 204;
  const body = new Uint8Array(await req.arrayBuffer());
  if (offset + body.length > total) return 400;
  const tmp = `${file}.import`;
  // Pieces come in order, each where the last one ended; offset 0 starts over.
  if (offset && (await stat(tmp).catch(() => null))?.size !== offset) return 409;
  await mkdir(dirname(file), { recursive: true });
  const fh = await open(tmp, offset ? "r+" : "w");
  try {
    await fh.write(body, 0, body.length, offset);
  } finally {
    await fh.close();
  }
  if (offset + body.length === total && !existsSync(file)) {
    if ((await stat(tmp)).size !== total) return 400;
    await rename(tmp, file);
  }
  return 204;
}

/**
 * Answer a /models/... request of the page. `local` is the models folder the
 * page is served with (dist/models, public/models): its files win over the
 * store's, so the list shows them too.
 */
export async function serveModel(req, pathname, isolation, local) {
  const json = { ...isolation, "Content-Type": "application/json" };
  try {
    if (pathname === LIST) {
      const files = new Map([...(await list(STORE)), ...(await list(local))].map((f) => [f.path, f]));
      return new Response(JSON.stringify([...files.values()]), { headers: json });
    }
    const file = storePath(pathname);
    if (!file) return new Response("Not found", { status: 404, headers: isolation });
    if (req.method === "DELETE") {
      downloads.get(file)?.abort.abort();
      await rm(file, { force: true });
      await rm(`${file}.part`, { force: true });
      return new Response(null, { status: 204, headers: isolation });
    }
    if (req.method === "PUT") return new Response(null, { status: await importPiece(req, file), headers: isolation });
    if (pathname.endsWith("/model.json")) {
      const { body, hit } = await manifest(pathname, file);
      return new Response(body, { headers: { ...json, "Cache-Control": "no-store", "X-Model-Store": hit ? "hit" : "miss" } });
    }
    return await serveFile(req, pathname, file, isolation);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 502;
    return new Response(status === 502 ? "Model sunucusuna ulaşılamadı" : e.message, { status, headers: isolation });
  }
}
