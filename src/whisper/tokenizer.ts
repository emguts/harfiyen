// Whisper's byte-level BPE vocabulary, used for decoding (and, roughly, for
// encoding known text to align it, see encodeWord). Token strings
// spell bytes with GPT-2's printable byte alphabet; a Turkish letter can be
// split across two tokens, so words are assembled from bytes, not strings.

function byteDecoder(): Map<string, number> {
  const bs: number[] = [];
  for (let b = 33; b <= 126; b++) bs.push(b);
  for (let b = 161; b <= 172; b++) bs.push(b);
  for (let b = 174; b <= 255; b++) bs.push(b);
  const cs = [...bs];
  let n = 0;
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b);
      cs.push(256 + n++);
    }
  }
  return new Map(bs.map((b, i) => [String.fromCharCode(cs[i]), b]));
}

const SPACE = 0x20;

/** Longest token string in the vocabulary worth trying when encoding. */
const MAX_TOKEN = 32;

export class WhisperTokenizer {
  private bytes: Uint8Array[] = [];
  private utf8 = new TextDecoder();
  private ids: Map<string, number>;
  private byteChar: string[] = [];

  /** `vocab`: vocab.json, token string -> id (special tokens are not needed). */
  constructor(vocab: Record<string, number>) {
    const dec = byteDecoder();
    for (const [ch, b] of dec) this.byteChar[b] = ch;
    this.ids = new Map(Object.entries(vocab));
    for (const [s, id] of Object.entries(vocab)) {
      this.bytes[id] = Uint8Array.from(s, (ch) => dec.get(ch) ?? 0);
    }
  }

  /**
   * Tokens for one word with its leading space, for forced alignment. Greedy
   * longest match over the vocabulary: without the BPE merges this is not
   * always Whisper's own split, but it spells the same bytes, which is what
   * the alignment heads follow. From emguts/harfiyen.
   */
  encodeWord(word: string): number[] {
    const s = Array.from(new TextEncoder().encode(` ${word}`), (b) => this.byteChar[b]).join("");
    const out: number[] = [];
    let p = 0;
    while (p < s.length) {
      let len = Math.min(MAX_TOKEN, s.length - p);
      while (len > 1 && !this.ids.has(s.slice(p, p + len))) len--;
      const id = this.ids.get(s.slice(p, p + len));
      if (id === undefined) return []; // A byte missing from the vocabulary: cannot happen with Whisper's.
      out.push(id);
      p += len;
    }
    return out;
  }

  tokenBytes(id: number): Uint8Array {
    return this.bytes[id] ?? new Uint8Array(0);
  }

  /** True if the token starts a new word (leading space). */
  startsWord(id: number): boolean {
    return this.bytes[id]?.[0] === SPACE;
  }

  decode(ids: number[]): string {
    const parts = ids.map((id) => this.tokenBytes(id));
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }
    return this.utf8.decode(out);
  }
}
