#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
futaba_img_reader.py
img.2chan.net など Futaba 系の現行スレを取得し、LLM向け Markdown / JSON に整形する。

Install:
    py -m pip install requests beautifulsoup4

Examples:
    py futaba_img_reader.py "https://img.2chan.net/b/res/1462301292.htm"
    py futaba_img_reader.py "https://img.2chan.net/b/res/1462301292.htm" --json
    py futaba_img_reader.py URL -o thread.md

Optional local relay:
    py futaba_img_reader.py --serve 8765
    http://127.0.0.1:8765/read?url=https%3A%2F%2Fimg.2chan.net%2Fb%2Fres%2F1462301292.htm

Note:
    localhost は ChatGPT 側から直接アクセスできない。
    外部から読ませる場合は、必要に応じてこの relay を自分で管理する
    HTTPS tunnel 等の背後に置く。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urljoin, urlparse

try:
    import requests
    from bs4 import BeautifulSoup, NavigableString, Tag
except ImportError as e:
    print(
        "依存パッケージがありません。\n"
        "  py -m pip install requests beautifulsoup4",
        file=sys.stderr,
    )
    raise SystemExit(2) from e


UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/150.0 Safari/537.36"
)
THREAD_RE = re.compile(r"^/[^/]+/res/(\d+)\.htm$")
NO_RE = re.compile(r"(?<![A-Za-z0-9])No\.(\d+)(?!\d)")
DATE_RE = re.compile(r"\b\d{2}/\d{2}/\d{2}\([^)]+\)\d{2}:\d{2}:\d{2}\b")
SODANE_RE = re.compile(r"そうだねx(\d+)")
EXPIRE_RE = re.compile(r"(\d{1,2}:\d{2})頃消えます")
IMG_EXT_RE = re.compile(r"\.(?:jpe?g|png|gif|webp|webm)$", re.I)


@dataclass
class Post:
    no: int
    timestamp: str | None
    sodane: int | None
    expires: str | None
    subject: str | None
    text: str
    image_url: str | None
    image_name: str | None


@dataclass
class ThreadData:
    source_url: str
    fetched_at_utc: str
    thread_no: int
    title: str | None
    post_count: int
    posts: list[Post]


class FutabaError(RuntimeError):
    pass


def validate_url(url: str) -> tuple[str, int]:
    p = urlparse(url)
    if p.scheme not in {"http", "https"}:
        raise FutabaError("http/https URL ではありません")
    host = (p.hostname or "").lower()
    if not (host == "2chan.net" or host.endswith(".2chan.net")):
        raise FutabaError("2chan.net 系以外のURLは受け付けません")
    m = THREAD_RE.match(p.path)
    if not m:
        raise FutabaError("スレURL形式ではありません: .../<board>/res/<number>.htm")
    return host, int(m.group(1))


def decode_html(resp: requests.Response) -> str:
    # ふたばは歴史的に Shift_JIS / CP932 系が多い。
    # HTTP/meta の指定を優先し、怪しい時だけ apparent_encoding を使う。
    enc = resp.encoding
    if not enc or enc.lower() in {"iso-8859-1", "ascii"}:
        enc = resp.apparent_encoding or "cp932"

    candidates = [enc, "cp932", "shift_jis", "utf-8"]
    tried = set()
    for candidate in candidates:
        if not candidate:
            continue
        key = candidate.lower()
        if key in tried:
            continue
        tried.add(key)
        try:
            text = resp.content.decode(candidate, errors="strict")
            if "�" not in text:
                return text
        except (UnicodeDecodeError, LookupError):
            pass
    return resp.content.decode(enc or "cp932", errors="replace")


def fetch_html(url: str, timeout: float = 15.0) -> str:
    validate_url(url)
    headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Referer": "https://img.2chan.net/b/",
    }
    try:
        r = requests.get(url, headers=headers, timeout=timeout)
    except requests.RequestException as e:
        raise FutabaError(f"取得失敗: {e}") from e

    if r.status_code == 404:
        raise FutabaError("404: スレが消えたかURLが違います")
    if r.status_code != 200:
        raise FutabaError(f"HTTP {r.status_code}")

    text = decode_html(r)
    if "No." not in text or "<blockquote" not in text.lower():
        raise FutabaError("スレ本文らしいHTMLを取得できませんでした")
    return text


