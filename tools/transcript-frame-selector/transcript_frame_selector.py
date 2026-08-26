from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Extract representative video frames from transcript segment timestamps.")
    p.add_argument("video", type=Path)
    p.add_argument("transcript_json", type=Path)
    p.add_argument("--output-dir", type=Path, default=Path("frames-from-transcript"))
    p.add_argument("--count", type=int, default=4)
    p.add_argument("--start-segment", type=int, default=0)
    return p.parse_args()


def main() -> int:
    args = parse_args()
    doc = json.loads(args.transcript_json.read_text(encoding="utf-8"))
    ts = doc.get("timestamps") or {}
    segments = ts.get("segments") or []
    segments = [s for s in segments if str(s.get("text", "")).strip()]
    if not segments:
        raise SystemExit("No non-empty transcript segments found")

    chosen = segments[args.start_segment : args.start_segment + args.count]
    if not chosen:
        raise SystemExit("No segments selected")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    manifest = []

    for ordinal, seg in enumerate(chosen):
        start_ms = int(seg["start_ms"])
        end_ms = int(seg["end_ms"])
        midpoint_s = (start_ms + end_ms) / 2000.0
        seg_index = int(seg.get("index", ordinal))
        out = args.output_dir / f"segment_{seg_index:03d}_{midpoint_s:.3f}s.jpg"
        subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                f"{midpoint_s:.3f}",
                "-i",
                str(args.video),
                "-frames:v",
                "1",
                "-q:v",
                "2",
                "-y",
                str(out),
            ],
            check=True,
        )
        item = {
            "segment_index": seg_index,
            "start_ms": start_ms,
            "end_ms": end_ms,
            "midpoint_s": midpoint_s,
            "text": str(seg.get("text", "")).strip(),
            "frame": out.name,
        }
        manifest.append(item)
        print(f"[{seg_index}] {midpoint_s:.3f}s -> {out}")
        print(f"  {item['text']}")

    (args.output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
