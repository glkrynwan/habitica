// Persistensi, validasi, dan migrasi. Data hanya disimpan di localStorage browser ini.
import { isYmd, today } from './dates.js';
import { ID_RE, newId } from './util.js';
import { EFFORT, levelInfo, totalXp } from './xp.js';

export const SCHEMA = 2;
export const KEY = 'habitica.v2';
export const LEGACY_KEY = 'levelup.v1';          // data lama; tidak pernah dihapus
export const PREV_KEY = 'habitica.v2.prev';      // salinan otomatis sebelum impor/reset
export const CORRUPT_KEY = 'habitica.corrupt';   // salinan mentah data yang tidak terbaca
export const RECOVER_KEY = 'habitica.v2.recovered';
export const THEME_KEY = 'habitica.theme';

const LIMITS = { cats: 200, tasks: 5000, habits: 1000, ledger: 60000, focus: 20000, steps: 50 };

export function defaultState(t = today()) {
  return {
    schema: SCHEMA,
    meta: { created: t, celebratedLevel: 1, legacyXp: 0, migratedFrom: null, lastExport: null, backupSnooze: null },
    settings: { theme: 'auto', pomodoroMin: 25, breakMin: 5, weeklyGoal: 0 },
    cats: [], tasks: [], habits: [], ledger: [], focus: [], achievements: {},
  };
}

/* ---------- validasi ---------- */
const str = (v, max, def = '') => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max) : def;
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const int = (v, lo, hi, def) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : def);
const okDate = s => isYmd(s) && s >= '2000-01-01' && s <= '2100-12-31';
const okId = s => typeof s === 'string' && ID_RE.test(s);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

