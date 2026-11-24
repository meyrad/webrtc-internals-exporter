// Archive viewer: renders an imported webrtc-internals dump with the same layout
// as chrome://webrtc-internals, plus a time scrubber to inspect any moment.
import { loadImport } from '../lib/db.js';
import { initI18n, t, num, locale } from '../lib/i18n.js';
import {
  normalizeDump, statAt, indexAt, sliceDump, downloadText, exportFileName,
} from '../lib/dump.js';

const $ = (id) => document.getElementById(id);
function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : String(k));
  return e;
}

const fmtLocale = (ms) => (ms === null || ms === undefined ? '' : new Date(ms).toLocaleString(locale()));
const fmtClock = (ms) => new Date(ms).toLocaleTimeString(locale());
function fmtDuration(ms) {
  if (!isFinite(ms)) return '';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  const [H, M, S] = [t('unit.h'), t('unit.m'), t('unit.s')];
  return h ? `${num(h)} ${H} ${num(m)} ${M} ${num(r)} ${S}` : m ? `${num(m)} ${M} ${num(r)} ${S}` : `${num(r)} ${S}`;
}
function fmtValue(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return '{ ' + Object.keys(v).map((k) => `${JSON.stringify(k)}: ${JSON.stringify(v[k])}`).join(', ') + ' }';
  }
  if (Array.isArray(v)) return JSON.stringify(v);
  return String(v);
}
function toLocalInput(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ------------------------------------------------------------------ state
let record = null; // stored import record
let dump = null; // raw parsed dump (never mutated)
let model = null; // normalized
let asOf = null; // ms
const tabs = []; // { head, body, built, update() }
let activeTab = null;

// ------------------------------------------------------------------ boot
init().catch((e) => showError(e));

async function init() {
  await initI18n();
  document.title = t('v.title');
  const id = Number(new URLSearchParams(location.search).get('id'));
  if (!id) throw new Error(t('v.noId'));
  record = await loadImport(id);
  if (!record) throw new Error(t('v.notFound', { id }));
  dump = JSON.parse(record.text);
  model = normalizeDump(dump);
  asOf = model.end;
  document.title = `${record.name} — ${t('v.title')}`;
  renderBanner();
  renderDumpSection();
  renderTabs();
}

function showError(e) {
  console.error(e);
  const box = $('wie-error');
  box.hidden = false;
  box.textContent = e && e.message ? e.message : String(e);
}

// ------------------------------------------------------------------ banner + scrubber
function renderBanner() {
  $('wie-banner').hidden = false;
  $('wie-name').textContent = record.name;
  const parts = [];
  if (model.start !== null) parts.push(`${fmtLocale(model.start)} → ${fmtLocale(model.end)} (${fmtDuration(model.end - model.start)})`);
  parts.push(t('v.pcs', { n: model.pcs.length }));
  parts.push(t('v.gums', { n: model.gum.length }));
  $('wie-summary').textContent = parts.join(' · ');

  const meta = $('wie-meta-table');
  const rows = [[t('v.metaImported'), fmtLocale(record.importedAt)], [t('v.metaSource'), record.source === 'capture' ? t('v.srcCapture') : t('v.srcFile')]];
  for (const k of Object.keys(model.meta)) {
    let v = model.meta[k];
    if (k === 'timestamp' && typeof v === 'number') v = `${fmtLocale(v)} (${v})`;
    rows.push([k, typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v)]);
  }
  for (const [k, v] of rows) meta.append(el('tr', null, el('td', { text: k }), el('td', null, el('pre', { style: 'margin:0;white-space:pre-wrap', text: v }))));

  const range = $('wie-time');
  if (model.start === null) {
    document.querySelector('.wie-scrubber').hidden = true;
    return;
  }
  range.min = String(Math.floor(model.start));
  range.max = String(Math.ceil(model.end));
  range.value = range.max;
  let raf = 0;
  range.addEventListener('input', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => setAsOf(Number(range.value)));
  });
  $('wie-first').onclick = () => setAsOf(model.start);
  $('wie-last').onclick = () => setAsOf(model.end);
  $('wie-back').onclick = () => setAsOf(Math.max(model.start, asOf - 1000));
  $('wie-fwd').onclick = () => setAsOf(Math.min(model.end, asOf + 1000));
  updateTimeOut();
}

