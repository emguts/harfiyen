// BERT WordPiece tokenizer, as Hugging Face `tokenizers` runs seda-v0.2's
// formatter/tokenizer.json (BertNormalizer without lowercasing,
// BertPreTokenizer, greedy longest-match WordPiece with "##" continuations).
// scripts/prepare_models.py checks that the file still has this setup.
// Chinese characters are not split apart: transcripts here are Turkish.

export interface WordPieceVocab {
  /** Tokens by id. */
  pieces: string[];
  unkId: number;
  clsId: number;
  sepId: number;
  /** Longer words become a single unknown token. */
  maxInputChars: number;
}

/** BertNormalizer's clean_text: drop control characters, other whitespace becomes a space. */
const CONTROL = /[\0�]|(?![\t\n\r])[\p{Cc}\p{Cf}\p{Cn}\p{Co}]/gu;
const SPACE = /\s/;
/** What BertPreTokenizer splits off as a token of its own. */
const PUNCT = /[!-/:-@[-`{-~]|\p{P}/u;

export class WordPieceTokenizer {
  private ids: Map<string, number>;

  constructor(readonly vocab: WordPieceVocab) {
    this.ids = new Map(vocab.pieces.map((p, i) => [p, i]));
  }

  /** Token ids of one word (pre-tokenized input: it may still split at punctuation). */
  encodeWord(word: string): number[] {
    const out: number[] = [];
    for (const piece of this.preTokenize(word.replace(CONTROL, ""))) out.push(...this.wordPiece(piece));
    return out;
  }

  private preTokenize(text: string): string[] {
    const out: string[] = [];
    let cur = "";
    for (const ch of text) {
      if (SPACE.test(ch) || PUNCT.test(ch)) {
        if (cur) out.push(cur);
        cur = "";
        if (!SPACE.test(ch)) out.push(ch);
      } else cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }

  private wordPiece(piece: string): number[] {
    const chars = Array.from(piece);
    if (chars.length > this.vocab.maxInputChars) return [this.vocab.unkId];
    const out: number[] = [];
    for (let start = 0; start < chars.length; ) {
      let end = chars.length;
      let id: number | undefined;
      for (; end > start; end--) {
        id = this.ids.get((start > 0 ? "##" : "") + chars.slice(start, end).join(""));
        if (id !== undefined) break;
      }
      // A part no token covers makes the whole piece unknown.
      if (id === undefined) return [this.vocab.unkId];
      out.push(id);
      start = end;
    }
    return out;
  }
}
