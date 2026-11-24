// Service worker: persists captured WebRTC data into IndexedDB and enforces retention.
import { openCapture, txDone, reqP, trimBefore, DEFAULT_SETTINGS } from './lib/db.js';

const pcKey = (tabId, frameId, nonce, lid) => `${tabId}:${frameId}:${nonce}:${lid}`;

async function settings() {
  return chrome.storage.local.get(DEFAULT_SETTINGS);
}

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.local.get(null);
  const missing = {};
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) if (!(k in cur)) missing[k] = v;
  if (Object.keys(missing).length) await chrome.storage.local.set(missing);
  chrome.alarms.create('wie-trim', { periodInMinutes: 5 });
  updateBadge();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('wie-trim', { periodInMinutes: 5 });
  updateBadge();
});

async function updateBadge() {
  const { recording } = await settings();
  chrome.action.setBadgeText({ text: recording ? '' : 'OFF' });
  chrome.action.setBadgeBackgroundColor({ color: '#777' });
}
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'local' && ch.recording) updateBadge();
});

// Serialise writes so batches from many tabs never interleave transactions badly.
let chain = Promise.resolve();
function enqueue(fn) {
  chain = chain.then(fn).catch((e) => console.warn('[webrtc-exporter]', e));
  return chain;
}

async function handleBatch(rawItems, sender) {
  const tabId = sender.tab ? sender.tab.id : -1;
  const frameId = sender.frameId || 0;
  const items = [];
  for (const raw of rawItems) {
    try { items.push(typeof raw === 'string' ? JSON.parse(raw) : raw); } catch (_) {}
  }
  if (!items.length) return;

  const db = await openCapture();
  const tx = db.transaction(['pcs', 'events', 'stats', 'gum'], 'readwrite');
  const pcs = tx.objectStore('pcs');
  const touched = new Map(); // id -> {created?: record, lastSeen}

  for (const it of items) {
    if (typeof it.t !== 'number') continue;
    if (it.k === 'gum') {
      tx.objectStore('gum').add({ t: it.t, tabId, frameId, nonce: it.nonce, seq: it.seq, e: it.e, url: sender.url });
      continue;
    }
    const id = pcKey(tabId, frameId, it.nonce, it.lid);
    const tr = touched.get(id) || { lastSeen: 0 };
    tr.lastSeen = Math.max(tr.lastSeen, it.t);
    if (it.k === 'pc') {
      tr.record = {
        id, tabId, frameId, nonce: it.nonce, lid: it.lid,
        url: it.url, origin: it.origin, created: it.t, lastSeen: it.t,
        rtcConfiguration: it.rtcConfiguration, constraints: it.constraints, ua: it.ua,
      };
    } else if (it.k === 'ev') {
      tx.objectStore('events').add({ pc: id, t: it.t, seq: it.seq, type: it.type, value: it.value });
      if (it.type === 'close') tr.closed = it.t;
    } else if (it.k === 'st') {
      tx.objectStore('stats').add({ pc: id, t: it.t, kf: it.kf, r: it.r });
    }
    touched.set(id, tr);
  }

  for (const [id, tr] of touched) {
    const existing = tr.record ? null : await reqP(pcs.get(id));
    const rec = tr.record || existing || {
      // Data for a connection whose creation was not recorded (e.g. recording was toggled on later).
      id, tabId, frameId, nonce: id.split(':')[2], lid: Number(id.split(':')[3]),
      url: sender.url, origin: sender.origin, created: tr.lastSeen, lastSeen: tr.lastSeen,
      rtcConfiguration: '', constraints: '', partial: true,
    };
    if (existing && tr.record) Object.assign(rec, { created: existing.created });
    rec.lastSeen = Math.max(rec.lastSeen || 0, tr.lastSeen);
    if (tr.closed) rec.closed = tr.closed;
    pcs.put(rec);
  }
  await txDone(tx);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'wie:batch' && Array.isArray(msg.items)) {
    enqueue(() => handleBatch(msg.items, sender));
    return false;
  }
  if (msg && msg.type === 'wie:trim') {
    enqueue(trim).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

async function trim() {
  const { retentionMinutes } = await settings();
  if (!retentionMinutes || retentionMinutes <= 0) return;
  const cutoff = Date.now() - retentionMinutes * 60000;
  const db = await openCapture();
  await trimBefore(db, ['events', 'stats', 'gum'], cutoff);
  const tx = db.transaction('pcs', 'readwrite');
  const req = tx.objectStore('pcs').index('lastSeen').openCursor(IDBKeyRange.upperBound(cutoff, true));
  req.onsuccess = () => {
    const c = req.result;
    if (!c) return;
    c.delete();
    c.continue();
  };
  await txDone(tx);
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'wie-trim') enqueue(trim);
});
