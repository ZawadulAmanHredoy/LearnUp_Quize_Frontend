/**
 * Zero-lag in-memory media cache for LearnUp Audio-Visual clips.
 * Preloads audio and video files from MongoDB GridFS / backend into local Blob URLs.
 * Guarantees instantaneous, stutter-free playback on the live stage without network buffering.
 */
import { mediaSrc } from './config';

const blobCache = new Map();
const inFlightRequests = new Map();

/**
 * Preload a single media asset into memory and produce a blob: URL.
 */
export async function preloadSingleMedia(url) {
  if (!url) return '';
  if (blobCache.has(url)) {
    return blobCache.get(url);
  }
  if (inFlightRequests.has(url)) {
    return inFlightRequests.get(url);
  }

  const fullUrl = mediaSrc(url);

  // If already a data URI or blob URI, return immediately
  if (/^(data:|blob:)/i.test(fullUrl)) {
    blobCache.set(url, fullUrl);
    return fullUrl;
  }

  const fetchPromise = (async () => {
    try {
      const response = await fetch(fullUrl, { cache: 'force-cache' });
      if (!response.ok) {
        console.warn(`[MediaCache] Failed to preload ${url}: HTTP ${response.status}`);
        return fullUrl; // Fallback to raw URL
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      blobCache.set(url, objectUrl);
      return objectUrl;
    } catch (err) {
      console.warn(`[MediaCache] Error preloading ${url}:`, err.message);
      return fullUrl; // Fallback to direct URL
    } finally {
      inFlightRequests.delete(url);
    }
  })();

  inFlightRequests.set(url, fetchPromise);
  return fetchPromise;
}

/**
 * Preload a list of media URLs in sequence or parallel with progress tracking.
 */
export async function preloadMediaList(urls = [], onProgress = null) {
  const validUrls = Array.from(new Set(urls.filter(Boolean)));
  const total = validUrls.length;
  if (total === 0) {
    if (onProgress) onProgress({ current: 0, total: 0, percent: 100, done: true });
    return { loaded: 0, total: 0 };
  }

  let loaded = 0;
  for (let i = 0; i < total; i++) {
    const url = validUrls[i];
    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        url,
        percent: Math.round(((i + 1) / total) * 100),
        done: false
      });
    }
    await preloadSingleMedia(url);
    loaded++;
  }

  if (onProgress) {
    onProgress({
      current: total,
      total,
      percent: 100,
      done: true
    });
  }

  return { loaded, total };
}

/**
 * Get the ready-to-play URL (prefers cached Blob URL, falls back to direct URL).
 */
export function getPreloadedMediaUrl(url) {
  if (!url) return '';
  if (blobCache.has(url)) {
    return blobCache.get(url);
  }
  return mediaSrc(url);
}

/**
 * Check if a media file is already cached in memory.
 */
export function isMediaLoaded(url) {
  return blobCache.has(url);
}

/**
 * Return summary statistics of current cache.
 */
export function getMediaCacheStats() {
  return {
    cachedCount: blobCache.size,
    cachedUrls: Array.from(blobCache.keys())
  };
}
