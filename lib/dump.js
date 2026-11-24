// Dump format utilities.
//
// The export format is the same JSON structure Chrome writes from
// chrome://webrtc-internals ("Download the webrtc-internals dump"):
//
// {
//   getUserMedia: [ ... ],
//   PeerConnections: {
//     "<rid>-<lid>": {
//       pid, url, rtcConfiguration, constraints,
//       updateLog: [ { type, value, timestamp } ],
//       stats: { "<statId>-<field>": { startTime, endTime, statsType, values: "<json array>" } }
//     }
//   },
//   UserAgent, ...
// }
//
// so files from this extension open in other webrtc-internals tools and native
// dumps open in this extension. Extension metadata lives under META_KEY.

export const META_KEY = 'webrtcInternalsExporter';
export const FORMAT_VERSION = 1;

// ------------------------------------------------------------------ helpers

export const iso = (ms) => (isFinite(ms) ? new Date(ms).toISOString() : null);

export function parseTime(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string' && v) {
    const n = Number(v);
    if (isFinite(n) && v.trim() !== '') return n;
    const p = Date.parse(v);
    if (!isNaN(p)) return p;
  }
  return null;
}

export function parseValues(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const a = JSON.parse(v); return Array.isArray(a) ? a : [a]; } catch (_) { return []; }
  }
  return [];
}

/** Split "<statId>-<field>" (field may itself contain '-' when bracketed). */
export function splitStatKey(key) {
  let i = key.endsWith(']') ? key.lastIndexOf('-[') : -1;
  if (i < 0) i = key.lastIndexOf('-');
  if (i <= 0) return [key, ''];
  return [key.slice(0, i), key.slice(i + 1)];
}

