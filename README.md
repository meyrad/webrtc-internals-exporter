# WebRTC Internals Exporter

Chrome extension (Manifest V3) that records WebRTC activity in real pages, exports a native `chrome://webrtc-internals` dump for any time range, imports dumps from Chrome or this extension, and opens them in a viewer that matches the native internals UI — including a time scrubber.

**Chrome 111+** · **MV3** · no network: data stays in IndexedDB on the machine.

Repository: [meyrad/webrtc-internals-exporter](https://github.com/meyrad/webrtc-internals-exporter)

## Features

- **Record** every `RTCPeerConnection`, `getUserMedia`, and `getDisplayMedia` after a page loads (all frames).
- **Export** a webrtc-internals dump for a preset window (last 5 / 15 / 60 minutes, or all data) or an exact From/To range. Filter peer connections, include or omit getUserMedia, gzip optional.
- **Import** `.json`, `.txt`, or `.gz` files from this extension **or** from `chrome://webrtc-internals` (plain or gzip).
- **Viewer** uses Chrome’s webrtc-internals layout: ICE / connection / signaling history, candidate grid, event log with SDP sections, stats tables and graphs, derived bit-rate style metrics.
- **Time scrubber** (“State at”) jumps the whole dump to any moment; later events dim; graphs show a cursor. Click an event time or a graph point to jump. `Alt`+←/→ steps one second.
- **Library** of imported archives: open, download, or delete.
- **Retention** (default 3 hours) and `getStats()` interval (default 1 s, same as webrtc-internals). TURN `credential` values are redacted before storage.

## Install (unpacked)

1. Open `chrome://extensions` and enable **Developer mode**.
2. **Load unpacked** and choose this folder (the one that contains `manifest.json`).
3. Reload tabs that were already open. Recording starts when a page creates its first `RTCPeerConnection`.

There is no Chrome Web Store package in this repo yet. Load unpacked is the intended install path.

## Usage

Click the toolbar icon. The popup shows recording status and links to every page.

| Page | What it does |
| --- | --- |
| **Export** | Preset or exact time range, peer-connection filter, getUserMedia, gzip. **Download export** or **Open in viewer**. |
| **Import** | Drop or pick `.json` / `.txt` / `.gz`. A single file opens in the viewer immediately. |
| **Imported data** | Stored archives: open, download, delete. |
| **Settings** | Pause/resume recording, stats interval, retention, clear recorded data. Toolbar badge shows `OFF` when paused. |

### Viewer extras

- Hover a graph for exact values.
- **Create a WebRTC-Internals dump** from the current archive (whole or a sub-range, compressed or not), or download the original imported file unchanged.

## Project layout

```
manifest.json          MV3 manifest
background.js          Service worker: persist batches, retention, badge
content/inject.js      MAIN-world hooks (RTCPeerConnection, gUM, getStats)
content/bridge.js      Isolated-world bridge: batch to the service worker
lib/db.js              IndexedDB: live capture (`wie-capture`) and imports (`wie-imports`)
lib/dump.js            Native dump build/parse, slice, gzip, derived stats
popup/                 Toolbar popup
app/                   Export / import / library / settings UI
viewer/                webrtc-internals-style viewer + time scrubber
icons/                 Toolbar / store icons (16, 32, 48, 128)
```

## File format

Exports match Chrome’s webrtc-internals dump JSON:

```
{
  getUserMedia: [...],
  PeerConnections: {
    "<tab>-<n>": {
      pid, url, rtcConfiguration, constraints,
      updateLog: [{ type, value, timestamp }],
      stats: { "<statId>-<field>": { startTime, endTime, statsType, values } }
    }
  },
  UserAgent,
  timestamp,
  webrtcInternalsExporter: { formatVersion, source, exportedAt, range }
}
```

Because the shape is the same, files open in other webrtc-internals dump tools. Imports are stored byte-for-byte; slicing only drops samples and events outside the range. Key order and other fields are kept.

The **rtcstats dump** format from webrtc-internals is not supported. Use **Download the webrtc-internals dump**.

## How it works

Chrome extensions cannot read `chrome://` pages, so this does not scrape `chrome://webrtc-internals`. It collects the same kind of data from inside each page:

1. `content/inject.js` runs at `document_start` in the MAIN world on all frames. It wraps `RTCPeerConnection` (constructor, offer/answer, descriptions, ICE, tracks/transceivers, data channels, close) and related events, plus `getUserMedia` / `getDisplayMedia`, and polls `getStats()` at the configured interval. Full stats snapshots every 30 samples; deltas in between.
2. `content/bridge.js` batches those events to the service worker about once per second.
3. `background.js` writes IndexedDB (`wie-capture`) and trims data older than the retention window (alarm every 5 minutes).
4. `lib/dump.js` rebuilds full snapshots, writes native-format series, computes Chrome-style derived metrics, and handles slice / gzip / parse.

Imported archives live in a separate database (`wie-imports`) and never mix with live recordings. Nothing is sent over the network.

## Privacy

- Host permission `<all_urls>` is required so the content scripts can hook WebRTC on every origin.
- Capture stays on-device (IndexedDB + `chrome.storage.local`).
- TURN credentials in `rtcConfiguration` are redacted before write.
- Page scripts can see the in-page hooks, the same way any `RTCPeerConnection` shim is visible.

## Limitations

- Only pages loaded (or reloaded) after the extension is installed (or after recording is turned back on) are captured.
- Connections created inside Web Workers are not recorded.
- Recordings include standard `getStats()` fields visible to web pages. A few Chrome-internal fields that only the native page shows are missing (for example legacy `track.*` stats, `networkAdapterType`, `vpn`, `jitterBufferFlushes`). Native dumps you import keep those fields.
- The in-page hooks are visible to page scripts.

## License

Use and modify as you need unless a `LICENSE` file is added later.
