#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Resolve a public X/Twitter post to normalized JSON / Markdown for assistant use.

Primary: FxTwitter API v2
Fallback: gallery-dl (if installed)
"""
from __future__ import annotations
import argparse, json, re, shutil, subprocess, sys
from dataclasses import dataclass, asdict
from typing import Any
from urllib.parse import urlparse
import requests

UA = "AIUse/x-post-resolver (+https://github.com/kaillebidan-byte/AIUse)"
STATUS_RE = re.compile(r"/status/(\d+)")
MEDIA_EXT = re.compile(r"\.(?:jpe?g|png|gif|webp|webm|mp4|m3u8)(?:$|[?#])", re.I)

class ResolveError(RuntimeError): pass

def status_id(url: str) -> str:
    p = urlparse(url)
    host=(p.hostname or "").lower()
    if host not in {"x.com","www.x.com","twitter.com","www.twitter.com","mobile.twitter.com"}:
        raise ResolveError("X/Twitter status URL expected")
    m=STATUS_RE.search(p.path)
    if not m: raise ResolveError("status id not found")
    return m.group(1)

def get_fx(url: str, timeout: float=15.0) -> dict[str, Any]:
    sid=status_id(url)
    api=f"https://api.fxtwitter.com/2/status/{sid}"
    r=requests.get(api, headers={"User-Agent":UA,"Accept":"application/json"}, timeout=timeout)
    if r.status_code != 200:
        raise ResolveError(f"FxTwitter HTTP {r.status_code}")
    data=r.json()
    st=data.get("status") or data.get("tweet")
    if not isinstance(st, dict):
        raise ResolveError("FxTwitter returned no status")
    return normalize_status(st, source="fxtwitter-v2")

def media_items(st: dict[str,Any]) -> list[dict[str,Any]]:
    out=[]
    media=st.get("media") or {}
    for kind in ("photos","videos"):
        vals=media.get(kind) or []
        if isinstance(vals, list):
            for item in vals:
                if isinstance(item, dict) and item.get("url"):
                    out.append({
                        "type": item.get("type") or kind.rstrip("s"),
                        "url": item.get("url"),
                        "thumbnail_url": item.get("thumbnail_url"),
                        "width": item.get("width"),
                        "height": item.get("height"),
                        "alt_text": item.get("altText") or item.get("alt_text"),
                    })
    ext=media.get("external")
    if isinstance(ext,dict) and ext.get("url"):
        out.append({"type":ext.get("type") or "external","url":ext["url"],"thumbnail_url":ext.get("thumbnail_url")})
    mosaic=media.get("mosaic")
    if isinstance(mosaic,dict):
        fm=mosaic.get("formats")
        if isinstance(fm,dict):
            for fmt,u in fm.items():
                if isinstance(u,str):
                    out.append({"type":f"mosaic_{fmt}","url":u})
    return out

def normalize_status(st: dict[str,Any], source: str) -> dict[str,Any]:
    author=st.get("author") or {}
    quote=st.get("quote")
    return {
        "source": source,
        "id": str(st.get("id") or ""),
        "url": st.get("url"),
        "text": st.get("text") or (st.get("raw_text") or {}).get("text"),
        "created_at": st.get("created_at"),
        "author": {
            "name": author.get("name") or author.get("display_name"),
            "screen_name": author.get("screen_name") or author.get("username"),
            "avatar_url": author.get("avatar_url"),
        },
        "metrics": {
            "likes": st.get("likes"),
            "reposts": st.get("reposts", st.get("retweets")),
            "quotes": st.get("quotes"),
            "replies": st.get("replies"),
            "views": st.get("views"),
        },
        "media": media_items(st),
        "quote": normalize_status(quote, source) if isinstance(quote,dict) and quote.get("id") else None,
    }

def collect_urls(obj: Any, out: list[str]) -> None:
    if isinstance(obj, dict):
        for v in obj.values(): collect_urls(v,out)
    elif isinstance(obj, list):
        for v in obj: collect_urls(v,out)
    elif isinstance(obj,str) and obj.startswith(("http://","https://")) and MEDIA_EXT.search(obj):
        if obj not in out: out.append(obj)

def get_gallery_dl(url: str, timeout: float=30.0) -> dict[str,Any]:
    exe=shutil.which("gallery-dl")
    if not exe: raise ResolveError("gallery-dl not installed")
    cp=subprocess.run([exe,"-J","--no-input",url],capture_output=True,text=True,encoding="utf-8",
                      errors="replace",timeout=timeout)
    if cp.returncode != 0:
        raise ResolveError("gallery-dl failed: "+cp.stderr.strip()[:500])
    try: raw=json.loads(cp.stdout)
    except json.JSONDecodeError as e: raise ResolveError("gallery-dl JSON parse failed") from e
    urls=[]; collect_urls(raw,urls)
    return {"source":"gallery-dl","url":url,"media":[{"type":"media","url":u} for u in urls],"raw":raw}

def resolve(url: str, timeout: float, force_gallery: bool=False) -> dict[str,Any]:
    status_id(url)
    errors=[]
    if not force_gallery:
        try: return get_fx(url,timeout)
        except Exception as e: errors.append(f"FxTwitter: {e}")
    try:
        data=get_gallery_dl(url,max(timeout,30.0))
        if errors: data["fallback_reason"]="; ".join(errors)
        return data
    except Exception as e:
        errors.append(f"gallery-dl: {e}")
        raise ResolveError(" | ".join(errors))

def markdown(d:dict[str,Any])->str:
    lines=["# X post","",f"- source: {d.get('source')}"]
    for k in ("url","id","created_at"):
        if d.get(k): lines.append(f"- {k}: {d[k]}")
    a=d.get("author") or {}
    if a: lines.append(f"- author: {a.get('name') or ''} (@{a.get('screen_name') or ''})")
    if d.get("text"): lines += ["",d["text"],""]
    media=d.get("media") or []
    if media:
        lines += ["## Media",""]
        for i,m in enumerate(media,1):
            lines.append(f"{i}. {m.get('type','media')}: {m.get('url')}")
            if m.get("alt_text"): lines.append(f"   alt: {m['alt_text']}")
    if d.get("quote"):
        q=d["quote"]; lines += ["","## Quote","",q.get("text") or "",f"- url: {q.get('url')}"]
    return "\n".join(lines).rstrip()+"\n"

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--json",action="store_true")
    ap.add_argument("--gallery-dl",action="store_true",help="skip FxTwitter and force gallery-dl")
    ap.add_argument("--timeout",type=float,default=15.0)
    ap.add_argument("-o","--output")
    a=ap.parse_args()
    try: d=resolve(a.url,a.timeout,a.gallery_dl)
    except ResolveError as e:
        print(f"ERROR: {e}",file=sys.stderr); raise SystemExit(1)
    out=(json.dumps(d,ensure_ascii=False,indent=2)+"\n") if a.json else markdown(d)
    if a.output: Path(a.output).write_text(out,encoding="utf-8")
    else:
        try: sys.stdout.reconfigure(encoding="utf-8")
        except Exception: pass
        sys.stdout.write(out)

if __name__=="__main__":
    from pathlib import Path
    main()
