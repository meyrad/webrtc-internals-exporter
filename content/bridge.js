// Isolated-world bridge: receives data from inject.js (MAIN world) and forwards
// it in batches to the service worker. Also pushes recording settings to inject.js.
(() => {
  'use strict';
  if (window.__wieBridge) return;
  window.__wieBridge = true;

  const EVT_OUT = '__wie_out__';
  const EVT_CFG = '__wie_cfg__';
  const EVT_HELLO = '__wie_hello__';
  const FLUSH_MS = 1000;

  let cfg = null;
  let buf = [];
  let timer = null;
  let dead = false;

  function sendCfg() {
    if (!cfg) return;
    window.dispatchEvent(new CustomEvent(EVT_CFG, { detail: JSON.stringify(cfg) }));
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!buf.length || dead) return;
    const items = buf; buf = [];
    try {
      chrome.runtime.sendMessage({ type: 'wie:batch', items }).catch(() => {});
    } catch (_) {
      dead = true; // extension was reloaded/removed; stop forwarding
    }
  }

  try {
    chrome.storage.local.get({ recording: false, pollInterval: 1000 }, (s) => {
      cfg = { enabled: !!s.recording, interval: s.pollInterval };
      sendCfg();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !cfg) return;
      if (changes.recording) cfg.enabled = !!changes.recording.newValue;
      if (changes.pollInterval) cfg.interval = changes.pollInterval.newValue;
      if (changes.recording || changes.pollInterval) sendCfg();
    });
  } catch (_) { dead = true; }

  window.addEventListener(EVT_HELLO, sendCfg);
  window.addEventListener(EVT_OUT, (e) => {
    if (dead || !cfg || !cfg.enabled || typeof e.detail !== 'string') return;
    buf.push(e.detail);
    if (buf.length >= 500) flush();
    else if (!timer) timer = setTimeout(flush, FLUSH_MS);
  });
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
})();