function updateTimeOut() {
  if (model.start === null) return;
  const off = asOf - model.start;
  const sign = off < 0 ? '-' : '+';
  const a = Math.abs(off);
  const mm = String(Math.floor(a / 60000)).padStart(2, '0');
  const ss = ((a % 60000) / 1000).toFixed(3).padStart(6, '0');
  $('wie-time-out').textContent = `${fmtLocale(asOf)} .${String(Math.floor(asOf % 1000)).padStart(3, '0')}  (${sign}${mm}:${ss}${asOf >= model.end ? `${locale() === 'fa-IR' ? '،' : ','} ${t('v.end')}` : ''})`;
}

function setAsOf(t) {
  asOf = Math.min(Math.max(t, model.start), model.end);
  $('wie-time').value = String(Math.round(asOf));
  updateTimeOut();
  for (const t of tabs) if (t.built) t.update();
}

// ------------------------------------------------------------------ "Create dump" section
function renderDumpSection() {
  $('wie-dump-root').hidden = false;
  const from = $('dump-from'); const to = $('dump-to');
  const full = () => {
    if (model.start === null) return;
    from.value = toLocalInput(Math.floor(model.start / 1000) * 1000);
    to.value = toLocalInput(Math.ceil(model.end / 1000) * 1000);
  };
  full();
  $('dump-full').onclick = full;
  $('dump-to-cursor').onclick = () => { to.value = toLocalInput(Math.ceil(asOf / 1000) * 1000); };
  $('dump-click-target').onclick = async () => {
    const f = new Date(from.value).getTime();
    const e = new Date(to.value).getTime() + 999; // inclusive of the whole "to" second
    if (!isFinite(f) || !isFinite(e) || f > e) { alert(t('v.badRange')); return; }
    const gz = $('dump-checkbox').checked;
    const isFull = model.start !== null && f <= model.start && e >= model.end;
    const text = isFull ? record.text : JSON.stringify(sliceDump(dump, f, e));
    await downloadText(text, exportFileName('webrtc_internals_dump', f, e, gz), { gz });
  };
  $('dump-original').onclick = () => {
    const base = record.name.replace(/\.(gz|json|txt)$/i, '').replace(/\.(json|txt)$/i, '');
    downloadText(record.text, `${base || 'webrtc_internals_dump'}.json`);
  };
}

// ------------------------------------------------------------------ tabs
function pcTitle(pc) {
  const m = /^(\d+)-(\d+)/.exec(pc.key);
  const ids = m ? `rid: ${m[1]}, lid: ${m[2]}, pid: ${pc.pid ?? '?'}` : `${pc.key}${pc.pid !== undefined ? `, pid: ${pc.pid}` : ''}`;
  return `${pc.url} [ ${ids} ]`;
}

function renderTabs() {
  const root = $('content-root');
  const heads = el('div', { style: 'text-align: center;' });
  root.append(heads);
  const addTab = (title, bodyId, build) => {
    const head = el('span', { class: 'tab-head', title, text: title });
    const body = el('div', { class: 'tab-body', id: bodyId });
    const tab = { head, body, built: false, build, update: () => {} };
    head.onclick = () => activate(tab);
    heads.append(head);
    root.append(body);
    tabs.push(tab);
    return tab;
  };
  addTab(t('v.gumTab'), 'user-media-tab-id', buildGumTab);
  model.pcs.forEach((pc) => addTab(pcTitle(pc), pc.key, (tab) => buildPcTab(tab, pc)));
  if (!model.pcs.length && !model.gum.length) root.append(el('p', { class: 'wie-empty', text: t('v.empty') }));
  activate(tabs[model.pcs.length ? 1 : 0]);
}

function activate(tab) {
  if (activeTab) {
    activeTab.head.classList.remove('active-tab-head');
    activeTab.body.classList.remove('active-tab-body');
  }
  activeTab = tab;
  tab.head.classList.add('active-tab-head');
  tab.body.classList.add('active-tab-body');
  if (!tab.built) {
    tab.build(tab);
    tab.built = true;
    tab.update();
  }
}

