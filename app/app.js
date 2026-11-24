import {
  openCapture, captureSummary, clearCapture, saveImport, listImports, deleteImport, loadImport, DEFAULT_SETTINGS,
} from '../lib/db.js';
import {
  buildDumpFromCapture, decodeDumpBytes, dumpRange, downloadText, exportFileName, META_KEY,
} from '../lib/dump.js';

const $ = (id) => document.getElementById(id);
const fmt = (ms) => (ms ? new Date(ms).toLocaleString() : '—');
const fmtTime = (ms) => (ms ? new Date(ms).toLocaleTimeString() : '—');
function fmtBytes(n) {
  if (!isFinite(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}
function fmtDur(ms) {
  if (!isFinite(ms) || ms < 0) return '';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return h ? `${h} h ${m} min` : m ? `${m} min ${r} s` : `${r} s`;
}
function toLocalInput(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined) e.append(k.nodeType ? k : String(k));
  return e;
}
const openViewer = (id) => chrome.tabs.create({ url: chrome.runtime.getURL(`viewer/viewer.html?id=${id}`) });

// ------------------------------------------------------------------ routing
function route() {
  const view = (location.hash || '#export').slice(1);
  document.querySelectorAll('.view').forEach((s) => { s.hidden = s.id !== `view-${view}`; });
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.dataset.view === view));
  if (view === 'export') refreshCapture();
  if (view === 'library') renderLibrary();
  if (view === 'settings') loadSettings();
}
window.addEventListener('hashchange', route);

// ------------------------------------------------------------------ recording pill
async function renderRec() {
  const { recording } = await chrome.storage.local.get(DEFAULT_SETTINGS);
  $('rec-pill').classList.toggle('on', recording);
  $('rec-text').textContent = recording ? 'Recording' : 'Paused';
  $('rec-pill').title = recording ? 'Click to pause recording' : 'Click to resume recording';
}
$('rec-pill').onclick = async () => {
  const { recording } = await chrome.storage.local.get(DEFAULT_SETTINGS);
  await chrome.storage.local.set({ recording: !recording });
};
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== 'local') return;
  if (c.recording) { renderRec(); if (!$('view-settings').hidden) loadSettings(); }
});

// ------------------------------------------------------------------ export
let summary = null;
let activePreset = 0;

async function refreshCapture() {
  summary = await captureSummary();
  $('cap-span').textContent = summary.start ? `${fmtDur(summary.end - summary.start)} (${fmtTime(summary.start)} – ${fmtTime(summary.end)})` : 'No data yet';
  $('cap-pcs').textContent = summary.pcs.length;
  $('cap-samples').textContent = summary.counts.stats.toLocaleString();
  $('cap-events').textContent = summary.counts.events.toLocaleString();
  try {
    const est = await navigator.storage.estimate();
    $('cap-storage').textContent = fmtBytes(est.usage);
  } catch (_) { $('cap-storage').textContent = '—'; }
  if (!$('exp-from').value || activePreset !== null) applyPreset(activePreset ?? 0);
  else renderPcTable();
}
$('cap-refresh').onclick = refreshCapture;

function applyPreset(min) {
  activePreset = min;
  document.querySelectorAll('#presets button').forEach((b) => b.classList.toggle('on', Number(b.dataset.min) === min));
  const end = summary && summary.end ? Math.max(summary.end, Date.now()) : Date.now();
  let start = min ? end - min * 60000 : (summary && summary.start) || end - 3600000;
  if (summary && summary.start && start < summary.start) start = summary.start;
  $('exp-from').value = toLocalInput(Math.floor(start / 1000) * 1000);
  $('exp-to').value = toLocalInput(Math.ceil(end / 1000) * 1000);
  renderPcTable();
}
document.querySelectorAll('#presets button').forEach((b) => { b.onclick = () => applyPreset(Number(b.dataset.min)); });
for (const id of ['exp-from', 'exp-to']) {
  $(id).addEventListener('change', () => {
    activePreset = null;
    document.querySelectorAll('#presets button').forEach((b) => b.classList.remove('on'));
    renderPcTable();
  });
}

