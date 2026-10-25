// Pengendali aplikasi: routing, aksi, tema, PWA/service worker.
import { h, toast, confirmDialog, menuSheet, openSheet } from './ui.js';
import { today, addDays, nowDate } from './dates.js';
import { newId } from './util.js';
import { keyOf, getEntry, isDone, completeItem, reopenItem, checkLevelUp, totalXp, levelInfo } from './xp.js';
import { isRecurring, resumeSchedule } from './schedule.js';
import { createTask, updateTask, MAX_PINS, pinnedCount, taskDone } from './tasks.js';
import { createHabit, updateHabit } from './habits.js';
import { resolveCat, catName } from './cats.js';
import { evaluateAchievements } from './achievements.js';
import { activeEntries } from './stats.js';
import { openEditor } from './editor.js';
import { openFocus } from './focus.js';
import { renderToday, renderTasks, renderHabits, renderProgress, renderSettings } from './views.js';
import { loadState, getState, getLoadInfo, update, subscribe, exportJson, replaceState, resolveCorrupt, sanitize, hasPrev, restorePrev, setThemeHint, defaultState, isSaveFailed } from './store.js';

export const APP_VERSION = '1.0.0';
const VIEWS = { today: renderToday, tasks: renderTasks, habits: renderHabits, progress: renderProgress, settings: renderSettings };
const TITLES = { today: 'Hari ini', tasks: 'Semua tugas', habits: 'Kebiasaan', progress: 'Progres', settings: 'Pengaturan' };
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const ui = { tasks: { q: '', filter: 'active', cat: '', sort: 'due' }, expanded: new Set(), popKey: null, prevRing: undefined, doneOpen: false, recoveryDismissed: false };
const net = { sw: 'registering', detail: '', online: navigator.onLine, persisted: undefined };
let view = 'today', lastDate = today(), lastFk = null, swReg = null, updateRequested = false;
const $ = id => document.getElementById(id);
const mq = window.matchMedia('(prefers-color-scheme: dark)');