// ------------------------------------------------------------------ getUserMedia tab
function buildGumTab(tab) {
  const body = tab.body;
  const groups = new Map();
  for (const g of model.gum) {
    const key = `${g.rid ?? ''}-${g.pid ?? ''}-${g.request_id ?? ''}-${g.request_type ?? ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(g);
  }
  const blocks = [];
  for (const [key, list] of groups) {
    const first = list[0];
    const origin = list.find((x) => x.origin)?.origin || '';
    const div = el('div', { class: 'user-media-request-div-class', id: `gum-${key}` },
      el('div', { text: `${t('v.callerOrigin')} ${origin}` }),
      el('div', { text: `${t('v.callerPid')} ${first.pid ?? ''}` }));
    for (const g of list) {
      const kind = g.request_type || 'getUserMedia';
      const time = g.t !== null ? new Date(g.t).toTimeString() : '';
      const line = (t) => el('div', { style: 'font-weight: normal;', text: t });
      const track = (j) => { try { const o = JSON.parse(j); return `id=${o.id} label:${o.label}`; } catch (_) { return j; } };
      if ('audio' in g || 'video' in g) {
        div.append(el('span', { style: 'font-weight: bold;' }, t('v.call', { kind }), line(`${t('v.time')} ${time}`),
          'audio' in g ? line(`${t('v.audioC')} ${g.audio === '' ? 'true' : g.audio}`) : null,
          'video' in g ? line(`${t('v.videoC')} ${g.video === '' ? 'true' : g.video}`) : null));
      } else if (g.error !== undefined || g.error_message !== undefined) {
        div.append(el('span', { style: 'font-weight: bold;' }, t('v.error', { kind }), line(`${t('v.time')} ${time}`),
          line(`${t('v.errName')} ${g.error ?? ''}`), line(`${t('v.errMsg')} ${g.error_message ?? ''}`)));
      } else if (g.stream_id !== undefined) {
        div.append(el('span', { style: 'font-weight: bold;' }, t('v.result', { kind }), line(`${t('v.time')} ${time}`),
          line(`${t('v.streamId')} ${g.stream_id}`),
          g.audio_track_info ? line(`${t('v.audioTrack')} ${track(g.audio_track_info)}`) : null,
          g.video_track_info ? line(`${t('v.videoTrack')} ${track(g.video_track_info)}`) : null));
      } else {
        div.append(el('span', { style: 'font-weight: bold;' }, kind, line(`${t('v.time')} ${time}`), el('pre', { text: JSON.stringify(g, null, 1) })));
      }
    }
    blocks.push({ div, origin, t: first.t });
    body.append(div);
  }
  if (!blocks.length) body.append(el('p', { class: 'wie-empty', text: t('v.noGum') }));
  const input = el('input', { size: 30 });
  body.append(el('label', { text: t('v.filterOrigin') }), input);
  input.oninput = () => {
    for (const b of blocks) b.div.style.display = !input.value || b.origin.includes(input.value) ? '' : 'none';
  };
  tab.update = () => { for (const b of blocks) b.div.classList.toggle('wie-future', b.t !== null && b.t > asOf); };
}

// ------------------------------------------------------------------ peer connection tab
const STATE_LINES = [
  ['iceconnectionstate', 'v.iceState', ['oniceconnectionstatechange', 'iceConnectionStateChange', 'iceconnectionstatechange']],
  ['connectionstate', 'v.connState', ['onconnectionstatechange', 'connectionStateChange', 'connectionstatechange']],
  ['signalingstate', 'v.sigState', ['onsignalingstatechange', 'signalingStateChange', 'signalingstatechange']],
];
const SDP_TYPES = new Set(['createOfferOnSuccess', 'createAnswerOnSuccess', 'setLocalDescription', 'setRemoteDescription']);
const LABEL_KEYS = ['kind', 'mid', 'ssrc', 'rtxSsrc', 'fecSsrc', 'frameHeight', 'active', 'scalabilityMode',
  'encoderImplementation', 'decoderImplementation', 'powerEfficientEncoder', 'powerEfficientDecoder', '[codec]',
  'mimeType', 'payloadType', 'label', 'state', 'candidateType', 'iceState', 'dtlsState'];
const NO_GRAPH = new Set(['timestamp', 'ssrc', 'rtxSsrc', 'fecSsrc', 'payloadType', 'clockRate', 'channels', 'port',
  'relatedPort', 'priority', 'remoteTimestamp', 'lastPacketReceivedTimestamp', 'lastPacketSentTimestamp',
  'estimatedPlayoutTimestamp', 'mid', 'dataChannelIdentifier', 'id']);

function statLabel(stat, values) {
  const parts = [];
  for (const k of LABEL_KEYS) if (values[k] !== undefined && values[k] !== '') parts.push(`${k}=${fmtValue(values[k])}`);
  parts.push(`id=${stat.id}`);
  return `${stat.type || values.type || '?'} (${parts.join(', ')})`;
}

function parseJSON(v) {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch (_) { return undefined; }
}

function eventSummary(u) {
  const v = parseJSON(u.value);
  if ((u.type === 'transceiverAdded' || u.type === 'transceiverModified') && v && typeof v === 'object') {
    return `${u.type}(index=${v.transceiverIndex}, kind=${v.kind})`;
  }
  if (SDP_TYPES.has(u.type) && v && typeof v === 'object' && typeof v.sdp === 'string') {
    const sections = v.sdp.split(/\r?\nm=/).length;
    return `${u.type} (type: "${v.type}", ${sections} sections)`;
  }
  if (u.type === 'addIceCandidate' && v && typeof v === 'object' && v.candidate !== undefined) {
    const typ = /\btyp (\w+)/.exec(v.candidate || '');
    return `addIceCandidate(sdpMid=${JSON.stringify(v.sdpMid)}, sdpMLineIndex=${v.sdpMLineIndex}${typ ? `, type: ${typ[1]}` : ''})`;
  }
  return u.type;
}

function sdpNode(sdp) {
  const frag = el('pre');
  const copy = el('button', { text: t('v.copySdp') });
  copy.onclick = (e) => { e.preventDefault(); navigator.clipboard.writeText(sdp).catch(() => {}); };
  frag.append(copy);
  const lines = sdp.split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === ''));
  const sections = [];
  for (const line of lines) {
    if (line.startsWith('m=') || !sections.length) sections.push([]);
    sections[sections.length - 1].push(line);
  }
  for (const sec of sections) {
    let summary = `${sec[0]} (${sec.length - 1} more lines)`;
    if (sec[0].startsWith('m=')) {
      const dir = sec.find((l) => /^a=(sendrecv|sendonly|recvonly|inactive)$/.test(l));
      const mid = sec.find((l) => l.startsWith('a=mid:'));
      if (dir) summary += ` direction=${dir.slice(2)}`;
      if (mid) summary += ` mid=${mid.slice(6)}`;
    }
    frag.append(el('details', { open: true }, el('summary', { text: summary }), sec.slice(1).join('\n')));
  }
  return frag;
}

function eventDetailNode(u) {
  const v = parseJSON(u.value);
  if (SDP_TYPES.has(u.type) && v && typeof v === 'object' && typeof v.sdp === 'string') return sdpNode(v.sdp);
  let text = typeof u.value === 'string' ? u.value : JSON.stringify(u.value);
  if (v && typeof v === 'object') text = JSON.stringify(v, null, 1);
  return el('pre', { text });
}

function buildPcTab(tab, pc) {
  const body = tab.body;
  const p = el('p', null, el('span', { text: pc.url }), el('span', { text: ', ' }),
    el('span', { text: typeof pc.rtcConfiguration === 'string' ? pc.rtcConfiguration : JSON.stringify(pc.rtcConfiguration) }),
    el('span', { text: ', ' }),
    el('span', { text: typeof pc.constraints === 'string' ? pc.constraints : JSON.stringify(pc.constraints) }));
  body.append(p, el('ul', { class: 'peerconnection-deprecations' }));

  const stateDivs = STATE_LINES.map(([cls]) => { const d = el('div', { class: cls }); body.append(d); return d; });
  const pairSpan = el('span');
  body.append(el('div', { class: 'candidatepair' }, t('v.pair'), pairSpan));
  const grid = el('table', { id: `grid-${pc.key}`, class: 'candidategrid' });
  const gridDetails = el('details', null, el('summary', { text: t('v.grid') }), grid);
  body.append(gridDetails);

  // ---- update log
  const logTable = el('table', { class: 'update-log-table', id: `${pc.key}-update-log`, border: '1' });
  const tbody = el('tbody', null, el('tr', null, el('th', { text: t('v.colTime') }), el('th', { class: 'update-log-header-event', text: t('v.colEvent') })));
  logTable.append(tbody);
  const rows = [];
  let prevT = null;
  for (const u of pc.updateLog) {
    const title = u.t !== null ? t('v.tsTitle', { t: u.t, delta: prevT !== null ? u.t - prevT : undefined }) : '';
    const timeCell = el('td', { title, class: 'wie-time', text: u.t !== null ? fmtLocale(u.t) : (u.timeText || '') });
    if (u.t !== null) timeCell.onclick = () => setAsOf(u.t);
    prevT = u.t ?? prevT;
    let eventCell;
    if (u.value === '' || u.value === null || u.value === undefined) {
      eventCell = el('td', { text: u.type });
    } else {
      const det = el('details', null, el('summary', { text: eventSummary(u) }));
      det.addEventListener('toggle', () => {
        if (det.open && det.childNodes.length === 1) det.append(eventDetailNode(u));
      }, { once: false });
      eventCell = el('td', null, det);
    }
    const tr = el('tr', null, timeCell, eventCell);
    if (/OnFailure$/.test(u.type) || u.type === 'onicecandidateerror' || u.type === 'icecandidateerror') tr.classList.add('update-log-failure');
    rows.push({ tr, t: u.t });
    tbody.append(tr);
  }
  body.append(el('div', { class: 'update-log-container' }, logTable));

  // ---- stats tables
  const tableContainer = el('div', { id: `${pc.key}-table-container`, class: 'stats-table-container' });
  const tableFilter = el('input', { placeholder: t('v.filterPh'), size: 25 });
  tableContainer.append(el('div', { text: t('v.statsTables') }), el('label', { text: t('v.filterTables') }), tableFilter);
  const statById = new Map(pc.stats.map((s) => [s.id, s]));
  const tableEntries = pc.stats.map((stat) => {
    const summary = el('summary');
    const table = el('table', { id: `${pc.key}-table-${stat.id}`, border: '1' });
    const details = el('details', { id: `${pc.key}-details-${stat.id}` }, summary, table);
    summary.dataset.stale = t('v.stale');
    details.addEventListener('toggle', () => { if (details.open) fillTable(entry); });
    tableContainer.append(details);
    const entry = { stat, details, summary, table };
    return entry;
  });
  body.append(tableContainer);
  if (!pc.stats.length) tableContainer.append(el('p', { class: 'wie-empty', text: t('v.noStats') }));

  function goToStat(id) {
    const ent = tableEntries.find((t) => t.stat.id === id);
    if (!ent) return;
    ent.details.open = true;
    fillTable(ent);
    ent.details.scrollIntoView({ block: 'start' });
  }

  function fillTable(entry) {
    const { stat, table } = entry;
    const vals = statAt(stat, asOf);
    table.textContent = '';
    const tb = el('tbody', null, el('tr', null, el('th', { colspan: '2', text: t('v.statistics', { id: stat.id }) })));
    const row = (name, value) => {
      let link = el('a');
      if (/Id$/.test(name) && typeof value === 'string' && statById.has(value)) {
        link = el('a', { href: `#${pc.key}-table-${value}`, text: ' 🔗' });
        link.onclick = (e) => { e.preventDefault(); goToStat(value); };
      }
      tb.append(el('tr', { id: `${pc.key}-table-${stat.id}-${name}` }, el('td', { text: name }), el('td', { text: value }), el('td', null, link)));
    };
    if (vals.timestamp !== undefined) row('timestamp', fmtLocale(Number(vals.timestamp)));
    const names = Object.keys(vals).filter((k) => k !== 'timestamp' && k !== 'type' && k !== 'id' && !k.startsWith('['));
    names.sort();
    for (const k of names) row(k, fmtValue(vals[k]));
    for (const f of stat.fields) if (f.name.startsWith('[') && vals[f.name] !== undefined) row(f.name, fmtValue(vals[f.name]));
    table.append(tb);
  }

  // ---- graphs
  const graphContainer = el('div', { id: `${pc.key}-graph-container`, class: 'stats-graph-container' });
  const graphFilter = el('input', { placeholder: t('v.filterPh'), size: 25 });
  graphContainer.append(el('label', { text: t('v.filterGraphs') }), graphFilter);
  const graphEntries = pc.stats.map((stat) => {
    const heading = el('span', { class: 'stats-graph-container-heading' });
    const details = el('details', { id: `${pc.key}-${stat.type}-${stat.id}-graph-container`, class: 'stats-graph-container' }, el('summary', null, heading));
    const entry = { stat, details, heading, graphs: null };
    details.addEventListener('toggle', () => {
      if (!details.open) return;
      if (!entry.graphs) buildGraphs(entry);
      entry.graphs.forEach((g) => g.draw());
    });
    graphContainer.append(details);
    return entry;
  });
  body.append(graphContainer);

  function buildGraphs(entry) {
    entry.graphs = [];
    const numeric = entry.stat.fields.filter((f) => !NO_GRAPH.has(f.name) && f.values.length
      && f.values.every((v) => typeof v === 'number' || v === null));
    numeric.sort((a, b) => (a.name.startsWith('[') - b.name.startsWith('[')) || a.name.localeCompare(b.name));
    for (const f of numeric) {
      const g = new Graph(f, pc);
      entry.details.append(el('div', { class: 'stats-graph-sub-container' }, el('div', { text: f.name }),
        el('div', { id: `${pc.key}-${entry.stat.id}-${f.name}-div` }, g.root)));
      entry.graphs.push(g);
    }
    if (!numeric.length) entry.details.append(el('p', { class: 'wie-graph-note', text: t('v.noNumeric') }));
  }

  const applyFilter = (input, entries) => {
    const terms = input.value.split(',').map((s) => s.trim()).filter(Boolean);
    for (const e of entries) {
      const ok = !terms.length || terms.some((t) => (e.stat.type || '').includes(t));
      e.details.style.display = ok ? '' : 'none';
    }
  };
  tableFilter.oninput = () => applyFilter(tableFilter, tableEntries);
  graphFilter.oninput = () => applyFilter(graphFilter, graphEntries);

  // ---- time-dependent refresh
  tab.update = () => {
    const at = asOf;
    // state lines
    STATE_LINES.forEach(([, label, types], i) => {
      const seq = pc.updateLog.filter((u) => types.includes(u.type) && (u.t === null || u.t <= at)).map((u) => u.value);
      stateDivs[i].textContent = `${t(label)}: new${seq.map((v) => ` => ${v}`).join('')}`;
    });
    for (const r of rows) r.tr.classList.toggle('wie-future', r.t !== null && r.t > at);

    const current = new Map(); // id -> values at t (only stats that exist at t)
    for (const stat of pc.stats) {
      if (stat.first !== null && stat.first > at) continue;
      current.set(stat.id, statAt(stat, at));
    }
    renderPair(current);
    renderGrid(current);

    for (const e of tableEntries) {
      const exists = current.has(e.stat.id);
      e.details.classList.toggle('wie-notyet', !exists);
      if (!exists) continue;
      const vals = current.get(e.stat.id);
      e.summary.textContent = statLabel(e.stat, vals);
      e.details.classList.toggle('wie-stale', e.stat.last !== null && e.stat.last < at - 2500);
      e.summary.classList.toggle('stats-table-rtp-inactive', e.stat.type === 'outbound-rtp' && vals.active === false);
      if (e.details.open) fillTable(e);
    }
    for (const e of graphEntries) {
      const vals = current.get(e.stat.id) || statAt(e.stat, null);
      e.heading.textContent = t('v.graphsFor', { label: statLabel(e.stat, vals) });
      if (e.graphs && e.details.open) e.graphs.forEach((g) => g.draw());
    }
  };

  function selectedPairId(current) {
    for (const v of current.values()) if (v.type === 'transport' && v.selectedCandidatePairId) return v.selectedCandidatePairId;
    for (const [id, v] of current) if (v.type === 'candidate-pair' && v.nominated && v.state === 'succeeded') return id;
    return null;
  }
  const addr = (c) => (c ? `${c.address ?? c.ip ?? ''}:${c.port ?? ''}` : '');

  function renderPair(current) {
    const id = selectedPairId(current);
    const pair = id && current.get(id);
    pairSpan.textContent = pair ? `${addr(current.get(pair.localCandidateId))} <=>${addr(current.get(pair.remoteCandidateId))}` : '';
  }

  function renderGrid(current) {
    grid.textContent = '';
    grid.append(el('tr', null, t('v.gridHead').map((h) => el('th', { text: h }))));
    const active = selectedPairId(current);
    const pairs = [...current].filter(([, v]) => v.type === 'candidate-pair');
    pairs.sort((a, b) => (b[0] === active) - (a[0] === active));
    const hex = (n) => (typeof n === 'number' ? '0x' + BigInt(Math.round(n)).toString(16) : '');
    const sl = (a, b) => `${a ?? ''} / ${b ?? ''}`;
    const tm = (ms) => (typeof ms === 'number' ? fmtClock(ms) : '');
    for (const [id, p] of pairs) {
      const local = current.get(p.localCandidateId) || {};
      const remote = current.get(p.remoteCandidateId) || {};
      const cls = 'candidategrid-candidatepair' + (id === active ? ' candidategrid-active' : '');
      grid.append(el('tr', { class: cls }, [id, p.state, local.networkType, '', local.protocol, hex(p.priority),
        sl(p.bytesSent, p.bytesReceived), sl(p.requestsSent, p.responsesReceived), sl(p.requestsReceived, p.responsesSent),
        p.currentRoundTripTime !== undefined ? `${p.currentRoundTripTime}s` : '',
        `${tm(p.lastPacketSentTimestamp)} / ${tm(p.lastPacketReceivedTimestamp)}`, tm(p.timestamp)].map((x) => el('td', { text: x ?? '' }))));
      for (const [cid, c] of [[p.localCandidateId, local], [p.remoteCandidateId, remote]]) {
        const prio = el('td', { text: hex(c.priority) });
        if (c.type === 'local-candidate' && typeof c.priority === 'number') {
          const pr = c.priority;
          prio.append(el('br'), `${Math.floor(pr / 2 ** 24)} | ${Math.floor(pr / 256) % 65536} | ${pr % 256}`);
        }
        grid.append(el('tr', { class: 'candidategrid-candidate' }, el('td', { text: cid || '' }), el('td', { text: c.type || '' }),
          el('td', { text: c.address ?? c.ip ?? '' }), el('td', { text: c.port ?? '' }), el('td', { text: c.candidateType || '' }), prio,
          ...Array.from({ length: 6 }, () => el('td'))));
      }
    }
  }
}