function getRange() {
  const from = new Date($('exp-from').value).getTime();
  const to = new Date($('exp-to').value).getTime() + 999;
  return { from, to, ok: isFinite(from) && isFinite(to) && from <= to };
}

function renderPcTable() {
  const { from, to, ok } = getRange();
  $('range-len').textContent = ok ? fmtDur(to - from) : 'Invalid range';
  const tb = $('pc-table').querySelector('tbody');
  tb.textContent = '';
  const all = $('pc-all').checked;
  const pcs = (summary ? summary.pcs : []).filter((p) => ok && p.created <= to && p.lastSeen >= from);
  for (const p of pcs) {
    const live = !p.closed && Date.now() - p.lastSeen < 10000;
    const cb = el('input', { type: 'checkbox', 'data-id': p.id });
    cb.checked = all;
    cb.disabled = all;
    tb.append(el('tr', null,
      el('td', null, cb),
      el('td', { class: 'url', title: p.url, text: p.url || p.origin || '' }),
      el('td', { class: 'mono', text: `tab ${p.tabId} · #${p.lid}${p.frameId ? ` · frame ${p.frameId}` : ''}` }),
      el('td', { class: 'nowrap', text: fmt(p.created) }),
      el('td', { class: 'nowrap', text: fmtTime(p.lastSeen) }),
      el('td', null, el('span', { class: `tag ${live ? 'live' : ''}`, text: p.closed ? 'closed' : live ? 'active' : 'idle' }))));
  }
  $('pc-count').textContent = pcs.length ? `(${pcs.length} in range)` : '';
  $('pc-empty').hidden = pcs.length > 0;
  $('pc-table').hidden = pcs.length === 0;
}
$('pc-all').onchange = renderPcTable;

function selectedPcIds() {
  if ($('pc-all').checked) return null;
  return [...document.querySelectorAll('#pc-table tbody input:checked')].map((c) => c.dataset.id);
}

async function buildExport() {
  const { from, to, ok } = getRange();
  if (!ok) throw new Error('Choose a valid time range (From must be before To).');
  const pcIds = selectedPcIds();
  if (pcIds && !pcIds.length) throw new Error('Select at least one peer connection.');
  const db = await openCapture();
  const dump = await buildDumpFromCapture(db, { from, to, pcIds, includeGum: $('exp-gum').checked });
  const n = Object.keys(dump.PeerConnections).length;
  if (!n && !dump.getUserMedia.length) throw new Error('Nothing was recorded in this time range.');
  return { dump, from, to, n };
}

async function withStatus(btn, fn) {
  const st = $('exp-status');
  st.className = 'status';
  st.textContent = 'Preparing…';
  btn.disabled = true;
  try { await fn(st); } catch (e) {
    st.className = 'status err';
    st.textContent = e.message || String(e);
  } finally { btn.disabled = false; }
}

$('exp-download').onclick = () => withStatus($('exp-download'), async (st) => {
  const { dump, from, to, n } = await buildExport();
  const text = JSON.stringify(dump);
  const gz = $('exp-gz').checked;
  await downloadText(text, exportFileName('webrtc_internals_dump', from, to, gz), { gz });
  st.textContent = `Exported ${n} peer connection${n === 1 ? '' : 's'} (${fmtBytes(text.length)} uncompressed).`;
});

$('exp-view').onclick = () => withStatus($('exp-view'), async (st) => {
  const { dump, from, to, n } = await buildExport();
  const text = JSON.stringify(dump);
  const name = `Recording ${new Date(from).toLocaleString()} – ${new Date(to).toLocaleTimeString()}`;
  const r = dumpRange(dump);
  const id = await saveImport({ name, text, source: 'capture', summary: { start: r.start, end: r.end, pcCount: r.pcCount, gumCount: r.gumCount } });
  openViewer(id);
  st.textContent = `Opened ${n} peer connection${n === 1 ? '' : 's'} in the viewer (also saved under “Imported data”).`;
});

