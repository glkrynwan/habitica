// XP, level, dan buku besar (ledger) penyelesaian. Satu-satunya tempat XP dihitung.
import { newId } from './util.js';

export const EFFORT = {
  easy: { label: 'Mudah', xp: 10 },
  medium: { label: 'Sedang', xp: 25 },
  hard: { label: 'Sulit', xp: 50 },
};

// Total XP untuk MULAI level L. Kenaikan per level: 100, 125, 150, ... (naik 25 tiap level).
// Level 2 = 100, Level 5 = 450, Level 10 = 1.800, Level 20 = 6.175 XP.
export const xpToReach = L => 100 * (L - 1) + (25 * (L - 1) * (L - 2)) / 2;
export function levelInfo(xp) {
  xp = Math.max(0, Math.floor(xp || 0));
  let L = 1;
  while (L < 999 && xpToReach(L + 1) <= xp) L++;
  const floor = xpToReach(L), next = xpToReach(L + 1);
  return { level: L, floor, next, into: xp - floor, span: next - floor, pct: Math.round(((xp - floor) / (next - floor)) * 100) };
}

export const keyOf = (kind, ref, occ) => `${kind}|${ref}|${occ}`;

// Indeks key -> entri, di-cache per array ledger.
const idx = new WeakMap();
function index(state) {
  let m = idx.get(state.ledger);
  if (!m || m.size !== state.ledger.length) {
    m = new Map(state.ledger.map(e => [e.key, e]));
    idx.set(state.ledger, m);
  }
  return m;
}
export const getEntry = (state, key) => index(state).get(key) || null;
export const isDone = (state, kind, ref, occ) => { const e = getEntry(state, keyOf(kind, ref, occ)); return !!(e && e.active); };

export function totalXp(state) {
  let t = state.meta.legacyXp || 0;
  for (const e of state.ledger) if (e.active) t += e.xp;
  return t;
}

// Memberi XP maksimal SEKALI per key. Menyelesaikan ulang setelah dibuka kembali
// memulihkan XP semula (bukan XP baru), sehingga tidak bisa "ditanam".
export function completeItem(state, { kind, ref, occ, date, title, cat, effort }, ts) {
  const key = keyOf(kind, ref, occ);
  const ex = getEntry(state, key);
  if (ex) {
    if (ex.active) return { ok: false, reason: 'duplicate' };
    ex.active = true; ex.date = date; ex.at = ts;
    return { ok: true, xp: ex.xp, entry: ex, restored: true };
  }
  if (!EFFORT[effort]) effort = 'easy';
  const e = { id: newId(), key, kind, ref, occ, date, title, cat: cat || '', effort, xp: EFFORT[effort].xp, at: ts, active: true };
  state.ledger.push(e);
  return { ok: true, xp: e.xp, entry: e };
}
// Membuka kembali = mencabut XP entri itu. Riwayat entri tetap ada (active=false).
export function reopenItem(state, key) {
  const e = getEntry(state, key);
  if (!e || !e.active) return { ok: false };
  e.active = false;
  return { ok: true, xp: e.xp, entry: e };
}
// Perayaan level hanya muncul saat melewati level tertinggi yang pernah dirayakan.
export function checkLevelUp(state) {
  const L = levelInfo(totalXp(state)).level;
  if (L > state.meta.celebratedLevel) { state.meta.celebratedLevel = L; return L; }
  return null;
}