/* ---------- tema & header ---------- */
function effectiveTheme() { const p = getState().settings.theme; return p === 'auto' ? (mq.matches ? 'dark' : 'light') : p; }
function applyTheme() {
  const eff = effectiveTheme();
  document.documentElement.dataset.theme = eff;
  setThemeHint(getState().settings.theme);
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = eff === 'dark' ? '#0d1618' : '#eef3f1';
  const b = $('theme-btn'); if (b) b.setAttribute('aria-label', eff === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap');
  const ic = $('theme-ico'); if (ic) ic.textContent = eff === 'dark' ? '☀' : '☾';
}
function updateHeader(st) {
  const xp = totalXp(st), lv = levelInfo(xp);
  $('lv-num').textContent = `Lv ${lv.level}`;
  $('xp-text').textContent = `${lv.into}/${lv.span} XP`;
  $('xp-fill').style.width = lv.pct + '%';
  $('level-chip').setAttribute('aria-label', `Level ${lv.level}, ${lv.into} dari ${lv.span} XP menuju level berikutnya. Buka progres.`);
  $('net-chip').hidden = net.online;
  const sw = $('save-warn'); sw.hidden = !isSaveFailed();
  const up = $('update-bar'); up.hidden = net.sw !== 'update';
}

/* ---------- render ---------- */
function ctx() {
  const st = getState(), date = today();
  return { state: st, date, ui, act, net, version: APP_VERSION, hasPrev: hasPrev(), backupDue: backupDue(st, date) };
}
function backupDue(st, date) {
  if (st.meta.backupSnooze && st.meta.backupSnooze > date) return false;
  const n = activeEntries(st).length;
  if (!st.meta.lastExport) return n >= 15;
  return n > 0 && Date.now() - st.meta.lastExport > 30 * 864e5;
}
function render(opts = {}) {
  const st = getState(), main = $('view');
  applyTheme(); updateHeader(st);
  const a = document.activeElement;
  const fk = a && main.contains(a) && a.dataset ? a.dataset.fk : null;
  const sel = fk && a.setSelectionRange && a.type !== 'number' && a.type !== 'date' ? [a.selectionStart, a.selectionEnd] : null;
  const y = window.scrollY;
  main.replaceChildren(VIEWS[view](ctx()));
  ui.popKey = null;
  document.querySelectorAll('[data-nav]').forEach(b => b.dataset.nav === view ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  document.title = (view === 'today' ? 'Habitica' : `${TITLES[view]} · Habitica`);
  if (fk) { const el = main.querySelector(`[data-fk="${CSS.escape(fk)}"]`); if (el) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(...sel); } catch (e) { /* abaikan */ } } }
  window.scrollTo(0, opts.top ? 0 : y);
}
function go(v) { if (!VIEWS[v]) v = 'today'; if (location.hash !== '#/' + v) location.hash = '#/' + v; else render({ top: true }); }
function routeFromHash() { const v = location.hash.replace(/^#\/?/, ''); view = VIEWS[v] ? v : 'today'; render({ top: true }); }

/* ---------- aksi ---------- */
let lastToggleAt = 0;
function toggle(kind, item, date) {
  const occ = kind === 'task' && !isRecurring(item) ? 'once' : date;
  const key = keyOf(kind, item.id, occ);
  const now = Date.now();
  // Jeda global: setelah satu item selesai, daftar bergeser sehingga ketukan ganda bisa mengenai item lain.
  if (now - lastToggleAt < 350) return;
  lastToggleAt = now;
  let res = null;
  update(st => {
    const e = getEntry(st, key);
    if (e && e.active) { const r = reopenItem(st, key); res = { type: 'reopen', xp: r.xp }; return; }
    const r = completeItem(st, { kind, ref: item.id, occ, date: kind === 'habit' ? date : today(), title: item.title, cat: catName(st, item.cat), effort: item.effort }, now);
    if (!r.ok) return;
    ui.popKey = item.id + '|' + date;
    res = { type: 'done', xp: r.xp, level: checkLevelUp(st), ach: evaluateAchievements(st, today()) };
  });
  if (!res) return;
  if (res.type === 'reopen') return toast(`Dibuka kembali${res.xp ? ` · −${res.xp} XP` : ''}`, { ms: 2000 });
  toast(res.xp ? `+${res.xp} XP · ${item.title}` : `Selesai · ${item.title}`, { kind: 'xp', action: { label: 'Urungkan', fn: () => { update(st => { reopenItem(st, key); }); } } });
  if (res.level) toast(`Naik ke Level ${res.level}`, { kind: 'level', ms: 3800 });
  for (const a of res.ach) toast(`Pencapaian: ${a.name}`, { kind: 'level', ms: 3200 });
}
function toggleStep(task, stepId) { update(() => { const s = task.steps.find(z => z.id === stepId); if (s) s.done = !s.done; }); }
function quickAdd(title, forToday) {
  update(st => { createTask(st, { title, effort: 'medium', repeat: { type: 'once', days: [] }, due: forToday ? today() : null }, today(), Date.now()); });
  toast(forToday ? 'Ditambahkan ke hari ini' : 'Tugas ditambahkan', { ms: 1800 });
}
function openAdd(kind) { openEditor({ state: getState(), kind, today: today(), onSave: saveEditor }); }
function edit(kind, item) { openEditor({ state: getState(), kind, item, today: today(), onSave: saveEditor }); }
function saveEditor(kind, input, item) {
  const t = today();
  if (input.pinDate && (!item || item.pinDate !== t) && pinnedCount(getState(), t) >= MAX_PINS) { input.pinDate = null; toast(`Maksimal ${MAX_PINS} prioritas hari ini. Tugas disimpan tanpa prioritas.`, { ms: 3200 }); }
  update(st => {
    const inp = { ...input, cat: resolveCat(st, input.catName) };
    if (kind === 'task') item ? updateTask(st, item, inp, t) : createTask(st, inp, t, Date.now());
    else item ? updateHabit(st, item, inp, t) : createHabit(st, inp, t, Date.now());
  });
  toast(item ? 'Perubahan disimpan' : (kind === 'task' ? 'Tugas ditambahkan' : 'Kebiasaan dibuat'), { ms: 1800 });
}
function menu(kind, item) {
  const t = today(), done = kind === 'task' && taskDone(getState(), item, t);
  const once = kind === 'task' && !isRecurring(item);
  menuSheet(item.title, [
    { label: 'Ubah', fn: () => edit(kind, item) },
    !done && !item.archivedAt ? { label: 'Mulai fokus', fn: () => focus(kind, item) } : null,
    once && !done && !item.archivedAt ? (item.pinDate === t
      ? { label: 'Batalkan prioritas hari ini', fn: () => update(() => { item.pinDate = null; }) }
      : { label: 'Jadikan prioritas hari ini', fn: () => { if (pinnedCount(getState(), t) >= MAX_PINS) return toast(`Maksimal ${MAX_PINS} prioritas hari ini.`); update(() => { item.pinDate = t; }); } }) : null,
    item.archivedAt ? { label: 'Pulihkan dari arsip', fn: () => unarchive(kind, item) } : { label: 'Arsipkan', fn: () => archive(kind, item) },
    { label: 'Hapus…', danger: true, fn: () => remove(kind, item) },
  ]);
}
function archive(kind, item) { update(() => { item.archivedAt = today(); item.pinDate = null; }); toast('Diarsipkan. Riwayat tetap tersimpan.', { ms: 2200, action: { label: 'Urungkan', fn: () => unarchive(kind, item) } }); }
function unarchive(kind, item) { update(() => resumeSchedule(item, today())); toast('Dipulihkan', { ms: 1800 }); }
async function remove(kind, item) {
  const ok = await confirmDialog({ title: kind === 'task' ? 'Hapus tugas?' : 'Hapus kebiasaan?', message: `"${item.title}" akan dihapus. Riwayat penyelesaian dan XP yang sudah didapat tetap tersimpan. Untuk menghentikan tanpa menghapus, gunakan Arsipkan.`, confirmLabel: 'Hapus', danger: true });
  if (!ok) return;
  update(st => { if (kind === 'task') st.tasks = st.tasks.filter(x => x.id !== item.id); else st.habits = st.habits.filter(x => x.id !== item.id); });
  toast('Dihapus', { ms: 1800 });
}
function focus(kind, item) {
  const st = getState(), t = today();
  openFocus({
    target: item ? { title: item.title } : null, settings: st.settings,
    canComplete: !!item && !(kind === 'habit' ? isDone(st, 'habit', item.id, t) : taskDone(st, item, t)),
    onLog: seconds => { let ach = []; update(s => { s.focus.push({ id: newId(), date: today(), seconds, title: item ? item.title : 'Fokus bebas', kind: item ? kind : null, ref: item ? item.id : null }); ach = evaluateAchievements(s, today()); }); ach.forEach(a => toast(`Pencapaian: ${a.name}`, { kind: 'level', ms: 3200 })); },
    onComplete: () => toggle(kind, item, t),
  });
}

/* ---------- data: ekspor, impor, reset ---------- */
function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
function exportData() {
  update(st => { st.meta.lastExport = Date.now(); });
  download(`habitica-${today()}.json`, exportJson());
  toast('Cadangan diunduh. Simpan di tempat yang aman.', { ms: 3000 });
}
async function importFile(file) {
  if (file.size > MAX_IMPORT_BYTES) return toast('Berkas terlalu besar (maks. 5 MB).', { kind: 'err', ms: 3500 });
  let text; try { text = await file.text(); } catch (e) { return toast('Berkas tidak dapat dibaca.', { kind: 'err', ms: 3500 }); }
  let parsed; try { parsed = JSON.parse(text); } catch (e) { return toast('Berkas bukan JSON yang valid.', { kind: 'err', ms: 3500 }); }
  const r = sanitize(parsed, today());
  if (!r.ok) return toast(r.error, { kind: 'err', ms: 4500 });
  const S = r.state;
  const msg = `Cadangan berisi ${S.tasks.length} tugas, ${S.habits.length} kebiasaan, dan ${S.ledger.length} catatan selesai.` +
    (r.dropped ? ` ${r.dropped} item tidak valid dilewati.` : '') + ' Data saat ini akan DIGANTI. Salinan data saat ini disimpan dan bisa dikembalikan dari Pengaturan.';
  if (!(await confirmDialog({ title: 'Pulihkan dari cadangan?', message: msg, confirmLabel: 'Ganti data', danger: true }))) return;
  replaceState(S); go('today'); toast('Data dipulihkan.', { ms: 2500 });
}
async function resetAll() {
  if (!(await confirmDialog({ title: 'Hapus semua data?', message: 'Semua tugas, kebiasaan, XP, dan riwayat di browser ini akan dihapus. Unduh cadangan dulu bila ragu. Salinan terakhir masih bisa dikembalikan dari Pengaturan.', confirmLabel: 'Hapus semua', danger: true, requireText: 'HAPUS' }))) return;
  replaceState(defaultState(today())); go('today'); toast('Semua data dihapus.', { ms: 2500 });
}
async function doRestorePrev() {
  if (!(await confirmDialog({ title: 'Kembalikan data sebelumnya?', message: 'Data saat ini akan diganti dengan salinan sebelum impor/reset terakhir.', confirmLabel: 'Kembalikan' }))) return;
  const r = restorePrev(); toast(r.ok ? 'Data dikembalikan.' : r.error, { kind: r.ok ? '' : 'err', ms: 3000 });
}
function addSamples() {
  const t = today();
  update(st => {
    const learn = resolveCat(st, 'Belajar'), health = resolveCat(st, 'Kesehatan');
    st.cats.forEach(c => { if (['Belajar', 'Kesehatan'].includes(c.name)) c.sample = true; });
    const a = createHabit(st, { title: 'Membaca 15 menit', cat: learn, effort: 'easy', repeat: { type: 'daily', days: [] } }, t, Date.now());
    const b = createHabit(st, { title: 'Peregangan pagi', cat: health, effort: 'easy', repeat: { type: 'daily', days: [] } }, t, Date.now());
    const c = createTask(st, { title: 'Rapikan meja belajar', cat: learn, effort: 'easy', priority: 'normal', repeat: { type: 'once', days: [] }, due: t }, t, Date.now());
    const d = createTask(st, { title: 'Tulis 3 prioritas minggu ini', effort: 'medium', priority: 'high', repeat: { type: 'once', days: [] }, due: t, steps: [{ text: 'Daftar semua yang menunggu' }, { text: 'Pilih tiga yang paling penting' }] }, t, Date.now());
    [a, b, c, d].forEach(x => { x.sample = true; });
  });
  toast('Contoh ditambahkan. Hapus kapan saja di Pengaturan.', { ms: 2800 });
}
async function removeSamples() {
  if (!(await confirmDialog({ title: 'Hapus data contoh?', message: 'Tugas dan kebiasaan bertanda "Contoh" akan dihapus. Riwayat selesai tetap ada.', confirmLabel: 'Hapus contoh', danger: true }))) return;
  update(st => { st.tasks = st.tasks.filter(x => !x.sample); st.habits = st.habits.filter(x => !x.sample); const used = new Set([...st.tasks, ...st.habits].map(x => x.cat)); st.cats = st.cats.filter(c => !c.sample || used.has(c.id)); });
  toast('Contoh dihapus.', { ms: 2000 });
}
function setSetting(key, val, lo, hi) {
  update(st => { st.settings[key] = typeof val === 'number' ? Math.min(hi, Math.max(lo, Number.isFinite(val) ? Math.round(val) : lo)) : val; });
}

/* ---------- PWA ---------- */
function setNet(patch) { Object.assign(net, patch); render(); }
function registerSW() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) { net.sw = 'unsupported'; return; }
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateRequested) location.reload(); });
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'PRECACHE_FAILED') setNet({ sw: 'error', detail: e.data.detail }); });
  navigator.serviceWorker.register('./sw.js', { scope: './' }).then(reg => {
    swReg = reg;
    if (reg.waiting && navigator.serviceWorker.controller) net.sw = 'update';
    else if (reg.active) net.sw = 'ready';
    reg.addEventListener('updatefound', () => {
      const w = reg.installing; if (!w) return; let installed = false;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed') { installed = true; setNet({ sw: navigator.serviceWorker.controller ? 'update' : 'ready' }); }
        if (w.state === 'redundant' && !installed) setNet({ sw: net.sw === 'ready' || net.sw === 'update' ? net.sw : 'error', detail: net.detail || 'pemasangan dibatalkan (periksa konsol)' });
      });
    });
    navigator.serviceWorker.ready.then(() => { if (net.sw === 'registering') setNet({ sw: 'ready' }); });
    reg.update().catch(() => {});
    render();
  }).catch(err => { console.error('[habitica] gagal mendaftarkan service worker', err); setNet({ sw: 'error', detail: String(err && err.message || err) }); });
}
function applyUpdate() { if (swReg && swReg.waiting) { updateRequested = true; swReg.waiting.postMessage({ type: 'SKIP_WAITING' }); } else location.reload(); }
async function checkUpdate() {
  if (!swReg) return toast('Pembaruan hanya tersedia saat aplikasi dibuka lewat http(s).', { ms: 2800 });
  toast('Memeriksa pembaruan…', { ms: 1500 });
  try { await swReg.update(); } catch (e) { return toast('Tidak dapat memeriksa (offline?).', { ms: 2500 }); }
  setTimeout(() => { if (net.sw !== 'update') toast('Sudah versi terbaru.', { ms: 2000 }); }, 1200);
}

