"""Reference outputs for tests/formatter.node.ts, from sedalib's Formatter.

    pip install "sedalib[format]>=1.0"
    python scripts/make_formatter_refs.py OUT.json [--model-dir .cache/seda-v0.2/formatter]

sedalib writes numbers as digits before formatting; Harfiyen leaves that to
src/lib/numbers.ts, so the number step is turned off here.
"""

import argparse
import json
from pathlib import Path

import sedalib.formatter as formatter
from tokenizers import Tokenizer

ROOT = Path(__file__).resolve().parent.parent

TEXTS = [
    "bugün ankarada hava yirmi dört derece",
    "yarın istanbula gidecek misin",
    "tbmmde yeni yasa kabul edildi ahmet beyin önerisi ise reddedildi",
    "covid-19 salgını iki bin yirmide başladı ve 1923te kurulan cumhuriyet yüz yaşına girdi",
    # More than one 48-word window.
    " ".join(["türkiye cumhuriyeti bin dokuz yüz yirmi üç yılında kuruldu başkenti ankaradır"] * 6),
    # More tokens than one call takes (128): the words past it get no marks.
    " ".join(["çekoslovakyalılaştıramadıklarımızdanmışsınız"] * 40),
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--model-dir", type=Path, default=ROOT / ".cache" / "seda-v0.2" / "formatter")
    args = ap.parse_args()
    formatter.itn = lambda text: text
    fmt = formatter.Formatter(args.model_dir)
    tok = Tokenizer.from_file(str(args.model_dir / "tokenizer.json"))
    refs = []
    for text in TEXTS:
        words = text.split()
        refs.append(
            {
                "words": words,
                "ids": [tok.encode(w, add_special_tokens=False).ids for w in words],
                "written": fmt(text).split(),
            }
        )
    args.out.write_text(json.dumps(refs, ensure_ascii=False, indent=1))
    print(f"{len(refs)} texts -> {args.out}")


if __name__ == "__main__":
    main()