export function isGzip(bytes) {
  return bytes && bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function streamThrough(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
export const gzip = (text) => streamThrough(new TextEncoder().encode(text), new CompressionStream('gzip'));
export const gunzip = (bytes) => streamThrough(bytes, new DecompressionStream('gzip'));

/** Bytes (maybe gzipped) -> parsed + validated dump. Returns { text, dump }. */
export async function decodeDumpBytes(bytes) {
  let b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (isGzip(b)) b = await gunzip(b);
  let text = new TextDecoder('utf-8').decode(b);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let dump;
  try { dump = JSON.parse(text); } catch (e) {
    throw Object.assign(new Error('File is not valid JSON (or gzipped JSON). ' + e.message), { code: 'notJson' });
  }
  validateDump(dump);
  return { text, dump };
}

export function validateDump(dump) {
  try { validateDumpInner(dump); } catch (e) { e.code = 'notDump'; throw e; }
}
function validateDumpInner(dump) {
  if (!dump || typeof dump !== 'object' || Array.isArray(dump)) throw new Error('Not a webrtc-internals dump: top level must be an object.');
  if (!('PeerConnections' in dump) && !('getUserMedia' in dump)) {
    throw new Error('Not a webrtc-internals dump: missing "PeerConnections" and "getUserMedia".');
  }
  if (dump.PeerConnections && typeof dump.PeerConnections !== 'object') throw new Error('"PeerConnections" must be an object.');
}

// ------------------------------------------------------------------ derived ("[...]") metrics
// Mirrors the calculated metrics chrome://webrtc-internals adds to its dumps.

const BITRATE = ['bytesSent', 'bytesReceived', 'headerBytesSent', 'headerBytesReceived',
  'retransmittedBytesSent', 'retransmittedBytesReceived', 'totalEncodedBytesTarget'];
const RATE = ['framesEncoded', 'framesSent', 'framesReceived', 'framesDecoded', 'keyFramesDecoded',
  'totalSamplesReceived', 'concealedSamples', 'silentConcealedSamples', 'insertedSamplesForDeceleration',
  'removedSamplesForAcceleration', 'messagesSent', 'messagesReceived'];
// [numerator, denominator, multiply-by-1000 ("_in_ms")]
const RATIO = [
  ['totalPacketSendDelay', 'packetsSent', true],
  ['totalEncodeTime', 'framesEncoded', true],
  ['qpSum', 'framesEncoded', false],
  ['totalDecodeTime', 'framesDecoded', true],
  ['totalInterFrameDelay', 'framesDecoded', true],
  ['qpSum', 'framesDecoded', false],
  ['concealedSamples', 'totalSamplesReceived', false],
  ['jitterBufferDelay', 'jitterBufferEmittedCount', true],
  ['jitterBufferTargetDelay', 'jitterBufferEmittedCount', true],
  ['jitterBufferMinimumDelay', 'jitterBufferEmittedCount', true],
  ['totalProcessingDelay', 'jitterBufferEmittedCount', true],
  ['totalAssemblyTime', 'framesAssembledFromMultiplePackets', true],
  ['totalPlayoutDelay', 'totalSamplesCount', false],
  ['totalRoundTripTime', 'responsesReceived', false],
  ['totalRoundTripTime', 'roundTripTimeMeasurements', false],
];
const TIMESTAMP_FIELDS = ['lastPacketReceivedTimestamp', 'lastPacketSentTimestamp', 'remoteTimestamp'];

export function codecLabel(codec) {
  if (!codec) return undefined;
  const name = (codec.mimeType || '').split('/')[1] || codec.mimeType || '?';
  let s = `${name} (${codec.payloadType}`;
  if (codec.sdpFmtpLine) s += `, ${codec.sdpFmtpLine}`;
  return s + ')';
}

const localeTime = (ms) => new Date(ms).toLocaleString('en-US');

/**
 * Given consecutive snapshots of one stats object (rows), return
 * { name: [ [timestamp, value], ... ] } for every derived metric that applies.
 */
export function deriveMetrics(rows) {
  const out = {};
  const push = (name, ts, v) => {
    if (v === undefined || v === null || (typeof v === 'number' && !isFinite(v))) return;
    (out[name] || (out[name] = [])).push([ts, v]);
  };
  const num = (v) => (typeof v === 'number' ? v : undefined);
  for (let i = 0; i < rows.length; i++) {
    const cur = rows[i];
    const ts = cur.timestamp;
    for (const f of TIMESTAMP_FIELDS) if (typeof cur[f] === 'number') push(`[${f}]`, ts, localeTime(cur[f]));
    if (num(cur.framesReceived) !== undefined && num(cur.framesDecoded) !== undefined) {
      push('[framesReceived-framesDecoded-framesDropped]', ts, cur.framesReceived - cur.framesDecoded - (cur.framesDropped || 0));
    }
    if (i === 0) continue;
    const prev = rows[i - 1];
    const dt = (cur.timestamp - prev.timestamp) / 1000;
    const d = (f) => (num(cur[f]) !== undefined && num(prev[f]) !== undefined ? cur[f] - prev[f] : undefined);
    if (dt > 0) {
      for (const f of BITRATE) { const v = d(f); if (v !== undefined) push(`[${f}_in_bits/s]`, ts, (v * 8) / dt); }
      for (const f of RATE) { const v = d(f); if (v !== undefined) push(`[${f}/s]`, ts, v / dt); }
    }
    for (const [a, b, ms] of RATIO) {
      const da = d(a); const db = d(b);
      if (da === undefined || db === undefined || db === 0) continue;
      push(`[${a}/${b}${ms ? '_in_ms' : ''}]`, ts, (da / db) * (ms ? 1000 : 1));
    }
    const dE = d('totalAudioEnergy'); const dD = d('totalSamplesDuration');
    if (dE !== undefined && dD) push('[Audio_Level_in_RMS]', ts, Math.sqrt(dE / dD));
    const n = d('framesDecoded'); const s = d('totalInterFrameDelay'); const ss = d('totalSquaredInterFrameDelay');
    if (n && s !== undefined && ss !== undefined) {
      const variance = (ss - (s * s) / n) / n;
      if (variance >= 0) push('[interFrameDelayStDev_in_ms]', ts, Math.sqrt(variance) * 1000);
    }
  }
  return out;
}

// ------------------------------------------------------------------ building series

/** Convert ordered snapshots of one stat object to native "stats" entries. */
function rowsToSeries(id, rows, target, { derived = true } = {}) {
  if (!rows.length) return;
  const statsType = rows[rows.length - 1].type;
  const fields = new Map(); // name -> [[ts, v]]
  for (const row of rows) {
    for (const k in row) {
      if (k === 'id') continue;
      let arr = fields.get(k);
      if (!arr) { arr = []; fields.set(k, arr); }
      arr.push([row.timestamp, row[k]]);
    }
  }
  // Native order: members, then "timestamp", then derived metrics.
  const ordered = [...fields.keys()].filter((k) => k !== 'timestamp' && !k.startsWith('['));
  ordered.sort();
  const bracket = [...fields.keys()].filter((k) => k.startsWith('['));
  const write = (name, pairs) => {
    if (!pairs.length) return;
    target[`${id}-${name}`] = {
      startTime: iso(pairs[0][0]),
      endTime: iso(pairs[pairs.length - 1][0]),
      statsType,
      values: JSON.stringify(pairs.map((p) => p[1])),
    };
  };
  for (const k of ordered) write(k, fields.get(k));
  for (const k of bracket) write(k, fields.get(k));
  if (fields.has('timestamp')) write('timestamp', fields.get('timestamp'));
  if (derived) {
    const dm = deriveMetrics(rows);
    for (const name in dm) if (!fields.has(name)) write(name, dm[name]);
  }
}

// ------------------------------------------------------------------ export from capture

/**
 * Build a native-format dump from the capture database.
 * @param {IDBDatabase} db  capture DB (lib/db.js openCapture())
 * @param {{from:number,to:number,pcIds?:string[]|null,includeGum?:boolean}} opts
 */
export async function buildDumpFromCapture(db, { from, to, pcIds = null, includeGum = true }) {
  const { reqP, iterate } = await import('./db.js');
  const tx = () => db.transaction(['pcs', 'events', 'stats', 'gum'], 'readonly');

  let pcs = await reqP(tx().objectStore('pcs').getAll());
  pcs = pcs.filter((p) => p.created <= to && p.lastSeen >= from && (!pcIds || pcIds.includes(p.id)));
  pcs.sort((a, b) => a.created - b.created);

  const dump = { getUserMedia: [], PeerConnections: {} };
  const usedKeys = new Set();
  let ua = '';

  for (const pc of pcs) {
    if (!ua && pc.ua) ua = pc.ua;
    let key = `${pc.tabId}-${pc.lid}`;
    for (let n = 2; usedKeys.has(key); n++) key = `${pc.tabId}-${pc.lid}.${n}`;
    usedKeys.add(key);

    // updateLog
    const events = [];
    await iterate(tx().objectStore('events').index('pc_t'),
      IDBKeyRange.bound([pc.id, from], [pc.id, to]), (e) => { events.push(e); });
    events.sort((a, b) => a.t - b.t || (a.seq || 0) - (b.seq || 0));

    // stats: replay deltas from the start of the connection, keep samples inside the range
    const rowsById = new Map();
    let state = {};
    await iterate(tx().objectStore('stats').index('pc_t'),
      IDBKeyRange.bound([pc.id, -Infinity], [pc.id, to]), (s) => {
        const next = {};
        if (s.kf) {
          for (const id in s.r) next[id] = s.r[id];
        } else {
          for (const id in s.r) next[id] = state[id] ? Object.assign({}, state[id], s.r[id]) : s.r[id];
        }
        state = next;
        if (s.t < from) return;
        for (const id in state) {
          let row = state[id];
          if (typeof row.timestamp !== 'number') row = Object.assign({}, row, { timestamp: s.t });
          if ((row.type === 'inbound-rtp' || row.type === 'outbound-rtp') && row.codecId && state[row.codecId]) {
            row = Object.assign({}, row, { '[codec]': codecLabel(state[row.codecId]) });
          }
          let arr = rowsById.get(id);
          if (!arr) { arr = []; rowsById.set(id, arr); }
          if (!arr.length || arr[arr.length - 1].timestamp !== row.timestamp) arr.push(row);
        }
      });
    const stats = {};
    for (const [id, rows] of rowsById) rowsToSeries(id, rows, stats);

    if (!events.length && !Object.keys(stats).length) continue;
    const entry = {
      pid: pc.tabId,
      rtcConfiguration: pc.rtcConfiguration || '',
      stats,
      updateLog: events.map((e) => ({ type: e.type, value: e.value, timestamp: e.t })),
      url: pc.url || '',
    };
    if (pc.constraints) entry.constraints = pc.constraints;
    dump.PeerConnections[key] = entry;
  }

  if (includeGum) {
    const gum = [];
    await iterate(tx().objectStore('gum').index('t'), IDBKeyRange.bound(from, to), (g) => { gum.push(g); });
    gum.sort((a, b) => a.t - b.t || (a.seq || 0) - (b.seq || 0));
    for (const g of gum) {
      const e = Object.assign({ pid: g.tabId, rid: g.tabId }, g.e);
      for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
      dump.getUserMedia.push(e);
    }
  }

  dump.UserAgent = ua || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  dump.timestamp = Date.now();
  dump[META_KEY] = {
    formatVersion: FORMAT_VERSION,
    source: 'capture',
    exportedAt: iso(Date.now()),
    range: { from: iso(from), to: iso(to) },
    peerConnections: pcs.length,
  };
  return dump;
}

// ------------------------------------------------------------------ reading dumps

/**
 * For one stat object, figure out the timestamp of every value of every series.
 * Uses the "<id>-timestamp" series when its points line up, else interpolates
 * between startTime and endTime (that is all older native dumps provide).
 */
export function seriesTimes(entry, values, base) {
  const n = values.length;
  const start = parseTime(entry.startTime);
  const end = parseTime(entry.endTime);
  if (base && base.length) {
    if (base.length === n && (start === null || Math.abs(base[0] - start) < 2)) return base;
    if (start !== null && end !== null) {
      let i0 = base.findIndex((t) => t >= start - 1);
      if (i0 >= 0 && i0 + n <= base.length && Math.abs(base[i0 + n - 1] - end) < 2) return base.slice(i0, i0 + n);
    }
  }
  if (start === null) return values.map(() => null);
  if (n === 1 || end === null) return values.map((_, i) => (i === 0 ? start : end ?? start));
  const step = (end - start) / (n - 1);
  return values.map((_, i) => start + step * i);
}

/** Group a PeerConnection's "stats" object by stat id. */
export function groupStats(statsObj) {
  const groups = new Map(); // id -> { id, type, entries: Map(field -> entry) }
  for (const key of Object.keys(statsObj || {})) {
    const [id, field] = splitStatKey(key);
    let g = groups.get(id);
    if (!g) { g = { id, type: statsObj[key].statsType, entries: new Map() }; groups.set(id, g); }
    g.entries.set(field, statsObj[key]);
  }
  return groups;
}

/** Parsed, query-friendly model used by the viewer. Leaves the source dump untouched. */
export function normalizeDump(dump) {
  const model = { meta: {}, gum: [], pcs: [], start: null, end: null };
  const extend = (t) => {
    if (t === null || t === undefined || !isFinite(t)) return;
    if (model.start === null || t < model.start) model.start = t;
    if (model.end === null || t > model.end) model.end = t;
  };
  for (const k of Object.keys(dump)) if (k !== 'PeerConnections' && k !== 'getUserMedia') model.meta[k] = dump[k];

  model.gum = (Array.isArray(dump.getUserMedia) ? dump.getUserMedia : []).map((g) => {
    const t = parseTime(g.timestamp);
    extend(t);
    return Object.assign({}, g, { t });
  });

  for (const key of Object.keys(dump.PeerConnections || {})) {
    const src = dump.PeerConnections[key] || {};
    const pc = {
      key,
      url: src.url || '',
      pid: src.pid,
      rtcConfiguration: src.rtcConfiguration ?? '',
      constraints: src.constraints ?? '',
      updateLog: [],
      stats: [],
      start: null,
      end: null,
    };
    const ext = (t) => {
      if (t === null || !isFinite(t)) return;
      if (pc.start === null || t < pc.start) pc.start = t;
      if (pc.end === null || t > pc.end) pc.end = t;
      extend(t);
    };
    (Array.isArray(src.updateLog) ? src.updateLog : []).forEach((u, i) => {
      const t = parseTime(u.timestamp ?? u.time);
      ext(t);
      pc.updateLog.push({ i, type: u.type || '', value: u.value ?? '', t, timeText: u.time });
    });

    for (const g of groupStats(src.stats).values()) {
      const tsEntry = g.entries.get('timestamp');
      const base = tsEntry ? parseValues(tsEntry.values).map(Number) : null;
      const stat = { id: g.id, type: g.type, fields: [], first: null, last: null, times: null };
      for (const [field, entry] of g.entries) {
        const values = parseValues(entry.values);
        const times = field === 'timestamp' ? values.map(Number) : seriesTimes(entry, values, base);
        stat.fields.push({ name: field, values, times });
        for (const t of [times[0], times[times.length - 1]]) {
          if (t === null || t === undefined) continue;
          if (stat.first === null || t < stat.first) stat.first = t;
          if (stat.last === null || t > stat.last) stat.last = t;
        }
      }
      stat.times = base || (stat.fields[0] ? stat.fields[0].times : []);
      ext(stat.first); ext(stat.last);
      // Add derived metrics when the dump does not carry them (non-Chrome sources).
      if (!stat.fields.some((f) => f.name.startsWith('[')) && base && base.length > 1) {
        const rows = base.map((ts) => ({ timestamp: ts }));
        for (const f of stat.fields) {
          if (f.name === 'timestamp') continue;
          f.times.forEach((t, i) => {
            const j = base.indexOf(t);
            if (j >= 0) rows[j][f.name] = f.values[i];
          });
        }
        const dm = deriveMetrics(rows);
        for (const name in dm) stat.fields.push({ name, values: dm[name].map((p) => p[1]), times: dm[name].map((p) => p[0]), derived: true });
      }
      pc.stats.push(stat);
    }
    model.pcs.push(pc);
  }
  return model;
}

/** Last index with times[i] <= t (or -1). */
export function indexAt(times, t) {
  let lo = 0; let hi = times.length - 1; let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** Value of every field of a stat at time t (latest sample at or before t). */
export function statAt(stat, t) {
  const o = {};
  for (const f of stat.fields) {
    const i = t === null ? f.values.length - 1 : indexAt(f.times, t);
    if (i >= 0) o[f.name] = f.values[i];
  }
  return o;
}

/** Overall time range covered by a raw dump. */
export function dumpRange(dump) {
  const m = normalizeDump(dump);
  return { start: m.start, end: m.end, pcCount: m.pcs.length, gumCount: m.gum.length };
}

// ------------------------------------------------------------------ slicing

/**
 * Return a new dump containing only data between from and to (ms, inclusive),
 * optionally restricted to some PeerConnection keys. Every field the source
 * dump had is preserved; only out-of-range samples/events are dropped.
 */
export function sliceDump(dump, from, to, pcKeys = null) {
  const out = {};
  // Preserve the original top-level key order.
  for (const k of Object.keys(dump)) out[k] = dump[k];
  const inRange = (t) => t === null || (t >= from && t <= to);

  if ('getUserMedia' in dump) {
    out.getUserMedia = (Array.isArray(dump.getUserMedia) ? dump.getUserMedia : [])
      .filter((g) => inRange(parseTime(g.timestamp)));
  }
  if ('PeerConnections' in dump) {
    out.PeerConnections = {};
    for (const key of Object.keys(dump.PeerConnections || {})) {
      if (pcKeys && !pcKeys.includes(key)) continue;
      const src = dump.PeerConnections[key] || {};
      const pc = {};
      for (const k of Object.keys(src)) if (k !== 'stats' && k !== 'updateLog') pc[k] = src[k];
      const log = (Array.isArray(src.updateLog) ? src.updateLog : []).filter((u) => inRange(parseTime(u.timestamp ?? u.time)));
      const stats = {};
      for (const g of groupStats(src.stats).values()) {
        const tsEntry = g.entries.get('timestamp');
        const base = tsEntry ? parseValues(tsEntry.values).map(Number) : null;
        for (const [field, entry] of g.entries) {
          const values = parseValues(entry.values);
          const times = field === 'timestamp' ? values.map(Number) : seriesTimes(entry, values, base);
          const keep = [];
          const keepT = [];
          values.forEach((v, i) => {
            const t = times[i];
            if (t !== null && t >= from && t <= to) { keep.push(v); keepT.push(t); }
          });
          if (!keep.length) continue;
          stats[`${g.id}-${field}`] = Object.assign({}, entry, {
            startTime: iso(keepT[0]),
            endTime: iso(keepT[keepT.length - 1]),
            values: JSON.stringify(keep),
          });
        }
      }
      const hadStats = 'stats' in src;
      if (!log.length && !Object.keys(stats).length) continue;
      // Keep the original key order of the PeerConnection object.
      const ordered = {};
      for (const k of Object.keys(src)) {
        if (k === 'stats') { if (hadStats) ordered.stats = stats; } else if (k === 'updateLog') ordered.updateLog = log;
        else ordered[k] = pc[k];
      }
      if (!('updateLog' in ordered)) ordered.updateLog = log;
      if (!('stats' in ordered)) ordered.stats = stats;
      out.PeerConnections[key] = ordered;
    }
  }
  const prevMeta = dump[META_KEY] && typeof dump[META_KEY] === 'object' ? dump[META_KEY] : {};
  out[META_KEY] = Object.assign({}, prevMeta, {
    formatVersion: FORMAT_VERSION,
    source: prevMeta.source || 'import',
    exportedAt: iso(Date.now()),
    range: { from: iso(from), to: iso(to) },
  });
  return out;
}

// ------------------------------------------------------------------ files

export function exportFileName(prefix, from, to, gz) {
  const f = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z').replace(/[:]/g, '-');
  return `${prefix}_${f(from)}_to_${f(to)}.${gz ? 'json.gz' : 'json'}`;
}

/** Trigger a browser download for text (optionally gzip it). */
export async function downloadText(text, filename, { gz = false } = {}) {
  const data = gz ? await gzip(text) : text;
  const blob = new Blob([data], { type: gz ? 'application/gzip' : 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
