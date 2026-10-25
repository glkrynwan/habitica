import { newId } from './util.js';
export const catName = (state, id) => (state.cats.find(c => c.id === id) || {}).name || '';
export const findCat = (state, id) => state.cats.find(c => c.id === id) || null;
// Mengembalikan id kategori untuk sebuah nama (membuat bila belum ada). '' => null.
export function resolveCat(state, name) {
  name = (name || '').trim().slice(0, 40);
  if (!name) return null;
  const ex = state.cats.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (ex) return ex.id;
  const c = { id: newId(), name, icon: '' };
  state.cats.push(c);
  return c.id;
}
export function catHue(name) { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }
