// Jadwal berulang dengan RIWAYAT: setiap perubahan jadwal menambah entri baru
// {from, type, days}. Hari lampau tetap dihitung dengan jadwal yang berlaku saat itu,
// sehingga mengedit jadwal tidak menulis ulang statistik masa lalu.
import { weekday, DAY_SHORT } from './dates.js';

export const lastSched = item => { for (let i = item.sched.length - 1; i >= 0; i--) if (item.sched[i].type !== 'pause') return item.sched[i]; return item.sched[item.sched.length - 1]; };
export function effectiveSched(item, d) {
  let cur = null;
  for (const s of item.sched) { if (s.from <= d) cur = s; else break; }
  return cur;
}
export const isRecurring = item => { const s = lastSched(item); return !!s && s.type !== 'once'; };
export function isScheduledOn(item, d) {
  if (item.archivedAt && d >= item.archivedAt) return false;
  const s = effectiveSched(item, d);
  if (!s) return false;
  if (s.type === 'daily') return true;
  if (s.type === 'weekly') return s.days.includes(weekday(d));
  return false;
}
const sameSched = (a, b) => a.type === b.type && a.days.join() === b.days.join();
export function setSchedule(item, next, todayStr) {
  const n = { from: todayStr, type: next.type, days: next.type === 'weekly' ? [...next.days].sort() : [] };
  const last = lastSched(item);
  if (last && sameSched(last, n)) return false;
  if (last && last.from === todayStr) item.sched[item.sched.length - 1] = n;
  else item.sched.push(n);
  return true;
}
// Dipakai saat arsip dipulihkan: masa arsip ditandai 'pause' agar tidak dihitung sebagai hari terlewat.
export function resumeSchedule(item, todayStr) {
  const prev = [...item.sched].reverse().find(x => x.type !== 'pause');
  if (prev && prev.type !== 'once') {
    if (item.archivedAt && item.archivedAt < todayStr) item.sched.push({ from: item.archivedAt, type: 'pause', days: [] });
    item.sched.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
    const lastI = item.sched[item.sched.length - 1];
    const n = { from: todayStr, type: prev.type, days: [...prev.days] };
    if (lastI.from === todayStr) item.sched[item.sched.length - 1] = n; else item.sched.push(n);
  }
  item.archivedAt = null;
}
export function describeSched(s) {
  if (!s || s.type === 'pause') return '';
  if (s.type === 'daily') return 'Setiap hari';
  if (s.type === 'weekly') return s.days.length === 5 && s.days.join() === '1,2,3,4,5' ? 'Hari kerja' : s.days.map(i => DAY_SHORT[i]).join(', ');
  return 'Sekali';
}
