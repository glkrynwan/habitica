// Pembantu DOM. Semua teks pengguna masuk lewat textContent (tanpa API HTML mentah).
const SVG_NS = 'http://www.w3.org/2000/svg';

function apply(el, props) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') for (const [sk, sv] of Object.entries(v)) (sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv));
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'open') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}
function append(el, kids) {
  for (const c of kids.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export function h(tag, props, ...kids) { const el = document.createElement(tag); apply(el, props); append(el, kids); return el; }
export function s(tag, props, ...kids) { const el = document.createElementNS(SVG_NS, tag); apply(el, props); append(el, kids); return el; }

/* ---------- toast (antrean, tidak mengganggu) ---------- */
const queue = []; let showing = false, closeCurrent = null, shownAt = 0;
export function toast(message, opts = {}) {
  queue.push({ message, ...opts });
  if (!showing) next();
  else if (closeCurrent) setTimeout(() => closeCurrent && closeCurrent(), Math.max(0, 900 - (Date.now() - shownAt)));   // umpan balik tidak menunggu antrean panjang
}
function next() {
  const region = document.getElementById('toasts');
  const t = queue.shift();
  if (!t || !region) { showing = false; return; }
  showing = true;
  const el = h('div', { class: 'toast' + (t.kind ? ' ' + t.kind : '') }, h('span', { text: t.message }));
  let timer;
  const close = () => { if (closeCurrent !== close) return; closeCurrent = null; clearTimeout(timer); el.classList.remove('on'); setTimeout(() => { el.remove(); next(); }, 180); };
  closeCurrent = close; shownAt = Date.now();
  if (t.action) el.append(h('button', { class: 'toast-act', type: 'button', text: t.action.label, onClick: () => { t.action.fn(); close(); } }));
  region.replaceChildren(el);
  requestAnimationFrame(() => el.classList.add('on'));
  timer = setTimeout(close, t.ms || (t.action ? 6000 : 2600));
}

/* ---------- dialog (<dialog> bawaan: fokus terkunci, Esc, dan fokus kembali otomatis) ---------- */
export function openSheet({ title, content, className = '', onClose, labelledBy }) {
  const dlg = h('dialog', { class: 'sheet ' + className, 'aria-labelledby': labelledBy || 'sheet-title' },
    h('div', { class: 'sheet-inner' }, title ? h('h2', { id: labelledBy || 'sheet-title', class: 'sheet-title', text: title }) : null, content));
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close('dismiss'); });
  dlg.addEventListener('close', () => { dlg.remove(); if (onClose) onClose(dlg.returnValue); });
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

export function confirmDialog({ title, message, confirmLabel = 'Lanjutkan', cancelLabel = 'Batal', danger = false, requireText = null }) {
  return new Promise(resolve => {
    let input = null;
    const ok = h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', text: confirmLabel, disabled: !!requireText });
    if (requireText) {
      input = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', 'aria-label': `Ketik ${requireText} untuk melanjutkan`, onInput: () => { ok.disabled = input.value.trim() !== requireText; } });
    }
    const body = h('div', {}, h('p', { class: 'sheet-msg', text: message }),
      requireText ? h('label', { class: 'field' }, h('span', { text: `Ketik ${requireText} untuk melanjutkan` }), input) : null,
      h('div', { class: 'actions' }, h('button', { class: 'btn ghost', type: 'button', text: cancelLabel, onClick: () => dlg.close('no') }), ok));
    const dlg = openSheet({ title, content: body, className: 'small', onClose: v => resolve(v === 'yes') });
    ok.addEventListener('click', () => dlg.close('yes'));
  });
}

export function menuSheet(title, entries) {
  const list = h('div', { class: 'menu' });
  const dlg = openSheet({ title, content: list });
  for (const e of entries) {
    if (!e) continue;
    list.append(h('button', { class: 'menu-item' + (e.danger ? ' danger-text' : ''), type: 'button', text: e.label, onClick: () => { dlg.close('action'); setTimeout(e.fn, 0); } }));
  }
  list.append(h('button', { class: 'btn ghost block', type: 'button', text: 'Tutup', onClick: () => dlg.close('dismiss') }));
  return dlg;
}
export const plural = (n, one) => `${n} ${one}`;
