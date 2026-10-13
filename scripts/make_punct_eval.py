"""Correctly written Turkish text for tests/punct-eval.node.ts, from Turkish Wikipedia.

    python scripts/make_punct_eval.py [OUT.json] [--holdout]

--holdout writes a second set from other articles: tune the rules on the
first, then confirm on this one that the gain is not specific to that text.

Keeps only sentences a transcript could produce: no parentheses, quotes,
abbreviations or numbers with separators. The text is CC BY-SA 4.0; the
output records each article's source.
"""

import argparse
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TITLES = [
    "Kapadokya",
    "Orhan Pamuk",
    "Barış Manço",
    "İzmir",
    "Karadeniz",
    "Nazım Hikmet",
    "Kahve",
    "Türk mutfağı",
    "Mimar Sinan",
    "Van Gölü",
]
HOLDOUT = [
    "Ankara",
    "Sabahattin Ali",
    "Sezen Aksu",
    "Kemal Sunal",
    "Pamukkale",
    "Trabzon",
    "Yaşar Kemal",
    "Efes",
    "Boğaziçi Köprüsü",
    "Çay (içecek)",
]
WORDS_PER_ARTICLE = 600
API = "https://tr.wikipedia.org/w/api.php"
STOP = re.compile(r"^==+\s*(Kaynakça|Dış bağlantılar|Ayrıca bakınız|Notlar|Kaynaklar|Dipnotlar)\s*==+", re.M)
TOKEN = re.compile(r"^\w+(?:['-]\w+)*[.,?!]?$")


def fetch(title: str) -> str:
    q = urllib.parse.urlencode(
        {"action": "query", "prop": "extracts", "explaintext": 1, "format": "json", "redirects": 1, "titles": title}
    )
    req = urllib.request.Request(f"{API}?{q}", headers={"User-Agent": "harfiyen-tests/0.1 (punctuation eval)"})
    for attempt in range(5):
        try:
            pages = json.load(urllib.request.urlopen(req, timeout=30))["query"]["pages"]
            return next(iter(pages.values()))["extract"]
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 4:
                raise
            time.sleep(10 * (attempt + 1))  # rate limited: wait and try again


def usable(sentence: str) -> bool:
    tokens = sentence.split()
    if len(tokens) < 5 or not re.search(r"[.?!]$", sentence):
        return False
    # Every token is a word with at most one closing mark; only the last may end a sentence.
    return all(TOKEN.match(t) and not re.search(r"\d", t) for t in tokens) and not any(
        re.search(r"[.?!]$", t) for t in tokens[:-1]
    )


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
        sentences = re.split(r"(?<=[.?!])\s+(?=[A-ZÇĞİÖŞÜ])", para)
        kept = [s for s in sentences if usable(s)]
        if kept:
            paragraphs.append(" ".join(kept))
    return paragraphs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path, nargs="?")
    ap.add_argument("--holdout", action="store_true")
    args = ap.parse_args()
    name = "punct-holdout.tr.json" if args.holdout else "punct-eval.tr.json"
    args.out = args.out or ROOT / "tests" / "data" / name
    articles = []
    for title in HOLDOUT if args.holdout else TITLES:
        words, text = 0, []
        for para in clean(fetch(title)):
            if words >= WORDS_PER_ARTICLE:
                break
            text.append(para)
            words += len(para.split())
        url = "https://tr.wikipedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_"))
        articles.append({"title": title, "url": url, "text": "\n".join(text)})
        print(f"{words:5d} words  {title}")
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
