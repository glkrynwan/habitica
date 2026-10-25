// Tanggal lokal (YYYY-MM-DD). Semua perhitungan memakai zona waktu perangkat,
// dan memakai jam 12:00 agar aman dari pergeseran DST.
const pad = n => String(n).padStart(2, '0');
let clock = () => new Date();
export const setClock = fn => { clock = fn; };
export const nowDate = () => clock();
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(clock());

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function parseYmd(s) {
  if (typeof s !== 'string') return null;
  const m = RE.exec(s); if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(y, mo - 1, d, 12);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}
export const isYmd = s => parseYmd(s) !== null;
export function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
export function diffDays(a, b) { // b - a, dalam hari
  const x = parseYmd(a), y = parseYmd(b);
  return Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / 864e5);
}
export const weekday = s => parseYmd(s).getDay(); // 0 = Minggu
export function lastDays(n, end = today()) {
  const out = []; for (let i = n - 1; i >= 0; i--) out.push(addDays(end, -i)); return out;
}
export const DAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const DAY_LONG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const formatLong = s => parseYmd(s).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
export const formatShort = s => parseYmd(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
export const formatMedium = s => parseYmd(s).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });

export function relativeDue(s, t = today()) {
  const n = diffDays(t, s);
  if (n === 0) return 'Hari ini';
  if (n === 1) return 'Besok';
  if (n === -1) return 'Kemarin';
  if (n < 0) return `${-n} hari lalu`;
  if (n < 7) return `${n} hari lagi`;
  return formatShort(s);
}
export function greeting(h) {
  return h < 4 ? 'Masih terjaga' : h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
}
