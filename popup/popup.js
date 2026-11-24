import { captureSummary, DEFAULT_SETTINGS } from '../lib/db.js';
import { initI18n, t, num } from '../lib/i18n.js';

const $ = (id) => document.getElementById(id);
const openApp = (hash) => { chrome.tabs.create({ url: chrome.runtime.getURL(`app/app.html#${hash}`) }); window.close(); };

function dur(ms) {
  if (!isFinite(ms) || ms <= 0) return `${num(0)}${t('unit.s')}`;
  const m = Math.round(ms / 60000);
  if (m < 1) return `${num(Math.round(ms / 1000))} ${t('unit.s')}`;
  return m < 60 ? `${num(m)} ${t('unit.m')}` : `${num(Math.floor(m / 60))} ${t('unit.h')} ${num(m % 60)} ${t('unit.m')}`;
}

let recording = false;

async function render() {
  ({ recording } = await chrome.storage.local.get(DEFAULT_SETTINGS));
  $('rec-label').textContent = recording ? t('rec.on') : t('rec.off');
  $('rec-sub').textContent = recording ? t('rec.subOn') : t('rec.subOff');
  $('rec-btn').textContent = recording ? t('rec.stop') : t('rec.start');
  document.querySelector('.rec').classList.toggle('on', recording);
  try {
    const s = await captureSummary();
    const now = Date.now();
    $('active').textContent = num(s.pcs.filter((p) => !p.closed && now - p.lastSeen < 10000).length);
    $('total').textContent = num(s.pcs.length);
    $('span').textContent = s.start ? dur(s.end - s.start) : dur(0);
  } catch (_) { /* database not created yet */ }
}

// Recording only ever starts from an explicit click.
$('rec-btn').onclick = () => chrome.storage.local.set({ recording: !recording }).then(render);
document.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => openApp(b.dataset.open); });
$('settings').onclick = (e) => { e.preventDefault(); openApp('settings'); };
$('native').onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: 'chrome://webrtc-internals' }); window.close(); };

initI18n().then(render);
setInterval(render, 2000);
