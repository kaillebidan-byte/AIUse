#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

VIDEO_EXTS = {".mp4", ".webm", ".mkv", ".mov", ".avi", ".m4v"}
AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".webm"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"}
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com"}


class InspectError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def run(cmd: list[str], *, cwd: Path | None = None, capture: bool = False) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            cmd,
            cwd=str(cwd) if cwd else None,
            check=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=capture,
        )
    except FileNotFoundError as e:
        raise InspectError(f"command not found: {cmd[0]}") from e
    except subprocess.CalledProcessError as e:
        detail = (e.stderr or e.stdout or "").strip()
        if detail:
            detail = f": {detail[-1200:]}"
        raise InspectError(f"command failed ({e.returncode}): {cmd[0]}{detail}") from e


def classify_input(value: str) -> tuple[str, str]:
    p = Path(value).expanduser()
    if p.exists():
        ext = p.suffix.lower()
        if ext in IMAGE_EXTS:
            return "image", "local-file"
        if ext in AUDIO_EXTS and ext not in VIDEO_EXTS:
            return "audio", "local-file"
        if ext in VIDEO_EXTS:
            return "video", "local-file"
        return "file", "local-file"

    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"}:
        raise InspectError("input must be an existing local path or http/https URL")
    host = (parsed.hostname or "").lower()
    if host in YOUTUBE_HOSTS:
        return "video", "youtube"
    ext = Path(parsed.path).suffix.lower()
    if ext in IMAGE_EXTS:
        return "image", "direct-media-url"
    if ext in AUDIO_EXTS and ext not in VIDEO_EXTS:
        return "audio", "direct-media-url"
    if ext in VIDEO_EXTS:
        return "video", "direct-media-url"
    return "media", "direct-media-url"


def acquire(value: str, out_dir: Path, browser: str | None) -> tuple[Path, str, list[str]]:
    p = Path(value).expanduser()
    if p.exists():
        return p.resolve(), "local-file", []

    _, input_kind = classify_input(value)
    root = repo_root()
    acquired = out_dir / "acquired"
    acquired.mkdir(parents=True, exist_ok=True)

    if input_kind == "youtube":
        if os.name != "nt":
            raise InspectError("YouTube URL acquisition currently requires Windows browser-media-bridge or a pre-downloaded local file")
        if not browser:
            raise InspectError("YouTube URL requires --browser <browser> for browser-authenticated acquisition")
        bridge = root / "tools" / "browser-media-bridge" / "browser_media_bridge.ps1"
        if not bridge.exists():
            raise InspectError(f"missing helper: {bridge}")
        ps = shutil.which("powershell") or shutil.which("powershell.exe")
        if not ps:
            raise InspectError("PowerShell not found")
        run([ps, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(bridge),
             value, "-Mode", "video", "-Browser", browser, "-OutputDir", str(acquired)])
        last_file = acquired / "last-file.txt"
        if not last_file.exists():
            raise InspectError("browser-media-bridge did not write last-file.txt")
        lines = [x.strip() for x in last_file.read_text(encoding="utf-8-sig", errors="replace").splitlines() if x.strip()]
        if not lines:
            raise InspectError("browser-media-bridge returned no acquired path")
        media = Path(lines[-1])
        if not media.exists():
            raise InspectError(f"acquired media not found: {media}")
        return media.resolve(), f"browser-media-bridge:{browser}", ["browser-media-bridge", "yt-dlp"]

    fetcher = root / "tools" / "web-media-fetcher" / "web_media_fetcher.py"
    if not fetcher.exists():
        raise InspectError(f"missing helper: {fetcher}")
    cp = run([sys.executable, str(fetcher), value, "-d", str(acquired)], capture=True)
    lines = [x.strip() for x in cp.stdout.splitlines() if x.strip()]
    if not lines:
        raise InspectError("web-media-fetcher returned no path")
    media = Path(lines[-1])
    if not media.is_absolute():
        media = (Path.cwd() / media).resolve()
    if not media.exists():
        raise InspectError(f"acquired media not found: {media}")
    return media, "web-media-fetcher", ["web-media-fetcher"]


