#!/usr/bin/env python3
from __future__ import annotations
import argparse
import base64
import json
import sys
from pathlib import Path

PREFIX = "AIUSE_X_MEDIA_V1:"
DELIVERIES = ("user_preview", "public_inline")


def preview_media(items):
    out = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        typ = str(item.get("type") or "").lower()
        if typ.startswith("mosaic") or typ == "external":
            continue
        url = item.get("url") or item.get("thumbnail_url")
        if not isinstance(url, str) or not url.startswith("https://"):
            continue
        out.append({
            "url": url,
            "type": typ or "image",
            "thumbnail_url": item.get("thumbnail_url"),
            "width": item.get("width"),
            "height": item.get("height"),
            "alt_text": item.get("alt_text"),
        })
    return out


def marker(data: dict, delivery: str = "user_preview") -> str:
    if delivery not in DELIVERIES:
        raise ValueError(f"unsupported delivery: {delivery}")
    payload = {
        "v": 1,
        "delivery": delivery,
        "post_url": data.get("url") or data.get("post_url"),
        "author": data.get("author") or {},
        "possibly_sensitive": bool(data.get("possibly_sensitive")),
        "media": preview_media(data.get("media")),
    }
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    token = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    return PREFIX + token


def main() -> int:
    ap = argparse.ArgumentParser(description="Create a ChatGPT inline-media marker from x-post-resolver JSON")
    ap.add_argument("input", nargs="?", help="JSON file; omit to read stdin")
    ap.add_argument("--delivery", choices=DELIVERIES, default="user_preview")
    args = ap.parse_args()
    text = Path(args.input).read_text(encoding="utf-8") if args.input else sys.stdin.read()
    print(marker(json.loads(text), delivery=args.delivery))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