function cleanSched(arr, from, kind) {
  const map = new Map();
  if (Array.isArray(arr)) for (const s of arr.slice(0, 200)) {
    if (!isObj(s) || !okDate(s.from)) continue;
    const type = oneOf(s.type, ['once', 'daily', 'weekly', 'pause'], null);
    if (!type || (kind === 'habit' && type === 'once')) continue;
    let days = [];
    if (type === 'weekly') {
      days = [...new Set((Array.isArray(s.days) ? s.days : []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
      if (!days.length) continue;
    }
    map.set(s.from, { from: s.from, type, days });
  }
  const out = [...map.values()].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  if (!out.length) out.push({ from, type: kind === 'habit' ? 'daily' : 'once', days: [] });
  return out;
}

// Mengubah objek apa pun menjadi state v2 yang bersih, atau mengembalikan error.
export function sanitize(input, t = today()) {
  if (!isObj(input)) return { ok: false, error: 'Berkas bukan data Habitica yang valid.' };
  if (input.schema === undefined && Array.isArray(input.cats) && Array.isArray(input.tasks) && Array.isArray(input.log)) return migrateV1(input, t);
  if (input.schema !== SCHEMA) {
    return { ok: false, error: Number.isInteger(input.schema) && input.schema > SCHEMA
      ? 'Cadangan ini dibuat oleh versi Habitica yang lebih baru. Perbarui aplikasi terlebih dahulu.'
      : 'Format cadangan tidak dikenali.' };
  }
  for (const k of ['cats', 'tasks', 'habits', 'ledger']) if (!Array.isArray(input[k])) return { ok: false, error: `Data rusak: bagian "${k}" tidak ada.` };

  let dropped = 0;
  const S = defaultState(t);
  const m = isObj(input.meta) ? input.meta : {};
  S.meta = {
    created: okDate(m.created) ? m.created : t,
    celebratedLevel: int(m.celebratedLevel, 1, 999, 1),
    legacyXp: int(m.legacyXp, 0, 1e7, 0),
    migratedFrom: str(m.migratedFrom, 20) || null,
    lastExport: Number.isFinite(m.lastExport) ? m.lastExport : null,
    backupSnooze: okDate(m.backupSnooze) ? m.backupSnooze : null,
  };
  const se = isObj(input.settings) ? input.settings : {};
  S.settings = {
    theme: oneOf(se.theme, ['auto', 'light', 'dark'], 'auto'),
    pomodoroMin: int(se.pomodoroMin, 5, 120, 25), breakMin: int(se.breakMin, 1, 60, 5), weeklyGoal: int(se.weeklyGoal, 0, 500, 0),
  };

  const catIds = new Set();
  for (const c of input.cats.slice(0, LIMITS.cats)) {
    const name = isObj(c) ? str(c.name, 40) : '';
    if (!isObj(c) || !okId(c.id) || !name || catIds.has(c.id)) { dropped++; continue; }
    catIds.add(c.id); S.cats.push({ id: c.id, name, icon: str(c.icon, 4), ...(c.sample ? { sample: true } : {}) });
  }
  const seen = new Set();
  const common = (x, kind) => {
    const title = str(x.title, 120);
    if (!okId(x.id) || seen.has(x.id) || !title) return null;
    const created = okDate(x.created) ? x.created : t;
    return {
      id: x.id, title, notes: str(x.notes, 1000), cat: catIds.has(x.cat) ? x.cat : null,
      effort: oneOf(x.effort, Object.keys(EFFORT), kind === 'habit' ? 'easy' : 'medium'),
      sched: cleanSched(x.sched, created, kind), created, createdAt: Number.isFinite(x.createdAt) ? x.createdAt : 0,
      archivedAt: okDate(x.archivedAt) ? x.archivedAt : null, ...(x.sample ? { sample: true } : {}),
    };
  };
  for (const x of input.tasks.slice(0, LIMITS.tasks)) {
    const b = isObj(x) ? common(x, 'task') : null;
    if (!b) { dropped++; continue; }
    seen.add(b.id);
    const stepIds = new Set();
    const steps = [];
    for (const s of (Array.isArray(x.steps) ? x.steps : []).slice(0, LIMITS.steps)) {
      const text = isObj(s) ? str(s.text, 120) : '';
      if (!text) continue;
      let id = okId(s.id) && !stepIds.has(s.id) ? s.id : newId();
      stepIds.add(id); steps.push({ id, text, done: !!s.done });
    }
    S.tasks.push({ ...b, priority: oneOf(x.priority, ['low', 'normal', 'high'], 'normal'), due: okDate(x.due) ? x.due : null, pinDate: okDate(x.pinDate) ? x.pinDate : null, steps });
  }
  for (const x of input.habits.slice(0, LIMITS.habits)) {
    const b = isObj(x) ? common(x, 'habit') : null;
    if (!b) { dropped++; continue; }
    seen.add(b.id);
    S.habits.push({ ...b, time: typeof x.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x.time) ? x.time : '' });
  }
  const keys = new Map();
  for (const e of input.ledger.slice(0, LIMITS.ledger)) {
    if (!isObj(e) || !okId(e.id) || !okId(e.ref) || !['task', 'habit'].includes(e.kind) || !okDate(e.date)
      || !(e.occ === 'once' || okDate(e.occ)) || !Number.isFinite(e.xp)) { dropped++; continue; }
    const key = `${e.kind}|${e.ref}|${e.occ}`;
    const clean = { id: e.id, key, kind: e.kind, ref: e.ref, occ: e.occ, date: e.date, title: str(e.title, 120), cat: str(e.cat, 40),
      effort: oneOf(e.effort, Object.keys(EFFORT), 'easy'), xp: int(e.xp, 0, 1000, 0), at: Number.isFinite(e.at) ? e.at : 0, active: e.active !== false };
    const prev = keys.get(key);
    if (prev) { dropped++; if (!prev.active && clean.active) { Object.assign(prev, clean); } continue; }   // 1 key = 1 entri
    keys.set(key, clean); S.ledger.push(clean);
  }
  for (const f of (Array.isArray(input.focus) ? input.focus : []).slice(0, LIMITS.focus)) {
    if (!isObj(f) || !okId(f.id) || !okDate(f.date) || !Number.isFinite(f.seconds)) { dropped++; continue; }
    S.focus.push({ id: f.id, date: f.date, seconds: int(f.seconds, 1, 86400, 60), title: str(f.title, 120), kind: oneOf(f.kind, ['task', 'habit'], null), ref: okId(f.ref) ? f.ref : null });
  }
  if (isObj(input.achievements)) for (const [k, v] of Object.entries(input.achievements).slice(0, 100)) {
    if (/^[a-z0-9_]{1,40}$/.test(k) && okDate(v)) S.achievements[k] = v;
  }
  S.meta.celebratedLevel = Math.max(S.meta.celebratedLevel, 1);
  return { ok: true, state: S, dropped };
}

/* ---------- migrasi dari "Level Up" (levelup.v1) ---------- */
function migrateV1(o, t) {
  if (!Number.isFinite(o.xp) || !isObj(o.awarded) || !Array.isArray(o.log)) return { ok: false, error: 'Data Level Up lama tidak lengkap.' };
  const byId = new Map();
  const tasks = [], habits = [];
  for (const k of o.tasks) {
    if (!isObj(k)) continue;
    byId.set(k.id, k);
    const created = k.created;
    if (k.freq === 'once') {
      tasks.push({ id: k.id, title: k.name, notes: k.note, cat: k.cat, priority: 'normal', effort: 'easy', due: null, created, createdAt: 0,
        sched: [{ from: created, type: 'once', days: [] }], sample: !!k.seed });
    } else {
      habits.push({ id: k.id, title: k.name, notes: k.note, cat: k.cat, effort: 'easy', time: k.time, created, createdAt: 0,
        sched: [{ from: created, type: k.freq === 'weekly' ? 'weekly' : 'daily', days: k.days }], sample: !!k.seed });
    }
  }
  const ledger = [];
  for (const l of o.log) {
    if (!isObj(l)) continue;
    const k = byId.get(l.task), isTask = !!k && k.freq === 'once';
    ledger.push({ id: l.id, kind: isTask ? 'task' : 'habit', ref: l.task, occ: isTask ? 'once' : l.date, date: l.date,
      title: l.name, cat: l.cat === '-' ? '' : l.cat, effort: 'easy', xp: o.awarded[`${l.task}|${l.date}`] ? 10 : 0, at: l.at, active: true });
  }
  const r = sanitize({
    schema: SCHEMA, meta: { created: t, migratedFrom: 'levelup.v1' }, settings: { theme: o.theme === 'light' ? 'light' : 'dark' },
    cats: o.cats.map(c => isObj(c) ? { id: c.id, name: c.name, icon: c.icon, sample: !!c.seed } : c), tasks, habits, ledger,
  }, t);
  if (!r.ok) return r;
  const sum = r.state.ledger.reduce((a, e) => a + (e.active ? e.xp : 0), 0);
  r.state.meta.legacyXp = Math.max(0, Math.round(o.xp) - sum);   // total XP lama dipertahankan persis
  r.state.meta.celebratedLevel = levelInfo(totalXp(r.state)).level;
  return r;
}

/* ---------- penyimpanan ---------- */
let state = defaultState();
let persist = true;           // false saat data rusak menunggu keputusan pengguna
let saveFailed = false;
let loadInfo = { status: 'new' };
const listeners = new Set();

export const getState = () => state;
export const getLoadInfo = () => loadInfo;
export const isSaveFailed = () => saveFailed;
export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };

export function loadState() {
  const t = today();
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { saveFailed = true; loadInfo = { status: 'blocked' }; return loadInfo; }
  const attempt = (text, source) => {
    let parsed; try { parsed = JSON.parse(text); } catch (e) { return { ok: false, error: 'JSON tidak terbaca' }; }
    return sanitize(parsed, t);
  };
  if (raw) {
    const r = attempt(raw);
    if (!r.ok) { persist = false; loadInfo = { status: 'corrupt', raw, error: r.error }; return loadInfo; }
    state = r.state;
    if (r.dropped) lsSet(RECOVER_KEY, raw);
    loadInfo = { status: 'ok', dropped: r.dropped };
    return loadInfo;
  }
  const legacy = lsGet(LEGACY_KEY);
  if (legacy) {
    const r = attempt(legacy);
    if (!r.ok) { persist = false; loadInfo = { status: 'corrupt', raw: legacy, error: r.error, legacy: true }; return loadInfo; }
    state = r.state; save();
    loadInfo = { status: 'migrated', dropped: r.dropped };
    return loadInfo;
  }
  state = defaultState(t); save();
  loadInfo = { status: 'new' };
  return loadInfo;
}

export function save() {
  if (!persist) return false;
  try { localStorage.setItem(KEY, JSON.stringify(state)); saveFailed = false; return true; }
  catch (e) { saveFailed = true; return false; }
}
export function update(fn) {
  const r = fn(state);
  save();
  listeners.forEach(f => f());
  return r;
}
export function exportJson() { return JSON.stringify({ app: 'habitica', exportedAt: new Date().toISOString(), ...state }, null, 2); }

// Mengganti seluruh data. Salinan data saat ini disimpan dulu di PREV_KEY.
export function replaceState(next) {
  const cur = persist ? lsGet(KEY) : null;
  if (cur) lsSet(PREV_KEY, cur);
  state = next; persist = true; save();
  listeners.forEach(f => f());
}
export function resolveCorrupt() {   // setelah pengguna memilih "mulai baru"
  if (loadInfo.raw) lsSet(CORRUPT_KEY, loadInfo.raw);
  state = defaultState(); persist = true; save(); loadInfo = { status: 'new' };
  listeners.forEach(f => f());
}
export const hasPrev = () => !!lsGet(PREV_KEY);
export function restorePrev() {
  const raw = lsGet(PREV_KEY); if (!raw) return { ok: false, error: 'Tidak ada salinan sebelumnya.' };
  let r; try { r = sanitize(JSON.parse(raw)); } catch (e) { return { ok: false, error: 'Salinan sebelumnya rusak.' }; }
  if (!r.ok) return r;
  replaceState(r.state); return { ok: true };
}
export function setThemeHint(theme) { lsSet(THEME_KEY, theme); }
