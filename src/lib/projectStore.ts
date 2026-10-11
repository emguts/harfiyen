// Projects live in IndexedDB: the transcript, style and waveform in one
// store, the media in another, so the project list never loads a video.
//
// Media is kept one of two ways: a file handle (Chromium; no copy, the file
// stays where it is) or a copy of the file (other browsers, recordings).
// Files too large to copy are linked again by hand when the project opens.

import type { CaptionSettings } from "../captions/style";
import type { DecodingMethod, Word } from "../engine";
import { DEFAULT_MODEL, isModelId, type ModelId } from "../models";

export interface MediaInfo {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

export type MediaStorage = "handle" | "copy" | "none";

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Made from the microphone. */
  live: boolean;
  /** Missing in projects saved before there was a choice (seda). */
  model?: ModelId;
  method: DecodingMethod;
  duration: number | null;
  elapsed: number | null;
  words: Word[];
  peaks: Float32Array;
  bands: Float32Array;
  settings: CaptionSettings;
  media: MediaInfo | null;
  storage: MediaStorage;
}

/** What the media store holds for a project. */
export type StoredMedia = { kind: "copy"; file: File } | { kind: "handle"; handle: FileSystemFileHandle };

/** Copies above this stay on disk only; the user picks the file again. */
export const COPY_LIMIT = 1024 ** 3;

const DB_NAME = "harfiyen";
const PROJECTS = "projects";
const MEDIA = "media";

let db: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  db ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(PROJECTS, { keyPath: "id" });
      req.result.createObjectStore(MEDIA);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((e) => {
    db = null; // Try again next time (e.g. a blocked upgrade).
    throw e;
  });
  return db;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => void): Promise<void> {
  const t = (await open()).transaction(stores, mode);
  fn(t);
  await new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = t.onabort = () => reject(t.error);
  });
}

export async function listProjects(): Promise<Project[]> {
  const t = (await open()).transaction(PROJECTS);
  const all = await done(t.objectStore(PROJECTS).getAll() as IDBRequest<Project[]>);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<Project | undefined> {
  const t = (await open()).transaction(PROJECTS);
  return done(t.objectStore(PROJECTS).get(id) as IDBRequest<Project | undefined>);
}

export const saveProject = (p: Project) => tx([PROJECTS], "readwrite", (t) => t.objectStore(PROJECTS).put(p));

export async function getMedia(id: string): Promise<StoredMedia | undefined> {
  const t = (await open()).transaction(MEDIA);
  return done(t.objectStore(MEDIA).get(id) as IDBRequest<StoredMedia | undefined>);
}

/** Store the media and record how, in one transaction. */
export const saveMedia = (p: Project, m: StoredMedia) =>
  tx([PROJECTS, MEDIA], "readwrite", (t) => {
    t.objectStore(MEDIA).put(m, p.id);
    t.objectStore(PROJECTS).put(p);
  });

export const deleteProject = (id: string) =>
  tx([PROJECTS, MEDIA], "readwrite", (t) => {
    t.objectStore(PROJECTS).delete(id);
    t.objectStore(MEDIA).delete(id);
  });

/** Room for a copy of `bytes`, leaving some headroom. */
export async function canCopy(bytes: number): Promise<boolean> {
  try {
    const { quota = 0, usage = 0 } = await navigator.storage.estimate();
    return quota - usage > bytes * 1.1 + 50_000_000;
  } catch {
    return true; // No estimate: try, a quota error just skips the copy.
  }
}

let persistAsked = false;
/** Ask the browser not to evict projects when space runs low. */
export function askPersist() {
  if (persistAsked) return;
  persistAsked = true;
  void navigator.storage?.persist?.().catch(() => {});
}

/** "röportaj.mp4" -> "röportaj": projects are named after their file. */
export function stripExt(name: string) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

/** Older projects kept the file name with its extension. */
export const projectTitle = (p: Project) => (p.media && p.name === p.media.name ? stripExt(p.name) : p.name);

export const mediaInfo = (f: File): MediaInfo => ({
  name: f.name,
  size: f.size,
  type: f.type,
  lastModified: f.lastModified,
});

/** The picked file looks like the one the project was made from. */
export const sameMedia = (m: MediaInfo | null, f: File) => !m || m.size === f.size;

// ---- File System Access (Chromium) ----

type Permission = "granted" | "denied" | "prompt";
type HandlePermissions = {
  queryPermission?: (d: { mode: "read" }) => Promise<Permission>;
  requestPermission?: (d: { mode: "read" }) => Promise<Permission>;
};

/**
 * The file behind a stored handle. Must run from a click: asking for
 * permission again needs a user gesture. Null when it is gone or refused.
 */
export async function fileFromHandle(handle: FileSystemFileHandle): Promise<File | null> {
  try {
    const h = handle as FileSystemFileHandle & HandlePermissions;
    let state = (await h.queryPermission?.({ mode: "read" })) ?? "granted";
    if (state === "prompt") state = (await h.requestPermission?.({ mode: "read" })) ?? "denied";
    return state === "granted" ? await handle.getFile() : null;
  } catch {
    return null; // Moved, deleted or renamed.
  }
}

// ---- Project file (.harfiyen) ----

export const PROJECT_EXT = ".harfiyen";
const FORMAT = "harfiyen-project";

function toBase64(a: Float32Array): string {
  const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(s: unknown): Float32Array {
  if (typeof s !== "string" || !s) return new Float32Array(0);
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length - (bin.length % 4));
  for (let i = 0; i < bytes.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

/** The project as a portable file. The media is not included. */
export function projectToFile(p: Project): string {
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return JSON.stringify({
    format: FORMAT,
    version: 1,
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    live: p.live,
    model: p.model,
    method: p.method,
    duration: p.duration,
    elapsed: p.elapsed,
    media: p.media,
    settings: p.settings,
    words: p.words.map((w) => ({ text: w.text, start: r(w.start), end: r(w.end) })),
    peaks: toBase64(p.peaks),
    bands: toBase64(p.bands),
  });
}

/** Read a project file; throws a readable message when it is not one. */
export function projectFromFile(text: string, defaults: CaptionSettings): Project {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error("Proje dosyası okunamadı.");
  }
  if (d?.format !== FORMAT || !Array.isArray(d.words)) throw new Error("Bu bir Harfiyen proje dosyası değil.");
  if (typeof d.version !== "number" || d.version > 1)
    throw new Error("Bu proje dosyası daha yeni bir Harfiyen sürümüyle kaydedilmiş.");
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const words = (d.words as Record<string, unknown>[])
    .filter((w) => typeof w?.text === "string" && num(w.start) !== null && num(w.end) !== null)
    .map((w) => ({ text: w.text as string, start: w.start as number, end: w.end as number }));
  const media = d.media as MediaInfo | null;
  const now = Date.now();
  return {
    id: typeof d.id === "string" && d.id ? d.id : crypto.randomUUID(),
    name: typeof d.name === "string" && d.name ? d.name : "Adsız proje",
    createdAt: num(d.createdAt) ?? now,
    updatedAt: now,
    live: d.live === true,
    model: isModelId(d.model) ? d.model : DEFAULT_MODEL,
    method: (d.method as DecodingMethod) ?? "beam-lm",
    duration: num(d.duration),
    elapsed: num(d.elapsed),
    words,
    peaks: fromBase64(d.peaks),
    bands: fromBase64(d.bands),
    settings: { ...defaults, ...(d.settings as Partial<CaptionSettings>) },
    media: media && typeof media.name === "string" && typeof media.size === "number" ? media : null,
    storage: "none",
  };
}
