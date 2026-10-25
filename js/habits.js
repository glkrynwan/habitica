import { newId } from './util.js';
import { isDone } from './xp.js';
import { addDays, diffDays } from './dates.js';
import { isScheduledOn, setSchedule } from './schedule.js';

export function createHabit(state, inp, todayStr, ts) {
  const rep = inp.repeat || { type: 'daily', days: [] };
  const h = {
    id: newId(), title: inp.title.trim().slice(0, 120), notes: (inp.notes || '').trim().slice(0, 1000),
    cat: inp.cat ?? null, effort: inp.effort || 'easy', time: inp.time || '',
    sched: [{ from: todayStr, type: rep.type === 'weekly' ? 'weekly' : 'daily', days: rep.type === 'weekly' ? [...rep.days].sort() : [] }],
    created: todayStr, createdAt: ts, archivedAt: null,
  };
  state.habits.push(h);
  return h;
}
export function updateHabit(state, h, inp, todayStr) {
  const rep = inp.repeat || { type: 'daily', days: [] };
  h.title = inp.title.trim().slice(0, 120);
  h.notes = (inp.notes || '').trim().slice(0, 1000);
  h.cat = inp.cat ?? null;
  h.effort = inp.effort || h.effort;
  h.time = inp.time || '';
  setSchedule(h, { type: rep.type === 'weekly' ? 'weekly' : 'daily', days: rep.days || [] }, todayStr);
  return h;
}
export const habitDone = (state, h, d) => isDone(state, 'habit', h.id, d);

// Streak per kebiasaan: hari terjadwal berturut-turut yang selesai. Hari yang tidak
// dijadwalkan dilewati (tidak memutus). Hari ini yang belum selesai belum memutus streak.
export function habitStreaks(state, h, todayStr) {
  let start = h.created < h.sched[0].from ? h.created : h.sched[0].from;
  if (diffDays(start, todayStr) > 3660) start = addDays(todayStr, -3660);
  let run = 0, longest = 0;
  for (let d = start; d <= todayStr; d = addDays(d, 1)) {
    if (habitDone(state, h, d)) { run++; if (run > longest) longest = run; }
    else if (isScheduledOn(h, d) && d !== todayStr) run = 0;
  }
  return { current: run, longest };
}
