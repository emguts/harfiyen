// Types for the parts of frontend.js (copied unchanged from the cloud0day3/antalia-mini Space) that mini.ts uses.

export interface Frontend {
  /** Raw text -> the model's lowercase, spelled-out alphabet. */
  modelText(raw: string): string;
  warmup(): void;
}

export function createFrontend(data: unknown): Frontend;
/** frontend-data.json.gz, gunzipped and parsed. */
export function decodeAsset(bytes: Uint8Array | ArrayBuffer): Promise<unknown>;
