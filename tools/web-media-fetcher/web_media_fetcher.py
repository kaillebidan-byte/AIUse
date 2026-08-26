#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Download explicit public media URLs to local files for later image/video analysis.
Accepts URLs on CLI or one-per-line input file. Does not discover media from pages.
"""
from __future__ import annotations
import argparse, hashlib, re, sys
from pathlib import Path
from urllib.parse import urlparse, unquote
import requests

UA="AIUse/web-media-fetcher (+https://github.com/kaillebidan-byte/AIUse)"
ALLOWED_CT=("image/","video/","audio/")
EXT_BY_CT={"image/jpeg":".jpg","image/png":".png","image/webp":".webp","image/gif":".gif",
           "video/mp4":".mp4","video/webm":".webm"}

class MediaError(RuntimeError):pass

def safe_name(url:str,ct:str,index:int)->str:
    name=unquote(Path(urlparse(url).path).name)
    name=re.sub(r'[^A-Za-z0-9._-]+','_',name).strip('._')
    if not name:
        name=f"media_{index}"
    if "." not in name:
        name+=EXT_BY_CT.get(ct,"")
    return name[:180]

def download(url:str,outdir:Path,index:int,timeout:float,max_mb:int)->Path:
    if urlparse(url).scheme not in {"http","https"}: raise MediaError("http/https only")
    with requests.get(url,headers={"User-Agent":UA},stream=True,timeout=timeout,allow_redirects=True) as r:
        if r.status_code!=200: raise MediaError(f"HTTP {r.status_code}")
        ct=(r.headers.get("Content-Type") or "").split(";")[0].lower()
        if ct and not ct.startswith(ALLOWED_CT): raise MediaError(f"not media Content-Type: {ct}")
        clen=r.headers.get("Content-Length")
        limit=max_mb*1024*1024
        if clen and int(clen)>limit: raise MediaError(f"too large: {int(clen)/1024/1024:.1f} MiB")
        outdir.mkdir(parents=True,exist_ok=True)
        p=outdir/safe_name(r.url,ct,index)
        if p.exists():
            stem,suf=p.stem,p.suffix
            p=outdir/f"{stem}_{hashlib.sha1(url.encode()).hexdigest()[:8]}{suf}"
        total=0
        with p.open("wb") as f:
            for chunk in r.iter_content(1024*256):
                if not chunk:continue
                total+=len(chunk)
                if total>limit:
                    f.close(); p.unlink(missing_ok=True); raise MediaError(f"exceeded {max_mb} MiB limit")
                f.write(chunk)
        return p

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("urls",nargs="*"); ap.add_argument("-i","--input")
    ap.add_argument("-d","--directory",default="media")
    ap.add_argument("--timeout",type=float,default=30); ap.add_argument("--max-mb",type=int,default=100)
    a=ap.parse_args()
    urls=list(a.urls)
    if a.input:
        urls += [x.strip() for x in Path(a.input).read_text(encoding="utf-8").splitlines()
                 if x.strip() and not x.lstrip().startswith("#")]
    if not urls: ap.error("URL required")
    failed=0
    for i,u in enumerate(urls,1):
        try: print(download(u,Path(a.directory),i,a.timeout,a.max_mb))
        except Exception as e:
            failed+=1; print(f"ERROR {u}: {e}",file=sys.stderr)
    raise SystemExit(1 if failed else 0)
if __name__=="__main__":main()
