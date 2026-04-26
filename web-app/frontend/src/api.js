/**
 * Centralized API helper for authenticated requests.
 * Reads JWT token from localStorage and attaches it to every request.
 */

const API_BASE = '/api';

function getHeaders(isJson = true) {
  const headers = {};
  const token = localStorage.getItem('token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (isJson) headers['Content-Type'] = 'application/json';
  return headers;
}

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: getHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Sunucu hatası' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Sunucu hatası' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiUpload(path, formData) {
  const headers = {};
  const token = localStorage.getItem('token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // Don't set Content-Type for multipart — browser sets it with boundary
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Sunucu hatası' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiPut(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Sunucu hatası' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiDelete(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Sunucu hatası' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
