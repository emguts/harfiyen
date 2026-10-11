"""Upload the browser model files and the ONNX Runtime WASM to Cloudflare R2.

Only files the app downloads are sent: each model directory's model.json
(punct.json for punctuation) plus the files it lists. Objects already in the
bucket with the same size (and, for small files, the same MD5) are skipped,
so running it again only sends what changed. Large files go up in parts.

Layout in the bucket, matching VITE_MODELS_BASE_URL and VITE_ORT_WASM_URL:

  models/<model dir>/...                         public/models/<model dir>/...
  runtime/ort-wasm-simd-threaded.asyncify.wasm   from node_modules/onnxruntime-web

Credentials come from the environment or .env.local (git-ignored):

  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET

Usage:  python scripts/upload_models.py [--dry-run] [--only DIR ...]
"""

import argparse
import hashlib
import json
import os
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "public" / "models"
WASM_NAME = "ort-wasm-simd-threaded.asyncify.wasm"
WASM = ROOT / "node_modules" / "onnxruntime-web" / "dist" / WASM_NAME
ENV_KEYS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]

# Below this a file goes up in one request, so its ETag is its MD5.
MULTIPART_THRESHOLD = 64 * 1024 * 1024

CONTENT_TYPES = {
    ".json": "application/json",
    ".txt": "text/plain; charset=utf-8",
    ".wasm": "application/wasm",
}
# The app fetches *.json with no-cache and keys its own cache by file size;
# the rest can sit in caches for a day.
CACHE_CONTROL = {".json": "no-cache"}
DEFAULT_CACHE_CONTROL = "public, max-age=86400"


def load_env() -> dict[str, str]:
    env = {}
    local = ROOT / ".env.local"
    if local.exists():
        for line in local.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip("\"'")
    env.update({k: os.environ[k] for k in ENV_KEYS if os.environ.get(k)})
    missing = [k for k in ENV_KEYS if not env.get(k)]
    if missing:
        sys.exit(f"Missing {', '.join(missing)} (set them in the environment or .env.local).")
    return env


def model_files(only: list[str] | None) -> list[tuple[Path, str]]:
    """(local path, object key) for every file the app downloads."""
    out = []
    for d in sorted(p for p in MODELS.iterdir() if p.is_dir()):
        if only and d.name not in only:
            continue
        manifest = next((d / n for n in ("model.json", "punct.json") if (d / n).exists()), None)
        if not manifest:
            print(f"skip {d.name}: no model.json or punct.json")
            continue
        names = [manifest.name, *json.loads(manifest.read_text())["files"]]
        for n in names:
            p = d / n
            if not p.exists():
                sys.exit(f"{p} is listed in {manifest.name} but missing; run `npm run models` first.")
            out.append((p, f"models/{d.name}/{n}"))
    if not only or "runtime" in only:
        if not WASM.exists():
            sys.exit(f"{WASM} not found; run `npm install` first.")
        out.append((WASM, f"runtime/{WASM_NAME}"))
    return out


def md5(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def unchanged(s3, bucket: str, path: Path, key: str) -> bool:
    from botocore.exceptions import ClientError

    try:
        head = s3.head_object(Bucket=bucket, Key=key)
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return False
        raise
    size = path.stat().st_size
    if head["ContentLength"] != size:
        return False
    if size < MULTIPART_THRESHOLD:
        return head.get("ETag", "").strip('"') == md5(path)
    return True


class Progress:
    def __init__(self, label: str, total: int):
        self.label, self.total, self.done = label, total, 0
        self.lock = threading.Lock()

    def __call__(self, n: int):
        with self.lock:
            self.done += n
            pct = 100 * self.done / self.total if self.total else 100
            print(f"\r  {self.label} {self.done / 1e6:,.0f} / {self.total / 1e6:,.0f} MB ({pct:.0f}%)", end="", flush=True)


def client(env: dict[str, str]):
    import boto3
    from botocore.config import Config

    cfg = {"retries": {"max_attempts": 5, "mode": "standard"}}
    try:
        # Newer botocore adds CRC checksums R2 may reject; only send them when required.
        config = Config(**cfg, request_checksum_calculation="when_required", response_checksum_validation="when_required")
    except TypeError:
        config = Config(**cfg)
    return boto3.client(
        "s3",
        endpoint_url=f"https://{env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
        config=config,
    )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dry-run", action="store_true", help="list what would be uploaded, upload nothing")
    ap.add_argument("--only", nargs="+", metavar="DIR", help="model directories (or 'runtime') to upload")
    args = ap.parse_args()

    try:
        from boto3.s3.transfer import TransferConfig
    except ImportError:
        sys.exit("boto3 is needed: python3 -m pip install boto3")

    env = load_env()
    s3 = client(env)
    bucket = env["R2_BUCKET"]
    transfer = TransferConfig(
        multipart_threshold=MULTIPART_THRESHOLD,
        multipart_chunksize=MULTIPART_THRESHOLD,
        max_concurrency=4,
    )

    files = model_files(args.only)
    sent = skipped = 0
    for path, key in files:
        size = path.stat().st_size
        if unchanged(s3, bucket, path, key):
            print(f"same  {key}")
            skipped += 1
            continue
        if args.dry_run:
            print(f"would {key} ({size / 1e6:,.1f} MB)")
            continue
        suffix = path.suffix.lower()
        extra = {
            "ContentType": CONTENT_TYPES.get(suffix, "application/octet-stream"),
            "CacheControl": CACHE_CONTROL.get(suffix, DEFAULT_CACHE_CONTROL),
        }
        s3.upload_file(str(path), bucket, key, ExtraArgs=extra, Config=transfer, Callback=Progress(key, size))
        print()
        sent += 1
    print(f"{sent} uploaded, {skipped} already up to date" + (" (dry run)" if args.dry_run else ""))


if __name__ == "__main__":
    main()
