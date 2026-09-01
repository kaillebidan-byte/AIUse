// ==UserScript==
// @name         AIUse ChatGPT Inline X Media
// @namespace    https://github.com/kaillebidan-byte/AIUse
// @version      0.3.0
// @description  Render AIUse X image/video presentation markers; access, model inspection, and presentation are separate concerns.
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
  const INVISIBLE_RE = /[\u200B-\u200D\u2060\uFEFF]/g;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .aiuse-x-media-gallery{margin:12px 0;padding:10px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:14px;background:color-mix(in srgb,currentColor 4%,transparent)}
      .aiuse-x-media-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:12px;opacity:.82}
      .aiuse-x-media-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
      .aiuse-x-media-card{overflow:hidden;border:1px solid color-mix(in srgb,currentColor 15%,transparent);border-radius:12px;background:color-mix(in srgb,currentColor 3%,transparent)}
      .aiuse-x-media-card img,.aiuse-x-media-card video{display:block;width:100%;max-height:520px;object-fit:contain;background:#111}
      .aiuse-x-media-card img{cursor:zoom-in}
      .aiuse-x-media-meta{padding:7px 8px 0;font-size:11px;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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
    if (!payload || ![1, 2].includes(payload.v) || !Array.isArray(payload.media)) {
      throw new Error('unsupported AIUse X media payload');
    }
    return payload;
  }

  function policyFor(payload) {
    if (payload.v >= 2) {
      return {
        access: payload.access || 'unknown',
        inspection: payload.inspection || 'user_only',
        presentation: payload.presentation || 'preview',
      };
    }
    if (payload.delivery === 'public_inline') {
      return { access: 'public', inspection: 'assistant', presentation: 'inline' };
    }
    return { access: 'unknown', inspection: 'user_only', presentation: 'preview' };
  }

  function sanitizeUrl(raw) {
    const u = new URL(raw, location.href);
    if (u.protocol !== 'https:') throw new Error('https media URL required');
    return u.href;
  }

  function hiddenKey(url) { return HIDDEN_PREFIX + url; }
  function isHidden(url) {
    try { return sessionStorage.getItem(hiddenKey(url)) === '1'; } catch { return false; }
  }
  function setHidden(url, hidden) {
    try {
      if (hidden) sessionStorage.setItem(hiddenKey(url), '1');
      else sessionStorage.removeItem(hiddenKey(url));
    } catch {}
  }

  function mediaType(media, url) {
    const typ = String(media?.type || '').toLowerCase();
    if (['video', 'gif', 'animated_gif'].includes(typ) || typ.startsWith('video')) return 'video';
    if (/\.(?:mp4|webm)(?:$|[?#])/i.test(url) || /\/tweet_video\//i.test(url)) return 'video';
    return 'image';
  }

  function filenameFor(url, index, mime = '') {
    try {
      const u = new URL(url);
      let name = u.pathname.split('/').pop() || `x-media-${index + 1}`;
      name = name.replace(/[^a-zA-Z0-9._-]+/g, '_');
      if (!/\.[a-z0-9]{2,5}$/i.test(name)) {
        const ext = mime.includes('video/mp4') ? '.mp4'
          : mime.includes('video/webm') ? '.webm'
          : mime.includes('png') ? '.png'
          : mime.includes('webp') ? '.webp'
          : mime.includes('gif') ? '.gif'
          : '.jpg';
        name += ext;
      }
      return name;
    } catch {
      return `x-media-${index + 1}`;
    }
  }

  function gmFetchBlob(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET', url, responseType: 'blob', timeout: 45000,
        onload: res => {
          if (res.status >= 200 && res.status < 300 && res.response) resolve(res.response);
          else reject(new Error(`media fetch HTTP ${res.status}`));
        },
        onerror: () => reject(new Error('media fetch failed')),
        ontimeout: () => reject(new Error('media fetch timed out')),
      });
    });
  }

  function likelyChatGPTFileInput() {
    const inputs = [...document.querySelectorAll('input[type="file"]')];
    if (!inputs.length) return null;
    return inputs.find(el => /image|video|\*/i.test(el.accept || '') || el.multiple) || inputs[0];
  }

  function composerTarget() {
    return document.querySelector('#prompt-textarea')
      || document.querySelector('form [contenteditable="true"]')
      || document.querySelector('main [contenteditable="true"]');
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
      } catch (err) {
        console.debug('[AIUse X media] file input attach failed', err);
      }
    }
    const target = composerTarget();
    if (target) {
      try {
        const dt = makeTransfer(file);
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        return 'drop';
      } catch (err) {
        console.debug('[AIUse X media] drop attach failed', err);
      }
      try {
        const dt = makeTransfer(file);
        target.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
        return 'paste';
      } catch (err) {
        console.debug('[AIUse X media] paste attach failed', err);
      }
    }
    throw new Error('ChatGPT composer upload target not found');
  }

  async function attachMedia(media, index, button, status) {
    const url = sanitizeUrl(media.url || media.thumbnail_url);
    const kind = mediaType(media, url);
    button.disabled = true;
    status.textContent = '取得中…';
    try {
      let blob = await gmFetchBlob(url);
      if (!blob.type.startsWith('image/') && !blob.type.startsWith('video/')) {
        if (kind === 'video' && /\.mp4(?:$|[?#])/i.test(url)) blob = blob.slice(0, blob.size, 'video/mp4');
        else throw new Error(`unsupported MIME: ${blob.type || 'unknown'}`);
      }
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

  function imageElement(media, url, who, index) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = media.alt_text || `${who} media ${index + 1}`;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
    img.addEventListener('error', async () => {
      if (img.dataset.aiuseFallback) return;
      img.dataset.aiuseFallback = '1';
      try { img.src = URL.createObjectURL(await gmFetchBlob(url)); }
      catch (err) { console.debug('[AIUse X media] image fallback failed', err); }
    });
    return img;
  }

  function videoElement(media, url) {
    const video = document.createElement('video');
    video.src = url;
    video.controls = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.referrerPolicy = 'no-referrer';
    if (media.thumbnail_url) video.poster = sanitizeUrl(media.thumbnail_url);
    video.addEventListener('error', async () => {
      if (video.dataset.aiuseFallback) return;
      video.dataset.aiuseFallback = '1';
      try {
        video.src = URL.createObjectURL(await gmFetchBlob(url));
        video.load();
      } catch (err) {
        console.debug('[AIUse X media] video fallback failed', err);
      }
    });
    return video;
  }

  function mediaWho(media, fallback) {
    const author = media?.author;
    if (author?.screen_name) return `@${author.screen_name}`;
    if (author?.name) return author.name;
    return fallback;
  }

  function buildGallery(payload) {
    const policy = policyFor(payload);
    const wrap = document.createElement('section');
    wrap.className = 'aiuse-x-media-gallery';

    const head = document.createElement('div');
    head.className = 'aiuse-x-media-head';
    const who = payload.author?.screen_name ? `@${payload.author.screen_name}` : (payload.author?.name || 'X media');
    const title = document.createElement('span');
    title.textContent = `${who} · ${payload.media.length} media · v0.3.0`;
    head.appendChild(title);

    if (payload.possibly_sensitive) {
      const badge = document.createElement('span');
      badge.className = 'aiuse-x-media-badge';
      badge.textContent = 'X sensitive';
      head.appendChild(badge);
    }
    if (policy.access === 'firefox_auth') {
      const badge = document.createElement('span');
      badge.className = 'aiuse-x-media-badge';
      badge.textContent = 'Firefox auth';
      head.appendChild(badge);
    }
    if (policy.inspection === 'user_only') {
      const badge = document.createElement('span');
      badge.className = 'aiuse-x-media-badge';
      badge.textContent = 'user-only preview';
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
    const canPromote = policy.inspection === 'user_only';

    payload.media.forEach((media, index) => {
      const url = sanitizeUrl(media.url || media.thumbnail_url);
      const kind = mediaType(media, url);
      const card = document.createElement('div');
      card.className = 'aiuse-x-media-card';
      if (isHidden(url)) card.classList.add('aiuse-x-media-hidden');
      card.appendChild(kind === 'video' ? videoElement(media, url) : imageElement(media, url, who, index));

      const cardWho = mediaWho(media, who);
      if (cardWho !== who || media.text) {
        const meta = document.createElement('div');
        meta.className = 'aiuse-x-media-meta';
        meta.textContent = media.text ? `${cardWho} · ${media.text}` : cardWho;
        card.appendChild(meta);
      }

      const actions = document.createElement('div');
      actions.className = 'aiuse-x-media-actions';
      const status = document.createElement('span');
      status.className = 'aiuse-x-media-status';

      if (canPromote) {
        const send = document.createElement('button');
        send.type = 'button';
        send.textContent = 'AIへ渡す';
        send.addEventListener('click', () => attachMedia(media, index, send, status));
        actions.appendChild(send);
      }

      const hide = document.createElement('button');
      hide.type = 'button';
      hide.textContent = '隠す';
      hide.addEventListener('click', () => {
        setHidden(url, true);
        card.classList.add('aiuse-x-media-hidden');
      });
      actions.appendChild(hide);

      const open = document.createElement('a');
      open.href = url;
      open.target = '_blank';
      open.rel = 'noreferrer';
      open.textContent = kind === 'video' ? '動画' : '原寸';
      actions.appendChild(open);

      const postUrl = media.post_url || payload.post_url;
      if (postUrl && postUrl !== payload.post_url) {
        const post = document.createElement('a');
        post.href = postUrl;
        post.target = '_blank';
        post.rel = 'noreferrer';
        post.textContent = '元post';
        actions.appendChild(post);
      }
      actions.appendChild(status);
      card.appendChild(actions);
      grid.appendChild(card);
    });

    wrap.appendChild(grid);
    return wrap;
  }

  function markerKey(token) {
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    for (let i = 0; i < token.length; i++) {
      const c = token.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= c + 0x9e3779b9 + ((h2 << 6) >>> 0) + (h2 >>> 2);
      h2 >>>= 0;
    }
    return `x-${token.length}-${(h1 >>> 0).toString(36)}-${(h2 >>> 0).toString(36)}`;
  }

  function markerBlocks(root) {
    const all = [...root.querySelectorAll('p, pre, li, blockquote, div')].filter(el => (el.textContent || '').includes(PREFIX));
    if ((root.textContent || '').includes(PREFIX)) all.push(root);
    const unique = [...new Set(all)];
    return unique
      .filter(el => !unique.some(other => other !== el && el.contains(other)))
      .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
  }

  function tokenFromBlock(block) {
    const text = (block.textContent || '').replace(INVISIBLE_RE, '');
    const at = text.indexOf(PREFIX);
    if (at < 0) return null;
    const tail = text.slice(at + PREFIX.length).replace(/\s+/g, '');
    const match = tail.match(/^([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  }

  function showMarkerError(block, message) {
    if (block.querySelector?.('.aiuse-x-media-marker-error')) return;
    const badge = document.createElement('span');
    badge.className = 'aiuse-x-media-marker-error aiuse-x-media-badge';
    badge.textContent = `AIUse marker error: ${message}`;
    badge.style.marginLeft = '8px';
    block.appendChild(badge);
  }

  function consumeMarkers(root) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
    const seenTokens = new Set();
    for (const block of markerBlocks(root)) {
      const token = tokenFromBlock(block);
      if (!token || seenTokens.has(token)) continue;
      seenTokens.add(token);
      const key = markerKey(token);
      if (document.querySelector(`[data-aiuse-marker-key="${CSS.escape(key)}"]`)) {
        if ((block.textContent || '').trim().startsWith(PREFIX)) block.style.display = 'none';
        continue;
      }
      try {
        const gallery = buildGallery(parsePayload(token));
        gallery.dataset.aiuseMarkerKey = key;
        block.insertAdjacentElement('afterend', gallery);
        block.style.display = 'none';
      } catch (err) {
        console.error('[AIUse X media] marker parse failed', err);
        showMarkerError(block, err.message || String(err));
      }
    }
  }

  function scan() {
    ensureStyle();
    const candidates = document.querySelectorAll('[data-message-author-role="assistant"], main article');
    for (const el of candidates) {
      if (el.getAttribute(PROCESSED) === '1' && !(el.textContent || '').includes(PREFIX)) continue;
      consumeMarkers(el);
      el.setAttribute(PROCESSED, '1');
    }
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  scan();
})();
