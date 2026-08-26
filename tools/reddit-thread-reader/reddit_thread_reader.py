#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Read a public Reddit thread and normalize it for assistant use.

Strategy:
1. Try rendered public HTML first (best: nested comments + scores when Reddit serves it).
2. If Reddit blocks HTML with 401/403/429 or the expected DOM is absent, fall back to
   the still-public per-thread RSS/Atom feed.

RSS fallback needs no Reddit API key/OAuth, but comments are flat, scoreless, and
currently capped around 25 entries by Reddit's feed surface.
"""
from __future__ import annotations
import argparse, html as html_lib, json, re, sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, urlunparse
import xml.etree.ElementTree as ET

import requests
from bs4 import BeautifulSoup, Tag

APP_UA="AIUse/reddit-thread-reader (+https://github.com/kaillebidan-byte/AIUse)"
BROWSER_UA=(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
)
ATOM="{http://www.w3.org/2005/Atom}"

class RedditError(RuntimeError): pass

def validate(url:str)->None:
    h=(urlparse(url).hostname or "").lower()
    if not (h=="reddit.com" or h.endswith(".reddit.com")): raise RedditError("reddit.com URL expected")
    if "/comments/" not in urlparse(url).path: raise RedditError("Reddit thread URL expected")

def text_of(node: Tag|None)->str:
    if not node: return ""
    return "\n".join(x.strip() for x in node.stripped_strings if x.strip()).strip()

def html_headers()->dict[str,str]:
    return {
        "User-Agent":BROWSER_UA,
        "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":"en-US,en;q=0.8,ja;q=0.6",
    }

def rss_url(url:str)->str:
    validate(url)
    p=urlparse(url)
    path=p.path
    if path.endswith(".rss"):
        return urlunparse((p.scheme,p.netloc,path,"","",""))
    if not path.endswith("/"):
        path += "/"
    path += ".rss"
    return urlunparse((p.scheme,p.netloc,path,"","",""))

def fetch_html(url:str,timeout:float)->str:
    validate(url)
    r=requests.get(url,headers=html_headers(),timeout=timeout)
    if r.status_code in (401,403,429):
        raise RedditError(f"HTML HTTP {r.status_code}: access/login/rate-limit boundary")
    if r.status_code!=200: raise RedditError(f"HTML HTTP {r.status_code}")
    if "shreddit-post" not in r.text and "<article" not in r.text:
        raise RedditError("thread HTML was not present in response")
    return r.text

def fetch_rss(url:str,timeout:float)->str:
    u=rss_url(url)
    r=requests.get(
        u,
        headers={
            "User-Agent":BROWSER_UA,
            "Accept":"application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.5",
            "Accept-Language":"en-US,en;q=0.8",
        },
        timeout=timeout,
    )
    if r.status_code!=200:
        raise RedditError(f"RSS HTTP {r.status_code}")
    text=r.text
    if "<feed" not in text or "<entry" not in text:
        raise RedditError("Reddit RSS/Atom feed was not present in response")
    return text

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

def parse_html(html:str,url:str)->dict[str,Any]:
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
            "published":None,
            "text":find_body(c),
        })
    return {
        "source_url":url,
        "transport":"html",
        "limitations":[],
        "subreddit":subreddit,
        "title":title,
        "author":author,
        "score":attr_int(post,"score","score-count","vote-count"),
        "body":body,
        "media":media,
        "comment_count_parsed":len(comments),
        "comments":comments,
    }

def clean_atom_html(raw:str)->str:
    decoded=html_lib.unescape(raw or "")
    soup=BeautifulSoup(decoded,"html.parser")
    return "\n".join(x.strip() for x in soup.stripped_strings if x.strip()).strip()

def child_text(el:ET.Element,name:str)->str:
    n=el.find(ATOM+name)
    return (n.text or "").strip() if n is not None else ""

def atom_author(entry:ET.Element)->str|None:
    a=entry.find(ATOM+"author")
    if a is None:return None
    n=a.find(ATOM+"name")
    return (n.text or "").strip() if n is not None and n.text else None

def atom_link(entry:ET.Element)->str|None:
    for n in entry.findall(ATOM+"link"):
        href=n.attrib.get("href")
        if href:return href
    return None

def comment_id_from_link(link:str|None)->str|None:
    if not link:return None
    p=urlparse(link).path.rstrip("/").split("/")
    if len(p)>=1:
        tail=p[-1]
        if re.fullmatch(r"[0-9a-z]{5,16}",tail,re.I): return tail
    return None

def parse_rss(xml:str,url:str,html_error:str|None=None)->dict[str,Any]:
    try:
        root=ET.fromstring(xml)
    except ET.ParseError as e:
        raise RedditError(f"RSS XML parse failed: {e}") from e

    feed_title=child_text(root,"title") or None
    entries=[]
    for entry in root.findall(ATOM+"entry"):
        content=child_text(entry,"content")
        entries.append({
            "title":child_text(entry,"title") or None,
            "author":atom_author(entry),
            "link":atom_link(entry),
            "published":child_text(entry,"published") or child_text(entry,"updated") or None,
            "id":child_text(entry,"id") or None,
            "text":clean_atom_html(content),
        })

    post=None
    comments=[]
    for e in entries:
        t=e.get("text") or ""
        looks_post=("submitted by" in t.lower() and "[link]" in t.lower())
        if looks_post and post is None:
            post=e
            continue
        comments.append({
            "id":comment_id_from_link(e.get("link")) or e.get("id"),
            "thing_id":None,
            "author":e.get("author"),
            "depth":None,
            "score":None,
            "permalink":e.get("link"),
            "published":e.get("published"),
            "text":e.get("text") or "",
        })

    title=(post or {}).get("title") or feed_title
    author=(post or {}).get("author")
    body=(post or {}).get("text") or ""
    subreddit=None
    m=re.search(r"/r/([^/]+)/comments/",urlparse(url).path,re.I)
    if m:subreddit="r/"+m.group(1)

    lim=[
        "RSS fallback: comments are flat; parent/child depth is unavailable",
        "RSS fallback: comment/post scores are unavailable",
        "RSS fallback: Reddit feed is typically capped around 25 entries",
    ]
    if html_error:lim.insert(0,f"HTML path unavailable: {html_error}")
    return {
        "source_url":url,
        "rss_source_url":rss_url(url),
        "transport":"rss",
        "limitations":lim,
        "subreddit":subreddit,
        "title":title,
        "author":author,
        "score":None,
        "body":body,
        "media":[],
        "comment_count_parsed":len(comments),
        "comments":comments,
    }

def read_thread(url:str,timeout:float)->dict[str,Any]:
    validate(url)
    html_error=None
    try:
        return parse_html(fetch_html(url,timeout),url)
    except RedditError as e:
        html_error=str(e)
    return parse_rss(fetch_rss(url,timeout),url,html_error)

def markdown(d):
    lines=["# Reddit thread","",f"- source: {d['source_url']}",f"- transport: {d.get('transport','?')}"]
    if d.get("subreddit"): lines.append(f"- subreddit: {d['subreddit']}")
    if d.get("author"): lines.append(f"- author: u/{d['author']}")
    if d.get("limitations"):
        lines += ["","## Limitations",""]
        lines += [f"- {x}" for x in d["limitations"]]
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
    try:d=read_thread(a.url,a.timeout)
    except RedditError as e: print(f"ERROR: {e}",file=sys.stderr); raise SystemExit(1)
    out=(json.dumps(d,ensure_ascii=False,indent=2)+"\n") if a.json else markdown(d)
    if a.output:Path(a.output).write_text(out,encoding="utf-8")
    else:
        try:sys.stdout.reconfigure(encoding="utf-8")
        except Exception:pass
        sys.stdout.write(out)
if __name__=="__main__":main()
