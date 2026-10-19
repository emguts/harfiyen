// Punctuation, casing and apostrophes for a Turkish transcript, with the
// formatter that ships with seda-v0.2 (a small Turkish BERT, int8 ONNX).
// Port of sedalib's Formatter without its number step: numbers are written by
// src/lib/numbers.ts, the way the user chose. One written word comes back for
// every input word, so the transcript's timestamps survive.

import type { Ort } from "../engine/models";
import { WordPieceTokenizer, type WordPieceVocab } from "./wordpiece";

export interface FormatterConfig {
  /** Labels of the three heads, in the model's output order. */
  punct: string[];
  case: ("lower" | "title" | "upper")[];
  /** Words per model call; the model was trained on windows of up to this many. */
  windowWords: number;
  /** Tokens per call, [CLS] and [SEP] included; words past it get no marks. */
  maxTokens: number;
  files: Record<string, number>;
}

const upperTr = (s: string) => s.toLocaleUpperCase("tr-TR");

export class Formatter {
  private constructor(
    private ort: Ort,
    private session: Awaited<ReturnType<Ort["InferenceSession"]["create"]>>,
    private tok: WordPieceTokenizer,
    private cfg: FormatterConfig,
  ) {}

  /** Runs on the CPU (wasm in the browser, "cpu" in Node): it is a one-off pass over the text. */
  static async create(
    ort: Ort,
    model: Uint8Array,
    vocab: WordPieceVocab,
    cfg: FormatterConfig,
    provider: "wasm" | "cpu" = "wasm",
  ): Promise<Formatter> {
    const session = await ort.InferenceSession.create(model, {
      executionProviders: [provider],
      graphOptimizationLevel: "all",
      logSeverityLevel: 3,
    });
    return new Formatter(ort, session, new WordPieceTokenizer(vocab), cfg);
  }

  /** words: lowercase, unpunctuated, one entry per word (no spaces inside). Returns them written. */
  async run(words: string[], onProgress?: (done: number, total: number) => void): Promise<string[]> {
    const labels: [number, number, number][] = [];
    const W = this.cfg.windowWords;
    const windows = Math.ceil(words.length / W);
    for (let w = 0; w < windows; w++) {
      labels.push(...(await this.predict(words.slice(w * W, (w + 1) * W))));
      onProgress?.(w + 1, windows);
    }

    let sentenceStart = true;
    return words.map((word, i) => {
      const [p, c, a] = labels[i];
      // The heads are independent, so the word after a predicted . ? ! starts a sentence.
      let kase = this.cfg.case[c];
      if (sentenceStart && kase === "lower") kase = "title";
      let post = this.cfg.punct[p];
      sentenceStart = post === "." || post === "?" || post === "!";
      // The transcript's last word ends a sentence.
      if (i === words.length - 1 && !post) post = ".";
      let text = word;
      const chars = Array.from(text);
      // Numbers keep their writing ("1923'te").
      if (chars.length && !/\d/.test(text)) {
        // The apostrophe head gives the suffix length: "istanbulda", 2 -> "istanbul'da".
        if (a > 0 && a < chars.length) text = chars.slice(0, -a).join("") + "'" + chars.slice(-a).join("");
        if (kase === "title") text = upperTr(chars[0]) + text.slice(chars[0].length);
        else if (kase === "upper") {
          const cut = text.indexOf("'");
          text = cut < 0 ? upperTr(text) : upperTr(text.slice(0, cut)) + text.slice(cut);
        }
      }
      return text + post;
    });
  }

  /** (punctuation, case, apostrophe) label ids per word of one window. */
  private async predict(words: string[]): Promise<[number, number, number][]> {
    const { clsId, sepId } = this.tok.vocab;
    const ids = [clsId];
    // Each word's first token; -1 when it has none, or was cut at maxTokens.
    const first = words.map((word) => {
      const toks = this.tok.encodeWord(word);
      const room = this.cfg.maxTokens - 1 - ids.length;
      if (!toks.length || room <= 0) return -1;
      ids.push(...toks.slice(0, room));
      return ids.length - Math.min(toks.length, room);
    });
    ids.push(sepId);

    const n = ids.length;
    const out = await this.session.run({
      input_ids: new this.ort.Tensor("int64", BigInt64Array.from(ids, BigInt), [1, n]),
      attention_mask: new this.ort.Tensor("int64", new BigInt64Array(n).fill(1n), [1, n]),
    });
    const heads = ["punct", "case", "apostrophe"].map((name) => {
      const t = out[name];
      return { data: t.data as Float32Array, k: t.dims[2] };
    });
    const argmax = ({ data, k }: { data: Float32Array; k: number }, j: number) => {
      let best = 0;
      for (let c = 1; c < k; c++) if (data[j * k + c] > data[j * k + best]) best = c;
      return best;
    };
    return first.map((j) =>
      j < 0 ? [0, 0, 0] : [argmax(heads[0], j), argmax(heads[1], j), argmax(heads[2], j)],
    );
  }
}
