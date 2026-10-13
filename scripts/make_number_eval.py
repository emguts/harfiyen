"""Turkish text with numbers for tests/numbers-eval.node.ts, from Turkish Wikipedia.

    python scripts/make_number_eval.py [OUT.json] [--holdout]

Keeps sentences a transcript could produce once its numbers are spoken:
whole numbers ("1923", "5.639.076"), with a suffix ("1923'te") or as an
ordinal ("20. yüzyıl"); no decimals, ranges, percentages, times, parentheses
or abbreviations. Sentences without numbers stay too: number words written
out ("üç kişi", "bir gün") show false conversions. The text is CC BY-SA 4.0;
the output records each article's source. --holdout writes a second set from
other articles, to confirm a change on text it was not tuned on.
"""

import argparse
import json
import re
import urllib.parse
from datetime import date
from pathlib import Path

from make_punct_eval import STOP, fetch

ROOT = Path(__file__).resolve().parent.parent
TITLES = [
    "Türkiye",
    "İstanbul",
    "Osmanlı İmparatorluğu",
    "Galatasaray Spor Kulübü",
    "Kurtuluş Savaşı",
    "Bursa",
    "Mustafa Kemal Atatürk",
    "Tarkan",
    "Konya",
    "Türk lirası",
]
HOLDOUT = [
    "Fenerbahçe Spor Kulübü",
    "Antalya",
    "Erzurum",
    "Sertab Erener",
    "Türkiye Büyük Millet Meclisi",
    "Çanakkale Cephesi",
    "Beşiktaş Jimnastik Kulübü",
    "Kayseri",
    "Samsun",
    "Cem Yılmaz",
]
WORDS_PER_ARTICLE = 1500
NUMBER = r"(?:[1-9]\d{0,2}(?:\.\d{3})+|[1-9]\d*|0)"
WORD = re.compile(rf"^(?:\w+(?:['-]\w+)*|{NUMBER}(?:'\w+)?)[.,?!]?$")
ORDINAL = re.compile(rf"^{NUMBER}\.$")


def usable(sentence: str) -> bool:
    tokens = sentence.split()
    if len(tokens) < 5 or not re.search(r"[.?!]$", sentence):
        return False
    for i, t in enumerate(tokens):
        last = i == len(tokens) - 1
        # "20. yüzyıl": an ordinal inside the sentence.
        if not last and ORDINAL.match(t) and tokens[i + 1][0].islower():
            continue
        if not WORD.match(t) or (re.search(r"\d", t) and not re.match(rf"^{NUMBER}('|[.,?!]?$)", t)):
            return False
        # Digits only as a whole number, never inside a word; only the last token ends a sentence.
        if re.search(r"\d", t) and re.search(r"[^\d.,?!']", t.split("'")[0]):
            return False
        if not last and re.search(r"[.?!]$", t):
            return False
    return True


def clean(text: str) -> list[str]:
    m = STOP.search(text)
    if m:
        text = text[: m.start()]
    text = text.replace("’", "'").replace(" ", " ")
    while True:
        stripped = re.sub(r"\s*\([^()]*\)", "", text)
        if stripped == text:
            break
        text = stripped
    paragraphs = []
    for para in text.split("\n"):
        para = para.strip()
        if not para or para.startswith("="):
            continue
        # Split after a sentence end, but not after an ordinal ("20. yüzyıl").
        sentences = re.split(r"(?<=[.?!])\s+(?=[A-ZÇĞİÖŞÜ0-9])", para)
        kept = [s for s in sentences if usable(s)]
        if kept:
            paragraphs.append(" ".join(kept))
    return paragraphs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path, nargs="?")
    ap.add_argument("--holdout", action="store_true")
    args = ap.parse_args()
    name = "numbers-holdout.tr.json" if args.holdout else "numbers-eval.tr.json"
    args.out = args.out or ROOT / "tests" / "data" / name
    articles = []
    for title in HOLDOUT if args.holdout else TITLES:
        words, text = 0, []
        for para in clean(fetch(title)):
            if words >= WORDS_PER_ARTICLE:
                break
            text.append(para)
            words += len(para.split())
        numbers = sum(bool(re.search(r"\d", t)) for t in " ".join(text).split())
        url = "https://tr.wikipedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_"))
        articles.append({"title": title, "url": url, "text": "\n".join(text)})
        print(f"{words:5d} words, {numbers:3d} numbers  {title}")
    out = {
        "source": "Türkçe Vikipedi",
        "license": "CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)",
        "retrieved": date.today().isoformat(),
        "articles": articles,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print(f"{sum(len(a['text'].split()) for a in articles)} words -> {args.out}")


if __name__ == "__main__":
    main()
