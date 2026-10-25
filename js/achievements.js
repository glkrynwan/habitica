import { totalXp, levelInfo } from './xp.js';
import { activeEntries, overallStreak } from './stats.js';
import { habitStreaks } from './habits.js';

export const ACHIEVEMENTS = [
  { id: 'first', name: 'Langkah pertama', desc: 'Selesaikan 1 tugas atau kebiasaan.', test: s => s.count >= 1 },
  { id: 'ten', name: 'Sepuluh selesai', desc: 'Selesaikan 10 hal.', test: s => s.count >= 10 },
  { id: 'fifty', name: 'Lima puluh selesai', desc: 'Selesaikan 50 hal.', test: s => s.count >= 50 },
  { id: 'hundred', name: 'Seratus selesai', desc: 'Selesaikan 100 hal.', test: s => s.count >= 100 },
  { id: 'streak3', name: 'Tiga hari berturut', desc: 'Aktif 3 hari berturut-turut.', test: s => s.longest >= 3 },
  { id: 'streak7', name: 'Sepekan penuh', desc: 'Aktif 7 hari berturut-turut.', test: s => s.longest >= 7 },
  { id: 'streak30', name: 'Sebulan konsisten', desc: 'Aktif 30 hari berturut-turut.', test: s => s.longest >= 30 },
  { id: 'habit7', name: 'Kebiasaan menetap', desc: 'Satu kebiasaan 7 kali berturut-turut.', test: s => s.habit >= 7 },
  { id: 'hard', name: 'Tantangan besar', desc: 'Selesaikan satu hal berbobot Sulit.', test: s => s.hard },
  { id: 'focus1', name: 'Sesi fokus pertama', desc: 'Fokus minimal 1 menit.', test: s => s.focus >= 1 },
  { id: 'level5', name: 'Level 5', desc: 'Capai level 5.', test: s => s.level >= 5 },
  { id: 'level10', name: 'Level 10', desc: 'Capai level 10.', test: s => s.level >= 10 },
];

export function achievementStats(state, t) {
  const act = activeEntries(state);
  let habit = 0;
  for (const h of state.habits) habit = Math.max(habit, habitStreaks(state, h, t).longest);
  return {
    count: act.length, longest: overallStreak(state, t).longest, habit,
    hard: act.some(e => e.effort === 'hard'), focus: state.focus.length, level: levelInfo(totalXp(state)).level,
  };
}
// Membuka pencapaian baru (permanen setelah terbuka). Mengembalikan daftar yang baru terbuka.
export function evaluateAchievements(state, t) {
  const st = achievementStats(state, t), fresh = [];
  for (const a of ACHIEVEMENTS) if (!state.achievements[a.id] && a.test(st)) { state.achievements[a.id] = t; fresh.push(a); }
  return fresh;
}
