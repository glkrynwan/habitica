import { newId } from './util.js';
import { isDone, completeItem, reopenItem, keyOf, getEntry } from './xp.js';
import { isRecurring, setSchedule, lastSched } from './schedule.js';
import { catName } from './cats.js';

export const PRIORITY = { low: { label: 'Rendah', rank: 0 }, normal: { label: 'Normal', rank: 1 }, high: { label: 'Tinggi', rank: 2 } };
export const MAX_PINS = 3;

function cleanSteps(steps) {
  return (steps || []).slice(0, 50).map(s => ({ id: s.id || newId(), text: String(s.text || '').trim().slice(0, 120), done: !!s.done })).filter(s => s.text);
}
export function createTask(state, inp, todayStr, ts) {
  const rep = inp.repeat || { type: 'once', days: [] };
  const t = {
    id: newId(), title: inp.title.trim().slice(0, 120), notes: (inp.notes || '').trim().slice(0, 1000),
    cat: inp.cat ?? null, priority: inp.priority in PRIORITY ? inp.priority : 'normal',
    effort: inp.effort || 'medium', due: rep.type === 'once' ? (inp.due || null) : null,
    sched: [{ from: todayStr, type: rep.type, days: rep.type === 'weekly' ? [...rep.days].sort() : [] }],
    pinDate: inp.pinDate || null, steps: cleanSteps(inp.steps), created: todayStr, createdAt: ts, archivedAt: null,
  };
  state.tasks.push(t);
  return t;
}
export function updateTask(state, t, inp, todayStr) {
  const rep = inp.repeat || { type: 'once', days: [] };
  t.title = inp.title.trim().slice(0, 120);
  t.notes = (inp.notes || '').trim().slice(0, 1000);
  t.cat = inp.cat ?? null;
  t.priority = inp.priority in PRIORITY ? inp.priority : 'normal';
  t.effort = inp.effort || t.effort;          // XP entri lama tidak berubah (snapshot di ledger)
  setSchedule(t, rep, todayStr);
  t.due = rep.type === 'once' ? (inp.due || null) : null;
  if ('pinDate' in inp) t.pinDate = inp.pinDate;
  t.steps = cleanSteps(inp.steps);
  return t;
}
export const occOf = (t, d) => (isRecurring(t) ? d : 'once');
export const taskDone = (state, t, d) => isDone(state, 'task', t.id, occOf(t, d));
export function taskCompletedDate(state, t) {
  const e = getEntry(state, keyOf('task', t.id, 'once'));
  return e && e.active ? e.date : null;
}
export const isOverdue = (t, d) => !isRecurring(t) && !!t.due && t.due < d;
export function pinnedCount(state, d) {
  return state.tasks.filter(t => t.pinDate === d && !t.archivedAt && !taskDone(state, t, d)).length;
}
export const repeatType = t => lastSched(t).type;
