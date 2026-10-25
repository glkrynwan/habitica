// Dijalankan sinkron sebelum render pertama agar tidak berkedip. Hanya membaca preferensi tema.
(function () {
  try {
    var p = localStorage.getItem('habitica.theme');
    var t = p === 'light' || p === 'dark' ? p : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.dataset.theme = t;
  } catch (e) { /* abaikan */ }
})();