def ffprobe_metadata(path: Path) -> dict[str, Any]:
    cp = run([
        "ffprobe", "-v", "error",
        "-show_entries",
        "format=filename,format_name,duration,size,bit_rate:stream=index,codec_type,codec_name,width,height,sample_rate,channels",
        "-of", "json", str(path)
    ], capture=True)
    try:
        return json.loads(cp.stdout)
    except json.JSONDecodeError as e:
        raise InspectError("ffprobe returned invalid JSON") from e


def media_type_from_probe(path: Path, probe: dict[str, Any], fallback: str) -> str:
    ext = path.suffix.lower()
    if ext in IMAGE_EXTS:
        return "image"
    streams = probe.get("streams") or []
    types = {s.get("codec_type") for s in streams if isinstance(s, dict)}
    if "video" in types:
        return "video"
    if "audio" in types:
        return "audio"
    return fallback if fallback != "media" else "file"


def resolve_transcriber() -> str:
    direct = shutil.which("youtube-transcribe") or shutil.which("youtube-transcribe.exe")
    if direct:
        return direct
    exe = Path(sys.executable)
    candidate = exe.parent / ("Scripts/youtube-transcribe.exe" if os.name == "nt" else "bin/youtube-transcribe")
    if candidate.exists():
        return str(candidate)
    raise InspectError("youtube-transcribe not found; install kavenio-youtube-transcribe")


def transcribe(path: Path, out_dir: Path, model: str, language: str) -> tuple[dict[str, Any], list[str]]:
    transcript_dir = out_dir / "transcript"
    transcript_dir.mkdir(parents=True, exist_ok=True)
    exe = resolve_transcriber()
    env = os.environ.copy()
    env["HF_HUB_DISABLE_SYMLINKS"] = "1"
    try:
        subprocess.run(
            [exe, str(path), "--output-dir", str(transcript_dir), "--model", model, "--language", language, "--timestamps"],
            check=True, env=env
        )
    except subprocess.CalledProcessError as e:
        raise InspectError(f"youtube-transcribe failed with exit code {e.returncode}") from e

    json_files = list(transcript_dir.rglob("transcript.json"))
    if not json_files:
        raise InspectError("transcript.json was not generated")
    transcript_json = json_files[0]
    doc = json.loads(transcript_json.read_text(encoding="utf-8-sig"))

    files: dict[str, str] = {}
    for name in ("transcript.md", "transcript.json", "timestamps.vtt"):
        matches = list(transcript_dir.rglob(name))
        if matches:
            files[name] = str(matches[0].resolve())

    text = doc.get("text") or doc.get("transcript")
    if not isinstance(text, str) or not text.strip():
        segments = ((doc.get("timestamps") or {}).get("segments") or [])
        text = "\n".join(str(s.get("text", "")).strip() for s in segments if str(s.get("text", "")).strip())

    segments = ((doc.get("timestamps") or {}).get("segments") or [])
    return {
        "model": model,
        "language": language,
        "text": text.strip() if isinstance(text, str) else None,
        "segment_count": len(segments),
        "files": files,
        "transcript_json": str(transcript_json.resolve()),
    }, ["youtube-transcribe"]


def extract_frames(path: Path, transcript_json: Path, out_dir: Path, count: int) -> tuple[list[dict[str, Any]], list[str]]:
    selector = repo_root() / "tools" / "transcript-frame-selector" / "transcript_frame_selector.py"
    if not selector.exists():
        raise InspectError(f"missing helper: {selector}")
    frames_dir = out_dir / "frames"
    run([sys.executable, str(selector), str(path), str(transcript_json),
         "--output-dir", str(frames_dir), "--count", str(count)])
    manifest = frames_dir / "manifest.json"
    if not manifest.exists():
        raise InspectError("frame selector did not write manifest.json")
    items = json.loads(manifest.read_text(encoding="utf-8-sig"))
    for item in items:
        frame = item.get("frame")
        if frame:
            item["path"] = str((frames_dir / frame).resolve())
    return items, ["transcript-frame-selector", "ffmpeg"]


