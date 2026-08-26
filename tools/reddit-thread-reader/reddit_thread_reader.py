#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Read a public Reddit thread from rendered public HTML and normalize it for assistant use.
No Reddit API key required. This intentionally does not attempt to bypass login/CAPTCHA/rate limits.
"""
from __future__ import annotations
import argparse, json, re, sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup, Tag

UA="AIUse/reddit-thread-reader (+https://github.com/kaillebidan-byte/AIUse)"

class RedditError(RuntimeError): pass

def validate(url:str)->None:
    h=(urlparse(url).hostname or "").lower()
    if not (h=="reddit.com" or h.endswith(".reddit.com")): raise RedditError("reddit.com URL expected")
    if "/comments/" not in urlparse(url).path: raise RedditError("Reddit thread URL expected")

def text_of(node: Tag|None)->str:
    if not node: return ""
    return "\n".join(x.strip() for x in node.stripped_strings if x.strip()).strip()

def fetch(url:str,timeout:float)->str:
    validate(url)
    r=requests.get(url,headers={"User-Agent":UA,"Accept-Language":"en-US,en;q=0.8,ja;q=0.6"},timeout=timeout)
    if r.status_code in (401,403,429):
        raise RedditError(f"HTTP {r.status_code}: access/login/rate-limit boundary")
    if r.status_code!=200: raise RedditError(f"HTTP {r.status_code}")
    if "shreddit-post" not in r.text and "<article" not in r.text:
        raise RedditError("thread HTML was not present in response")
    return r.text

def find_body(el:Tag)->str:
    selectors=[
        '[slot="text-body"]','shreddit-post-text-body','[data-testid="post-text-container"]',
        '[id$="-post-rtjson-content"]','[id$="-comment-rtjson-content"]','.md','.usertext-body'
    ]
    for sel in selectors:
        n=el.select_one(sel)
        t=text_of(n)
        if t: return t
    return ""

def attr_int(el:Tag,*names:str):
    for n in names:
        v=el.get(n)
        if v is not None:
            m=re.search(r"-?\d+",str(v).replace(",",""))
            if m:
                try:return int(m.group())
                except:pass
    return None

def parse(html:str,url:str)->dict[str,Any]:
    soup=BeautifulSoup(html,"html.parser")
    post=soup.find("shreddit-post")
    if not post:
        raise RedditError("shreddit-post not found; page structure may have changed")
    title=post.get("post-title") or post.get("title")
    if not title:
        n=post.select_one('a[id^="post-title"], h1')
        title=text_of(n)
    author=post.get("author")
    subreddit=post.get("subreddit-name") or post.get("subreddit-prefixed-name")
    body=find_body(post)
    media=[]
    for img in post.find_all("img",src=True):
        src=img.get("src")
        if src and src.startswith("http") and src not in [m["url"] for m in media]:
            media.append({"type":"image","url":src,"alt":img.get("alt")})
    comments=[]
    for c in soup.find_all("shreddit-comment"):
        thing=c.get("thingid") or c.get("thing-id") or ""
        cid=thing.removeprefix("t1_") if thing else c.get("comment-id")
        comments.append({
            "id":cid,
            "thing_id":thing or None,
            "author":c.get("author"),
            "depth":attr_int(c,"depth"),
            "score":attr_int(c,"score","vote-count"),
            "permalink":c.get("permalink"),
            "text":find_body(c),
        })
    return {
        "source_url":url,
        "subreddit":subreddit,
        "title":title,
        "author":author,
        "score":attr_int(post,"score","score-count","vote-count"),
        "body":body,
        "media":media,
        "comment_count_parsed":len(comments),
        "comments":comments,
    }

def markdown(d):
    lines=["# Reddit thread","",f"- source: {d['source_url']}"]
    if d.get("subreddit"): lines.append(f"- subreddit: {d['subreddit']}")
    if d.get("author"): lines.append(f"- author: u/{d['author']}")
    lines += ["",f"## {d.get('title') or '(untitled)'}","",d.get("body") or ""]
    if d.get("media"):
        lines += ["","### Media",""]
        for m in d["media"]: lines.append(f"- {m['url']}")
    lines += ["","## Comments",""]
    for c in d["comments"]:
        depth=c.get("depth") or 0
        prefix="  "*depth
        lines.append(f"{prefix}- u/{c.get('author') or '[deleted]'} ({c.get('id') or '?'})")
        for ln in (c.get("text") or "").splitlines():
            lines.append(f"{prefix}  {ln}")
    return "\n".join(lines).rstrip()+"\n"

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("url"); ap.add_argument("--json",action="store_true")
    ap.add_argument("--timeout",type=float,default=20); ap.add_argument("-o","--output")
    a=ap.parse_args()
    try:d=parse(fetch(a.url,a.timeout),a.url)
    except RedditError as e: print(f"ERROR: {e}",file=sys.stderr); raise SystemExit(1)
    out=(json.dumps(d,ensure_ascii=False,indent=2)+"\n") if a.json else markdown(d)
    if a.output:Path(a.output).write_text(out,encoding="utf-8")
    else:
        try:sys.stdout.reconfigure(encoding="utf-8")
        except Exception:pass
        sys.stdout.write(out)
if __name__=="__main__":main()