/* ---------- objek aksi untuk views ---------- */
const act = {
  go, toggle, toggleStep, quickAdd, edit, menu, focus, archive, unarchive, remove, exportData, importFile, resetAll, addSamples, removeSamples, setSetting, checkUpdate, applyUpdate,
  add: openAdd, rerender: () => render(), restorePrev: doRestorePrev,
  toggleExpanded: id => { ui.expanded.has(id) ? ui.expanded.delete(id) : ui.expanded.add(id); render(); },
  dismissRecovery: () => { ui.recoveryDismissed = true; render(); },
  snoozeBackup: () => { update(st => { st.meta.backupSnooze = addDays(today(), 7); }); },
};

/* ---------- data rusak ---------- */
function showCorrupt(info) {
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onChange: e => { const f = e.target.files[0]; if (f) importFile(f).then(() => { if (!getLoadInfo() || getLoadInfo().status !== 'corrupt') dlg.close('ok'); }); } });
  const dlg = openSheet({ title: 'Data tidak dapat dibaca', className: 'locked', content: h('div', {},
    h('p', { class: 'sheet-msg', text: 'Data Habitica di browser ini rusak atau tidak dikenali. Tidak ada yang diubah atau dihapus. Pilih langkah selanjutnya:' }),
    h('div', { class: 'stack' },
      h('button', { class: 'btn primary', type: 'button', text: 'Unduh data mentah', onClick: () => download('habitica-data-rusak.json', info.raw) }),
      h('button', { class: 'btn secondary', type: 'button', text: 'Pulihkan dari cadangan…', onClick: () => file.click() }),
      h('button', { class: 'btn danger', type: 'button', text: 'Mulai baru (data lama tetap disalin)', onClick: async () => { if (await confirmDialog({ title: 'Mulai baru?', message: 'Data lama disalin ke penyimpanan cadangan browser, lalu aplikasi dimulai kosong.', confirmLabel: 'Mulai baru', danger: true })) { resolveCorrupt(); dlg.close('ok'); } } })), file) });
  dlg.addEventListener('cancel', e => e.preventDefault());
}

