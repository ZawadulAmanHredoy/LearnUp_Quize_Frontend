// Backend address. On a phone joining over the venue Wi-Fi, "localhost" is the
// phone itself, so by default we target port 5000 on whatever host served
// this page (e.g. http://192.168.1.100:5000). Override with VITE_API_URL.
const DEFAULT_BACKEND_URL =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : 'http://localhost:5000';

export const API_URL = import.meta.env.VITE_API_URL || DEFAULT_BACKEND_URL;
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_URL;

/**
 * fetch() wrapper for the REST API. Adds the bearer token when given and
 * always resolves to { ok, status, json }.
 */
export async function apiFetch(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let json = null;
  try {
    json = await res.json();
  } catch (err) {}
  return { ok: res.ok, status: res.status, json };
}

/**
 * URL for an audio-visual clip. Clips live in the backend's public/media
 * folder, so a question's "/media/clip.mp4" is loaded from the backend;
 * full http(s) URLs are used as-is.
 */
export function mediaSrc(mediaUrl) {
  if (!mediaUrl) return '';
  if (/^(https?:|data:|blob:)/i.test(mediaUrl)) return mediaUrl;
  return `${API_URL}${mediaUrl.startsWith('/') ? '' : '/'}${mediaUrl}`;
}