// ------------------------------------------------------------------ graph
const W = 300; const H = 150; const PLOT_H = 132;

function niceStep(range) {
  if (!(range > 0)) return 1;
  const raw = range / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}
function fmtAxis(v, step) {
  const a = Math.abs(step);
  if (Math.abs(v) >= 1e6 && a >= 1e5) return `${+(v / 1e6).toFixed(a >= 1e6 ? 0 : 1)} M`;
  if (Math.abs(v) >= 1e3 && a >= 100) return `${+(v / 1e3).toFixed(a >= 1e3 ? 0 : 1)} k`;
  const dec = a >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(a)));
  return v.toFixed(dec);
}

class Graph {
  constructor(field, pc) {
    this.f = field;
    this.pc = pc;
    this.root = el('div', { class: 'wie-graph' });
    this.canvas = el('canvas', { width: W * devicePixelRatio, height: H * devicePixelRatio, style: `width:${W}px;height:${H}px` });
    this.tip = el('div', { class: 'wie-tip', hidden: true });
    this.root.append(this.canvas, this.tip);
    this.hover = null;
    this.canvas.addEventListener('mousemove', (e) => { this.hover = e.offsetX; this.draw(); });
    this.canvas.addEventListener('mouseleave', () => { this.hover = null; this.tip.hidden = true; this.draw(); });
    this.canvas.addEventListener('click', (e) => setAsOf(this.timeAt(e.offsetX)));
    const vals = field.values.filter((v) => typeof v === 'number');
    let min = Math.min(0, ...vals); let max = Math.max(...vals, 0);
    if (max === min) max = min + 1;
    const step = niceStep(max - min);
    this.step = step;
    this.min = Math.floor(min / step) * step;
    this.max = Math.ceil(max / step) * step;
    this.t0 = pc.start ?? field.times[0];
    this.t1 = pc.end ?? field.times[field.times.length - 1];
    if (!(this.t1 > this.t0)) this.t1 = this.t0 + 1000;
  }
  x(t) { return ((t - this.t0) / (this.t1 - this.t0)) * (W - 1); }
  y(v) { return PLOT_H - 1 - ((v - this.min) / (this.max - this.min)) * (PLOT_H - 2); }
  timeAt(px) { return this.t0 + (px / (W - 1)) * (this.t1 - this.t0); }

