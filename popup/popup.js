import { captureSummary, DEFAULT_SETTINGS } from '../lib/db.js';

const $ = (id) => document.getElementById(id);
const openApp = (hash) => { chrome.tabs.create({ url: chrome.runtime.getURL(`app/app.html#${hash}`) }); window.close(); };

function dur(ms) {
  if (!isFinite(ms) || ms <= 0) return '0s';
  const m = Math.round(ms / 60000);
  if (m < 1) return `${Math.round(ms / 1000)}s`;
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

async function render() {
  const { recording } = await chrome.storage.local.get(DEFAULT_SETTINGS);
  $('rec').checked = recording;
  $('rec-label').textContent = recording ? 'Recording' : 'Paused';
  $('rec-sub').textContent = recording ? 'Capturing WebRTC activity in all tabs' : 'Not capturing new data';
  document.querySelector('.rec').classList.toggle('on', recording);
  try {
    const s = await captureSummary();
    const now = Date.now();
    $('active').textContent = s.pcs.filter((p) => !p.closed && now - p.lastSeen < 10000).length;
    $('total').textContent = s.pcs.length;
    $('span').textContent = s.start ? dur(s.end - s.start) : '0s';
  } catch (_) { /* database not created yet */ }
}

$('rec').onchange = (e) => chrome.storage.local.set({ recording: e.target.checked }).then(render);
document.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => openApp(b.dataset.open); });
$('settings').onclick = (e) => { e.preventDefault(); openApp('settings'); };
$('native').onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: 'chrome://webrtc-internals' }); window.close(); };

render();
setInterval(render, 2000);
