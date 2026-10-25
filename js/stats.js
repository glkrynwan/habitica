// Statistik dihitung dari ledger (snapshot) — hanya angka yang bisa dihitung andal.
import { addDays, lastDays, diffDays } from './dates.js';
import { isScheduledOn } from './schedule.js';
import { habitDone } from './habits.js';

export const activeEntries = state => state.ledger.filter(e => e.active);
export const activeDates = state => new Set(activeEntries(state).map(e => e.date));

export function overallStreak(state, t) {
  const dates = activeDates(state);
  let current = 0;
  let d = dates.has(t) ? t : addDays(t, -1);   // hari ini yang belum diisi belum memutus streak
  while (dates.has(d)) { current++; d = addDays(d, -1); }
  const sorted = [...dates].sort();
  let longest = 0, run = 0, prev = null;
  for (const x of sorted) {
    run = prev && diffDays(prev, x) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = x;
  }
  return { current, longest, lastActive: sorted.length ? sorted[sorted.length - 1] : null };
}
export function xpByDay(state, days) {
  const m = Object.fromEntries(days.map(d => [d, 0]));
  for (const e of state.ledger) if (e.active && e.date in m) m[e.date] += e.xp;
  return days.map(d => m[d]);
}
export function countOn(state, d) { let n = 0; for (const e of state.ledger) if (e.active && e.date === d) n++; return n; }
export function countBetween(state, from, to) {
  let n = 0; for (const e of state.ledger) if (e.active && e.date >= from && e.date <= to) n++; return n;
}
export function categoryCounts(state, from, to) {
  const m = new Map();
  for (const e of state.ledger) if (e.active && e.date >= from && e.date <= to) {
    const k = e.cat || 'Tanpa kategori'; m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}
// Konsistensi kebiasaan yang MASIH ADA (aktif dan diarsipkan sampai tanggal arsip).
export function habitConsistency(state, t, n) {
  const days = lastDays(n, t); let sched = 0, done = 0;
  for (const h of state.habits) for (const d of days) {
    if (d < h.created) continue;
    if (isScheduledOn(h, d)) { sched++; if (habitDone(state, h, d)) done++; }
  }
  return { sched, done };
}
export function focusSeconds(state, from, to) {
  let s = 0; for (const f of state.focus) if (f.date >= from && f.date <= to) s += f.seconds; return s;
}
export function totals(state) {
  const completedTasks = state.ledger.filter(e => e.active && e.kind === 'task').length;
  const completedHabits = state.ledger.filter(e => e.active && e.kind === 'habit').length;
  return {
    tasksCreated: state.tasks.length,
    tasksActive: state.tasks.filter(t => !t.archivedAt).length,
    tasksArchived: state.tasks.filter(t => t.archivedAt).length,
    habitsActive: state.habits.filter(h => !h.archivedAt).length,
    habitsArchived: state.habits.filter(h => h.archivedAt).length,
    completedTasks, completedHabits, completedAll: completedTasks + completedHabits,
  };
}
