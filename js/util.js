export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export function newId() {
  let r = '';
  try { const a = new Uint8Array(8); crypto.getRandomValues(a); r = [...a].map(b => b.toString(36).padStart(2, '0')).join(''); }
  catch (e) { r = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
  return Date.now().toString(36) + r.slice(0, 10);
}
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
