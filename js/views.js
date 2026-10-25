// Renderer layar. Fungsi murni: (konteks) -> DOM. Semua aksi diteruskan lewat c.act.
import { h, s } from './ui.js';
import { EFFORT, totalXp, levelInfo, isDone, keyOf, getEntry } from './xp.js';
import { addDays, lastDays, formatLong, formatShort, formatMedium, relativeDue, greeting, diffDays, DAY_SHORT, nowDate } from './dates.js';
import { describeSched, lastSched, isRecurring, isScheduledOn } from './schedule.js';
import { buildToday } from './today.js';
import { PRIORITY, taskDone, isOverdue, taskCompletedDate } from './tasks.js';
import { habitDone, habitStreaks } from './habits.js';
import { catName, catHue } from './cats.js';
import { overallStreak, xpByDay, countOn, countBetween, categoryCounts, habitConsistency, focusSeconds, totals, activeEntries } from './stats.js';
import { ACHIEVEMENTS } from './achievements.js';
import { pct } from './util.js';

/* ---------- komponen kecil ---------- */
const chip = (text, cls = '') => h('span', { class: 'chip ' + cls, text });
const section = (title, ...kids) => h('section', { class: 'block' }, title ? h('h2', { class: 'block-title', text: title }) : null, ...kids);
const empty = (title, text, ...actions) => h('div', { class: 'empty' }, h('p', { class: 'empty-title', text: title }), text ? h('p', { class: 'muted', text }) : null, actions.length ? h('div', { class: 'actions center' }, ...actions) : null);
const btn = (text, onClick, cls = 'secondary') => h('button', { type: 'button', class: 'btn ' + cls, text, onClick });
const bar = (p, cls = '') => h('div', { class: 'bar ' + cls, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': p }, h('i', { style: { width: Math.max(0, Math.min(100, p)) + '%' } }));
const checkIcon = () => s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', class: 'tick' }, s('path', { d: 'M5 12.5l4.5 4.5L19 7.5' }));

function catBadge(name) {
  const dot = h('span', { class: 'dot' }); dot.style.setProperty('--hue', catHue(name));
  return h('span', { class: 'chip cat' }, dot, name);
}
function checkBtn({ done, label, onClick, pop, fk }) {
  return h('button', { class: 'check-btn' + (done ? ' done' : '') + (pop ? ' pop' : ''), type: 'button', role: 'checkbox', 'aria-checked': String(done), 'aria-label': label, 'data-fk': fk, onClick }, checkIcon());
}

function metaChips(c, x) {
  const { state, date } = c, it = x.item, out = [];
  const cn = catName(state, it.cat); if (cn) out.push(catBadge(cn));
  if (x.kind === 'task') {
    if (it.priority === 'high') out.push(chip('Prioritas tinggi', 'prio'));
    else if (it.priority === 'low') out.push(chip('Rendah', 'muted'));
    if (isRecurring(it)) out.push(chip(describeSched(lastSched(it)), 'muted'));
    else if (x.done && x.doneDate) out.push(chip('Selesai ' + formatShort(x.doneDate), 'ok'));
    else if (it.due) {
      const n = diffDays(date, it.due);
      out.push(n < 0 ? chip(`Terlewat ${-n} hari`, 'late') : chip('Tenggat: ' + relativeDue(it.due, date), n === 0 ? 'warn' : 'muted'));
    }
  } else {
    if (it.time) out.push(chip(it.time, 'muted'));
    out.push(chip(describeSched(lastSched(it)), 'muted'));
    const st = habitStreaks(state, it, date).current;
    if (st > 1) out.push(chip(`🔥 ${st}`, 'streak'));
  }
  out.push(chip(`+${EFFORT[it.effort].xp} XP`, 'xp'));
  if (it.sample) out.push(chip('Contoh', 'muted'));
  return out;
}

function stepsBlock(c, x) {
  const t = x.item; if (x.kind !== 'task' || !t.steps.length) return null;
  const open = c.ui.expanded.has(t.id), n = t.steps.filter(z => z.done).length;
  const toggle = h('button', { type: 'button', class: 'chip steps', 'aria-expanded': String(open), 'data-fk': 'st-' + t.id, text: `${n}/${t.steps.length} langkah ${open ? '▴' : '▾'}`, onClick: () => c.act.toggleExpanded(t.id) });
  const list = open ? h('ul', { class: 'steps' }, t.steps.map(z => h('li', {}, h('button', { type: 'button', class: 'mini-check' + (z.done ? ' done' : ''), role: 'checkbox', 'aria-checked': String(z.done), 'aria-label': z.text, onClick: () => c.act.toggleStep(t, z.id) }, checkIcon()), h('span', { class: z.done ? 'struck' : '', text: z.text })))) : null;
  return { toggle, list };
}

function itemRow(c, x, opts = {}) {
  const it = x.item, steps = stepsBlock(c, x);
  const popKey = c.ui.popKey && c.ui.popKey === it.id + '|' + c.date;
  const meta = metaChips(c, x); if (steps) meta.splice(Math.min(1, meta.length), 0, steps.toggle);
  return h('li', { class: 'row' + (x.done ? ' done' : '') + (it.priority === 'high' && !x.done ? ' hi' : '') },
    checkBtn({ done: x.done, pop: popKey, fk: 'ck-' + x.kind + it.id, label: (x.done ? 'Buka kembali: ' : 'Selesaikan: ') + it.title, onClick: () => c.act.toggle(x.kind, it, c.date) }),
    h('div', { class: 'row-main' },
      h('button', { type: 'button', class: 'row-title', 'data-fk': 'tt-' + x.kind + it.id, text: it.title, onClick: () => c.act.edit(x.kind, it) }),
      h('div', { class: 'row-meta' }, meta),
      it.notes && !opts.compact ? h('p', { class: 'row-note', text: it.notes }) : null,
      steps && steps.list),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Menu untuk ${it.title}`, 'data-fk': 'mn-' + x.kind + it.id, text: '⋯', onClick: () => c.act.menu(x.kind, it) }));
}
const list = (c, xs, opts) => h('ul', { class: 'rows' }, xs.map(x => itemRow(c, x, opts)));

function ring(c, done, total) {
  const R = 42, C = 2 * Math.PI * R, p = total ? done / total : 0, prev = c.ui.prevRing ?? p;
  const arc = s('circle', { class: 'ring-arc' + (total && done === total ? ' full' : ''), cx: 50, cy: 50, r: R, 'stroke-dasharray': C.toFixed(2) });
  arc.style.strokeDashoffset = (C * (1 - prev)).toFixed(2);
  requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = (C * (1 - p)).toFixed(2); }));
  c.ui.prevRing = p;
  return h('div', { class: 'ring', role: 'img', 'aria-label': `${done} dari ${total} selesai hari ini` },
    s('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' }, s('circle', { class: 'ring-bg', cx: 50, cy: 50, r: R }), arc),
    h('div', { class: 'ring-num' }, h('b', { text: String(done) }), h('span', { text: `/${total}` })));
}

/* ---------- HARI INI ---------- */
export function renderToday(c) {
  const { state, date, act } = c, T = buildToday(state, date);
  const hour = nowDate().getHours();
  const summary = T.total === 0 ? 'Belum ada rencana untuk hari ini.' : T.remaining === 0 ? 'Semua selesai. Kamu boleh istirahat.' : `Tersisa ${T.remaining} dari ${T.total}.`;
  const root = h('div', { class: 'view' });

  root.append(h('section', { class: 'hero' }, ring(c, T.doneCount, T.total),
    h('div', { class: 'hero-text' }, h('h1', { text: greeting(hour) }), h('p', { class: 'muted', text: formatLong(date) }), h('p', { class: 'hero-sum', text: summary }))));

  const info = overallStreak(state, date);
  const gap = info.lastActive && diffDays(info.lastActive, date) >= 2 && countOn(state, date) === 0;
  if (gap && !c.ui.recoveryDismissed && T.open.length) {
    const easy = [...T.open].sort((a, b) => EFFORT[a.item.effort].xp - EFFORT[b.item.effort].xp)[0];
    root.append(h('div', { class: 'banner soft', role: 'region', 'aria-label': 'Selamat datang kembali' },
      h('p', {}, h('b', { text: 'Senang kamu kembali. ' }), 'Tidak apa-apa melewatkan beberapa hari. Mulai dari satu hal kecil saja.'),
      h('div', { class: 'actions' }, btn('Mulai dengan: ' + easy.item.title.slice(0, 30), () => act.focus(easy.kind, easy.item), 'primary'), btn('Nanti', () => act.dismissRecovery(), 'ghost'))));
  }
  if (c.backupDue) root.append(h('div', { class: 'banner', role: 'region', 'aria-label': 'Pengingat cadangan' },
    h('p', {}, 'Datamu hanya tersimpan di browser ini. Unduh cadangan agar aman jika data browser terhapus.'),
    h('div', { class: 'actions' }, btn('Unduh cadangan', () => act.exportData(), 'primary'), btn('Ingatkan nanti', () => act.snoozeBackup(), 'ghost'))));

  if (T.next) {
    const n = T.next, it = n.item;
    root.append(h('section', { class: 'next', 'aria-labelledby': 'next-h' },
      h('p', { id: 'next-h', class: 'next-label', text: T.doneCount === 0 && T.pinned.length ? 'Mulai dari sini' : 'Langkah berikutnya' }),
      h('h2', { class: 'next-title', text: it.title }),
      h('div', { class: 'row-meta' }, metaChips(c, n)),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn primary', 'data-fk': 'next-focus', text: 'Mulai fokus', onClick: () => act.focus(n.kind, it) }),
        h('button', { type: 'button', class: 'btn secondary', 'data-fk': 'next-done', text: 'Selesai', onClick: () => act.toggle(n.kind, it, date) }))));
  } else if (T.total > 0) {
    root.append(h('section', { class: 'next allclear' }, h('p', { class: 'next-label', text: 'Hari ini' }), h('h2', { class: 'next-title', text: 'Semua rencana hari ini selesai' }),
      h('p', { class: 'muted', text: 'Tambah satu hal lagi jika masih ada tenaga, atau berhenti di sini. Keduanya baik.' })));
  }

  const input = h('input', { type: 'text', maxlength: 120, autocomplete: 'off', 'data-fk': 'quick', placeholder: 'Tambah tugas hari ini…', 'aria-label': 'Tambah tugas cepat untuk hari ini' });
  root.append(h('form', { class: 'quick', onSubmit: e => { e.preventDefault(); const v = input.value.trim(); if (v) { act.quickAdd(v, true); } } }, input, h('button', { type: 'submit', class: 'btn primary', text: 'Tambah' })));
  root.append(h('button', { type: 'button', class: 'btn ghost', text: 'Fokus bebas (tanpa tugas)', onClick: () => act.focus(null, null) }));

  if (T.total === 0) {
    root.append(empty('Mulai dari satu hal kecil', 'Satu tugas yang jelas lebih berguna daripada daftar panjang.',
      btn('Tambah tugas', () => act.add('task'), 'primary'), btn('Buat kebiasaan', () => act.add('habit')), state.tasks.length + state.habits.length === 0 ? btn('Coba dengan contoh', () => act.addSamples(), 'ghost') : null));
  }
  if (T.pinned.length) root.append(section('Prioritas hari ini', list(c, T.pinned)));
  if (T.tasks.length) root.append(section('Tugas', list(c, T.tasks)));
  if (T.habits.length) root.append(section('Kebiasaan', list(c, T.habits)));
  if (T.done.length) {
    const d = h('details', { class: 'block fold', open: c.ui.doneOpen, onToggle: e => { c.ui.doneOpen = e.currentTarget.open; } }, h('summary', { text: `Selesai hari ini (${T.done.length})` }), list(c, T.done, { compact: true }));
    root.append(d);
  }

  const lv = levelInfo(totalXp(state)), last = Object.entries(state.achievements).sort((a, b) => (a[1] < b[1] ? 1 : -1))[0];
  const la = last && ACHIEVEMENTS.find(a => a.id === last[0]);
  root.append(h('button', { type: 'button', class: 'summary-strip', onClick: () => act.go('progress') },
    h('span', {}, h('b', { text: `Level ${lv.level}` }), ` · ${totalXp(state)} XP`),
    h('span', {}, info.current ? `🔥 ${info.current} hari berturut` : 'Belum ada streak'),
    la ? h('span', { class: 'muted', text: `Terbaru: ${la.name}` }) : null,
    h('span', { class: 'link', text: 'Lihat progres' })));
  return root;
}

/* ---------- SEMUA TUGAS ---------- */
const FILTERS = [['active', 'Aktif'], ['done', 'Selesai'], ['archived', 'Arsip'], ['all', 'Semua']];
const SORTS = [['due', 'Tenggat'], ['priority', 'Prioritas'], ['new', 'Terbaru'], ['name', 'Nama']];

export function renderTasks(c) {
  const { state, date, act, ui } = c, f = ui.tasks;
  const q = f.q.trim().toLowerCase();
  const all = state.tasks.map(t => {
    const done = taskDone(state, t, date);
    return { kind: 'task', item: t, done, doneDate: !isRecurring(t) && done ? taskCompletedDate(state, t) : null, overdue: !done && isOverdue(t, date), pinned: t.pinDate === date };
  }).filter(x => {
    const t = x.item;
    if (f.cat && (t.cat || '') !== f.cat) return false;
    if (q && !(t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q) || catName(state, t.cat).toLowerCase().includes(q) || t.steps.some(z => z.text.toLowerCase().includes(q)))) return false;
    const everDone = !isRecurring(t) && !!taskCompletedDate(state, t);
    if (f.filter === 'archived') return !!t.archivedAt;
    if (f.filter === 'done') return !t.archivedAt && everDone;
    if (f.filter === 'active') return !t.archivedAt && !everDone;
    return true;
  });
  const cmpDue = (a, b) => ((a.item.due || '9999') < (b.item.due || '9999') ? -1 : (a.item.due || '9999') > (b.item.due || '9999') ? 1 : 0);
  const sorters = {
    due: (a, b) => cmpDue(a, b) || PRIORITY[b.item.priority].rank - PRIORITY[a.item.priority].rank || a.item.createdAt - b.item.createdAt,
    priority: (a, b) => PRIORITY[b.item.priority].rank - PRIORITY[a.item.priority].rank || cmpDue(a, b),
    new: (a, b) => b.item.createdAt - a.item.createdAt,
    name: (a, b) => a.item.title.localeCompare(b.item.title, 'id'),
  };
  all.sort(sorters[f.sort]);
  if (f.filter === 'done') all.sort((a, b) => ((b.doneDate || '') < (a.doneDate || '') ? -1 : 1));

  const root = h('div', { class: 'view' }, h('div', { class: 'view-head' }, h('h1', { text: 'Semua tugas' }), btn('Tambah', () => act.add('task'), 'primary')));
  const search = h('input', { type: 'search', 'data-fk': 'q', value: f.q, placeholder: 'Cari tugas…', 'aria-label': 'Cari tugas', autocomplete: 'off', onInput: e => { f.q = e.target.value; act.rerender(); } });
  const cats = h('select', { 'aria-label': 'Filter kategori', 'data-fk': 'fcat', onChange: e => { f.cat = e.target.value; act.rerender(); } }, h('option', { value: '', text: 'Semua kategori' }), state.cats.map(k => h('option', { value: k.id, selected: f.cat === k.id, text: k.name })));
  const sort = h('select', { 'aria-label': 'Urutkan', 'data-fk': 'fsort', onChange: e => { f.sort = e.target.value; act.rerender(); } }, SORTS.map(([v, l]) => h('option', { value: v, selected: f.sort === v, text: 'Urut: ' + l })));
  root.append(h('div', { class: 'controls' }, search,
    h('div', { class: 'seg-group wrap', role: 'group', 'aria-label': 'Filter status' }, FILTERS.map(([v, l]) => h('button', { type: 'button', class: 'seg', 'data-fk': 'flt-' + v, 'aria-pressed': String(f.filter === v), text: l, onClick: () => { f.filter = v; act.rerender(); } }))),
    h('div', { class: 'two' }, cats, sort)));

  const tq = h('input', { type: 'text', maxlength: 120, autocomplete: 'off', 'data-fk': 'quick-t', placeholder: 'Tambah tugas cepat…', 'aria-label': 'Tambah tugas cepat' });
  root.append(h('form', { class: 'quick', onSubmit: e => { e.preventDefault(); const v = tq.value.trim(); if (v) act.quickAdd(v, false); } }, tq, h('button', { type: 'submit', class: 'btn secondary', text: 'Tambah' })));

  if (!all.length) {
    root.append(state.tasks.length === 0
      ? empty('Belum ada tugas', 'Tulis satu hal yang perlu dikerjakan. Tidak perlu lengkap.', btn('Tambah tugas', () => act.add('task'), 'primary'))
      : empty('Tidak ada yang cocok', 'Coba ubah filter atau kata pencarian.', btn('Atur ulang filter', () => { Object.assign(f, { q: '', cat: '', filter: 'active', sort: 'due' }); act.rerender(); })));
    return root;
  }
  if (f.filter === 'active' && f.sort === 'due') {
    const g = { late: [], today: [], soon: [], none: [], rep: [] };
    for (const x of all) {
      const t = x.item;
      if (isRecurring(t)) g.rep.push(x);
      else if (x.overdue) g.late.push(x);
      else if ((t.due && t.due === date) || t.pinDate === date) g.today.push(x);
      else if (t.due) g.soon.push(x);
      else g.none.push(x);
    }
    const defs = [['late', 'Terlewat'], ['today', 'Hari ini'], ['soon', 'Mendatang'], ['none', 'Tanpa tenggat'], ['rep', 'Berulang']];
    for (const [k, l] of defs) if (g[k].length) root.append(section(`${l} (${g[k].length})`, list(c, g[k])));
  } else root.append(list(c, all));
  return root;
}

/* ---------- KEBIASAAN ---------- */
export function renderHabits(c) {
  const { state, date, act } = c;
  const active = state.habits.filter(x => !x.archivedAt), arch = state.habits.filter(x => x.archivedAt);
  const root = h('div', { class: 'view' }, h('div', { class: 'view-head' }, h('h1', { text: 'Kebiasaan' }), btn('Tambah', () => act.add('habit'), 'primary')));
  root.append(h('p', { class: 'muted lead', text: 'Hal kecil yang diulang. Streak dihitung hanya dari hari yang dijadwalkan.' }));
  if (!active.length) root.append(empty('Belum ada kebiasaan', 'Mulai dengan satu: membaca 10 menit, latihan mengetik, atau peregangan.', btn('Buat kebiasaan', () => act.add('habit'), 'primary')));
  const days = lastDays(7, date);
  const ul = h('ul', { class: 'cards' });
  for (const hb of active) {
    const st = habitStreaks(state, hb, date), done = habitDone(state, hb, date), sched = isScheduledOn(hb, date);
    const pop = c.ui.popKey && c.ui.popKey === hb.id + '|' + date;
    ul.append(h('li', { class: 'hcard' },
      h('div', { class: 'hcard-top' },
        checkBtn({ done, pop, fk: 'ck-habit' + hb.id, label: (done ? 'Buka kembali hari ini: ' : 'Selesaikan hari ini: ') + hb.title, onClick: () => act.toggle('habit', hb, date) }),
        h('div', { class: 'row-main' }, h('button', { type: 'button', class: 'row-title', 'data-fk': 'tt-habit' + hb.id, text: hb.title, onClick: () => act.edit('habit', hb) }),
          h('div', { class: 'row-meta' }, [catName(state, hb.cat) ? catBadge(catName(state, hb.cat)) : null, hb.time ? chip(hb.time, 'muted') : null, chip(describeSched(lastSched(hb)), 'muted'), chip(`+${EFFORT[hb.effort].xp} XP`, 'xp'), hb.sample ? chip('Contoh', 'muted') : null])),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Menu untuk ${hb.title}`, 'data-fk': 'mn-habit' + hb.id, text: '⋯', onClick: () => act.menu('habit', hb) })),
      h('div', { class: 'streaks' }, h('span', {}, h('b', { text: `🔥 ${st.current}` }), ' saat ini'), h('span', {}, h('b', { text: String(st.longest) }), ' terpanjang'), !sched && !done ? h('span', { class: 'muted', text: 'Tidak dijadwalkan hari ini' }) : null),
      h('div', { class: 'strip', role: 'group', 'aria-label': `7 hari terakhir: ${hb.title}` }, days.map(d => {
        const dn = habitDone(state, hb, d), sc = isScheduledOn(hb, d), isT = d === date;
        return h('button', { type: 'button', class: 'day' + (dn ? ' on' : '') + (sc ? ' sched' : '') + (isT ? ' today' : ''), 'aria-pressed': String(dn), 'data-fk': `dy-${hb.id}-${d}`,
          'aria-label': `${formatMedium(d)}: ${dn ? 'selesai' : sc ? 'belum' : 'tidak dijadwalkan'}`, onClick: () => act.toggle('habit', hb, d) },
          h('span', { text: DAY_SHORT[new Date(d + 'T12:00').getDay()] }), h('i', { 'aria-hidden': 'true' }));
      }))));
  }
  root.append(ul);
  if (arch.length) {
    root.append(h('details', { class: 'block fold' }, h('summary', { text: `Diarsipkan (${arch.length})` }),
      h('ul', { class: 'rows' }, arch.map(hb => h('li', { class: 'row' }, h('div', { class: 'row-main' }, h('span', { class: 'row-title static', text: hb.title }), h('div', { class: 'row-meta' }, chip('Diarsipkan ' + formatShort(hb.archivedAt), 'muted'))),
        btn('Pulihkan', () => act.unarchive('habit', hb)), h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Hapus ${hb.title}`, text: '🗑', onClick: () => act.remove('habit', hb) }))))));
  }
  return root;
}

/* ---------- PROGRES ---------- */
function xpChart(state, date) {
  const days = lastDays(7, date), vals = xpByDay(state, days), max = Math.max(25, ...vals), W = 320, H = 140, bw = 30, gap = (W - 7 * bw) / 8, base = 112, top = 20;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'XP 7 hari terakhir: ' + days.map((d, i) => `${DAY_SHORT[new Date(d + 'T12:00').getDay()]} ${vals[i]}`).join(', ') });
  days.forEach((d, i) => {
    const x = gap + i * (bw + gap), bh = Math.round((vals[i] / max) * (base - top));
    svg.append(s('rect', { class: 'bar-bg', x, y: top, width: bw, height: base - top, rx: 6 }));
    if (bh > 0) svg.append(s('rect', { class: 'bar-fg' + (d === date ? ' today' : ''), x, y: base - bh, width: bw, height: bh, rx: 6 }));
    if (vals[i] > 0) svg.append(s('text', { class: 'bar-val', x: x + bw / 2, y: base - bh - 5, 'text-anchor': 'middle' }, String(vals[i])));
    svg.append(s('text', { class: 'bar-lbl' + (d === date ? ' today' : ''), x: x + bw / 2, y: 132, 'text-anchor': 'middle' }, DAY_SHORT[new Date(d + 'T12:00').getDay()]));
  });
  return svg;
}
const stat = (label, value, sub) => h('div', { class: 'stat' }, h('div', { class: 'stat-v', text: String(value) }), h('div', { class: 'stat-l', text: label }), sub ? h('div', { class: 'muted small', text: sub }) : null);

export function renderProgress(c) {
  const { state, date } = c, xp = totalXp(state), lv = levelInfo(xp), st = overallStreak(state, date), tot = totals(state);
  const w7 = addDays(date, -6), d30 = addDays(date, -29);
  const hc7 = habitConsistency(state, date, 7), cats = categoryCounts(state, d30, date), maxCat = cats.length ? cats[0].count : 1;
  const goal = state.settings.weeklyGoal, week = countBetween(state, w7, date);
  const root = h('div', { class: 'view' }, h('h1', { text: 'Progres' }));

  root.append(h('section', { class: 'level-card' }, h('div', { class: 'level-top' }, h('div', {}, h('p', { class: 'muted', text: 'Level' }), h('p', { class: 'level-num', text: String(lv.level) })), h('div', { class: 'level-xp' }, h('b', { text: `${xp} XP` }), h('span', { class: 'muted', text: ` total` }))),
    bar(lv.pct, 'xp'), h('p', { class: 'muted small', text: `${lv.span - lv.into} XP lagi menuju level ${lv.level + 1}` })));
  root.append(h('div', { class: 'stats' }, stat('Selesai hari ini', countOn(state, date)), stat('Selesai 7 hari', countBetween(state, w7, date)), stat('Streak saat ini', st.current, `terpanjang ${st.longest} hari`),
    stat('Fokus 7 hari', Math.round(focusSeconds(state, w7, date) / 60) + ' mnt')));
  if (goal > 0) root.append(section('Target mingguan', h('p', { text: `${Math.min(week, goal)} dari ${goal} selesai dalam 7 hari terakhir` }), bar(pct(Math.min(week, goal), goal))));
  root.append(section('XP 7 hari terakhir', xpChart(state, date)));
  root.append(section('Konsistensi kebiasaan (7 hari)', hc7.sched ? h('div', {}, h('p', { text: `${hc7.done} dari ${hc7.sched} hari terjadwal selesai (${pct(hc7.done, hc7.sched)}%)` }), bar(pct(hc7.done, hc7.sched)), h('p', { class: 'muted small', text: 'Hanya menghitung kebiasaan yang masih ada.' })) : h('p', { class: 'muted', text: 'Belum ada kebiasaan terjadwal pada 7 hari terakhir.' })));
  root.append(section('Aktivitas per kategori (30 hari)', cats.length ? h('ul', { class: 'hbars' }, cats.slice(0, 8).map(k => h('li', {}, h('span', { class: 'hb-l', text: k.name }), bar(pct(k.count, maxCat)), h('span', { class: 'hb-v', text: String(k.count) })))) : h('p', { class: 'muted', text: 'Belum ada aktivitas selesai.' })));
  root.append(section('Ringkasan data', h('dl', { class: 'dl' },
    h('dt', { text: 'Tugas dibuat' }), h('dd', { text: `${tot.tasksCreated} (${tot.tasksActive} aktif, ${tot.tasksArchived} arsip)` }),
    h('dt', { text: 'Tugas selesai (sepanjang waktu)' }), h('dd', { text: String(tot.completedTasks) }),
    h('dt', { text: 'Kebiasaan aktif' }), h('dd', { text: `${tot.habitsActive}${tot.habitsArchived ? ` (+${tot.habitsArchived} arsip)` : ''}` }),
    h('dt', { text: 'Kebiasaan tercatat selesai' }), h('dd', { text: String(tot.completedHabits) }))));
  root.append(section('Pencapaian', h('ul', { class: 'ach' }, ACHIEVEMENTS.map(a => { const on = state.achievements[a.id];
    return h('li', { class: on ? 'on' : 'off' }, h('b', { text: a.name }), h('span', { class: 'muted small', text: on ? 'Terbuka ' + formatShort(on) : a.desc })); }))));
  const hist = activeEntries(state).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.at - a.at)).slice(0, 40);
  const groups = []; for (const e of hist) { const g = groups[groups.length - 1]; if (g && g.date === e.date) g.items.push(e); else groups.push({ date: e.date, items: [e] }); }
  root.append(section('Riwayat selesai', groups.length ? h('div', { class: 'hist' }, groups.map(g => h('div', {}, h('h3', { text: formatMedium(g.date) }), h('ul', {}, g.items.map(e => h('li', {}, h('span', { text: e.title }), h('span', { class: 'muted small', text: `+${e.xp} XP` }))))))) : h('p', { class: 'muted', text: 'Belum ada yang selesai. Satu langkah kecil sudah cukup untuk memulai.' })));
  return root;
}

/* ---------- PENGATURAN ---------- */
export function renderSettings(c) {
  const { state, act, net } = c, se = state.settings;
  const num = (id, label, key, lo, hi, hint) => h('label', { class: 'field' }, h('span', { text: label }), h('input', { id, type: 'number', inputmode: 'numeric', min: lo, max: hi, value: String(se[key]), 'data-fk': id, onChange: e => act.setSetting(key, Number(e.target.value), lo, hi) }), hint ? h('small', { class: 'muted', text: hint }) : null);
  const root = h('div', { class: 'view' }, h('h1', { text: 'Pengaturan' }));
  root.append(section('Tampilan', h('label', { class: 'field' }, h('span', { text: 'Tema' }), h('select', { 'data-fk': 'theme', onChange: e => act.setSetting('theme', e.target.value) },
    [['auto', 'Ikuti perangkat'], ['light', 'Terang'], ['dark', 'Gelap']].map(([v, l]) => h('option', { value: v, selected: se.theme === v, text: l }))))));
  root.append(section('Fokus & target', num('set-pomo', 'Durasi Pomodoro (menit)', 'pomodoroMin', 5, 120), num('set-break', 'Durasi istirahat (menit)', 'breakMin', 1, 60), num('set-goal', 'Target mingguan (jumlah selesai)', 'weeklyGoal', 0, 500, 'Isi 0 untuk menonaktifkan.')));
  const sample = state.cats.some(k => k.sample) || state.tasks.some(t => t.sample) || state.habits.some(x => x.sample);
  const lastExp = state.meta.lastExport ? new Date(state.meta.lastExport).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'belum pernah';
  root.append(section('Data & cadangan',
    h('p', {}, 'Datamu disimpan di ', h('b', { text: 'browser ini, di perangkat ini saja' }), '. Tidak ada akun, tidak ada server, dan tidak ada sinkronisasi otomatis. Menghapus data situs, mereset browser, atau mengganti perangkat akan menghilangkan data kecuali kamu punya cadangan.'),
    h('p', { class: 'muted', text: `Cadangan terakhir: ${lastExp}. Penyimpanan permanen: ${net.persisted === true ? 'aktif' : net.persisted === false ? 'tidak dijamin oleh browser' : 'tidak diketahui'}.` }),
    h('div', { class: 'stack' }, btn('Unduh cadangan (JSON)', () => act.exportData(), 'primary'),
      h('label', { class: 'btn secondary file-btn' }, 'Pulihkan dari cadangan…', h('input', { type: 'file', accept: 'application/json,.json', 'data-fk': 'import', onChange: e => { const f = e.target.files[0]; e.target.value = ''; if (f) act.importFile(f); } })),
      c.hasPrev ? btn('Kembalikan data sebelum impor/reset terakhir', () => act.restorePrev()) : null,
      sample ? btn('Hapus data contoh', () => act.removeSamples()) : null,
      btn('Hapus semua data…', () => act.resetAll(), 'danger'))));
  const swText = { unsupported: 'Browser ini tidak mendukung mode offline.', registering: 'Menyiapkan…', ready: 'Siap. Aplikasi bisa dibuka tanpa internet.', error: 'Gagal menyiapkan mode offline: ' + (net.detail || 'tidak diketahui'), update: 'Versi baru tersedia.' }[net.sw] || '';
  root.append(section('Aplikasi & offline', h('p', { text: swText }), h('p', { class: 'muted', text: `Versi ${c.version} · ${net.online ? 'Online' : 'Offline'}` }),
    h('div', { class: 'stack' }, btn('Periksa pembaruan', () => act.checkUpdate()), net.sw === 'update' ? btn('Perbarui sekarang', () => act.applyUpdate(), 'primary') : null)));
  root.append(section('Batasan yang perlu diketahui', h('ul', { class: 'plain' },
    h('li', { text: 'Tidak ada sinkronisasi antarperangkat. Pindah perangkat = impor cadangan.' }),
    h('li', { text: 'Penyimpanan browser tidak dienkripsi; siapa pun yang memakai browser ini dapat membacanya.' }),
    h('li', { text: 'Tidak ada notifikasi pengingat. Aplikasi web tidak dapat menjadwalkannya dengan andal saat tertutup.' }),
    h('li', { text: 'Timer fokus hilang bila halaman dimuat ulang atau ditutup.' }),
    h('li', { text: 'Jadwal lampau dihitung dengan jadwal yang berlaku saat itu; kebiasaan yang dihapus tidak ikut dihitung dalam konsistensi.' }))));
  return root;
}
