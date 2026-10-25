import { taskDone, isOverdue, PRIORITY, taskCompletedDate } from './tasks.js';
import { habitDone } from './habits.js';
import { isRecurring, isScheduledOn } from './schedule.js';

// Menyusun isi layar "Hari ini". Tugas sekali pakai tanpa tenggat hanya muncul
// bila diprioritaskan; sisanya tinggal di "Semua tugas" supaya hari ini tidak menumpuk.
export function buildToday(state, d) {
  const items = [];
  for (const t of state.tasks) {
    if (t.archivedAt) continue;
    const done = taskDone(state, t, d);
    if (isRecurring(t)) {
      if (isScheduledOn(t, d)) items.push({ kind: 'task', item: t, done, overdue: false, pinned: t.pinDate === d });
    } else if (done) {
      if (taskCompletedDate(state, t) === d) items.push({ kind: 'task', item: t, done: true, overdue: false, pinned: t.pinDate === d });
    } else if ((t.due && t.due <= d) || t.pinDate === d) {
      items.push({ kind: 'task', item: t, done: false, overdue: isOverdue(t, d), pinned: t.pinDate === d });
    }
  }
  for (const h of state.habits) {
    if (h.archivedAt) continue;
    const done = habitDone(state, h, d);
    if (isScheduledOn(h, d) || done) items.push({ kind: 'habit', item: h, done, overdue: false, pinned: false });
  }
  const rank = x => [x.pinned ? 0 : 1, -(x.kind === 'task' ? PRIORITY[x.item.priority].rank : 1), x.overdue ? 0 : 1, x.item.time || '99:99', x.item.createdAt || 0];
  const cmp = (a, b) => { const A = rank(a), B = rank(b); for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return A[i] < B[i] ? -1 : 1; return 0; };
  const open = items.filter(x => !x.done).sort(cmp);
  const done = items.filter(x => x.done).sort(cmp);
  const next = open[0] || null;
  const rest = open.slice(1);
  return {
    next, total: items.length, doneCount: done.length, remaining: open.length,
    pinned: rest.filter(x => x.pinned && x.kind === 'task'),
    tasks: rest.filter(x => !x.pinned && x.kind === 'task'),
    habits: rest.filter(x => x.kind === 'habit'),
    done,
    open,
  };
}