// ------------------------------------------------------------------ import
const drop = $('drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => importFiles([...e.dataTransfer.files]));
$('file').addEventListener('change', (e) => { importFiles([...e.target.files]); e.target.value = ''; });

async function importFiles(files) {
  const out = $('import-results');
  let lastId = null;
  for (const file of files) {
    const li = el('li', null, el('span', { class: 'name', text: file.name }), el('span', { class: 'info', text: 'Reading…' }));
    out.prepend(li);
    const info = li.querySelector('.info');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { text, dump } = await decodeDumpBytes(bytes);
      const r = dumpRange(dump);
      const source = dump[META_KEY] ? 'extension' : 'native';
      const id = await saveImport({ name: file.name, text, source, summary: { start: r.start, end: r.end, pcCount: r.pcCount, gumCount: r.gumCount } });
      lastId = id;
      info.textContent = `${r.pcCount} peer connection${r.pcCount === 1 ? '' : 's'} · ${r.start ? `${fmt(r.start)} → ${fmtTime(r.end)}` : 'no timestamps'} · ${fmtBytes(text.length)}`;
      li.append(el('button', { class: 'small', text: 'Open', onclick: () => openViewer(id) }));
    } catch (e) {
      li.classList.add('err');
      info.textContent = e.message || String(e);
    }
  }
  if (lastId !== null && files.length === 1) openViewer(lastId);
}

// ------------------------------------------------------------------ library
async function renderLibrary() {
  const list = await listImports();
  const tb = $('lib-table').querySelector('tbody');
  tb.textContent = '';
  $('lib-empty').hidden = list.length > 0;
  $('lib-table').hidden = list.length === 0;
  for (const d of list) {
    const src = d.source === 'capture' ? ['live', 'Recorded'] : d.source === 'native' ? ['native', 'webrtc-internals'] : ['', 'Extension file'];
    tb.append(el('tr', null,
      el('td', { class: 'url', title: d.name, text: d.name }),
      el('td', null, el('span', { class: `tag ${src[0]}`, text: src[1] })),
      el('td', { class: 'nowrap', text: d.start ? `${fmt(d.start)} (${fmtDur(d.end - d.start)})` : '—' }),
      el('td', { text: d.pcCount ?? '—' }),
      el('td', { class: 'nowrap', text: fmtBytes(d.size) }),
      el('td', { class: 'nowrap', text: fmt(d.importedAt) }),
      el('td', { class: 'nowrap' },
        el('button', { class: 'small primary', text: 'Open', onclick: () => openViewer(d.id) }), ' ',
        el('button', { class: 'small', text: 'Download', onclick: async () => {
          const r = await loadImport(d.id);
          downloadText(r.text, `${d.name.replace(/\.(json|txt|gz)$/gi, '').replace(/[\\/:*?"<>|]/g, '_')}.json`);
        } }), ' ',
        el('button', { class: 'small danger', text: 'Delete', onclick: async () => {
          if (!confirm(`Delete “${d.name}” from imported data? This cannot be undone.`)) return;
          await deleteImport(d.id);
          renderLibrary();
        } }))));
  }
}

// ------------------------------------------------------------------ settings
async function loadSettings() {
  const s = await chrome.storage.local.get(DEFAULT_SETTINGS);
  $('set-recording').checked = s.recording;
  $('set-interval').value = String(s.pollInterval);
  $('set-retention').value = String(s.retentionMinutes);
  const sum = await captureSummary();
  $('set-usage').textContent = `${sum.pcs.length} peer connections, ${sum.counts.stats.toLocaleString()} stats samples, ${sum.counts.events.toLocaleString()} events.`;
}
$('set-recording').onchange = (e) => chrome.storage.local.set({ recording: e.target.checked });
$('set-interval').onchange = (e) => chrome.storage.local.set({ pollInterval: Number(e.target.value) });
$('set-retention').onchange = async (e) => {
  await chrome.storage.local.set({ retentionMinutes: Number(e.target.value) });
  chrome.runtime.sendMessage({ type: 'wie:trim' }).catch(() => {});
};
$('set-clear').onclick = async () => {
  if (!confirm('Delete all recorded WebRTC data? Imported files are not affected. This cannot be undone.')) return;
  await clearCapture();
  loadSettings();
};

renderRec();
route();
