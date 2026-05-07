/**
 * Centralized API helper for authenticated requests.
 * JWT token is stored in an httpOnly cookie (set by backend).
 * Browser automatically sends the cookie with every request.
 * Token is NOT stored in localStorage — invisible to F12 DevTools.
 */

const API_BASE = '/api';

class ApiError extends Error {
  constructor(message, status, retryAfterSec = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

function getHeaders(isJson = true) {
  const headers = {};
  if (isJson) headers['Content-Type'] = 'application/json';
  return headers;
}

async function parseError(res) {
  const payload = await res.json().catch(() => ({}));
  const retryAfterHeader = res.headers.get('retry-after');
  const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : null;
  const retryMins = retryAfterSec && Number.isFinite(retryAfterSec)
    ? Math.max(1, Math.ceil(retryAfterSec / 60))
    : null;

  if (res.status === 429) {
    const msg = retryMins
      ? `Sistem şu anda yoğun. Lütfen ${retryMins} dakika sonra tekrar deneyin.`
      : 'Sistem şu anda yoğun. Lütfen kısa süre sonra tekrar deneyin.';
    return new ApiError(msg, res.status, retryAfterSec);
  }

  const message = payload.error || `HTTP ${res.status}`;
  return new ApiError(message, res.status, retryAfterSec);
}

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: getHeaders(),
    credentials: 'include',  // Send httpOnly cookies
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return res.json();
}

export async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return res.json();
}

export async function apiUpload(path, formData) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return res.json();
}

export async function apiPut(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return res.json();
}

export async function apiDelete(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: getHeaders(),
    credentials: 'include',
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return res.json();
}
