// trnorm in TypeScript (src/tts/trnorm/) against the Python it was ported from, and Ahenk Cep's pieces
// (src/tts/ahenk.ts) against site/py/ahenk_front.py, without a model.
//
//   npx tsx tests/trnorm.node.ts
//
// tests/data/trnorm.json holds the Python outputs: every string in the reference's tests/test_normalizer.py,
// test_trtts.py, test_web_demo.py and test_small_student.py, plus subtitle-like sentences, run through
// trnorm.normalize and ahenk_front.prepare(text, 1.0, vocab) of ozguradmin/ahenk-turkish-tts at commit 2319ffc.
// Exits non-zero on a mismatch.

import { readFileSync } from "node:fs";
import { pieces } from "../src/tts/ahenk";
import { normalize } from "../src/tts/trnorm/normalize";

interface Case {
  text: string;
  spoken: string;
  pieces: string[];
}

const { vocab, cases } = JSON.parse(readFileSync(new URL("data/trnorm.json", import.meta.url), "utf8")) as {
  vocab: string[];
  cases: Case[];
};
const alpha = new Set(vocab.filter((v) => v.length === 1));

let failed = 0;
for (const c of cases) {
  let spoken: string;
  let got: string[];
  try {
    spoken = normalize(c.text);
    got = pieces(c.text, 1, alpha).map(([p]) => p);
  } catch (e) {
    console.log(`FAIL  ${JSON.stringify(c.text)}\n        threw: ${e}`);
    failed++;
    continue;
  }
  if (spoken !== c.spoken) {
    console.log(`FAIL  ${JSON.stringify(c.text)}\n        want: ${JSON.stringify(c.spoken)}\n        got:  ${JSON.stringify(spoken)}`);
    failed++;
  } else if (JSON.stringify(got) !== JSON.stringify(c.pieces)) {
    console.log(`FAIL  pieces of ${JSON.stringify(c.text)}\n        want: ${JSON.stringify(c.pieces)}\n        got:  ${JSON.stringify(got)}`);
    failed++;
  }
}
console.log(`${cases.length - failed} / ${cases.length} match the Python`);
process.exit(failed ? 1 : 0);
