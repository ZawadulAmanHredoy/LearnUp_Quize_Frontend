import { API_URL } from './config';

/**
 * Local copies of the audio-visual clips, kept in IndexedDB.
 *
 * The admin's browser downloads every clip right after login, and each
 * projector does the same when it connects. Tabs on the same browser share
 * the database, so a projector tab next to the admin tab finds the clips
 * already there. Playback then uses the local copy: nothing streams over the
 * network during the round, so nothing can buffer.
 *
 * IndexedDB (unlike the Cache API) also works over plain http on a venue LAN.
 */

const DB_NAME = 'learnup-media';
const STORE = 'clips';
const CONCURRENT_DOWNLOADS = 2;

let dbPromise = null;
const listeners = new Set();
let status = { items: {}, ready: 0, total: 0, bytesDone: 0, bytesTotal: 0, running: false };
let currentRun = null;
let pendingRun = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available in this browser'));
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(result?.result ?? result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function getClip(id) {
  try {
    const record = await withStore('readonly', (store) => store.get(id));
    return record || null;
  } catch (err) {
    return null;
  }
}

async function listClipIds() {
  try {
    return (await withStore('readonly', (store) => store.getAllKeys())) || [];
  } catch (err) {
    return [];
  }
}

export function mediaUrlFor(itemOrId) {
  const url = typeof itemOrId === 'string' ? `/media/${itemOrId}` : itemOrId.url;
  return /^https?:/i.test(url) ? url : `${API_URL}${url}`;
}

function emit() {
  const snapshot = getMediaStatus();
  listeners.forEach((listener) => listener(snapshot));
}

export function getMediaStatus() {
  return { ...status, items: { ...status.items } };
}

/**
 * Subscribe to download progress. Returns an unsubscribe function.
 */
export function subscribeMediaStatus(listener) {
  listeners.add(listener);
  listener(getMediaStatus());
  return () => listeners.delete(listener);
}

function recount(manifestItems, bytesInFlight = {}) {
  let ready = 0;
  let bytesDone = 0;
  for (const item of manifestItems) {
    if (status.items[item.id] === 'ready') {
      ready += 1;
      bytesDone += item.size;
    } else {
      bytesDone += bytesInFlight[item.id] || 0;
    }
  }
  status = { ...status, ready, bytesDone };
}

/**
 * Fetch one clip in full and store it, reporting bytes as they arrive
 */
async function downloadClip(item, onBytes) {
  const res = await fetch(mediaUrlFor(item), { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  let blob;
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onBytes(received);
    }
    blob = new Blob(chunks, { type: item.contentType });
  } else {
    blob = await res.blob();
  }

  if (blob.size !== item.size) throw new Error('Incomplete download');
  await withStore('readwrite', (store) =>
    store.put({ id: item.id, blob, size: blob.size, contentType: item.contentType, savedAt: Date.now() })
  );
}

/**
 * Run a download only once across tabs of this browser (when the browser
 * supports Web Locks); the second tab then finds the clip already stored.
 */
async function withClipLock(id, fn) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(`learnup-clip-${id}`, fn);
  }
  return fn();
}

async function runPreload(manifest, { force = false } = {}) {
  const items = manifest?.items || [];
  const wanted = new Set(items.map((item) => item.id));

  // Ask the browser not to evict the clips under storage pressure
  navigator.storage?.persist?.().catch(() => {});

  if (force) {
    await withStore('readwrite', (store) => store.clear()).catch(() => {});
  } else {
    // Drop clips no question uses any more
    const stored = await listClipIds();
    const stale = stored.filter((id) => !wanted.has(id));
    if (stale.length > 0) {
      await withStore('readwrite', (store) => stale.forEach((id) => store.delete(id))).catch(() => {});
    }
  }

  status = {
    items: Object.fromEntries(items.map((item) => [item.id, 'pending'])),
    ready: 0,
    total: items.length,
    bytesDone: 0,
    bytesTotal: items.reduce((sum, item) => sum + item.size, 0),
    running: true
  };

  for (const item of items) {
    const existing = await getClip(item.id);
    if (existing && existing.size === item.size) status.items[item.id] = 'ready';
  }
  recount(items);
  emit();

  const queue = items.filter((item) => status.items[item.id] !== 'ready');
  const inFlight = {};
  let lastEmit = 0;

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      status.items[item.id] = 'downloading';
      emit();
      try {
        await withClipLock(item.id, async () => {
          const existing = await getClip(item.id);
          if (existing && existing.size === item.size) return;
          await downloadClip(item, (bytes) => {
            inFlight[item.id] = bytes;
            if (Date.now() - lastEmit > 250) {
              lastEmit = Date.now();
              recount(items, inFlight);
              emit();
            }
          });
        });
        status.items[item.id] = 'ready';
      } catch (err) {
        console.warn(`[Media] Could not download ${item.originalName}:`, err.message);
        status.items[item.id] = 'error';
      }
      delete inFlight[item.id];
      recount(items, inFlight);
      emit();
    }
  }

  await Promise.all(Array.from({ length: CONCURRENT_DOWNLOADS }, worker));
  status = { ...status, running: false };
  recount(items);
  emit();
  return getMediaStatus();
}

/**
 * Download every clip in the manifest that isn't stored yet. Calls made
 * while a run is in progress are merged into one follow-up run.
 */
export function preloadMedia(manifest, options = {}) {
  if (currentRun) {
    pendingRun = { manifest, options: { force: Boolean(options.force || pendingRun?.options.force) } };
    return currentRun;
  }
  currentRun = runPreload(manifest, options)
    .catch((err) => {
      console.warn('[Media] Preload failed:', err.message);
      status = { ...status, running: false };
      emit();
    })
    .finally(() => {
      currentRun = null;
      if (pendingRun) {
        const next = pendingRun;
        pendingRun = null;
        preloadMedia(next.manifest, next.options);
      }
    });
  return currentRun;
}

/**
 * URL to play a clip from: the local copy when stored (an object URL the
 * caller must revoke), otherwise the server URL as a fallback.
 */
export async function getPlayableUrl(mediaId) {
  const record = await getClip(mediaId);
  if (record?.blob) {
    return { url: URL.createObjectURL(record.blob), isLocal: true };
  }
  return { url: mediaUrlFor(mediaId), isLocal: false };
}
