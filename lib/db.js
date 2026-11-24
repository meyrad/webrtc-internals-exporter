// IndexedDB helpers shared by the service worker and extension pages.
// Two databases keep live captures and imported archives strictly separate.

export const CAPTURE_DB = 'wie-capture';
export const IMPORT_DB = 'wie-imports';

export function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

function open(name, version, upgrade) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = (e) => upgrade(req.result, e.oldVersion, req.transaction);
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error(`Database ${name} is blocked by another open connection`));
  });
}

let captureP = null;
export function openCapture() {
  if (!captureP) {
    captureP = open(CAPTURE_DB, 1, (db) => {
      const pcs = db.createObjectStore('pcs', { keyPath: 'id' });
      pcs.createIndex('lastSeen', 'lastSeen');
      for (const name of ['events', 'stats']) {
        const s = db.createObjectStore(name, { autoIncrement: true });
        s.createIndex('t', 't');
        s.createIndex('pc_t', ['pc', 't']);
      }
      const gum = db.createObjectStore('gum', { autoIncrement: true });
      gum.createIndex('t', 't');
    }).catch((e) => { captureP = null; throw e; });
  }
  return captureP;
}

let importP = null;
export function openImports() {
  if (!importP) {
    importP = open(IMPORT_DB, 1, (db) => {
      // Metadata and the (potentially large) raw text are kept apart so listing stays cheap.
      const s = db.createObjectStore('dumps', { keyPath: 'id', autoIncrement: true });
      s.createIndex('importedAt', 'importedAt');
      db.createObjectStore('texts', { keyPath: 'id' });
    }).catch((e) => { importP = null; throw e; });
  }
  return importP;
}

/** Iterate a cursor; callback may return false to stop. */
export function iterate(source, range, cb, direction = 'next') {
  return new Promise((resolve, reject) => {
    const req = source.openCursor(range, direction);
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return resolve();
      if (cb(c.value, c) === false) return resolve();
      c.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

/** Delete every record with t < cutoff in the given stores. */
export async function trimBefore(db, stores, cutoff) {
  const tx = db.transaction(stores, 'readwrite');
  for (const name of stores) {
    const idx = tx.objectStore(name).index('t');
    const req = idx.openKeyCursor(IDBKeyRange.upperBound(cutoff, true));
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      tx.objectStore(name).delete(c.primaryKey);
      c.continue();
    };
  }
  return txDone(tx);
}

/** Summary of what is currently captured (for popup / export page). */
export async function captureSummary() {
  const db = await openCapture();
  const tx = db.transaction(['pcs', 'events', 'stats', 'gum'], 'readonly');
  const pcs = await reqP(tx.objectStore('pcs').getAll());
  const counts = {
    events: await reqP(tx.objectStore('events').count()),
    stats: await reqP(tx.objectStore('stats').count()),
    gum: await reqP(tx.objectStore('gum').count()),
  };
  const first = async (store, dir) => {
    const c = await reqP(tx.objectStore(store).index('t').openCursor(null, dir));
    return c ? c.value.t : null;
  };
  const times = [await first('events', 'next'), await first('stats', 'next'), await first('gum', 'next'),
    await first('events', 'prev'), await first('stats', 'prev'), await first('gum', 'prev')].filter((x) => x != null);
  pcs.sort((a, b) => a.created - b.created);
  return {
    pcs,
    counts,
    start: times.length ? Math.min(...times) : null,
    end: times.length ? Math.max(...times) : null,
  };
}

export async function clearCapture() {
  const db = await openCapture();
  const tx = db.transaction(['pcs', 'events', 'stats', 'gum'], 'readwrite');
  for (const s of ['pcs', 'events', 'stats', 'gum']) tx.objectStore(s).clear();
  return txDone(tx);
}

export const DEFAULT_SETTINGS = Object.freeze({
  recording: true,
  pollInterval: 1000,
  retentionMinutes: 180,
});

/** Store an imported/exported dump. Returns the new id. */
export async function saveImport({ name, text, source, summary }) {
  const db = await openImports();
  const tx = db.transaction(['dumps', 'texts'], 'readwrite');
  const id = await reqP(tx.objectStore('dumps').add(Object.assign({
    name, source, size: text.length, importedAt: Date.now(),
  }, summary || {})));
  tx.objectStore('texts').put({ id, text });
  await txDone(tx);
  return id;
}

export async function loadImport(id) {
  const db = await openImports();
  const tx = db.transaction(['dumps', 'texts'], 'readonly');
  const meta = await reqP(tx.objectStore('dumps').get(id));
  const t = await reqP(tx.objectStore('texts').get(id));
  return meta && t ? Object.assign({}, meta, { text: t.text }) : null;
}

export async function listImports() {
  const db = await openImports();
  const all = await reqP(db.transaction('dumps').objectStore('dumps').getAll());
  return all.sort((a, b) => b.importedAt - a.importedAt);
}

export async function deleteImport(id) {
  const db = await openImports();
  const tx = db.transaction(['dumps', 'texts'], 'readwrite');
  tx.objectStore('dumps').delete(id);
  tx.objectStore('texts').delete(id);
  return txDone(tx);
}
