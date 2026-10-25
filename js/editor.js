// Formulir tugas / kebiasaan. Hanya judul yang wajib; sisanya opsional.
import { h, openSheet } from './ui.js';
import { EFFORT } from './xp.js';
import { PRIORITY } from './tasks.js';
import { DAY_SHORT } from './dates.js';
import { lastSched } from './schedule.js';
import { newId } from './util.js';
import { catName } from './cats.js';

export function openEditor({ state, kind = 'task', item = null, today, onSave }) {
  const editing = !!item;
  let type = kind;
  const last = item ? lastSched(item) : null;
  let days = last && last.type === 'weekly' ? [...last.days] : [1, 2, 3, 4, 5];
  let steps = item && item.steps ? item.steps.map(x => ({ ...x })) : [];

  const err = h('p', { class: 'field-error', role: 'alert', id: 'f-err', hidden: true });
  const title = h('input', { id: 'f-title', type: 'text', maxlength: 120, required: true, autocomplete: 'off', 'aria-describedby': 'f-err', value: item ? item.title : '', placeholder: 'Apa yang ingin kamu kerjakan?' });
  const repeat = h('select', { id: 'f-repeat', onChange: sync });
  const due = h('input', { id: 'f-due', type: 'date', value: item && item.due ? item.due : '' });
  const pin = h('input', { id: 'f-pin', type: 'checkbox', checked: item ? item.pinDate === today : false });
  const notes = h('textarea', { id: 'f-notes', rows: 3, maxlength: 1000, value: item ? item.notes : '' });
  const cat = h('input', { id: 'f-cat', type: 'text', list: 'f-cats', maxlength: 40, autocomplete: 'off', value: item ? catName(state, item.cat) : '', placeholder: 'mis. Belajar, Kesehatan' });
  const catList = h('datalist', { id: 'f-cats' }, state.cats.map(c => h('option', { value: c.name })));
  const priority = h('select', { id: 'f-prio' }, Object.entries(PRIORITY).map(([k, v]) => h('option', { value: k, selected: (item ? item.priority : 'normal') === k, text: v.label })));
  const effort = h('select', { id: 'f-effort' });
  const time = h('input', { id: 'f-time', type: 'time', value: item && item.time ? item.time : '' });
  const dayRow = h('div', { class: 'days', role: 'group', 'aria-label': 'Hari' });
  const stepList = h('ul', { class: 'step-edit' });
  const stepIn = h('input', { id: 'f-step', type: 'text', maxlength: 120, placeholder: 'Tambah langkah kecil…', autocomplete: 'off',
    onKeydown: e => { if (e.key === 'Enter') { e.preventDefault(); addStep(); } } });
  const typeBtns = ['task', 'habit'].map(k => h('button', { type: 'button', class: 'seg', 'aria-pressed': String(type === k), text: k === 'task' ? 'Tugas' : 'Kebiasaan',
    onClick: () => { type = k; typeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(['task', 'habit'][i] === type))); fillRepeat(); sync(); } }));

  const rows = {
    type: h('div', { class: 'seg-group', role: 'group', 'aria-label': 'Jenis' }, typeBtns),
    due: h('label', { class: 'field' }, h('span', { text: 'Tenggat (opsional)' }), due),
    pin: h('label', { class: 'check' }, pin, h('span', { text: 'Jadikan prioritas hari ini (maks. 3)' })),
    prio: h('label', { class: 'field' }, h('span', { text: 'Prioritas' }), priority),
    time: h('label', { class: 'field' }, h('span', { text: 'Waktu (opsional)' }), time),
    steps: h('div', { class: 'field' }, h('span', { text: 'Pecah menjadi langkah kecil' }), stepList,
      h('div', { class: 'step-add' }, stepIn, h('button', { type: 'button', class: 'btn secondary', text: 'Tambah', onClick: addStep }))),
  };

  function fillRepeat() {
    const cur = repeat.value || (last ? last.type : (type === 'habit' ? 'daily' : 'once'));
    const opts = type === 'habit' ? [['daily', 'Setiap hari'], ['weekly', 'Hari tertentu']] : [['once', 'Sekali'], ['daily', 'Setiap hari'], ['weekly', 'Hari tertentu']];
    repeat.replaceChildren(...opts.map(([v, l]) => h('option', { value: v, text: l })));
    repeat.value = opts.some(o => o[0] === cur) ? cur : opts[0][0];
    effort.replaceChildren(...Object.entries(EFFORT).map(([k, v]) => h('option', { value: k, text: `${v.label} · ${v.xp} XP` })));
    effort.value = item ? item.effort : (type === 'habit' ? 'easy' : 'medium');
  }
  function renderDays() {
    dayRow.replaceChildren(...DAY_SHORT.map((n, i) => h('button', { type: 'button', 'aria-pressed': String(days.includes(i)), text: n,
      onClick: e => { days = days.includes(i) ? days.filter(x => x !== i) : [...days, i]; e.currentTarget.setAttribute('aria-pressed', String(days.includes(i))); } })));
  }
  function renderSteps() {
    stepList.replaceChildren(...steps.map((st, i) => h('li', {}, h('span', { text: st.text }),
      h('button', { type: 'button', class: 'icon-btn small', 'aria-label': `Hapus langkah: ${st.text}`, text: '✕', onClick: () => { steps.splice(i, 1); renderSteps(); } }))));
  }
  function addStep() {
    const v = stepIn.value.trim(); if (!v) return;
    if (steps.length >= 50) return;
    steps.push({ id: newId(), text: v.slice(0, 120), done: false }); stepIn.value = ''; renderSteps(); stepIn.focus();
  }
  function sync() {
    const isTask = type === 'task', r = repeat.value;
    rows.type.hidden = editing;
    rows.due.hidden = !(isTask && r === 'once');
    rows.pin.hidden = !(isTask && r === 'once');
    rows.prio.hidden = !isTask;
    rows.time.hidden = isTask;
    rows.steps.hidden = !isTask;
    dayRow.parentElement.hidden = r !== 'weekly';
  }
  function submit() {
    const t = title.value.trim();
    if (!t) { err.textContent = 'Isi judul terlebih dahulu.'; err.hidden = false; title.setAttribute('aria-invalid', 'true'); title.focus(); return; }
    if (repeat.value === 'weekly' && !days.length) { err.textContent = 'Pilih minimal satu hari.'; err.hidden = false; return; }
    const pendingStep = stepIn.value.trim(); if (pendingStep && type === 'task') addStep();
    const r = repeat.value;
    onSave(type, {
      title: t, notes: notes.value, catName: cat.value, effort: effort.value, priority: priority.value,
      repeat: { type: r, days: r === 'weekly' ? days : [] },
      due: type === 'task' && r === 'once' ? (due.value || null) : null,
      pinDate: type === 'task' && r === 'once' ? (pin.checked ? today : null) : null,
      time: type === 'habit' ? time.value : '', steps: type === 'task' ? steps : [],
    }, item);
    dlg.close('saved');
  }

  const daysWrap = h('div', { class: 'field' }, h('span', { text: 'Hari' }), dayRow);
  const details = h('details', { class: 'details', open: editing && !!(item.notes || item.cat || (item.steps && item.steps.length)) },
    h('summary', { text: 'Detail (opsional)' }),
    rows.prio, h('label', { class: 'field' }, h('span', { text: 'Bobot (menentukan XP)' }), effort), rows.time,
    h('label', { class: 'field' }, h('span', { text: 'Kategori' }), cat, catList),
    h('label', { class: 'field' }, h('span', { text: 'Catatan' }), notes), rows.steps);
  const form = h('form', { class: 'form', novalidate: true, onSubmit: e => { e.preventDefault(); submit(); } },
    rows.type,
    h('label', { class: 'field' }, h('span', { text: 'Judul' }), title), err,
    h('label', { class: 'field' }, h('span', { text: 'Ulangi' }), repeat), daysWrap, rows.due, rows.pin, details,
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn ghost', text: 'Batal', onClick: () => dlg.close('cancel') }),
      h('button', { type: 'submit', class: 'btn primary', text: editing ? 'Simpan perubahan' : 'Tambah' })));
  const dlg = openSheet({ title: editing ? (kind === 'habit' ? 'Ubah kebiasaan' : 'Ubah tugas') : 'Tambah baru', content: form });
  // Tab "Detail" yang berisi langkah diperlukan oleh tugas saja; urutan sinkron:
  fillRepeat(); renderDays(); renderSteps(); sync();
  if (!editing) title.focus();
  return dlg;
}
