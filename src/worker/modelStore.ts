// Downloads model files once and keeps them in the Cache API, so later visits
// (and offline use) never touch the network.
//
// Every file is checked before use, from the cache or the network: its size
// against model.json, and an .onnx file's first byte. A bad cached copy (a
// download cut short, a browser that stored the stream wrongly) is dropped
// and fetched again; a bad download is retried once, bypassing the HTTP cache.

const CACHE_NAME = "seda-models-v1";

export interface FileRequest {
  url: string;
  /** Exact size, checked once downloaded; also gives progress before the response headers arrive. */
  size: number;
  /** The size is only an estimate (the wasm runtime): not checked. */
  approx?: boolean;
}

export type Progress = (loaded: number, total: number, fromCache: boolean) => void;

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches === "undefined" ? null : await caches.open(CACHE_NAME);
  } catch {
    return null; // e.g. insecure context or storage disabled
  }
}

const cacheKey = (f: FileRequest) => `${f.url}?size=${f.size}`;

/** True if every file is in the cache, in any version (works on the page too). */
export async function allCached(urls: string[]): Promise<boolean> {
  const cache = await openCache();
  if (!cache) return false;
  for (const url of urls) if (!(await cache.match(new URL(url, location.href).href, { ignoreSearch: true }))) return false;
  return true;
}

/**
 * Read a body into one buffer. With the expected size the buffer is
 * allocated once, so a 1.3 GB model does not need twice its size in memory.
 */
async function readWithProgress(res: Response, expected: number, onChunk: (n: number) => void): Promise<Uint8Array> {
  if (!res.body) {
    const b = new Uint8Array(await res.arrayBuffer());
    onChunk(b.length);
    return b;
  }
  const reader = res.body.getReader();
  let out = new Uint8Array(expected);
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.length > out.length) {
      const next = new Uint8Array(Math.max(out.length * 2, size + value.length));
      next.set(out.subarray(0, size));
      out = next;
    }
    out.set(value, size);
    size += value.length;
    onChunk(value.length);
  }
  return size === out.length ? out : out.slice(0, size);
}

/** Why the bytes are not the expected file, or null when they look right. */
function problem(f: FileRequest, b: Uint8Array): string | null {
  if (!f.approx && b.length !== f.size) return `${b.length} bayt geldi, ${f.size} bekleniyordu`;
  // An ONNX model is a protobuf that starts with its IR version (field 1, varint): 0x08.
  if (new URL(f.url, location.href).pathname.endsWith(".onnx") && b[0] !== 0x08)
    return b[0] === 0x3c ? "model yerine bir web sayfası geldi" : "dosya bir ONNX modeli değil";
  return null;
}

const fileName = (f: FileRequest) => new URL(f.url, location.href).pathname.split("/").pop();

/** Fetch all files, reporting combined progress. Results keep the input order. */
export async function fetchAll(files: FileRequest[], onProgress: Progress): Promise<Uint8Array[]> {
  const cache = await openCache();
  const total = files.reduce((a, f) => a + f.size, 0);
  let loaded = 0;
  let allCached = true;

  async function download(f: FileRequest, key: string, reload: boolean): Promise<Uint8Array> {
    const res = await fetch(f.url, reload ? { cache: "reload" } : undefined);
    if (!res.ok) throw new Error(`${f.url}: HTTP ${res.status}`);
    // The cache gets its own copy of the stream instead of the finished buffer.
    let body = res;
    let stored: Promise<void> = Promise.resolve();
    if (cache && res.body) {
      const [mine, theirs] = res.body.tee();
      body = new Response(mine);
      stored = (async () => {
        // Drop older versions of this file before storing the new one.
        for (const req of await cache.keys()) {
          if (req.url.startsWith(new URL(f.url, location.href).href + "?")) await cache.delete(req);
        }
        await cache.put(key, new Response(theirs));
      })().catch(() => {
        // Quota exceeded: still usable for this session. Stop the copy
        // from buffering the rest of the download.
        theirs.cancel().catch(() => {});
      });
    }
    let got = 0;
    const b = await readWithProgress(body, f.size, (n) => {
      got += n;
      loaded += n;
      onProgress(Math.min(loaded, total), total, false);
    });
    // Some servers report a different size (compression); settle the count.
    loaded += f.size - got;
    await stored;
    return b;
  }

  const results = await Promise.all(
    files.map(async (f) => {
      const key = cacheKey(f);
      const hit = cache ? await cache.match(key) : undefined;
      if (hit) {
        const b = new Uint8Array(await hit.arrayBuffer());
        if (!problem(f, b)) {
          loaded += f.size;
          onProgress(loaded, total, allCached);
          return b;
        }
        await cache!.delete(key);
      }
      allCached = false;
      let b = await download(f, key, false);
      let why = problem(f, b);
      if (why) {
        // Once more, past the browser's HTTP cache, which may hold the same bad copy.
        await cache?.delete(key);
        loaded -= f.size;
        b = await download(f, key, true);
        why = problem(f, b);
      }
      if (why) {
        await cache?.delete(key);
        throw new Error(`${fileName(f)} indirilemedi: ${why}.`);
      }
      return b;
    }),
  );
  onProgress(total, total, allCached);
  return results;
}
