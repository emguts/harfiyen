"""Reference outputs for tests/translate.node.ts.

    python scripts/make_mt_refs.py OUT.json [--export-dir .cache/opus-mt-tc-big-tr-en]

Token ids come from transformers' MarianTokenizer; translations from the int8 files in
public/models/opus-mt-tc-big-tr-en/, decoded greedily here with onnxruntime, so the browser
code has to match them exactly. The fp32 PyTorch model's output is stored too, for a look at
what quantisation changes (it is not compared).
"""

import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort

ROOT = Path(__file__).resolve().parent.parent
MODEL = ROOT / "public" / "models" / "opus-mt-tc-big-tr-en"
TEXTS = [
    "Merhaba arkadaşlar, bugün sizlere çok güzel bir tarif göstereceğim.",
    "Videoyu beğenmeyi ve kanala abone olmayı unutmayın.",
    "Açıkçası ben de ilk başta buna inanmamıştım ama sonuç gerçekten şaşırtıcıydı.",
    "Yani şöyle düşünün, her gün sadece on dakika ayırsanız bile fark edersiniz.",
    "Kodu çalıştırdığınızda ekranda bir hata mesajı göreceksiniz, bunu birazdan düzelteceğiz.",
    "Toplantıyı yarın saat üçe erteleyelim mi?",
    "Geçen hafta İstanbul'daydım ve trafik yine felaketti.",
    "Saat 15.30'da 15 kişi geldi.",
    "Kapadokya, Türkiye'nin İç Anadolu Bölgesi'nde yer alan tarihî bölgedir.",
    # Tokeniser corners: NFKC, curly quotes, an ellipsis, a character outside the vocabulary.
    "İstanbul’da “tırnak” … Ｆｕｌｌ ① emoji 😀 son",
    "gidemedim çünkü otobüsü kaçırmışım",
]


def greedy(enc, dec, cfg, ids):
    am = np.ones_like(ids)
    h = enc.run(None, {"input_ids": ids, "attention_mask": am})[0]
    H, hd = cfg["heads"], cfg["headDim"]
    past = {i.name: np.zeros((1, H, 0, hd), np.float32) for i in dec.get_inputs() if i.name.startswith("past_key_values")}
    names = [o.name for o in dec.get_outputs()]
    out, token = [], cfg["decoderStart"]
    for step in range(min(cfg["maxLength"] - 1, 2 * ids.shape[1] + 10)):
        r = dec.run(None, {
            "encoder_attention_mask": am,
            "input_ids": np.array([[token]], np.int64),
            "encoder_hidden_states": h,
            "use_cache_branch": np.array([step > 0]),
            **past,
        })
        logits = r[0][0, -1].copy()
        logits[cfg["pad"]] = -np.inf
        best = int(logits.argmax())
        for n, v in zip(names[1:], r[1:]):
            if step == 0 or ".decoder." in n:
                past[n.replace("present", "past_key_values")] = v
        if best == cfg["eos"]:
            break
        out.append(best)
        token = best
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--export-dir", type=Path, default=ROOT / ".cache" / "opus-mt-tc-big-tr-en")
    args = ap.parse_args()

    import torch
    from transformers import MarianMTModel, MarianTokenizer

    tok = MarianTokenizer.from_pretrained(args.export_dir)
    fp32 = MarianMTModel.from_pretrained("Helsinki-NLP/opus-mt-tc-big-tr-en").eval()
    cfg = json.loads((MODEL / "model.json").read_text())
    enc = ort.InferenceSession(str(MODEL / "encoder.int8.onnx"))
    dec = ort.InferenceSession(str(MODEL / "decoder.int8.onnx"))
    refs = []
    for text in TEXTS:
        ids = tok(text)["input_ids"]
        out = greedy(enc, dec, cfg, np.array([ids], np.int64))
        with torch.no_grad():
            ref = fp32.generate(**tok(text, return_tensors="pt"), num_beams=1, max_new_tokens=128)[0]
        refs.append({
            "text": text,
            "ids": ids,
            "output": out,
            "translation": tok.decode(out, skip_special_tokens=True),
            "fp32": tok.decode(ref, skip_special_tokens=True),
        })
        print(text, "->", refs[-1]["translation"])
    args.out.write_text(json.dumps(refs, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
