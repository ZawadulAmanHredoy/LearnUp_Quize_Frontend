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
 * Server URL for a question's clip: uploaded media is served from the
 * backend at /media/<id>; external https links are used as-is.
 */
export function mediaSrc(question) {
  if (!question) return '';
  if (question.mediaId) return `${API_URL}/media/${question.mediaId}`;
  return question.mediaUrl || '';
}
