// ==UserScript==
// @name         ChatGPT Inline Video Lite
// @namespace    local.chatgpt.inline-video
// @version      0.8.6-rplay
// @description  YouTube/TikTok/Bilibili/TwitCastingにRPLAY live inline/popupと録画handoffを統合。
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://player.bilibili.com/player.html*
// @match        https://rplay.live/*
// @match        https://www.rplay.live/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @connect      api.bilibili.com
// @updateURL    https://raw.githubusercontent.com/kaillebidan-byte/AIUse/main/tools/chatgpt-inline-video-lite/chatgpt-inline-video-lite.user.js
// @downloadURL  https://raw.githubusercontent.com/kaillebidan-byte/AIUse/main/tools/chatgpt-inline-video-lite/chatgpt-inline-video-lite.user.js
// ==/UserScript==

(() => {
  'use strict';

  function gmJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 12000,
        headers: { Accept: 'application/json' },
        onload: (res) => {
          try { resolve(JSON.parse(res.responseText || '{}')); }
          catch (err) { reject(err); }
        },
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout'))
      });
    });
  }

  const RPLAY_RECORD_SCHEME = 'aiuse-rplay-record://start';
  const RPLAY_CLIPBOARD_PREFIX = 'AIUSE_RPLAY_RECORD_V1\n';

  function isRplayHost() {
    return /(^|\.)rplay\.live$/i.test(location.hostname);
  }

  function rplayMediaScore(raw) {
    if (!raw || typeof raw !== 'string' || raw.startsWith('blob:')) return -1;
    let url;
    try { url = new URL(raw, location.href); }
    catch { return -1; }
    if (url.protocol !== 'https:') return -1;

    const host = url.hostname.toLowerCase();
    if (!['livestream.rplay.live', 'api.rplay.live'].includes(host)) return -1;
    const pathAndQuery = url.pathname + url.search;
    let score = 0;
    if (host === 'livestream.rplay.live') score += 100;
    if (/\.flv(?:$|[?#])/i.test(pathAndQuery)) score += 80;
    if (/\.m3u8(?:$|[?#])/i.test(pathAndQuery)) score += 60;
    if (/\.mp4(?:$|[?#])/i.test(pathAndQuery)) score += 40;
    if (/\/live\/stream\//i.test(url.pathname)) score += 50;
    return score;
  }

  function findRplayMediaUrl() {
    const seen = new Set();
    const urls = [];
    const add = value => {
      if (typeof value !== 'string' || !value || seen.has(value)) return;
      seen.add(value);
      urls.push(value);
    };

    for (const el of document.querySelectorAll('video,audio,source')) {
      add(el.currentSrc);
      add(el.src);
      add(el.getAttribute?.('src'));
    }
    for (const entry of performance.getEntriesByType('resource')) add(entry.name);

    let best = null;
    let bestScore = 0;
    for (const url of urls) {
      const score = rplayMediaScore(url);
      if (score > bestScore) {
        best = url;
        bestScore = score;
      }
    }
    return best;
  }

  function handoffRplayRecording(mediaUrl) {
    const envelope = {
      media_url: mediaUrl,
      page_url: location.href,
      title: document.title || 'RPLAY live',
      detected_at: new Date().toISOString()
    };
    GM_setClipboard(RPLAY_CLIPBOARD_PREFIX + JSON.stringify(envelope), 'text');

    // Keep the signed URL out of the custom-protocol URI. The handler reads the
    // clipboard locally and clears it immediately after pickup.
    const launch = document.createElement('a');
    launch.href = RPLAY_RECORD_SCHEME;
    launch.style.display = 'none';
    document.documentElement.appendChild(launch);
    launch.click();
    launch.remove();
  }

  function initRplayLiveRecorder() {
    const livePath = /^\/live\/[0-9a-f]{24}(?:[/?#]|$)/i.test(location.pathname + location.search + location.hash)
      || /^\/c\/[^/]+\/live(?:[/?#]|$)/i.test(location.pathname + location.search + location.hash);
    if (!livePath || document.getElementById('ivl-rplay-record')) return;

    const btn = document.createElement('button');
    btn.id = 'ivl-rplay-record';
    btn.type = 'button';
    btn.textContent = '録画準備中…';
    btn.disabled = true;
    Object.assign(btn.style, {
      position: 'fixed',
      zIndex: '2147483647',
      right: '16px',
      bottom: '16px',
      padding: '9px 13px',
      border: '1px solid rgba(255,255,255,.28)',
      borderRadius: '10px',
      background: 'rgba(18,18,18,.92)',
      color: '#fff',
      font: '600 13px/1.3 system-ui, sans-serif',
      cursor: 'pointer',
      boxShadow: '0 4px 18px rgba(0,0,0,.28)'
    });

    let mediaUrl = null;
    const refresh = () => {
      mediaUrl = findRplayMediaUrl();
      btn.disabled = !mediaUrl;
      btn.textContent = mediaUrl ? '● RPLAY録画' : '録画準備中…';
      btn.style.opacity = mediaUrl ? '1' : '.58';
    };
    btn.addEventListener('click', () => {
      refresh();
      if (!mediaUrl) return;
      btn.textContent = 'PowerShell起動…';
      handoffRplayRecording(mediaUrl);
      setTimeout(refresh, 1800);
    });

    document.documentElement.appendChild(btn);
    refresh();
    setInterval(refresh, 1000);
  }

  function formatPartDurationShared(seconds) {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n < 0) return '';
    const total = Math.round(n);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${m}:${String(sec).padStart(2, '0')}`;
  }

  function initBilibiliPlayerSidebar() {
    const params = new URLSearchParams(location.search);
    const bvid = params.get('bvid');
    const aid = params.get('aid');
    const currentPage = Math.max(1, Number(params.get('p') || params.get('page') || 1) || 1);
    if (!bvid && !aid) return;

    const sidebarWidth = 360;
    const style = document.createElement('style');
    style.textContent = `
      :root { --ivl-bili-sidebar-width: ${sidebarWidth}px; }
      html, body {
        margin: 0 !important;
        width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
        background: #000 !important;
      }
      /* player本体は一切縮めない。Bilibili標準の音量/全画面UIをそのまま使う。 */
      #ivl-bili-parts {
        position: fixed;
        z-index: 2147483647;
        top: 0;
        right: 0;
        bottom: 0;
        width: var(--ivl-bili-sidebar-width);
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        background: #18191c;
        color: #f1f2f3;
        border-left: 1px solid #2f3134;
        box-shadow: -10px 0 28px rgba(0,0,0,.28);
        font: 13px/1.35 system-ui, -apple-system, sans-serif;
        transform: translateX(100%);
        transition: transform .16s ease-out;
      }
      #ivl-bili-parts.ivlb-opened { transform: translateX(0); }
      #ivl-bili-parts * { box-sizing: border-box; }
      .ivlb-head {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 11px 12px;
        border-bottom: 1px solid #2f3134;
      }
      .ivlb-head strong { flex: 1; min-width: 0; font-size: 14px; }
      .ivlb-open { color: #00aeec; text-decoration: none; font-size: 12px; white-space: nowrap; }
      .ivlb-close {
        width: 28px;
        height: 28px;
        padding: 0;
        border: 0;
        border-radius: 7px;
        background: #2b2d31;
        color: inherit;
        cursor: pointer;
        font-size: 18px;
        line-height: 28px;
      }
      .ivlb-close:hover { background: #3a3c41; }
      .ivlb-list { flex: 1 1 auto; overflow: auto; padding: 7px; }
      .ivlb-row {
        width: 100%;
        display: grid;
        grid-template-columns: 2.5em minmax(0,1fr) auto;
        gap: 8px;
        align-items: start;
        padding: 9px 9px;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
      }
      .ivlb-row:hover { background: #27282c; }
      .ivlb-row.ivlb-current { background: #33353a; }
      .ivlb-num, .ivlb-duration { opacity: .62; font-variant-numeric: tabular-nums; }
      .ivlb-duration { white-space: nowrap; }
      .ivlb-title {
        min-width: 0;
        overflow-wrap: anywhere;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .ivlb-status { padding: 12px; color: #9499a0; }
      #ivl-bili-toggle {
        position: fixed;
        z-index: 2147483647;
        top: 50%;
        right: 0;
        transform: translateY(-50%);
        width: 34px;
        min-height: 88px;
        padding: 8px 4px;
        border: 1px solid #3b3d42;
        border-right: 0;
        border-radius: 10px 0 0 10px;
        background: rgba(24,25,28,.94);
        color: #f1f2f3;
        cursor: pointer;
        font: 12px/1.25 system-ui, -apple-system, sans-serif;
        writing-mode: vertical-rl;
        letter-spacing: .08em;
        box-shadow: -4px 0 14px rgba(0,0,0,.24);
        transition: right .16s ease-out, background .12s ease-out;
      }
      #ivl-bili-toggle:hover { background: rgba(43,45,49,.98); }
      #ivl-bili-toggle.ivlb-opened { right: var(--ivl-bili-sidebar-width); }
      @media (max-width: 900px) {
        :root { --ivl-bili-sidebar-width: min(330px, 78vw); }
      }
    `;
    document.documentElement.appendChild(style);

    const buildUrl = (page, cid) => {
      const u = new URL('https://player.bilibili.com/player.html');
      if (bvid) u.searchParams.set('bvid', bvid); else u.searchParams.set('aid', aid);
      if (cid) u.searchParams.set('cid', String(cid));
      u.searchParams.set('page', String(page));
      u.searchParams.set('p', String(page));
      u.searchParams.set('autoplay', '1');
      u.searchParams.set('isOutside', 'true');
      return u.href;
    };

    const canonical = bvid
      ? `https://www.bilibili.com/video/${encodeURIComponent(bvid)}/?p=${currentPage}`
      : `https://www.bilibili.com/video/av${encodeURIComponent(aid)}/?p=${currentPage}`;

    const panel = document.createElement('aside');
    panel.id = 'ivl-bili-parts';
    panel.innerHTML = `
      <div class="ivlb-head">
        <strong>P一覧</strong>
        <a class="ivlb-open" target="_blank" rel="noopener noreferrer">通常ページ ↗</a>
        <button type="button" class="ivlb-close" title="P一覧を閉じる">×</button>
      </div>
      <div class="ivlb-list"><div class="ivlb-status">P一覧を取得中…</div></div>
    `;
    panel.querySelector('.ivlb-open').href = canonical;

    const toggle = document.createElement('button');
    toggle.id = 'ivl-bili-toggle';
    toggle.type = 'button';
    toggle.textContent = 'P一覧';
    toggle.title = 'P一覧を開く';

    document.body.append(panel, toggle);

    const setOpen = (open) => {
      panel.classList.toggle('ivlb-opened', open);
      toggle.classList.toggle('ivlb-opened', open);
      toggle.textContent = open ? '閉じる' : (toggle.dataset.count ? `P一覧 ${toggle.dataset.count}` : 'P一覧');
      toggle.title = open ? 'P一覧を閉じる' : 'P一覧を開く';
      if (open) panel.querySelector('.ivlb-row.ivlb-current')?.scrollIntoView({ block: 'nearest' });
    };

    toggle.addEventListener('click', () => setOpen(!panel.classList.contains('ivlb-opened')));
    panel.querySelector('.ivlb-close').addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && panel.classList.contains('ivlb-opened')) setOpen(false);
    });

    const apiParams = bvid ? `bvid=${encodeURIComponent(bvid)}` : `aid=${encodeURIComponent(aid)}`;
    gmJson(`https://api.bilibili.com/x/player/pagelist?${apiParams}`).then((payload) => {
      const list = panel.querySelector('.ivlb-list');
      list.textContent = '';
      const items = payload?.code === 0 && Array.isArray(payload?.data) ? payload.data : [];
      panel.querySelector('.ivlb-head strong').textContent = `P一覧 • ${items.length || 0}`;
      toggle.dataset.count = String(items.length || 0);
      toggle.textContent = items.length ? `P一覧 ${items.length}` : 'P一覧';
      if (!items.length) {
        const s = document.createElement('div');
        s.className = 'ivlb-status';
        s.textContent = '分P情報なし';
        list.appendChild(s);
        return;
      }
      for (const item of items) {
        const page = Number(item.page || 1);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'ivlb-row' + (page === currentPage ? ' ivlb-current' : '');
        const num = document.createElement('span');
        num.className = 'ivlb-num';
        num.textContent = String(page).padStart(2, '0');
        const title = document.createElement('span');
        title.className = 'ivlb-title';
        title.textContent = item.part || `P${page}`;
        title.title = item.part || `P${page}`;
        const duration = document.createElement('span');
        duration.className = 'ivlb-duration';
        duration.textContent = formatPartDurationShared(item.duration);
        row.append(num, title, duration);
        row.addEventListener('click', () => {
          setOpen(false);
          location.href = buildUrl(page, item.cid);
        });
        list.appendChild(row);
      }
    }).catch((err) => {
      const list = panel.querySelector('.ivlb-list');
      list.textContent = '';
      const s = document.createElement('div');
      s.className = 'ivlb-status';
      s.textContent = `P一覧取得失敗: ${err?.message || err}`;
      list.appendChild(s);
    });

    // 初期状態は閉じる。playerのサイズ/volume/video要素には触らない。
    setOpen(false);
  }

  if (location.hostname === 'player.bilibili.com' && location.pathname === '/player.html') {
    initBilibiliPlayerSidebar();
    return;
  }

  if (isRplayHost()) {
    initRplayLiveRecorder();
    return;
  }

  const PROCESSED = 'inlineVideoLiteProcessed';

  const css = `
    .ivl-play {
      margin-left: .35em;
      padding: 1px 7px;
      border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
      border-radius: 7px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: .85em;
      cursor: pointer;
      opacity: .78;
      vertical-align: baseline;
    }
    .ivl-play:hover { opacity: 1; background: rgba(127,127,127,.12); }
    .ivl-link { text-decoration: none; }
    .ivl-actions {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      vertical-align: baseline;
    }
    .ivl-actions .ivl-play { margin-left: .35em; }
    .ivl-actions .ivl-play + .ivl-play { margin-left: 2px; }
    .ivl-parts {
      position: fixed;
      z-index: 2147483646;
      top: 88px;
      right: 22px;
      display: block;
      width: min(430px, calc(100vw - 44px));
      max-height: min(72vh, 640px);
      overflow: auto;
      margin: 0;
      padding: 8px;
      border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
      border-radius: 12px;
      background: color-mix(in srgb, Canvas 97%, currentColor 3%);
      color: CanvasText;
      box-shadow: 0 12px 38px rgba(0,0,0,.24);
      font: 13px/1.35 system-ui, sans-serif;
    }
    .ivl-parts-head {
      position: sticky;
      top: -8px;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin: -8px -8px 6px;
      padding: 9px 11px;
      border-bottom: 1px solid color-mix(in srgb, currentColor 14%, transparent);
      background: color-mix(in srgb, Canvas 97%, currentColor 3%);
      border-radius: 12px 12px 0 0;
      font-weight: 650;
    }
    .ivl-parts-close {
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      opacity: .65;
    }
    .ivl-parts-close:hover { opacity: 1; }
    .ivl-part-row {
      display: grid;
      grid-template-columns: 2.6em minmax(0, 1fr) auto;
      align-items: start;
      gap: 9px;
      width: 100%;
      padding: 8px 9px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    .ivl-part-row:hover { background: rgba(127,127,127,.12); }
    .ivl-part-row.ivl-current { background: rgba(127,127,127,.17); font-weight: 600; }
    .ivl-part-num { opacity: .58; font-variant-numeric: tabular-nums; }
    .ivl-part-title {
      min-width: 0;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .ivl-part-duration { opacity: .62; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .ivl-parts-status { padding: 8px 9px; opacity: .7; }

    .ivl-player {
      position: relative;
      display: block;
      width: min(100%, 760px);
      aspect-ratio: 16 / 9;
      margin: 8px 0 12px;
      border-radius: 10px;
      overflow: hidden;
      background: #000;
    }
    .ivl-player.ivl-player-tiktok {
      width: min(100%, 360px);
      aspect-ratio: 9 / 16;
    }
    .ivl-player iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
    }
    .ivl-toolbar {
      position: absolute;
      z-index: 3;
      left: 8px;
      top: 8px;
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .ivl-open {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 0 9px;
      border-radius: 999px;
      background: rgba(0,0,0,.68);
      color: #fff;
      text-decoration: none;
      font: 12px/28px system-ui, sans-serif;
      white-space: nowrap;
    }
    .ivl-open:hover { background: rgba(0,0,0,.82); }
    .ivl-close {
      position: absolute;
      z-index: 2;
      top: 6px;
      right: 6px;
      width: 30px;
      height: 30px;
      border: 0;
      border-radius: 999px;
      background: rgba(0,0,0,.68);
      color: #fff;
      font: 20px/30px system-ui, sans-serif;
      text-align: center;
      cursor: pointer;
    }
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.documentElement.appendChild(style);

  function safeDecode(value) {
    try { return decodeURIComponent(value); }
    catch { return value; }
  }

  function possibleUrls(raw) {
    if (!raw) return [];

    const out = new Set();
    const queue = [String(raw).trim()];

    for (let depth = 0; depth < 4 && queue.length; depth++) {
      const value = queue.shift();
      if (!value || out.has(value)) continue;
      out.add(value);

      // URLが属性値やラベル内に埋まっている場合も拾う。
      const matches = value.match(/https?:\/\/[^\s"'<>]+/g);
      if (matches) {
        for (const match of matches) {
          if (!out.has(match)) queue.push(match);
        }
      }

      // %3A%2F%2F のようにURL全体がencodeされているケース。
      const decoded = safeDecode(value);
      if (decoded !== value && !out.has(decoded)) queue.push(decoded);

      let u;
      try { u = new URL(value, location.href); }
      catch { continue; }

      // ChatGPT / Google等のredirectラッパーから実URLを取り出す。
      for (const key of [
        'url', 'u', 'q', 'target', 'to', 'dest', 'destination',
        'redirect', 'redirect_url', 'redirect_uri', 'continue'
      ]) {
        const nested = u.searchParams.get(key);
        if (!nested) continue;
        const nestedDecoded = safeDecode(nested);
        if (/^https?:\/\//i.test(nestedDecoded) && !out.has(nestedDecoded)) {
          queue.push(nestedDecoded);
        }
      }
    }

    return [...out];
  }

  function parseDirectVideo(raw) {
    let url;
    try { url = new URL(raw, location.href); }
    catch { return null; }

    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    // YouTube
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      if (id) return {
        kind: 'embed',
        provider: 'YouTube',
        key: `youtube:${id}`,
        embed: `https://www.youtube.com/embed/${encodeURIComponent(id)}`
      };
    }

    if (/(^|\.)youtube\.com$/i.test(url.hostname) || /(^|\.)youtube-nocookie\.com$/i.test(url.hostname)) {
      let id = null;
      if (url.pathname === '/watch') id = url.searchParams.get('v');

      const m = url.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/);
      if (!id && m) id = m[1];

      if (id) return {
        kind: 'embed',
        provider: 'YouTube',
        key: `youtube:${id}`,
        embed: `https://www.youtube.com/embed/${encodeURIComponent(id)}`
      };
    }

    // TikTok: canonical post URL / official player URL -> official Embed Player.
    // vm.tiktok.com 等の短縮URL解決はこのprobeではまだ行わない。
    if (/(^|\.)tiktok\.com$/i.test(url.hostname)) {
      const postMatch = url.pathname.match(/^\/@[^/]+\/video\/(\d+)/i);
      const playerMatch = url.pathname.match(/^\/player\/v1\/(\d+)/i);
      const id = postMatch?.[1] || playerMatch?.[1] || null;

      if (id) {
        const player = new URL(`https://www.tiktok.com/player/v1/${encodeURIComponent(id)}`);
        player.searchParams.set('autoplay', '0');
        player.searchParams.set('controls', '1');
        player.searchParams.set('progress_bar', '1');
        player.searchParams.set('play_button', '1');
        player.searchParams.set('volume_control', '1');
        player.searchParams.set('fullscreen_button', '1');
        player.searchParams.set('timestamp', '1');
        player.searchParams.set('muted', '0');

        return {
          kind: 'embed',
          provider: 'TikTok',
          key: `tiktok:${id}`,
          embed: player.href,
          popup: player.href,
          page: postMatch ? url.href : null,
          popupWidth: 420,
          popupHeight: 760,
          inlineProbe: 'tiktok'
        };
      }
    }

    // Bilibili: 通常動画URLを公式external playerへ変換。
    // 元URLに ?p=N があればmulti-P動画の選択も引き継ぐ。
    if (/(^|\.)bilibili\.com$/i.test(url.hostname)) {
      let bvid = null;
      let aid = null;
      let page = null;

      const bvMatch = url.pathname.match(/^\/video\/(BV[0-9A-Za-z]+)/i);
      const avMatch = url.pathname.match(/^\/video\/av(\d+)/i);
      if (bvMatch) bvid = bvMatch[1];
      if (avMatch) aid = avMatch[1];

      // player.bilibili.com/player.html?bvid=... / ?aid=... も再利用できる。
      if (host === 'player.bilibili.com' && url.pathname === '/player.html') {
        bvid = url.searchParams.get('bvid') || bvid;
        aid = url.searchParams.get('aid') || aid;
      }

      const pRaw = url.searchParams.get('p') || url.searchParams.get('page');
      if (pRaw && /^\d+$/.test(pRaw) && Number(pRaw) >= 1) page = Number(pRaw);

      if (bvid || aid) {
        const params = new URLSearchParams();
        if (bvid) params.set('bvid', bvid);
        else params.set('aid', aid);
        if (page) params.set('p', String(page));
        params.set('autoplay', '0');
        params.set('isOutside', 'true');

        const idKey = bvid ? `bv:${bvid.toLowerCase()}` : `av:${aid}`;
        const canonical = new URL(
          bvid
            ? `https://www.bilibili.com/video/${encodeURIComponent(bvid)}/`
            : `https://www.bilibili.com/video/av${encodeURIComponent(aid)}/`
        );
        if (page) canonical.searchParams.set('p', String(page));

        return {
          kind: 'popup',
          provider: 'Bilibili',
          key: `bilibili:${idKey}:p${page || 1}`,
          popup: `https://player.bilibili.com/player.html?${params.toString()}`,
          page: canonical.href,
          popupWidth: 1280,
          popupHeight: 720,
          popupTitle: '公式external playerを小窓で再生',
          bvid: bvid || null,
          aid: aid || null,
          partPage: page || 1
        };
      }
    }

    // b23.tv/BV... のようにBV番号がpathに直接入る短縮形だけは通信なしで扱える。
    if (host === 'b23.tv') {
      const m = url.pathname.match(/^\/(BV[0-9A-Za-z]+)/i);
      if (m) {
        const bvid = m[1];
        return {
          kind: 'popup',
          provider: 'Bilibili',
          key: `bilibili:bv:${bvid.toLowerCase()}:p1`,
          popup: `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&autoplay=0&isOutside=true`,
          page: `https://www.bilibili.com/video/${encodeURIComponent(bvid)}/`,
          popupWidth: 1280,
          popupHeight: 720,
          popupTitle: '公式external playerを小窓で再生',
          bvid,
          aid: null,
          partPage: 1
        };
      }
    }

    // RPLAY current live. Discovery emits canonical /live/<creatorOid> URLs.
    if (host === 'rplay.live') {
      const liveMatch = url.pathname.match(/^\/live\/([0-9a-f]{24})(?:\/|$)/i);
      if (liveMatch) {
        const creatorOid = liveMatch[1].toLowerCase();
        const page = `https://rplay.live/live/${creatorOid}`;
        return {
          kind: 'rplay-live',
          provider: 'RPLAY',
          key: `rplay-live:${creatorOid}`,
          page,
          embed: page,
          popup: page,
          popupWidth: 1100,
          popupHeight: 780
        };
      }
    }

    // TwitCasting本体だけでなく ja. / mail2. 等のsubdomainも許可。
    if (/(^|\.)twitcasting\.tv$/i.test(url.hostname)) {
      const parts = url.pathname.split('/').filter(Boolean).map(safeDecode);

      // https://*.twitcasting.tv/<user>/movie/<movieId>
      if (parts.length >= 3 && parts[1] === 'movie' && /^\d+$/.test(parts[2])) {
        const user = parts[0];
        const movieId = parts[2];
        return {
          kind: 'popup',
          provider: 'ツイキャス',
          key: `twitcasting-movie:${user.toLowerCase()}:${movieId}`,
          page: `https://twitcasting.tv/${encodeURIComponent(user)}/movie/${movieId}`,
          popup:
            `https://twitcasting.tv/${encodeURIComponent(user)}/embeddedplayer/${movieId}` +
            `?auto_play=false&default_mute=false`
        };
      }

      // https://*.twitcasting.tv/<user>/archive?... は動画1本ではなく一覧。
      if (parts.length >= 2 && parts[1] === 'archive') {
        const user = parts[0];
        return {
          kind: 'external',
          provider: 'ツイキャス一覧',
          key: `twitcasting-archive:${user.toLowerCase()}`,
          url: url.href
        };
      }

      // https://*.twitcasting.tv/<user>
      if (parts.length === 1) {
        const user = parts[0];
        return {
          kind: 'popup',
          provider: 'ツイキャスLIVE',
          key: `twitcasting-live:${user.toLowerCase()}`,
          page: `https://twitcasting.tv/${encodeURIComponent(user)}`,
          popup:
            `https://twitcasting.tv/${encodeURIComponent(user)}/embeddedplayer/live` +
            `?auto_play=false&default_mute=false`
        };
      }
    }

    return null;
  }

  function parseVideo(raw) {
    for (const candidate of possibleUrls(raw)) {
      const video = parseDirectVideo(candidate);
      if (video) return video;
    }
    return null;
  }

  function getVideoFromElement(el) {
    const candidates = new Set();

    const add = value => {
      if (typeof value === 'string' && value.trim()) candidates.add(value.trim());
    };

    add(el.href);
    add(el.getAttribute?.('href'));
    add(el.getAttribute?.('data-href'));
    add(el.getAttribute?.('data-url'));
    add(el.getAttribute?.('data-source-url'));
    add(el.getAttribute?.('data-citation-url'));
    add(el.getAttribute?.('data-external-url'));
    add(el.getAttribute?.('aria-label'));
    add(el.getAttribute?.('title'));

    // ChatGPTのsource/citation UIは元URLをdata-*に持つ場合がある。
    if (el.dataset) {
      for (const value of Object.values(el.dataset)) add(value);
    }

    for (const candidate of candidates) {
      const video = parseVideo(candidate);
      if (video) return video;
    }

    return null;
  }

  const scopeRegistry = new WeakMap();

  function getMessageScope(el) {
    return el.closest?.('[data-message-author-role="assistant"], article') || document.body;
  }

  function getRegistry(scope) {
    let registry = scopeRegistry.get(scope);
    if (!registry) {
      registry = new Map();
      scopeRegistry.set(scope, registry);
    }
    return registry;
  }

  function citationLike(el) {
    const text = (el.innerText || el.textContent || '').trim();
    // ChatGPTのsource badgeは「YouTube\n+2\nFC2動画\n+2」のようになりやすい。
    return /(?:^|\n)\+\d+(?:\n|$)/.test(text);
  }

  function ownerRank(el, video) {
    let rank = 0;
    const href = el.href || el.getAttribute?.('href') || '';
    const direct = parseDirectVideo(href);
    if (direct?.key === video.key) rank += 100;
    if (!citationLike(el)) rank += 50;

    const text = (el.innerText || el.textContent || '').trim();
    if (text && text.length <= 120) rank += 10;
    if (video.kind === 'external' && /archive/i.test(href)) rank += 5;
    return rank;
  }

  function moveEntry(entry, el, rank) {
    entry.owner = el;
    entry.rank = rank;
    el.insertAdjacentElement('afterend', entry.button);
    if (entry.player?.isConnected) {
      entry.button.insertAdjacentElement('afterend', entry.player);
    }
  }

  function createEmbedEntry(el, video, rank) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ivl-play';
    btn.dataset.ivlKey = video.key;
    btn.textContent = `▶ ${video.provider}`;
    btn.title = video.autoExpand ? '公式external playerを再表示' : 'このページ内で再生';

    const entry = {
      owner: el,
      rank,
      button: btn,
      player: null,
      probeFallback: false
    };

    let probeTimer = null;
    let probeMessageHandler = null;
    let probeViolationHandler = null;

    const clearProbe = () => {
      if (probeTimer) {
        clearTimeout(probeTimer);
        probeTimer = null;
      }
      if (probeMessageHandler) {
        window.removeEventListener('message', probeMessageHandler);
        probeMessageHandler = null;
      }
      if (probeViolationHandler) {
        document.removeEventListener('securitypolicyviolation', probeViolationHandler);
        probeViolationHandler = null;
      }
    };

    const closePlayer = () => {
      clearProbe();
      if (!entry.player?.isConnected) return;
      entry.player.querySelector('iframe')?.setAttribute('src', 'about:blank');
      entry.player.remove();
      entry.player = null;
      btn.textContent = entry.probeFallback ? `▶ ${video.provider}小窓` : `▶ ${video.provider}`;
    };

    const switchProbeToPopup = (reason, persist = false) => {
      clearProbe();
      if (entry.player?.isConnected) {
        entry.player.querySelector('iframe')?.setAttribute('src', 'about:blank');
        entry.player.remove();
        entry.player = null;
      }
      entry.probeFallback = true;
      if (persist && video.inlineProbe === 'tiktok') {
        try { sessionStorage.setItem('ivl:tiktok-preview-mode', 'popup'); } catch (_) {}
      }
      btn.textContent = `▶ ${video.provider}小窓`;
      btn.title = reason || `${video.provider}公式playerを小窓で再生`;
    };

    const openPlayer = () => {
      if (entry.player?.isConnected) return;

      if (video.inlineProbe === 'tiktok') {
        try {
          if (sessionStorage.getItem('ivl:tiktok-preview-mode') === 'popup') {
            entry.probeFallback = true;
          }
        } catch (_) {}
        if (entry.probeFallback) {
          openTopLevelPopup(video, video.popup || video.embed);
          return;
        }
      }

      const player = document.createElement('span');
      player.className = 'ivl-player';
      if (video.inlineProbe === 'tiktok') player.classList.add('ivl-player-tiktok');

      const iframe = document.createElement('iframe');
      iframe.src = video.embed;
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      iframe.allowFullscreen = true;
      iframe.loading = video.autoExpand ? 'eager' : 'lazy';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';

      if (video.page) {
        const toolbar = document.createElement('span');
        toolbar.className = 'ivl-toolbar';
        const open = document.createElement('a');
        open.className = 'ivl-open';
        open.href = video.page;
        open.target = '_blank';
        open.rel = 'noopener noreferrer';
        open.textContent = `↗ ${video.provider}で開く`;
        open.title = '通常ページを新しいタブで開く';
        toolbar.appendChild(open);
        player.appendChild(toolbar);
      }

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'ivl-close';
      close.textContent = '×';
      close.title = '閉じる';
      close.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closePlayer();
      });

      player.appendChild(iframe);
      player.appendChild(close);
      entry.player = player;
      btn.insertAdjacentElement('afterend', player);
      btn.textContent = `▼ ${video.provider}`;

      if (video.inlineProbe === 'tiktok') {
        // TikTok公式Embed PlayerはonPlayerReadyをpostMessageする。
        // readyならinlineを採用。ChatGPTのframe-src CSP違反なら、そのタブではpopupへ固定する。
        probeMessageHandler = (event) => {
          if (event.origin !== 'https://www.tiktok.com') return;
          if (event.source !== iframe.contentWindow) return;
          const data = event.data;
          if (!data || data['x-tiktok-player'] !== true) return;

          if (data.type === 'onPlayerReady') {
            clearProbe();
            try { sessionStorage.setItem('ivl:tiktok-preview-mode', 'inline'); } catch (_) {}
            btn.title = 'TikTok公式Embed Player: inline ready';
          } else if (data.type === 'onPlayerError') {
            switchProbeToPopup('TikTok player error。次のクリックで公式player小窓を開く');
          }
        };
        window.addEventListener('message', probeMessageHandler);

        probeViolationHandler = (event) => {
          const blocked = String(event.blockedURI || '');
          const directive = String(event.effectiveDirective || event.violatedDirective || '');
          if (!/frame-src|child-src/i.test(directive)) return;
          if (!/https:\/\/(?:www\.)?tiktok\.com/i.test(blocked)) return;
          switchProbeToPopup('ChatGPT CSPでTikTok iframe不可。次のクリックで公式player小窓を開く', true);
        };
        document.addEventListener('securitypolicyviolation', probeViolationHandler);

        // readyもCSPイベントも来ない環境では誤判定を永続化せず、このentryだけpopupへ逃がす。
        probeTimer = setTimeout(() => {
          if (!entry.player?.isConnected) return;
          switchProbeToPopup('TikTok inline readyを確認できず。次のクリックで公式player小窓を開く');
        }, 6000);
      }
    };

    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (entry.player?.isConnected) closePlayer();
      else openPlayer();
    });

    el.insertAdjacentElement('afterend', btn);
    return entry;
  }

  function formatPartDuration(seconds) {
    return formatPartDurationShared(seconds);
  }

  function bilibiliPlayerUrl(video, page = 1, cid = null) {
    const u = new URL('https://player.bilibili.com/player.html');
    if (video.bvid) u.searchParams.set('bvid', video.bvid);
    else if (video.aid) u.searchParams.set('aid', video.aid);
    if (cid) u.searchParams.set('cid', String(cid));
    u.searchParams.set('page', String(page));
    u.searchParams.set('p', String(page));
    u.searchParams.set('autoplay', '0');
    u.searchParams.set('isOutside', 'true');
    return u.href;
  }

  function openTopLevelPopup(video, targetUrl = video.popup) {
    const width = video.popupWidth || 760;
    const height = video.popupHeight || 460;
    const left = Math.max(0, Math.round((screen.availWidth - width) / 2));
    const top = Math.max(0, Math.round((screen.availHeight - height) / 2));
    const name = `ivl_${video.key.replace(/[^a-z0-9_-]/gi, '_')}`;
    const popup = window.open(
      targetUrl,
      name,
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no`
    );
    if (popup) {
      try { popup.focus(); } catch (_) {}
      return true;
    }
    window.open(video.page, '_blank', 'noopener,noreferrer');
    return false;
  }

  function requestBilibiliParts(video) {
    return new Promise((resolve, reject) => {
      const params = video.bvid
        ? `bvid=${encodeURIComponent(video.bvid)}`
        : `aid=${encodeURIComponent(video.aid || '')}`;
      GM_xmlhttpRequest({
        method: 'GET',
        url: `https://api.bilibili.com/x/player/pagelist?${params}`,
        timeout: 12000,
        headers: { Accept: 'application/json' },
        onload: (res) => {
          try {
            const payload = JSON.parse(res.responseText || '{}');
            if (payload?.code !== 0 || !Array.isArray(payload?.data)) {
              throw new Error(payload?.message || `API code ${payload?.code}`);
            }
            resolve(payload.data);
          } catch (err) { reject(err); }
        },
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout'))
      });
    });
  }

  function createBilibiliEntry(el, video, rank) {
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'ivl-play';
    play.dataset.ivlKey = video.key;
    play.textContent = '▶ Bilibili';
    play.title = '公式external playerを小窓で再生（P一覧は小窓右端から展開）';

    play.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openTopLevelPopup(video, bilibiliPlayerUrl(video, video.partPage || 1));
    });

    el.insertAdjacentElement('afterend', play);
    return { owner: el, rank, button: play, player: null };
  }

  function createRplayLiveEntry(el, video, rank) {
    const actions = document.createElement('span');
    actions.className = 'ivl-actions';
    actions.dataset.ivlKey = video.key;

    const inline = document.createElement('button');
    inline.type = 'button';
    inline.className = 'ivl-play';
    inline.textContent = '▶ RPLAY';
    inline.title = 'RPLAY liveをこのページ内で試す';

    const popup = document.createElement('button');
    popup.type = 'button';
    popup.className = 'ivl-play';
    popup.textContent = '↗ 小窓';
    popup.title = 'RPLAY liveをログイン状態のトップレベル小窓で開く';

    const entry = { owner: el, rank, button: actions, player: null };

    const closePlayer = () => {
      if (!entry.player?.isConnected) return;
      entry.player.querySelector('iframe')?.setAttribute('src', 'about:blank');
      entry.player.remove();
      entry.player = null;
      inline.textContent = '▶ RPLAY';
    };

    inline.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (entry.player?.isConnected) {
        closePlayer();
        return;
      }

      const player = document.createElement('span');
      player.className = 'ivl-player';

      const toolbar = document.createElement('span');
      toolbar.className = 'ivl-toolbar';
      const open = document.createElement('a');
      open.className = 'ivl-open';
      open.href = video.page;
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      open.textContent = '↗ RPLAYで開く';
      toolbar.appendChild(open);

      const iframe = document.createElement('iframe');
      iframe.src = video.embed;
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'ivl-close';
      close.textContent = '×';
      close.title = '閉じる';
      close.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closePlayer();
      });

      player.append(toolbar, iframe, close);
      entry.player = player;
      actions.insertAdjacentElement('afterend', player);
      inline.textContent = '▼ RPLAY';
    });

    popup.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openTopLevelPopup(video);
    });

    actions.append(inline, popup);
    el.insertAdjacentElement('afterend', actions);
    return entry;
  }

  function createPopupEntry(el, video, rank) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ivl-play';
    btn.dataset.ivlKey = video.key;
    btn.textContent = `▶ ${video.provider}`;
    btn.title = video.popupTitle || `${video.provider}を小窓で再生`;

    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      // cross-site iframeでは認証/CSPで失敗する場合があるためトップレベル小窓を使う。
      openTopLevelPopup(video);
    });

    el.insertAdjacentElement('afterend', btn);
    return {
      owner: el,
      rank,
      button: btn,
      player: null
    };
  }

  function createExternalEntry(el, video, rank) {
    const btn = document.createElement('a');
    btn.className = 'ivl-play ivl-link';
    btn.dataset.ivlKey = video.key;
    btn.href = video.url;
    btn.target = '_blank';
    btn.rel = 'noopener noreferrer';
    btn.textContent = `↗ ${video.provider}`;
    btn.title = 'アーカイブ一覧を開く';

    el.insertAdjacentElement('afterend', btn);
    return {
      owner: el,
      rank,
      button: btn,
      player: null
    };
  }

  function addPlayerButton(el) {
    if (!(el instanceof Element)) return;
    if (el.classList?.contains('ivl-play')) return;

    const video = getVideoFromElement(el);
    if (!video) return; // href=null等は推測せず触らない。
    if (el.dataset?.[PROCESSED] === video.key) return;

    // hrefが後から別動画へ変わるReact再利用にも追従できるようkeyを記録。
    if (el.dataset) el.dataset[PROCESSED] = video.key;

    const scope = getMessageScope(el);
    const registry = getRegistry(scope);
    const rank = ownerRank(el, video);
    const existing = registry.get(video.key);

    // 同一メッセージ内の同一動画/一覧は1 UIだけ。
    // citation badgeより本文の直接リンクを優先する。
    if (existing) {
      if (!existing.button.isConnected || rank > existing.rank) {
        moveEntry(existing, el, rank);
      }
      return;
    }

    const entry = video.kind === 'rplay-live'
      ? createRplayLiveEntry(el, video, rank)
      : video.provider === 'Bilibili' && video.kind === 'popup'
        ? createBilibiliEntry(el, video, rank)
        : video.kind === 'external'
          ? createExternalEntry(el, video, rank)
          : video.kind === 'popup'
            ? createPopupEntry(el, video, rank)
            : createEmbedEntry(el, video, rank);

    registry.set(video.key, entry);
  }

  const LINK_SELECTOR = [
    'a[href]',
    '[role="link"]',
    '[data-href]',
    '[data-url]',
    '[data-source-url]',
    '[data-citation-url]',
    '[data-external-url]'
  ].join(',');

  function scan(root) {
    if (root instanceof Element && root.matches?.(LINK_SELECTOR)) {
      addPlayerButton(root);
    }
    if (root instanceof Element || root instanceof Document) {
      root.querySelectorAll?.(LINK_SELECTOR).forEach(addPlayerButton);
    }
  }

  // ChatGPTは要素を先に作り、href/data-*を後から確定することがある。
  // addedNodesだけを監視するとそこを落とすので、関連属性の更新も監視する。
  let fullScanTimer = 0;
  function scheduleFullScan(delay = 80) {
    clearTimeout(fullScanTimer);
    fullScanTimer = setTimeout(() => scan(document), delay);
  }

  scan(document);

  // 初期描画・ストリーミング・citation解決の時間差を軽い再走査で吸収。
  for (const delay of [250, 900, 1800, 3500, 6000]) {
    setTimeout(() => scan(document), delay);
  }

  const observer = new MutationObserver((mutations) => {
    let needsFullScan = false;

    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        if (mutation.target instanceof Element) addPlayerButton(mutation.target);
        continue;
      }

      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          scan(node);
          needsFullScan = true;
        }
      }
    }

    // React側でsource UIを組み替えるケース用。毎mutationで全走査せずdebounceする。
    if (needsFullScan) scheduleFullScan();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      'href',
      'data-href',
      'data-url',
      'data-source-url',
      'data-citation-url',
      'data-external-url',
      'aria-label',
      'title'
    ]
  });

  // ChatGPTのSPA遷移ではdocument自体は再生成されないため、URL変化時にも再走査。
  let lastLocation = location.href;
  setInterval(() => {
    if (location.href === lastLocation) return;
    lastLocation = location.href;
    scheduleFullScan(120);
  }, 800);
})();