  draw() {
    const c = this.canvas.getContext('2d');
    c.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    c.clearRect(0, 0, W, H);
    c.font = '10px Arial, sans-serif';
    // time grid
    c.strokeStyle = '#ccc'; c.lineWidth = 1; c.fillStyle = '#000'; c.textAlign = 'center'; c.textBaseline = 'top';
    const span = this.t1 - this.t0;
    const steps = [1e3, 2e3, 5e3, 1e4, 15e3, 3e4, 6e4, 12e4, 3e5, 6e5, 9e5, 18e5, 36e5, 72e5];
    const tStep = steps.find((s) => span / s <= 4) || 144e5;
    for (let t = Math.ceil(this.t0 / tStep) * tStep; t <= this.t1; t += tStep) {
      const x = Math.round(this.x(t)) + 0.5;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, PLOT_H); c.stroke();
      if (x > 20 && x < W - 20) c.fillText(fmtClock(t), x, PLOT_H + 4);
    }
    c.strokeRect(0.5, 0.5, W - 1, PLOT_H - 1);
    // y labels (right side, like webrtc-internals)
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let v = this.min; v <= this.max + this.step / 2; v += this.step) {
      const y = Math.round(this.y(v)) + 0.5;
      c.beginPath(); c.moveTo(W - 4, y); c.lineTo(W - 1, y); c.stroke();
      c.fillText(fmtAxis(v, this.step), W - 5, Math.min(Math.max(y, 6), PLOT_H - 6));
    }
    // series (bucketed min/max per pixel for long recordings)
    const { times, values } = this.f;
    c.strokeStyle = 'red'; c.lineWidth = 1; c.beginPath();
    let started = false;
    if (times.length > W * 3) {
      let bx = -1; let lo = 0; let hi = 0;
      const flush = () => { if (bx < 0) return; if (!started) { c.moveTo(bx, this.y(lo)); started = true; } c.lineTo(bx, this.y(lo)); c.lineTo(bx, this.y(hi)); };
      for (let i = 0; i < times.length; i++) {
        const v = values[i]; if (typeof v !== 'number' || times[i] === null) continue;
        const px = Math.round(this.x(times[i]));
        if (px !== bx) { flush(); bx = px; lo = hi = v; } else { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      }
      flush();
    } else {
      for (let i = 0; i < times.length; i++) {
        const v = values[i]; if (typeof v !== 'number' || times[i] === null) { started = false; continue; }
        const x = this.x(times[i]); const y = this.y(v);
        if (!started) { c.moveTo(x, y); started = true; } else c.lineTo(x, y);
      }
    }
    c.stroke();
    // current time cursor
    if (asOf !== null && asOf >= this.t0 && asOf <= this.t1) {
      const x = Math.round(this.x(asOf)) + 0.5;
      c.strokeStyle = '#1a73e8'; c.setLineDash([3, 3]);
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, PLOT_H); c.stroke(); c.setLineDash([]);
    }
    // hover readout
    if (this.hover !== null) {
      const t = this.timeAt(this.hover);
      let i = indexAt(times, t);
      if (i < 0) i = 0;
      if (i + 1 < times.length && Math.abs(times[i + 1] - t) < Math.abs(times[i] - t)) i++;
      const v = values[i];
      if (typeof v === 'number') {
        const x = this.x(times[i]); const y = this.y(v);
        c.fillStyle = 'red'; c.beginPath(); c.arc(x, y, 2.5, 0, Math.PI * 2); c.fill();
        this.tip.hidden = false;
        this.tip.textContent = `${+v.toFixed(4)} @ ${fmtClock(times[i])}.${String(Math.floor(times[i] % 1000)).padStart(3, '0')}`;
        this.tip.style.left = `${Math.min(x + 6, W - 120)}px`;
        this.tip.style.top = `${Math.max(0, y - 22)}px`;
      }
    }
  }
}

// Alt+Left / Alt+Right step the time position by one second.
document.addEventListener('keydown', (e) => {
  if (!model || model.start === null || e.target.closest('input, textarea')) return;
  if (e.key === 'ArrowLeft' && e.altKey) setAsOf(asOf - 1000);
  if (e.key === 'ArrowRight' && e.altKey) setAsOf(asOf + 1000);
});

