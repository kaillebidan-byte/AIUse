// ==UserScript==
// @name         AIUse RPLAY Live Recorder
// @namespace    https://github.com/kaillebidan-byte/AIUse
// @version      0.1.0
// @description  Add RPLAY live popup/inline controls in ChatGPT and one-click ffmpeg handoff on rplay.live.
// @match        https://rplay.live/*
// @match        https://www.rplay.live/*
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const RECORD_SCHEME = 'aiuse-rplay-record://start';
  const CLIPBOARD_PREFIX = 'AIUSE_RPLAY_RECORD_V1\n';
  const RPLAY_LIVE_RE = /^https:\/\/(?:www\.)?rplay\.live\/live\/[0-9a-f]{24}(?:[/?#]|$)/i;
  const MEDIA_EXT_RE = /\.(?:flv|m3u8|mp4)(?:$|[?#])/i;

  function isRplayPage() {
    return /(^|\.)rplay\.live$/i.test(location.hostname);
  }

  function scoreMediaUrl(raw) {
    if (!raw || typeof raw !== 'string' || raw.startsWith('blob:')) return -1;
    let url;
    try { url = new URL(raw, location.href); } catch { return -1; }
    if (url.protocol !== 'https:') return -1;

    const host = url.hostname.toLowerCase();
    const pathq = url.pathname + url.search;
    let score = 0;
    if (host === 'livestream.rplay.live') score += 100;
    if (host === 'api.rplay.live') score += 10;
    if (MEDIA_EXT_RE.test(pathq)) score += 50;
    if (/\.flv(?:$|[?#])/i.test(pathq)) score += 40;
    if (/\.m3u8(?:$|[?#])/i.test(pathq)) score += 30;
    if (/\/live\/stream\//i.test(url.pathname)) score += 25;
    return score;
  }

  function collectMediaUrls() {
    const out = [];
    const seen = new Set();
    const push = value => {
      if (!value || typeof value !== 'string' || seen.has(value)) return;
      seen.add(value);
      out.push(value);
    };

    for (const el of document.querySelectorAll('video,audio,source')) {
      push(el.currentSrc);
      push(el.src);
      push(el.getAttribute('src'));
    }
    for (const entry of performance.getEntriesByType('resource')) push(entry.name);
    return out;
  }

  function bestMediaUrl() {
    let best = null;
    let bestScore = 0;
    for (const url of collectMediaUrls()) {
      const score = scoreMediaUrl(url);
      if (score > bestScore) {
        bestScore = score;
        best = url;
      }
    }
    return best;
  }

  function triggerRecorder(mediaUrl) {
    const envelope = {
      media_url: mediaUrl,
      page_url: location.href,
      title: document.title || 'RPLAY live',
      detected_at: new Date().toISOString(),
    };
    GM_setClipboard(CLIPBOARD_PREFIX + JSON.stringify(envelope), 'text');
    window.location.href = RECORD_SCHEME;
  }

  function installRplayRecorderButton() {
    const id = 'aiuse-rplay-recorder-button';
    if (document.getElementById(id)) return;

    const button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.textContent = '録画準備中…';
    button.disabled = true;
    Object.assign(button.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      padding: '9px 13px',
      borderRadius: '10px',
      border: '1px solid rgba(255,255,255,.25)',
      background: 'rgba(18,18,18,.92)',
      color: '#fff',
      fontSize: '13px',
      fontWeight: '600',
      cursor: 'pointer',
      boxShadow: '0 4px 18px rgba(0,0,0,.28)',
    });

    let currentUrl = null;
    const refresh = () => {
      currentUrl = bestMediaUrl();
      if (currentUrl) {
        button.disabled = false;
        button.textContent = '● RPLAY録画';
        button.style.opacity = '1';
      } else {
        button.disabled = true;
        button.textContent = '録画準備中…';
        button.style.opacity = '.58';
      }
    };

    button.addEventListener('click', () => {
      refresh();
      if (!currentUrl) return;
      button.textContent = 'PowerShell起動…';
      triggerRecorder(currentUrl);
      setTimeout(refresh, 1800);
    });

    document.documentElement.appendChild(button);
    refresh();
    setInterval(refresh, 1000);
  }

  function buttonStyle(button) {
    Object.assign(button.style, {
      marginLeft: '6px',
      padding: '2px 7px',
      border: '1px solid currentColor',
      borderRadius: '7px',
      fontSize: '11px',
      lineHeight: '18px',
      opacity: '.78',
      cursor: 'pointer',
      background: 'transparent',
      color: 'inherit',
      verticalAlign: 'middle',
    });
  }

  function addChatGptControls(anchor) {
    if (anchor.dataset.aiuseRplayControls === '1') return;
    const href = anchor.href;
    if (!RPLAY_LIVE_RE.test(href)) return;
    anchor.dataset.aiuseRplayControls = '1';

    const popup = document.createElement('button');
    popup.type = 'button';
    popup.textContent = '別窓';
    popup.title = 'RPLAY liveを別ウィンドウで開く';
    buttonStyle(popup);
    popup.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      window.open(href, 'aiuse-rplay-live', 'popup=yes,width=1100,height=780,resizable=yes,scrollbars=yes');
    });

    const inline = document.createElement('button');
    inline.type = 'button';
    inline.textContent = 'インライン';
    inline.title = 'RPLAY liveをインラインiframeで試す。埋め込み拒否時は別窓を使う。';
    buttonStyle(inline);
    inline.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const marker = anchor.parentElement?.querySelector(':scope > .aiuse-rplay-inline-frame');
      if (marker) {
        marker.remove();
        return;
      }

      const frame = document.createElement('iframe');
      frame.className = 'aiuse-rplay-inline-frame';
      frame.src = href;
      frame.allow = 'autoplay; fullscreen; picture-in-picture';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      Object.assign(frame.style, {
        display: 'block',
        width: 'min(720px, 100%)',
        aspectRatio: '16 / 9',
        marginTop: '8px',
        border: '1px solid rgba(127,127,127,.35)',
        borderRadius: '10px',
        background: '#111',
      });
      anchor.parentElement?.appendChild(frame);
    });

    anchor.insertAdjacentElement('afterend', inline);
    anchor.insertAdjacentElement('afterend', popup);
  }

  function scanChatGptLinks(root = document) {
    const anchors = root.querySelectorAll?.('a[href*="rplay.live/live/"]') || [];
    for (const anchor of anchors) addChatGptControls(anchor);
  }

  function installChatGptLinkObserver() {
    scanChatGptLinks();
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches?.('a[href*="rplay.live/live/"]')) addChatGptControls(node);
          scanChatGptLinks(node);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (isRplayPage()) installRplayRecorderButton();
  else installChatGptLinkObserver();
})();
