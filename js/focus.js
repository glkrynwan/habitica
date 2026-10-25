// Mode fokus: layar minimal dengan satu tugas, timer bebas atau Pomodoro.
// Waktu dihitung dari cap waktu (bukan hitungan interval) sehingga akurat saat tab di latar belakang.
import { h, toast } from './ui.js';

const fmt = ms => { const t = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

export function openFocus({ target, settings, onLog, onComplete, canComplete }) {
  const pomoMs = settings.pomodoroMin * 60000, breakMs = settings.breakMin * 60000;
  let closed = false, mode = 'free', phase = 'work', running = false, startedAt = 0, acc = 0, timer = null, wake = null, workMs = 0;

  const elapsed = () => acc + (running ? Date.now() - startedAt : 0);
  const limit = () => (mode === 'pomo' ? (phase === 'work' ? pomoMs : breakMs) : Infinity);
  const shown = () => (mode === 'pomo' ? limit() - elapsed() : elapsed());

  const clock = h('div', { class: 'focus-clock', role: 'timer', 'aria-live': 'off' }, '00:00');
  const status = h('p', { class: 'focus-status', role: 'status' });
  const startBtn = h('button', { class: 'btn primary big', type: 'button', onClick: toggleRun });
  const stopBtn = h('button', { class: 'btn secondary', type: 'button', text: 'Simpan & berhenti', onClick: () => finish('stop') });
  const doneBtn = canComplete ? h('button', { class: 'btn secondary', type: 'button', text: 'Tandai selesai', onClick: () => finish('complete') }) : null;
  const modeBtns = [['free', 'Bebas'], ['pomo', `Pomodoro ${settings.pomodoroMin} mnt`]].map(([k, l]) =>
    h('button', { type: 'button', class: 'seg', 'aria-pressed': String(mode === k), text: l, onClick: () => setMode(k) }));
  const exitBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Keluar dari mode fokus', text: '✕', onClick: () => finish('exit') });

  const dlg = h('dialog', { class: 'focus', 'aria-labelledby': 'focus-title' },
    h('div', { class: 'focus-inner' },
      h('div', { class: 'focus-top' }, h('span', { class: 'muted', text: 'Mode fokus' }), exitBtn),
      h('h2', { id: 'focus-title', class: 'focus-title', text: target ? target.title : 'Fokus bebas' }),
      clock, status,
      h('div', { class: 'seg-group', role: 'group', 'aria-label': 'Jenis timer' }, modeBtns),
      h('div', { class: 'focus-actions' }, startBtn, stopBtn, doneBtn)));
  dlg.addEventListener('cancel', e => { e.preventDefault(); finish('exit'); });
  document.body.append(dlg);
  dlg.showModal();

  function setMode(k) {
    if (running || elapsed() > 0) return;      // jangan ganti mode di tengah sesi
    mode = k; modeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(['free', 'pomo'][i] === k))); paint();
  }
  function paint() {
    clock.textContent = fmt(shown());
    startBtn.textContent = running ? 'Jeda' : elapsed() > 0 ? 'Lanjut' : 'Mulai';
    stopBtn.disabled = elapsed() < 1000;
    status.textContent = mode === 'pomo' ? (phase === 'work' ? (running ? 'Fokus. Satu hal saja.' : 'Siap saat kamu siap.') : 'Istirahat sebentar.') : (running ? 'Fokus berjalan.' : 'Tidak ada batas waktu.');
    modeBtns.forEach(b => { b.disabled = running || elapsed() > 0; });
  }
  function tick() {
    if (mode === 'pomo' && elapsed() >= limit()) return phaseEnd();
    paint();
  }
  function toggleRun() {
    if (running) { acc += Date.now() - startedAt; running = false; clearInterval(timer); releaseWake(); }
    else { running = true; startedAt = Date.now(); timer = setInterval(tick, 250); requestWake(); }
    paint();
  }
  function phaseEnd() {
    clearInterval(timer); running = false; releaseWake();
    if (navigator.vibrate) try { navigator.vibrate([120, 80, 120]); } catch (e) { /* abaikan */ }
    if (phase === 'work') {
      workMs += limit(); log(workMs); workMs = 0; phase = 'break'; acc = 0;
      toast('Sesi fokus selesai. Istirahat sebentar?', { ms: 3500 });
    } else { phase = 'work'; acc = 0; toast('Istirahat selesai.', { ms: 2500 }); }
    paint();
  }
  function log(ms) { if (ms >= 60000) onLog(Math.round(ms / 1000)); }
  async function requestWake() { try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (e) { wake = null; } }
  function releaseWake() { try { if (wake) wake.release(); } catch (e) { /* abaikan */ } wake = null; }

  function finish(how) {
    if (closed) return; closed = true;
    document.removeEventListener('visibilitychange', onVis);
    if (running) { acc += Date.now() - startedAt; running = false; }
    clearInterval(timer); releaseWake();
    if (phase === 'work') { workMs += acc; log(workMs); }
    const minutes = Math.round(workMs / 60000);
    dlg.close(how);
    dlg.remove();
    if (how === 'complete') onComplete();
    else if (minutes >= 1) toast(`Sesi fokus tersimpan: ${minutes} menit.`);
  }
  const onVis = () => { if (!document.hidden && running) { tick(); if (running && !wake) requestWake(); } };
  document.addEventListener('visibilitychange', onVis);
  paint();
  startBtn.focus();
  return dlg;
}
