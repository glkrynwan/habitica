# Habitica

Pengelola tugas dan kebiasaan dengan progres bergaya RPG. HTML + CSS + JavaScript (ES modules) tanpa build, tanpa dependensi, tanpa font/CDN eksternal. Bekerja offline sebagai PWA.

## Struktur
```
index.html            cangkang aplikasi (CSP ketat, tanpa script inline)
manifest.webmanifest  id/scope/start_url relatif → aman di /habitica/
sw.js                 service worker (precache berversi, pembaruan atas persetujuan)
css/app.css           desain (tema gelap/terang, reduced-motion)
js/  dates schedule xp tasks habits today stats achievements cats   ← logika murni (diuji di Node)
     store (persistensi, validasi, migrasi)  ui editor focus views app  ← antarmuka
icons/                icon-192/512, maskable-192/512, apple-touch, favicon, logo.svg
tests/                logic.test.mjs, static.test.mjs (Node) · browser.py, browser2.py (Playwright)
```

## Deploy ke GitHub Pages
1. Buat repo (mis. `habitica`), unggah **isi folder ini** ke root repo (`index.html` harus di root, bukan di subfolder).
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
3. Buka `https://USERNAME.github.io/habitica/`. Semua path relatif, jadi subpath tidak masalah.

## Instal di Android
Buka URL di Chrome → menu ⋮ → **Instal aplikasi** (atau *Tambahkan ke layar utama*). Ikon maskable tersedia untuk bentuk ikon adaptif.
> Aplikasi "Level Up" lama yang sudah terpasang dari repo yang sama akan diperbarui di tempat (`id` manifest sengaja `./index.html` agar identitas tidak berubah). Data lama (`levelup.v1`) dimigrasikan otomatis dan **tidak dihapus**.

## Menguji offline
1. Buka aplikasi sekali saat online (tunggu Pengaturan → "Aplikasi & offline" menyatakan *Siap*).
2. Aktifkan mode pesawat, tutup aplikasi sepenuhnya, buka lagi. Lencana "Offline" muncul dan semua fitur tetap berjalan.
3. Desktop: DevTools → Application → Service Workers → centang *Offline*, muat ulang.

## Keputusan desain penting
- **XP berasal dari ledger**: setiap penyelesaian = 1 entri unik (`jenis|id|kejadian`). Total XP = jumlah entri aktif. Klik ganda ditolak; membuka kembali mencabut XP entri itu; menyelesaikan lagi memulihkan nilai yang sama (tidak bisa "ditanam"). Mengedit/menghapus tugas tidak mengubah XP lampau (judul/kategori disalin ke ledger).
- **Kurva level**: kenaikan per level 100, 125, 150, … XP (Lv 2 = 100, Lv 5 = 450, Lv 10 = 1.800, Lv 20 = 6.175). XP: Mudah 10 · Sedang 25 · Sulit 50.
- **Jadwal punya riwayat**: mengubah jadwal menambah entri baru berlaku mulai hari ini; statistik masa lalu tidak ditulis ulang.
- **Tugas vs kebiasaan**: tugas satu kali (bisa bertenggat) atau berulang; kebiasaan selalu berulang dengan streak. Migrasi: tugas harian/mingguan Level Up → kebiasaan, tugas "sekali" → tugas.
- **Hari ini** hanya menampilkan yang relevan (berulang hari ini, tenggat ≤ hari ini, prioritas manual maks. 3) agar tidak menumpuk.
- **Tanpa innerHTML**; semua teks pengguna lewat `textContent`. Impor divalidasi ketat (id, tanggal, tipe, batas jumlah) dan item tidak valid dibuang.
- **Pembaruan**: SW baru menunggu; banner "Versi baru tersedia" → pengguna memilih *Perbarui*.

## Status pengujian (jujur)
**Dijalankan & lulus** — 26 tes Node (logika, validasi, migrasi, konsistensi aset) + ±60 pemeriksaan Chromium headless: mulai tanpa error JS; tambah/selesaikan/hapus; persisten setelah reload; klik ganda; XSS lewat judul dan lewat impor; impor rusak/jahat; ekspor; tema; tanpa scroll horizontal di 390 px; mode fokus; SW terpasang di subpath `/habitica/`; start offline (termasuk `?query`); aset tak dikenal tidak diganti `index.html`; ikon hilang → SW gagal dengan pesan menyebut file & tidak ada cache setengah jadi; alur pembaruan v1.0.0→1.0.1; migrasi Level Up (total XP persis); data rusak tidak ditimpa; pergantian hari (jam disimulasikan).
**Belum dijalankan**: instal nyata di Android/WebAPK, deploy nyata ke GitHub Pages, Safari/Firefox, pembaca layar (TalkBack), audit kontras otomatis (kontras dipilih dengan perhitungan, bukan alat), wake-lock/getar di perangkat nyata, performa dengan puluhan ribu catatan.

## Batasan
- Data hanya di browser ini; tidak ada sinkronisasi/akun/enkripsi. Unduh cadangan berkala (aplikasi mengingatkan).
- Tidak ada notifikasi pengingat (aplikasi web tidak bisa menjadwalkannya dengan andal).
- Timer fokus hilang bila halaman dimuat ulang.
- Level hasil migrasi dihitung ulang dengan kurva baru (total XP sama).
- Statistik konsistensi tidak menghitung kebiasaan yang sudah dihapus (yang diarsipkan tetap dihitung).
- Hapus data situs/browser = hapus data aplikasi. `navigator.storage.persist()` diminta tetapi tidak dijamin.

## Checklist pemeliharaan
- [ ] Setiap rilis: **naikkan `VERSION` di `sw.js`** (dan `APP_VERSION` di `js/app.js`). Tanpa ini pengguna tidak menerima pembaruan.
- [ ] File JS/CSS/ikon baru → tambahkan ke `ASSETS` di `sw.js` (`tests/static.test.mjs` akan gagal bila lupa).
- [ ] Ubah bentuk data → naikkan `SCHEMA`, tambah migrasi di `store.js`, tambah tes.
- [ ] Jalankan: `node --test tests/*.test.mjs` dan `python3 tests/browser.py && python3 tests/browser2.py` (butuh Playwright + Chromium).
- [ ] Setelah deploy: buka di perangkat nyata, cek Pengaturan → "Siap", uji offline.
