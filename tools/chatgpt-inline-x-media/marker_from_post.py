#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path

PREFIX = "AIUSE_X_MEDIA_V1:"
ACCESSES = ("public", "firefox_auth", "unknown")
INSPECTIONS = ("assistant", "user_only")
PRESENTATIONS = ("inline", "preview")
LEGACY_DELIVERIES = ("user_preview", "public_inline")


def presentation_media(items):
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
        record = {
            "url": url,
            "type": typ or "image",
            "thumbnail_url": item.get("thumbnail_url"),
            "width": item.get("width"),
            "height": item.get("height"),
            "alt_text": item.get("alt_text"),
        }
        for key in ("post_url", "text", "possibly_sensitive"):
            if key in item:
                record[key] = item.get(key)
        if isinstance(item.get("author"), dict):
            record["author"] = item["author"]
        out.append(record)
    return out


def marker(
    data: dict,
    *,
    access: str = "public",
    inspection: str = "assistant",
    presentation: str = "inline",
) -> str:
    if access not in ACCESSES:
        raise ValueError(f"unsupported access: {access}")
    if inspection not in INSPECTIONS:
        raise ValueError(f"unsupported inspection: {inspection}")
    if presentation not in PRESENTATIONS:
        raise ValueError(f"unsupported presentation: {presentation}")

    payload = {
        "v": 2,
        "access": access,
        "inspection": inspection,
        "presentation": presentation,
        "post_url": data.get("url") or data.get("post_url"),
        "author": data.get("author") or {},
        "possibly_sensitive": bool(data.get("possibly_sensitive")),
        "media": presentation_media(data.get("media")),
    }
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return PREFIX + base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def legacy_policy(delivery: str) -> tuple[str, str, str]:
    if delivery == "public_inline":
        return "public", "assistant", "inline"
    if delivery == "user_preview":
        return "unknown", "user_only", "preview"
    raise ValueError(delivery)


def main() -> int:
    ap = argparse.ArgumentParser(description="Create a ChatGPT X-media presentation marker")
    ap.add_argument("input", nargs="?", help="JSON file; omit to read stdin")
    ap.add_argument("--access", choices=ACCESSES, default="public")
    ap.add_argument("--inspection", choices=INSPECTIONS, default="assistant")
    ap.add_argument("--presentation", choices=PRESENTATIONS, default="inline")
    ap.add_argument("--delivery", choices=LEGACY_DELIVERIES, help="Deprecated v0.2 compatibility alias")
    args = ap.parse_args()

    access, inspection, presentation = args.access, args.inspection, args.presentation
    if args.delivery:
        access, inspection, presentation = legacy_policy(args.delivery)

    text = Path(args.input).read_text(encoding="utf-8") if args.input else sys.stdin.read()
    print(marker(json.loads(text), access=access, inspection=inspection, presentation=presentation))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