/* ---------- init ---------- */
function init() {
  const info = loadState();
  subscribe(() => render());
  $('theme-btn').addEventListener('click', () => update(st => { st.settings.theme = effectiveTheme() === 'dark' ? 'light' : 'dark'; }));
  $('settings-btn').addEventListener('click', () => go('settings'));
  $('level-chip').addEventListener('click', () => go('progress'));
  $('fab').addEventListener('click', () => openAdd('task'));
  $('update-btn').addEventListener('click', applyUpdate);
  document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => go(b.dataset.nav)));
  window.addEventListener('hashchange', routeFromHash);
  mq.addEventListener('change', () => { if (getState().settings.theme === 'auto') render(); });
  window.addEventListener('online', () => setNet({ online: true }));
  window.addEventListener('offline', () => setNet({ online: false }));
  document.addEventListener('focusin', e => { const k = e.target && e.target.dataset && e.target.dataset.fk; if (k && !e.target.closest('dialog')) lastFk = k; });
  document.addEventListener('close', e => {                  // fokus kembali setelah dialog ditutup
    if (!(e.target instanceof HTMLDialogElement)) return;
    setTimeout(() => { if ((document.activeElement === document.body || !document.activeElement) && lastFk) { const el = document.querySelector(`[data-fk="${CSS.escape(lastFk)}"]`); if (el) el.focus({ preventScroll: true }); } }, 0);
  }, true);
  const tick = () => { const d = today(); if (d !== lastDate) { lastDate = d; ui.prevRing = undefined; if (!document.querySelector('dialog[open]')) render(); } };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); if (swReg) swReg.update().catch(() => {}); } });
  setInterval(tick, 60000);

  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then(p => p ? p : navigator.storage.persist()).then(p => { net.persisted = !!p; if (view === 'settings') render(); }).catch(() => {});
  }
  routeFromHash();
  if (info.status === 'corrupt') showCorrupt(info);
  else if (info.status === 'migrated') toast('Data Level Up lama berhasil dipindahkan ke Habitica.', { ms: 4500 });
  else if (info.status === 'blocked') toast('Penyimpanan browser diblokir. Data tidak akan tersimpan.', { kind: 'err', ms: 6000 });
  else if (info.dropped) toast(`${info.dropped} item rusak dilewati. Salinan data asli disimpan.`, { ms: 5000 });
  registerSW();
  const q = new URLSearchParams(location.search);
  if (q.get('action') === 'add' && info.status !== 'corrupt') { openAdd('task'); history.replaceState(null, '', location.pathname + location.hash); }
  window.__habitica = { getState, act, ui, net };   // untuk pengujian
}
init();
