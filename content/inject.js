// Runs in the page's MAIN world at document_start.
// Instruments RTCPeerConnection and getUserMedia/getDisplayMedia the same way
// chrome://webrtc-internals observes them, and polls getStats() on an interval.
// Data is handed to the isolated-world bridge (bridge.js) via CustomEvents.
(() => {
  'use strict';
  const FLAG = Symbol.for('webrtc-internals-exporter');
  if (window[FLAG]) return;
  Object.defineProperty(window, FLAG, { value: true });

  const EVT_OUT = '__wie_out__';
  const EVT_CFG = '__wie_cfg__';
  const EVT_HELLO = '__wie_hello__';
  const MAX_BUFFER = 5000;
  const KEYFRAME_EVERY = 30; // full stats snapshot every N samples, deltas in between

  let cfg = { enabled: true, interval: 1000 };
  let ready = false;
  let buffer = [];
  const nonce = Math.random().toString(36).slice(2, 10);
  let seq = 0;

  const now = () => performance.timeOrigin + performance.now();
  let schedulePoll = () => {}; // replaced once RTCPeerConnection is instrumented

  function dispatch(json) {
    window.dispatchEvent(new CustomEvent(EVT_OUT, { detail: json }));
  }

  function emit(item) {
    item.nonce = nonce;
    item.seq = ++seq;
    let json;
    try { json = JSON.stringify(item); } catch (e) { return; }
    if (ready) {
      if (cfg.enabled) dispatch(json);
    } else if (buffer.length < MAX_BUFFER) {
      buffer.push(json);
    }
  }

  window.addEventListener(EVT_CFG, (e) => {
    try {
      const c = JSON.parse(e.detail);
      const wasEnabled = cfg.enabled;
      cfg = { enabled: !!c.enabled, interval: Math.max(250, Number(c.interval) || 1000) };
      if (!ready) {
        ready = true;
        const b = buffer; buffer = [];
        if (cfg.enabled) b.forEach(dispatch);
      }
      if (cfg.enabled) schedulePoll();
    } catch (_) { /* ignore malformed */ }
  });
  window.dispatchEvent(new CustomEvent(EVT_HELLO));

  const safeJSON = (v) => {
    if (v === undefined) return '';
    try { return JSON.stringify(v); } catch (_) { return String(v); }
  };

  function sanitizeConfig(config) {
    if (!config || typeof config !== 'object') return config;
    const out = {};
    for (const k in config) {
      if (k === 'certificates') continue;
      out[k] = config[k];
    }
    if (Array.isArray(out.iceServers)) {
      // Never record TURN credentials.
      out.iceServers = out.iceServers.map((s) => {
        const c = Object.assign({}, s);
        if ('credential' in c) c.credential = '[redacted]';
        return c;
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- peer connections
  const NativePC = window.RTCPeerConnection;
  const meta = new WeakMap();
  const live = new Set();
  let pcCounter = 0;

  function log(pc, type, value, t) {
    const m = meta.get(pc);
    if (!m) return;
    emit({ k: 'ev', lid: m.lid, t: t ?? now(), type, value: value ?? '' });
  }

  function candidateJSON(c) {
    if (!c) return '';
    const o = { sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex, candidate: c.candidate };
    if (c.usernameFragment) o.usernameFragment = c.usernameFragment;
    return JSON.stringify(o);
  }

  function descJSON(d) {
    if (!d) return '';
    return JSON.stringify({ type: d.type, sdp: d.sdp });
  }

  function transceiverJSON(pc, m, tr, index, reason) {
    let encodings = [];
    try { encodings = (tr.sender.getParameters().encodings || []).map((e) => Object.assign({}, e)); } catch (_) {}
    const o = {
      mid: tr.mid,
      kind: tr.receiver && tr.receiver.track ? tr.receiver.track.kind : null,
      sender: {
        track: tr.sender && tr.sender.track ? tr.sender.track.id : null,
        streams: m.senderStreams.get(tr.sender) || [],
        encodings,
      },
      receiver: {
        track: tr.receiver && tr.receiver.track ? tr.receiver.track.id : null,
        streams: m.receiverStreams.get(tr.receiver) || [],
      },
      direction: tr.direction,
      currentDirection: tr.currentDirection,
    };
    if (reason) o.reason = reason;
    o.transceiverIndex = index;
    return o;
  }

  function diffTransceivers(pc, reason) {
    const m = meta.get(pc);
    if (!m) return;
    let list;
    try { list = pc.getTransceivers(); } catch (_) { return; }
    list.forEach((tr, i) => {
      const prev = m.transceivers.get(tr);
      if (prev === undefined) {
        const o = transceiverJSON(pc, m, tr, i, reason);
        const s = JSON.stringify(o);
        m.transceivers.set(tr, JSON.stringify(transceiverJSON(pc, m, tr, i)));
        log(pc, 'transceiverAdded', s);
      } else {
        const cur = JSON.stringify(transceiverJSON(pc, m, tr, i));
        if (cur !== prev) {
          m.transceivers.set(tr, cur);
          log(pc, 'transceiverModified', cur);
        }
      }
    });
  }

  function register(pc, config, constraints) {
    const lid = ++pcCounter;
    meta.set(pc, {
      lid,
      prev: null,
      samples: 0,
      transceivers: new Map(),
      senderStreams: new WeakMap(),
      receiverStreams: new WeakMap(),
    });
    emit({
      k: 'pc',
      lid,
      t: now(),
      url: location.href,
      origin: location.origin,
      rtcConfiguration: safeJSON(sanitizeConfig(config) || {}),
      constraints: constraints === undefined ? '' : safeJSON(constraints),
      ua: navigator.userAgent,
    });

    pc.addEventListener('icecandidate', (e) => { if (e.candidate) log(pc, 'onicecandidate', candidateJSON(e.candidate)); });
    pc.addEventListener('icecandidateerror', (e) => log(pc, 'onicecandidateerror', JSON.stringify({
      address: e.address, port: e.port, url: e.url, errorCode: e.errorCode, errorText: e.errorText,
    })));
    pc.addEventListener('signalingstatechange', () => log(pc, 'onsignalingstatechange', JSON.stringify(pc.signalingState)));
    pc.addEventListener('icegatheringstatechange', () => log(pc, 'onicegatheringstatechange', JSON.stringify(pc.iceGatheringState)));
    pc.addEventListener('iceconnectionstatechange', () => log(pc, 'oniceconnectionstatechange', JSON.stringify(pc.iceConnectionState)));
    pc.addEventListener('connectionstatechange', () => log(pc, 'onconnectionstatechange', JSON.stringify(pc.connectionState)));
    pc.addEventListener('negotiationneeded', () => log(pc, 'onnegotiationneeded', ''));
    pc.addEventListener('track', (e) => {
      const m = meta.get(pc);
      if (m && e.receiver) m.receiverStreams.set(e.receiver, (e.streams || []).map((s) => s.id));
      log(pc, 'ontrack', JSON.stringify({
        track: e.track ? { id: e.track.id, kind: e.track.kind, label: e.track.label } : null,
        streams: (e.streams || []).map((s) => s.id),
        mid: e.transceiver ? e.transceiver.mid : null,
      }));
    });
    pc.addEventListener('datachannel', (e) => log(pc, 'ondatachannel', JSON.stringify({
      label: e.channel.label, ordered: e.channel.ordered, protocol: e.channel.protocol || undefined, id: e.channel.id,
    })));

    live.add(pc);
    schedulePoll();
  }

  if (NativePC) {
    const P = NativePC.prototype;
    const origGetStats = P.getStats;

    const PCProxy = new Proxy(NativePC, {
      construct(target, args, newTarget) {
        const pc = Reflect.construct(target, args, newTarget);
        try { register(pc, args[0], args[1]); } catch (_) { /* never break the page */ }
        return pc;
      },
    });
    for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection']) {
      const d = Object.getOwnPropertyDescriptor(window, name);
      if (d && d.value === NativePC) Object.defineProperty(window, name, Object.assign({}, d, { value: PCProxy }));
    }
    try { Object.defineProperty(P, 'constructor', { value: PCProxy, writable: true, configurable: true }); } catch (_) {}

    // Promise-returning methods. Supports legacy callback signatures too.
    function hookAsync(name, hooks) {
      const orig = P[name];
      if (typeof orig !== 'function') return;
      const wrapped = {
        [name](...args) {
          if (!meta.has(this) || !cfg.enabled) return orig.apply(this, args);
          let ok = null; let fail = null; let callArgs = args;
          if (name === 'createOffer' || name === 'createAnswer') {
            if (typeof args[0] === 'function') { ok = args[0]; fail = args[1]; callArgs = args.length > 2 ? [args[2]] : []; }
          } else if (typeof args[1] === 'function' || typeof args[2] === 'function') {
            ok = args[1]; fail = args[2]; callArgs = [args[0]];
          }
          const t0 = now();
          const pc = this;
          try { hooks.before && hooks.before(pc, callArgs, t0); } catch (_) {}
          let p;
          try {
            p = orig.apply(pc, callArgs);
          } catch (err) {
            log(pc, `${name}OnFailure`, String(err));
            throw err;
          }
          const tracked = Promise.resolve(p).then((res) => {
            try { hooks.success && hooks.success(pc, res, callArgs, t0); } catch (_) {}
            return res;
          }, (err) => {
            try { hooks.failure && hooks.failure(pc, callArgs, t0); } catch (_) {}
            log(pc, `${name}OnFailure`, String(err));
            throw err;
          });
          if (ok || fail) {
            return tracked.then((r) => { if (ok) ok(r); }, (e) => { if (fail) fail(e); });
          }
          return tracked;
        },
      }[name];
      P[name] = wrapped;
    }

    for (const name of ['createOffer', 'createAnswer']) {
      hookAsync(name, {
        before: (pc, a) => log(pc, name, safeJSON(a[0] || {})),
        success: (pc, res) => log(pc, `${name}OnSuccess`, descJSON(res)),
      });
    }
    for (const [name, which] of [['setLocalDescription', 'localDescription'], ['setRemoteDescription', 'remoteDescription']]) {
      hookAsync(name, {
        before: (pc, a, t0) => { if (a[0] && a[0].sdp) log(pc, name, descJSON(a[0]), t0); },
        success: (pc, res, a, t0) => {
          if (!(a[0] && a[0].sdp)) log(pc, name, descJSON(pc[which]), t0); // implicit description
          log(pc, `${name}OnSuccess`, '');
          diffTransceivers(pc, name);
        },
        failure: (pc, a, t0) => { if (!(a[0] && a[0].sdp)) log(pc, name, safeJSON(a[0] || {}), t0); },
      });
    }
    hookAsync('addIceCandidate', {
      before: (pc, a) => log(pc, 'addIceCandidate', a[0] ? candidateJSON(a[0]) : ''),
      success: (pc) => log(pc, 'addIceCandidateOnSuccess', ''),
    });

    function hookSync(name, fn) {
      const orig = P[name];
      if (typeof orig !== 'function') return;
      P[name] = {
        [name](...args) {
          if (!meta.has(this) || !cfg.enabled) return orig.apply(this, args);
          return fn.call(this, orig, args);
        },
      }[name];
    }

    hookSync('addTrack', function (orig, args) {
      const sender = orig.apply(this, args);
      try {
        meta.get(this).senderStreams.set(sender, args.slice(1).filter(Boolean).map((s) => s.id));
        diffTransceivers(this, 'addTrack');
      } catch (_) {}
      return sender;
    });
    hookSync('addTransceiver', function (orig, args) {
      const tr = orig.apply(this, args);
      try {
        const init = args[1];
        if (init && init.streams) meta.get(this).senderStreams.set(tr.sender, init.streams.map((s) => s.id));
        diffTransceivers(this, 'addTransceiver');
      } catch (_) {}
      return tr;
    });
    hookSync('removeTrack', function (orig, args) {
      const r = orig.apply(this, args);
      diffTransceivers(this, 'removeTrack');
      return r;
    });
    hookSync('createDataChannel', function (orig, args) {
      log(this, 'createDataChannel', safeJSON(Object.assign({ label: args[0] }, args[1] || {})));
      return orig.apply(this, args);
    });
    hookSync('setConfiguration', function (orig, args) {
      log(this, 'setConfiguration', safeJSON(sanitizeConfig(args[0])));
      return orig.apply(this, args);
    });
    hookSync('restartIce', function (orig, args) {
      log(this, 'restartIce', '');
      return orig.apply(this, args);
    });
    hookSync('close', function (orig, args) {
      const pc = this;
      log(pc, 'close', '');
      // Take one last stats sample before the connection is torn down.
      pollOne(pc, true);
      return orig.apply(pc, args);
    });

    // ------------------------------------------------------------ getStats polling
    function deltaOf(prev, cur) {
      const out = {};
      for (const id in cur) {
        const c = cur[id];
        const p = prev[id];
        if (!p) { out[id] = c; continue; }
        const d = {};
        for (const k in c) {
          const a = c[k]; const b = p[k];
          if (a === b) continue;
          if (a && typeof a === 'object' && JSON.stringify(a) === JSON.stringify(b)) continue;
          d[k] = a;
        }
        out[id] = d;
      }
      return out;
    }

    function pollOne(pc, final) {
      const m = meta.get(pc);
      if (!m) return Promise.resolve();
      let p;
      try { p = origGetStats.call(pc); } catch (_) { live.delete(pc); return Promise.resolve(); }
      return Promise.resolve(p).then((report) => {
        const cur = {};
        report.forEach((s) => { cur[s.id] = Object.assign({}, s); });
        const key = !m.prev || m.samples % KEYFRAME_EVERY === 0;
        emit({ k: 'st', lid: m.lid, t: now(), kf: key ? 1 : 0, r: key ? cur : deltaOf(m.prev, cur) });
        m.prev = cur;
        m.samples++;
        if (final || pc.signalingState === 'closed') live.delete(pc);
      }, () => {
        if (pc.signalingState === 'closed') live.delete(pc);
      });
    }

    let timer = null;
    let running = false;
    function schedulePollImpl() {
      if (!ready || timer || running || !cfg.enabled || !live.size) return;
      timer = setTimeout(tick, cfg.interval);
    }
    async function tick() {
      timer = null;
      if (!cfg.enabled) return;
      running = true;
      try { await Promise.all([...live].map((pc) => pollOne(pc, false))); } finally { running = false; }
      schedulePollImpl();
    }
    schedulePoll = schedulePollImpl;
  }

  // ---------------------------------------------------------------- getUserMedia
  let gumCounter = 0;
  function constraintString(c) {
    if (c === undefined || c === false) return undefined;
    if (c === true) return '';
    return safeJSON(c);
  }
  function trackInfo(t) { return t ? JSON.stringify({ id: t.id, label: t.label }) : undefined; }

  function hookMedia(proto, name) {
    if (!proto) return;
    const orig = proto[name];
    if (typeof orig !== 'function') return;
    proto[name] = {
      [name](...args) {
        if (!cfg.enabled) return orig.apply(this, args);
        const request_id = gumCounter++;
        const c = args[0] || (name === 'getDisplayMedia' ? { video: true } : {});
        emit({
          k: 'gum', t: now(),
          e: {
            request_id, request_type: name, origin: location.origin, url: location.href,
            audio: constraintString(c.audio), video: constraintString(c.video), timestamp: now(),
          },
        });
        return orig.apply(this, args).then((stream) => {
          emit({
            k: 'gum', t: now(),
            e: {
              request_id, request_type: name, stream_id: stream.id,
              audio_track_info: trackInfo(stream.getAudioTracks()[0]),
              video_track_info: trackInfo(stream.getVideoTracks()[0]),
              timestamp: now(),
            },
          });
          return stream;
        }, (err) => {
          emit({
            k: 'gum', t: now(),
            e: { request_id, request_type: name, error: err && err.name, error_message: err && err.message, timestamp: now() },
          });
          throw err;
        });
      },
    }[name];
  }
  if (window.MediaDevices) {
    hookMedia(MediaDevices.prototype, 'getUserMedia');
    hookMedia(MediaDevices.prototype, 'getDisplayMedia');
  }
})();