def _text_with_breaks(node: Tag) -> str:
    # <br> を改行として保持し、引用記号 > もそのまま残す。
    parts: list[str] = []

    def walk(n):
        if isinstance(n, NavigableString):
            parts.append(str(n))
            return
        if not isinstance(n, Tag):
            return
        if n.name == "br":
            parts.append("\n")
            return
        for c in n.children:
            walk(c)

    walk(node)
    text = "".join(parts)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _container_for(block: Tag) -> Tag:
    # 返信は td、OPは form/body 直下寄り。No. が見つかる最小祖先を採る。
    for parent_name in ("td", "div", "form", "body"):
        p = block.find_parent(parent_name)
        if p and NO_RE.search(p.get_text(" ", strip=True)):
            return p
    return block.parent if isinstance(block.parent, Tag) else block


def _metadata_near_block(block: Tag, container: Tag) -> str:
    # container 全体だと後続レスまで混ざる場合があるので、
    # blockquote より前のテキストを中心に拾う。
    parts: list[str] = []
    for elem in block.previous_elements:
        if elem is container:
            break
        if isinstance(elem, NavigableString):
            s = str(elem).strip()
            if s:
                parts.append(s)
        if len(" ".join(parts)) > 1200:
            break
    text = " ".join(reversed(parts))
    if not NO_RE.search(text):
        text = container.get_text(" ", strip=True)[:1800]
    return re.sub(r"\s+", " ", text)


def _find_image(block: Tag, container: Tag, base_url: str) -> tuple[str | None, str | None]:
    # blockquote から直前方向だけを見る。前レスの画像を誤って拾わないよう、
    # container または前の blockquote に達したら打ち切る。
    for elem in block.previous_elements:
        if elem is container:
            break
        if isinstance(elem, Tag):
            if elem.name == "blockquote":
                break
            if elem.name == "a" and elem.has_attr("href"):
                href = elem.get("href", "")
                if IMG_EXT_RE.search(href.split("?", 1)[0]):
                    return urljoin(base_url, href), href.rsplit("/", 1)[-1]

    # 返信 td の中だけなら安全なのでフォールバック探索。
    if container.name == "td":
        for a in container.find_all("a", href=True):
            href = a.get("href", "")
            if IMG_EXT_RE.search(href.split("?", 1)[0]):
                return urljoin(base_url, href), href.rsplit("/", 1)[-1]
    return None, None


def _find_subject(meta: str) -> str | None:
    # Subject がある板向け。二次裏では空が普通。
    m = re.search(r"(?:Subject|題名|タイトル)\s*[:：]?\s*(.+?)(?=\s+(?:Name|名前|No\.|\d{2}/\d{2}/\d{2}))", meta)
    if not m:
        return None
    s = m.group(1).strip()
    return s or None


def parse_thread(html: str, source_url: str) -> ThreadData:
    _, thread_no = validate_url(source_url)
    soup = BeautifulSoup(html, "html.parser")

    title = None
    if soup.title:
        raw_title = soup.title.get_text(" ", strip=True)
        raw_title = re.sub(r"\s*[-–—]\s*二次元裏＠ふたば.*$", "", raw_title).strip()
        if raw_title and raw_title != "二次元裏＠ふたば":
            title = raw_title

    posts: list[Post] = []
    seen: set[int] = set()

    for block in soup.find_all("blockquote"):
        text = _text_with_breaks(block)
        if not text:
            continue

        container = _container_for(block)
        meta = _metadata_near_block(block, container)

        nos = NO_RE.findall(meta)
        if not nos:
            continue
        no = int(nos[-1])
        if no in seen:
            continue

        dm = DATE_RE.search(meta)
        sm = SODANE_RE.search(meta)
        em = EXPIRE_RE.search(meta)
        image_url, image_name = _find_image(block, container, source_url)

        posts.append(
            Post(
                no=no,
                timestamp=dm.group(0) if dm else None,
                sodane=int(sm.group(1)) if sm else None,
                expires=em.group(1) if em else None,
                subject=_find_subject(meta),
                text=text,
                image_url=image_url,
                image_name=image_name,
            )
        )
        seen.add(no)

    if not posts:
        raise FutabaError("レスを解析できませんでした。HTML構造が変わった可能性があります")

    # DOM順が基本だが、念のためレス番号順。
    posts.sort(key=lambda p: p.no)

    return ThreadData(
        source_url=source_url,
        fetched_at_utc=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        thread_no=thread_no,
        title=title,
        post_count=len(posts),
        posts=posts,
    )


