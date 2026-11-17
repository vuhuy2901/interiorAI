// ==UserScript==
// @name         Goofish Public Product Viewer
// @namespace    local.codex.goofish.public-view
// @version      1.1.0
// @description  Hiển thị lại dữ liệu sản phẩm đã công khai trong DOM Goofish, không cần đăng nhập.
// @match        https://www.goofish.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const SCRIPT_ID = 'gf-public-product-view';
  const PAGE_STYLE_ID = `${SCRIPT_ID}-page-style`;
  const HOST_ID = `${SCRIPT_ID}-host`;
  const GATE_ATTRIBUTE = 'data-gf-public-login-gate';
  const MAX_ITEMS = 120;

  let suppressGates = true;
  let panelOpen = true;
  let refreshTimer = 0;
  let lastFingerprint = '';
  let observer = null;
  let shadow = null;

  const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

  function absoluteUrl(value) {
    if (!value) return '';
    try {
      return new URL(value, location.href).href;
    } catch {
      return '';
    }
  }

  function itemIdFromUrl(value) {
    try {
      const url = new URL(value, location.href);
      return url.pathname === '/item' ? cleanText(url.searchParams.get('id')) : '';
    } catch {
      return '';
    }
  }

  function bestImageUrl(root) {
    const images = Array.from(root.querySelectorAll('img'));
    const preferred = images.find((image) => /xy_item|bao\/uploaded/i.test(image.currentSrc || image.src));
    const image = preferred || images.find((candidate) => {
      const src = candidate.currentSrc || candidate.src || '';
      return src && !/logo|avatar|icon|tps-/i.test(src);
    });
    return absoluteUrl(image?.currentSrc || image?.src || image?.getAttribute('data-src'));
  }

  function longestUsefulTitle(root) {
    const candidates = Array.from(root.querySelectorAll('[title]'))
      .map((element) => cleanText(element.getAttribute('title')))
      .filter((value) => value.length > 3 && !/^\d+人想要$/.test(value));
    candidates.sort((left, right) => right.length - left.length);
    return candidates[0] || '';
  }

  function publicFacts(root) {
    const selectors = [
      '[class*="cpv-wrap"]',
      '[class*="tag"]',
      '[class*="condition"]',
      '[class*="want"]',
      '[class*="price-desc"]',
    ];
    const values = selectors.flatMap((selector) =>
      Array.from(root.querySelectorAll(selector)).map((element) => cleanText(element.textContent)),
    );
    return Array.from(new Set(values.filter(Boolean))).join(' · ');
  }

  function priceFromCard(root) {
    const priceRoot = root.querySelector('[class*="price-wrap"], [class*="price--"]');
    const source = cleanText(priceRoot?.textContent || root.textContent);
    const match = source.match(/¥\s*([0-9]+(?:[.,][0-9]+)?)/);
    return match ? `¥${match[1]}` : '';
  }

  function extractCard(anchor) {
    const url = absoluteUrl(anchor.href);
    const id = itemIdFromUrl(url);
    if (!id) return null;

    const title = longestUsefulTitle(anchor) || cleanText(anchor.getAttribute('aria-label'));
    const facts = publicFacts(anchor);
    const fallbackText = cleanText(anchor.textContent);
    const description = title || fallbackText;

    return {
      id,
      url,
      image: bestImageUrl(anchor),
      name: title || `Sản phẩm ${id}`,
      price: priceFromCard(anchor),
      description,
      facts,
      source: 'Thẻ sản phẩm công khai',
    };
  }

  function metaContent(selector) {
    return cleanText(document.querySelector(selector)?.getAttribute('content'));
  }

  function extractCurrentDetail() {
    const id = itemIdFromUrl(location.href);
    if (!id) return null;

    const heading = document.querySelector('h1, [class*="item-title"], [class*="main-title"]');
    const name =
      metaContent('meta[property="og:title"]') ||
      metaContent('meta[name="twitter:title"]') ||
      cleanText(heading?.textContent) ||
      cleanText(document.title).replace(/\s*[-_|].*$/, '');
    const description =
      metaContent('meta[property="og:description"]') ||
      metaContent('meta[name="description"]');
    const image =
      absoluteUrl(metaContent('meta[property="og:image"]')) ||
      bestImageUrl(document.querySelector('main, [class*="content"]') || document.body);
    const bodyText = cleanText(document.querySelector('main, [class*="content"]')?.textContent);
    const priceMatch = bodyText.match(/¥\s*([0-9]+(?:[.,][0-9]+)?)/);

    if (!name && !description && !image && !priceMatch) return null;
    return {
      id,
      url: location.href,
      image,
      name: name || `Sản phẩm ${id}`,
      price: priceMatch ? `¥${priceMatch[1]}` : '',
      description,
      facts: '',
      source: 'Metadata/trang chi tiết công khai',
    };
  }

  function collectProducts() {
    const products = new Map();
    const detail = extractCurrentDetail();
    if (detail) products.set(detail.id, detail);

    document.querySelectorAll('a[href*="/item?"]').forEach((anchor) => {
      const product = extractCard(anchor);
      if (product && !products.has(product.id)) products.set(product.id, product);
    });
    return Array.from(products.values()).slice(0, MAX_ITEMS);
  }

  function ensurePageStyle() {
    if (document.getElementById(PAGE_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PAGE_STYLE_ID;
    style.textContent = `
      [${GATE_ATTRIBUTE}="1"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function fixedAncestor(element) {
    let current = element;
    for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
      if (getComputedStyle(current).position === 'fixed') return current;
    }
    return null;
  }

  function markLoginGates() {
    document.querySelectorAll(`[${GATE_ATTRIBUTE}]`).forEach((element) => {
      if (!suppressGates) element.removeAttribute(GATE_ATTRIBUTE);
    });
    if (!suppressGates) return;

    document.querySelectorAll('.ant-modal-root').forEach((root) => {
      const text = cleanText(root.textContent);
      const hasPassportFrame = Boolean(root.querySelector('iframe[src*="passport.goofish.com"]'));
      if (hasPassportFrame || /请先登录|短信登录|手机扫码安全登录/.test(text)) {
        root.setAttribute(GATE_ATTRIBUTE, '1');
      }
    });

    document.querySelectorAll('div, section, aside').forEach((element) => {
      const text = cleanText(element.textContent);
      if (!text || text.length > 180) return;
      if (/登录后可以更懂你|立即登录/.test(text)) {
        const fixed = fixedAncestor(element);
        if (fixed) fixed.setAttribute(GATE_ATTRIBUTE, '1');
      }
    });
  }

  function ensurePanel() {
    let host = document.getElementById(HOST_ID);
    if (host) return;

    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;top:12px;right:12px;';
    document.documentElement.appendChild(host);
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { color-scheme: light; }
        * { box-sizing: border-box; }
        button, a { font: inherit; }
        .launcher {
          border: 0; border-radius: 999px; background: #ffe500; color: #151515;
          box-shadow: 0 8px 26px rgba(0,0,0,.22); cursor: pointer; font: 700 13px/1 system-ui;
          padding: 12px 16px;
        }
        .panel {
          width: min(440px, calc(100vw - 24px)); max-height: calc(100vh - 24px);
          background: #fff; border: 1px solid #dedede; border-radius: 18px;
          box-shadow: 0 18px 60px rgba(0,0,0,.28); color: #191919;
          display: flex; flex-direction: column; font: 13px/1.45 system-ui, sans-serif; overflow: hidden;
        }
        .hidden { display: none !important; }
        header { align-items: center; background: #ffe500; display: flex; gap: 8px; padding: 12px; }
        header strong { flex: 1; font-size: 14px; }
        header button, .toolbar button {
          background: rgba(255,255,255,.78); border: 1px solid rgba(0,0,0,.14);
          border-radius: 9px; cursor: pointer; padding: 6px 9px;
        }
        .notice { background: #fffbe0; border-bottom: 1px solid #eee2a3; padding: 9px 12px; }
        .toolbar { align-items: center; border-bottom: 1px solid #eee; display: flex; gap: 8px; padding: 9px 12px; }
        .toolbar .count { flex: 1; font-weight: 700; }
        .list { display: grid; gap: 10px; overflow: auto; padding: 12px; }
        .card { border: 1px solid #e7e7e7; border-radius: 13px; color: inherit; cursor: pointer; display: grid; gap: 9px; grid-template-columns: 84px 1fr; padding: 9px; text-decoration: none; transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease; }
        .card:hover, .card:focus-visible { border-color: #cdb900; box-shadow: 0 5px 18px rgba(0,0,0,.12); outline: none; transform: translateY(-1px); }
        .card img { background: #f4f4f4; border-radius: 9px; height: 84px; object-fit: cover; width: 84px; }
        .placeholder { align-items: center; background: #f3f3f3; border-radius: 9px; color: #888; display: flex; height: 84px; justify-content: center; text-align: center; width: 84px; }
        .name { color: #111; display: -webkit-box; font-weight: 700; overflow: hidden; text-decoration: none; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
        .price { color: #e5482d; font-size: 18px; font-weight: 800; }
        .facts { color: #666; margin-top: 3px; }
        .description { color: #3f3f3f; display: -webkit-box; margin-top: 5px; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
        .source { color: #8a8a8a; font-size: 11px; margin-top: 5px; }
        .empty { color: #666; padding: 24px 10px; text-align: center; }
      </style>
      <button class="launcher hidden" type="button">Goofish công khai</button>
      <section class="panel">
        <header>
          <strong>Goofish · dữ liệu công khai</strong>
          <button class="minimize" type="button" title="Thu gọn">−</button>
          <button class="close" type="button" title="Đóng">×</button>
        </header>
        <div class="notice">Chỉ đọc dữ liệu đã có trong trang. Không thực hiện xác thực hay gọi dịch vụ tài khoản.</div>
        <div class="toolbar">
          <span class="count">0 sản phẩm</span>
          <button class="gate" type="button">Lớp phủ: ẩn</button>
          <button class="refresh" type="button">Làm mới</button>
        </div>
        <div class="list"></div>
      </section>
    `;

    shadow.querySelector('.launcher').addEventListener('click', () => setPanelOpen(true));
    shadow.querySelector('.minimize').addEventListener('click', () => setPanelOpen(false));
    shadow.querySelector('.close').addEventListener('click', () => {
      observer?.disconnect();
      host.remove();
    });
    shadow.querySelector('.refresh').addEventListener('click', () => refresh(true));
    shadow.querySelector('.gate').addEventListener('click', () => {
      suppressGates = !suppressGates;
      markLoginGates();
      updateGateButton();
    });
  }

  function setPanelOpen(open) {
    panelOpen = open;
    shadow?.querySelector('.panel')?.classList.toggle('hidden', !open);
    shadow?.querySelector('.launcher')?.classList.toggle('hidden', open);
  }

  function updateGateButton() {
    const button = shadow?.querySelector('.gate');
    if (button) button.textContent = suppressGates ? 'Lớp phủ: ẩn' : 'Lớp phủ: hiện';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function render(products, force) {
    ensurePanel();
    const fingerprint = products.map((product) => `${product.id}:${product.price}:${product.name}`).join('|');
    if (!force && fingerprint === lastFingerprint) return;
    lastFingerprint = fingerprint;

    shadow.querySelector('.count').textContent = `${products.length} sản phẩm`;
    const list = shadow.querySelector('.list');
    if (!products.length) {
      list.innerHTML = '<div class="empty">Chưa thấy thẻ sản phẩm công khai trong trang hiện tại.</div>';
      return;
    }

    list.innerHTML = products.map((product) => `
      <a class="card" href="${escapeHtml(product.url)}" target="_blank" rel="noopener noreferrer" aria-label="Mở trang chi tiết: ${escapeHtml(product.name)}">
        ${product.image
          ? `<img src="${escapeHtml(product.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
          : '<div class="placeholder">Không có ảnh</div>'}
        <div>
          <div class="name">${escapeHtml(product.name)}</div>
          <div class="price">${escapeHtml(product.price || 'Chưa công khai giá')}</div>
          ${product.facts ? `<div class="facts">${escapeHtml(product.facts)}</div>` : ''}
          ${product.description ? `<div class="description">${escapeHtml(product.description)}</div>` : ''}
          <div class="source">${escapeHtml(product.source)} · ID ${escapeHtml(product.id)}</div>
        </div>
      </a>
    `).join('');
  }

  function refresh(force = false) {
    if (!document.documentElement) return;
    ensurePageStyle();
    markLoginGates();
    render(collectProducts(), force);
    updateGateButton();
    setPanelOpen(panelOpen);
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => refresh(false), 220);
  }

  function start() {
    if (!document.documentElement || document.getElementById(HOST_ID)) return;
    ensurePageStyle();
    ensurePanel();
    refresh(true);

    observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('popstate', scheduleRefresh, { passive: true });
    window.addEventListener('hashchange', scheduleRefresh, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
