// ==UserScript==
// @name         AIUse ChatGPT Inline X Media
// @namespace    https://github.com/kaillebidan-byte/AIUse
// @version      0.1.0
// @description  Render AIUse X media markers inside ChatGPT without sending image pixels to the model; attach selected images to the composer on demand.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @downloadURL  https://raw.githubusercontent.com/kaillebidan-byte/AIUse/main/tools/chatgpt-inline-x-media/chatgpt-inline-x-media.user.js
// @updateURL    https://raw.githubusercontent.com/kaillebidan-byte/AIUse/main/tools/chatgpt-inline-x-media/chatgpt-inline-x-media.user.js
// @grant        GM_xmlhttpRequest
// @connect      pbs.twimg.com
// @connect      video.twimg.com
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const PREFIX = 'AIUSE_X_MEDIA_V1:';
  const PROCESSED = 'data-aiuse-x-media-processed';
  const HIDDEN_PREFIX = 'aiuse-x-media-hidden:';
  const STYLE_ID = 'aiuse-x-media-style';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .aiuse-x-media-gallery{margin:12px 0;padding:10px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:14px;background:color-mix(in srgb,currentColor 4%,transparent)}
      .aiuse-x-media-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:12px;opacity:.8}
      .aiuse-x-media-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
      .aiuse-x-media-card{overflow:hidden;border:1px solid color-mix(in srgb,currentColor 15%,transparent);border-radius:12px;background:color-mix(in srgb,currentColor 3%,transparent)}
      .aiuse-x-media-card img{display:block;width:100%;max-height:520px;object-fit:contain;background:#111;cursor:zoom-in}
      .aiuse-x-media-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:8px}
      .aiuse-x-media-actions button,.aiuse-x-media-actions a{font:inherit;font-size:12px;line-height:1.2;padding:6px 9px;border-radius:8px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);background:transparent;color:inherit;text-decoration:none;cursor:pointer}
      .aiuse-x-media-actions button:hover,.aiuse-x-media-actions a:hover{background:color-mix(in srgb,currentColor 8%,transparent)}
      .aiuse-x-media-status{font-size:11px;opacity:.7;min-height:1.2em}
      .aiuse-x-media-badge{font-size:11px;padding:2px 6px;border-radius:999px;border:1px solid color-mix(in srgb,currentColor 20%,transparent)}
      .aiuse-x-media-hidden{display:none!important}
    `;
    document.head.appendChild(style);
  }

  function decodeBase64Url(token) {
    const normalized = token.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function parsePayload(token) {
    const payload = JSON.parse(decodeBase64Url(token));
    if (!payload || payload.v !== 1 || !Array.isArray(payload.media)) throw new Error('unsupported AIUse X media payload');
    return payload;
  }

  function sanitizeUrl(raw) {
    const u = new URL(raw, location.href);
    if (u.protocol !== 'https:') throw new Error('https media URL required');
    return u.href;
  }

  function hiddenKey(url) { return HIDDEN_PREFIX + url; }
  function isHidden(url) { try { return sessionStorage.getItem(hiddenKey(url)) === '1'; } catch { return false; } }
  function setHidden(url, hidden) {
    try { hidden ? sessionStorage.setItem(hiddenKey(url), '1') : sessionStorage.removeItem(hiddenKey(url)); } catch {}
  }

  function filenameFor(url, index, mime='') {
    try {
      const u = new URL(url);
      let name = u.pathname.split('/').pop() || `x-media-${index + 1}`;
      name = name.replace(/[^a-zA-Z0-9._-]+/g, '_');
      if (!/\.[a-z0-9]{2,5}$/i.test(name)) {
        const ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : mime.includes('gif') ? '.gif' : '.jpg';
        name += ext;
      }
      return name;
    } catch { return `x-media-${index + 1}.jpg`; }
  }

  function gmFetchBlob(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET', url, responseType: 'blob', timeout: 30000,
        onload: res => res.status >= 200 && res.status < 300 && res.response ? resolve(res.response) : reject(new Error(`media fetch HTTP ${res.status}`)),
        onerror: () => reject(new Error('media fetch failed')),
        ontimeout: () => reject(new Error('media fetch timed out')),
      });
    });
  }

  function likelyChatGPTFileInput() {
    const inputs = [...document.querySelectorAll('input[type="file"]')];
    return inputs.find(el => /image|video|\*/i.test(el.accept || '') || el.multiple) || inputs[0] || null;
  }

  function composerTarget() {
    return document.querySelector('#prompt-textarea') || document.querySelector('form [contenteditable="true"]') || document.querySelector('main [contenteditable="true"]');
  }

  function makeTransfer(file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt;
  }

  async function attachFileToComposer(file) {
    const input = likelyChatGPTFileInput();
    if (input) {
      try {
        const dt = makeTransfer(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return 'file-input';
      } catch (err) { console.debug('[AIUse X media] file input attach failed', err); }
    }

    const target = composerTarget();
    if (target) {
      try {
        const dt = makeTransfer(file);
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        return 'drop';
      } catch (err) { console.debug('[AIUse X media] drop attach failed', err); }
      try {
        const dt = makeTransfer(file);
        target.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
        return 'paste';
      } catch (err) { console.debug('[AIUse X media] paste attach failed', err); }
    }
    throw new Error('ChatGPT composer upload target not found');
  }

  async function attachMedia(media, index, button, status) {
    const url = sanitizeUrl(media.url || media.thumbnail_url);
    button.disabled = true;
    status.textContent = '取得中…';
    try {
      const blob = await gmFetchBlob(url);
      if (!blob.type.startsWith('image/')) throw new Error(`image expected, got ${blob.type || 'unknown MIME'}`);
      const file = new File([blob], filenameFor(url, index, blob.type), { type: blob.type, lastModified: Date.now() });
      const via = await attachFileToComposer(file);
      status.textContent = `composerへ添付済み (${via})。送信はしていません。`;
      button.textContent = '添付済み';
    } catch (err) {
      console.error('[AIUse X media] attach failed', err);
      status.textContent = `添付失敗: ${err.message || err}`;
      button.disabled = false;
    }
  }

  function buildGallery(payload) {
    const wrap = document.createElement('section');
    wrap.className = 'aiuse-x-media-gallery';
    const head = document.createElement('div');
    head.className = 'aiuse-x-media-head';
    const who = payload.author?.screen_name ? `@${payload.author.screen_name}` : (payload.author?.name || 'X post');
    const title = document.createElement('span');
    title.textContent = `${who} · ${payload.media.length} media`;
    head.appendChild(title);
    if (payload.possibly_sensitive) {
      const badge = document.createElement('span');
      badge.className = 'aiuse-x-media-badge';
      badge.textContent = 'X sensitive';
      head.appendChild(badge);
    }
    if (payload.post_url) {
      const postLink = document.createElement('a');
      postLink.href = payload.post_url;
      postLink.target = '_blank';
      postLink.rel = 'noreferrer';
      postLink.textContent = '元post';
      postLink.style.marginLeft = 'auto';
      head.appendChild(postLink);
    }
    wrap.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'aiuse-x-media-grid';
    payload.media.forEach((media, index) => {
      const url = sanitizeUrl(media.url || media.thumbnail_url);
      const card = document.createElement('div');
      card.className = 'aiuse-x-media-card';
      if (isHidden(url)) card.classList.add('aiuse-x-media-hidden');
      const img = document.createElement('img');
      img.src = url;
      img.alt = media.alt_text || `${who} media ${index + 1}`;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
      img.addEventListener('error', async () => {
        if (img.dataset.aiuseFallback) return;
        img.dataset.aiuseFallback = '1';
        try { const blob = await gmFetchBlob(url); img.src = URL.createObjectURL(blob); }
        catch (err) { console.debug('[AIUse X media] image fallback failed', err); }
      });
      card.appendChild(img);

      const actions = document.createElement('div');
      actions.className = 'aiuse-x-media-actions';
      const send = document.createElement('button');
      send.type = 'button'; send.textContent = 'AIへ渡す';
      const hide = document.createElement('button');
      hide.type = 'button'; hide.textContent = '隠す';
      const open = document.createElement('a');
      open.href = url; open.target = '_blank'; open.rel = 'noreferrer'; open.textContent = '原寸';
      const status = document.createElement('span');
      status.className = 'aiuse-x-media-status';
      send.addEventListener('click', () => attachMedia(media, index, send, status));
      hide.addEventListener('click', () => { setHidden(url, true); card.classList.add('aiuse-x-media-hidden'); });
      actions.append(send, hide, open, status);
      card.appendChild(actions);
      grid.appendChild(card);
    });
    wrap.appendChild(grid);
    return wrap;
  }

  function markerHostFor(textNode) {
    const el = textNode.parentElement;
    return el ? (el.closest('pre, p, li, div') || el) : null;
  }

  function consumeMarkers(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) if (walker.currentNode.nodeValue?.includes(PREFIX)) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const text = node.nodeValue;
      const regex = /AIUSE_X_MEDIA_V1:([A-Za-z0-9_-]+)/g;
      const matches = [...text.matchAll(regex)];
      const host = markerHostFor(node);
      if (!matches.length || !host) continue;
      for (const match of matches) {
        const token = match[1];
        const key = `${PREFIX}${token.slice(0, 24)}`;
        if (document.querySelector(`[data-aiuse-marker-key="${CSS.escape(key)}"]`)) continue;
        try {
          const gallery = buildGallery(parsePayload(token));
          gallery.dataset.aiuseMarkerKey = key;
          host.insertAdjacentElement('afterend', gallery);
        } catch (err) { console.error('[AIUse X media] marker parse failed', err); }
      }
      node.nodeValue = text.replace(regex, '').trim();
      if (!host.textContent.trim() && !host.querySelector('img,video,a,button')) host.style.display = 'none';
    }
  }

  function scan() {
    ensureStyle();
    const candidates = document.querySelectorAll('[data-message-author-role="assistant"], main article');
    for (const el of candidates) {
      if (el.getAttribute(PROCESSED) === '1' && !el.textContent.includes(PREFIX)) continue;
      consumeMarkers(el);
      el.setAttribute(PROCESSED, '1');
    }
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; scan(); });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  scan();
})();