def to_markdown(data: ThreadData) -> str:
    lines = [
        "# Futaba thread",
        "",
        f"- source: {data.source_url}",
        f"- thread_no: {data.thread_no}",
        f"- fetched_at_utc: {data.fetched_at_utc}",
        f"- parsed_posts: {data.post_count}",
    ]
    if data.title:
        lines.append(f"- title: {data.title}")
    lines.append("")

    for p in data.posts:
        label = "OP" if p.no == data.thread_no else f"No.{p.no}"
        lines.append(f"## {label}")
        meta = []
        if p.timestamp:
            meta.append(p.timestamp)
        if p.sodane is not None:
            meta.append(f"そうだねx{p.sodane}")
        if p.expires:
            meta.append(f"{p.expires}頃消えます")
        if meta:
            lines.append(" / ".join(meta))
        if p.subject:
            lines.append(f"subject: {p.subject}")
        if p.image_url:
            lines.append(f"image: {p.image_url}")
        lines.append("")
        lines.append(p.text)
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def read_thread(url: str, timeout: float = 15.0) -> ThreadData:
    html = fetch_html(url, timeout=timeout)
    return parse_thread(html, url)


class RelayHandler(BaseHTTPRequestHandler):
    server_version = "FutabaReader/1.0"

    def _send(self, status: int, body: bytes, content_type: str):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        p = urlparse(self.path)
        if p.path == "/health":
            self._send(200, b"ok\n", "text/plain; charset=utf-8")
            return
        if p.path != "/read":
            self._send(
                404,
                b"use /read?url=https%3A%2F%2Fimg.2chan.net%2Fb%2Fres%2F....htm\n",
                "text/plain; charset=utf-8",
            )
            return

        qs = parse_qs(p.query)
        url = qs.get("url", [""])[0]
        fmt = qs.get("format", ["md"])[0].lower()
        try:
            data = read_thread(url)
            if fmt == "json":
                body = json.dumps(asdict(data), ensure_ascii=False, indent=2).encode("utf-8")
                ctype = "application/json; charset=utf-8"
            else:
                body = to_markdown(data).encode("utf-8")
                ctype = "text/markdown; charset=utf-8"
            self._send(200, body, ctype)
        except Exception as e:
            body = (f"error: {e}\n").encode("utf-8", errors="replace")
            self._send(400, body, "text/plain; charset=utf-8")

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))


def serve(port: int):
    addr = ("127.0.0.1", port)
    httpd = ThreadingHTTPServer(addr, RelayHandler)
    print(f"Futaba relay: http://127.0.0.1:{port}")
    print("  health: /health")
    print("  read:   /read?url=<percent-encoded-thread-url>")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


def main():
    ap = argparse.ArgumentParser(description="Futaba thread reader for LLM use")
    ap.add_argument("url", nargs="?", help="例: https://img.2chan.net/b/res/1462301292.htm")
    ap.add_argument("-o", "--output", help="UTF-8で保存。未指定ならstdout")
    ap.add_argument("--json", action="store_true", help="MarkdownではなくJSON")
    ap.add_argument("--timeout", type=float, default=15.0)
    ap.add_argument("--serve", type=int, metavar="PORT", help="localhost relay を起動")
    args = ap.parse_args()

    if args.serve is not None:
        serve(args.serve)
        return

    if not args.url:
        ap.error("url が必要です（または --serve PORT）")

    try:
        data = read_thread(args.url, timeout=args.timeout)
    except FutabaError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        raise SystemExit(1)

    if args.json:
        out = json.dumps(asdict(data), ensure_ascii=False, indent=2) + "\n"
    else:
        out = to_markdown(data)

    if args.output:
        with open(args.output, "w", encoding="utf-8", newline="\n") as f:
            f.write(out)
        print(args.output)
    else:
        # Windows terminalでも壊れにくく。
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
        sys.stdout.write(out)


if __name__ == "__main__":
    main()