def build_envelope(
    original_input: str,
    source_type: str,
    media_path: Path,
    acquisition_path: str,
    probe: dict[str, Any],
    transcript_info: dict[str, Any] | None,
    frames: list[dict[str, Any]],
    upstream: list[str],
) -> dict[str, Any]:
    source_url = original_input if urlparse(original_input).scheme in {"http", "https"} else None
    source_path = str(Path(original_input).expanduser().resolve()) if Path(original_input).expanduser().exists() else None

    media: list[dict[str, Any]] = [{
        "role": "source",
        "type": source_type,
        "url": source_url,
        "path": str(media_path.resolve()),
        "mime_type": mimetypes.guess_type(media_path.name)[0],
    }]
    for item in frames:
        media.append({
            "role": "frame",
            "type": "image",
            "path": item.get("path"),
            "timestamp_s": item.get("midpoint_s"),
            "segment_index": item.get("segment_index"),
        })

    content: dict[str, Any] = {
        "local_path": str(media_path.resolve()),
        "source_path": source_path,
        "metadata": probe,
    }
    text = None
    if transcript_info:
        text = transcript_info.get("text")
        content["transcript"] = {k: v for k, v in transcript_info.items() if k != "text"}
    if frames:
        content["frames"] = frames

    seen: list[str] = []
    for name in ["media-inspector", *upstream, "ffprobe"]:
        if name not in seen:
            seen.append(name)

    return {
        "schema_version": 1,
        "source": {
            "type": source_type,
            "url": source_url,
            "path": source_path,
        },
        "retrieved_at": utc_now(),
        "author": None,
        "published_at": None,
        "text": text,
        "media": media,
        "comments": [],
        "content": content,
        "provenance": {
            "tool": "media-inspector",
            "acquisition_path": acquisition_path,
            "upstream_tools": seen[1:],
        },
    }


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Thin media inspection orchestrator for AIUse.")
    p.add_argument("input", help="existing local file, direct media URL, or YouTube URL")
    p.add_argument("--mode", choices=("metadata", "transcribe", "analyze"), default="analyze")
    p.add_argument("--output-dir", type=Path, default=Path("media-inspector-output"))
    p.add_argument("--browser", help="browser profile source for YouTube acquisition, e.g. firefox")
    p.add_argument("--model", default="small")
    p.add_argument("--language", default="ja")
    p.add_argument("--frame-count", type=int, default=6)
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if args.frame_count < 1 or args.frame_count > 24:
        raise SystemExit("--frame-count must be between 1 and 24")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    try:
        guessed_type, _ = classify_input(args.input)
        media_path, acquisition_path, upstream = acquire(args.input, args.output_dir, args.browser)
        probe = ffprobe_metadata(media_path)
        source_type = media_type_from_probe(media_path, probe, guessed_type)

        transcript_info = None
        frames: list[dict[str, Any]] = []
        if args.mode in {"transcribe", "analyze"}:
            if source_type not in {"video", "audio"}:
                raise InspectError(f"{args.mode} mode requires audio/video input; detected {source_type}")
            transcript_info, used = transcribe(media_path, args.output_dir, args.model, args.language)
            upstream += used

        if args.mode == "analyze":
            if source_type != "video":
                raise InspectError("analyze mode requires video input")
            transcript_json = Path(transcript_info["transcript_json"])
            frames, used = extract_frames(media_path, transcript_json, args.output_dir, args.frame_count)
            upstream += used

        result = build_envelope(
            args.input, source_type, media_path, acquisition_path, probe,
            transcript_info, frames, upstream
        )
        result_path = args.output_dir / "result.json"
        result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(result_path.resolve())
        return 0
    except InspectError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
