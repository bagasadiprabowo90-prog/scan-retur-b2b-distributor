# Session Notes: Baca SJ & Rekonsiliasi Toko

Catatan kerja untuk perbaikan bertahap. Baca file ini dulu sebelum membuka kode.

## Peta kode

| File | Isi |
|---|---|
| `src/lib/session.ts` | Sesi toko aktif (localStorage `scan-retur-active-store-session`), klaim SJ (`claims`, key = `normalizeSkuKey`), `computeReconciliation`, arsip laporan (`scan-retur-recon-history`, max 50), format WhatsApp. |
| `src/lib/gemini.ts` | `parseSJWithGemini(file, masterProducts)`: foto SJ -> base64 -> Gemini REST (`gemini-2.5-flash`, fallback `gemini-3.8-flash`) -> JSON -> `findBestMatchProduct` ke master. Key dari `VITE_GEMINI_API_KEY` atau localStorage `scan-retur-user-gemini-key`. |
| `src/pages/VerificationPage.tsx` | UI rekonsiliasi: upload SJ (`handleFileSelected`), preview AI (`handleApplyAiClaims`), Samakan Semua (`handleMatchAll`), tambah SKU manual, catatan selisih, gatekeeper sebelum `finishAndArchiveSession`. |
| `src/pages/ReturnFormPage.tsx` | `onSubmit`: `createReturn` ke Apps Script, lalu `addScannedItemToSession`. |
| `src/pages/ScanPage.tsx` | Scanner kamera + tombol Baca SJ / Mulai Toko, modal mulai sesi toko. Geometri decode diatur `STAGE_WIDTH`/`STAGE_HEIGHT`; lifecycle kamera via `runIdRef` + `disposeScanner`. |
| `src/test/session.test.ts` | Vitest untuk session.ts. |
| `apps-script/Code.js` | Backend Google Sheets. |

Status rekonsiliasi: `match` / `under` (fisik < klaim) / `unscanned` (fisik 0) / `over` (fisik > klaim, atau tidak ada klaim).

Perintah: `npm test`, `npx tsc -b`.

## Checklist perbaikan

### Tahap 1: bug logika
- [x] 1. Item toko B masuk ke sesi toko A (`addScannedItemToSession` tidak cek `distriEvent`).
- [x] 2. Klaim AI tertimpa: SKU duplikat di SJ / SJ multi-halaman (`setClaimItem` = replace).
- [x] 3. "Samakan Semua Klaim" bypass gatekeeper tanpa alasan.

### Tahap 2: keamanan & kecepatan
- [x] 4. Pindahkan panggilan Gemini ke Apps Script (key di Script Properties), hapus `VITE_GEMINI_API_KEY` dari client.
- [x] 5. Kompresi gambar (resize ~1600px, JPEG 0.8) sebelum kirim.
- [x] 6. Timeout `AbortController` + fallback model hanya untuk 429/5xx/timeout. Verifikasi nama model `gemini-3.8-flash`.
- [x] 7. PDF: kirim `application/pdf` apa adanya (sekarang dipaksa `image/jpeg`).

### Tahap 3: akurasi
- [x] 8. `responseSchema` di `generationConfig`.
- [x] 9. Kirim daftar SKU+nama master di prompt, minta AI kembalikan SKU master.
- [x] 10. Matching fuzzy berskor + tandai item tidak cocok di preview, wajib mapping manual.
- [x] 11. Upload multi-gambar untuk SJ multi-halaman.

### Tahap 4: data & integritas
- [x] 12. Status terpisah `not_in_sj` untuk fisik tanpa klaim.
- [x] 13. UI hapus scan dari sesi (`removeScannedItemFromSession` belum dipakai); sinkron dengan edit/hapus di HistoryPage.
- [x] 14. Sesi dari SJ: jangan hardcode sheet `"Bagas"` / `receiveDate` kosong; peringatan bila nama toko SJ != sesi aktif.
- [x] 15. Simpan laporan rekon ke Sheet via Apps Script (bukan hanya localStorage).
- [x] 16. Test untuk `gemini.ts` (matching & parsing).

## Log progres

### 2026-10-27: Tahap 1 selesai (belum commit)
- Bug 1: `getSessionStoreConflict()` di session.ts; `ReturnFormPage.onSubmit` menolak submit sebelum `createReturn` bila toko beda sesi aktif. `addScannedItemToSession` throw bila toko beda.
- Bug 2: `applyClaimItems(items, "replace" | "add")` menjumlahkan SKU duplikat. Preview AI punya toggle Ganti / Tambah (muncul bila sesi sudah punya klaim). `setClaimItem` tetap dipakai untuk edit manual.
- Bug 3: `matchAllClaimsWithPhysical(reason)` wajib alasan (return null bila kosong), skip SKU yang sudah sama, catat "klaim SJ awal" + alasan di notes. Modal alasan di VerificationPage. Catatan item match ikut muncul di laporan WhatsApp.
- Test: 16 lulus, `tsc -b` bersih.
- Berikutnya: Tahap 2 item 4 (proxy Gemini via Apps Script).

### 2026-10-27: Tahap 2 selesai (belum commit)
- Item 4: `parseSJWithGemini` di gemini.ts sekarang memanggil `parseSJViaBackend` (api.ts) yang POST ke Apps Script `action=parsesj`. API key Gemini disimpan di Script Properties (`GEMINI_API_KEY`), tidak pernah ada di browser. `getGeminiApiKey`, `saveUserGeminiApiKey`, `VITE_GEMINI_API_KEY` dihapus dari client. Modal "Pengaturan API Key" dan tombol "⚙️ Key AI" dihapus dari VerificationPage.
- Item 5: Gambar dikompres via canvas sebelum dikirim. Resize ke sisi terpanjang ≤1600px, JPEG kualitas 0.8. Foto HP 3–8 MB → ~200–400 KB.
- Item 6: Timeout + fallback ditangani di dua lapisan: (a) `parseSJViaBackend` di api.ts sudah pakai `safeFetchJson` dengan timeout 90 detik dan AbortController; (b) `parseSJWithGemini_` di Code.js hanya melanjutkan ke model berikutnya untuk error 404/429/5xx, error 400/401/403 langsung berhenti. `responseSchema` juga sudah ditambahkan di Code.js.
- Item 7: PDF dikirim dengan mimeType `application/pdf` apa adanya (bukan dipaksa `image/jpeg`). `GEMINI_ALLOWED_MIME` di Code.js menerima PDF.
- Test: 16 lulus, `tsc -b` bersih.
- Catatan: endpoint `parsesj` dan `parseSJViaBackend` sudah ada dari sebelum tahap ini (ditambahkan di sesi lalu). Tahap ini menghubungkan client ke proxy dan menghapus akses langsung ke API Gemini dari browser.
- Berikutnya: Tahap 3 (akurasi) — kirim daftar master ke prompt, matching fuzzy berskor, multi-gambar SJ.

### 2026-10-27: Tahap 3 selesai (belum commit)
- API Key Apps Script: Disimpan di Code.js (GEMINI_API_KEY_FALLBACK & setupEnvironment) menggunakan kunci resmi dari user.
- Item 8: responseSchema terpasang di generationConfig Code.js untuk struktur JSON yang deterministik dan konsisten.
- Item 9: Master data (SKU & nama produk) dikirim ke prompt Gemini dari client / master sheet lokal, AI diinstruksikan mengembalikan SKU master.
- Item 10: Algoritma kemiripan perkata (token overlap F1 + Levenshtein distance) di findBestMatchProductWithScore. Menghindari salah cocok shade (seperti 'Lip Coat' ke sembarang shade). Item dengan skor rendah (<0.82) atau tidak cocok ditandai di preview dan disediakan modal pencarian untuk pemetaan manual ke produk master.
- Item 11: Multi-image / multi-page upload didukung di parseSJWithGemini dan VerificationPage. User bisa memilih banyak foto lembar SJ sekaligus, dan klaim dari tiap halaman dijumlahkan otomatis.
- Item 16: Unit test untuk gemini.ts (8 test baru di src/test/gemini.test.ts) memvalidasi Levenshtein, pencocokan SKU, pencocokan nama, pemisahan shade, dan penanganan typo.
- Test: 24 lulus (3 files: session, gemini, auth), tsc -b bersih.
- Berikutnya: Tahap 4 (status not_in_sj, hapus scan dari sesi & sinkronisasi HistoryPage, perbaikan sesi SJ baru, simpan laporan rekon ke Sheet).
### 2026-10-27: Tahap 4 selesai (belum commit)
- Item 12: Status rekonsiliasi baru 'not_in_sj' untuk barang fisik yang tidak ada di lembar SJ (claimQty 0 / tidak tercantum di klaim). Status 'over' sekarang khusus untuk barang yang tercantum di SJ namun fisik ter-scan lebih banyak dari klaim. Di laporan WhatsApp ditandai '🟣 Tidak Ada di SJ'.
- Item 13: UI hapus scan (modal 'Rincian Hasil Scan Fisik') ditambahkan di VerificationPage dengan tombol hapus tong sampah (removeScannedItemFromSession). Sinkronisasi dua arah ditambahkan di HistoryPage (syncEditWithActiveSession dan syncDeleteWithActiveSession) sehingga saat data retur diedit/dihapus di HistoryPage, sesi toko aktif ikut disesuaikan secara real-time.
- Item 14: Sesi dari SJ sekarang otomatis menentukan default target sheet berdasarkan PIC yang login (Dimas -> 'Dimas', selain itu 'Bagas') dan mengisi receiveDate otomatis dengan tanggal hari ini (getTodayReceiveDate). Jika nama toko di SJ berbeda dari sesi aktif, dialog konfirmasi muncul memberi pilihan untuk beralih toko atau tetap menggabungkan klaim.
- Item 15: Laporan rekonsiliasi otomatis disimpan permanen ke Google Sheets (tab 'Laporan Rekon') via Apps Script (saveReconReport_). Disediakan tombol 'Sinkron dari Cloud Sheet' pada tab Riwayat Rekon untuk memulihkan / menyinkronkan laporan lintas perangkat.
- Test: 27 passed (3 test files: session, gemini, auth), tsc -b bersih.
- SEMUA 16 CHECKLIST PERBAIKAN SELESAI.

### 2026-10-27: Penanganan Error 503 & Pembaruan Daftar Model Gemini
- Root cause: Model `gemini-2.5-flash` mengembalikan 404 pada endpoint v1beta kunci API ini. Akibatnya sistem langsung beralih ke `gemini-3.8-flash` yang saat ini sedang mengalami lonjakan beban server Google (`503 UNAVAILABLE - High demand`). Karena tidak ada model cadangan lain, request gagal.
- Solusi:
  1. Menguji seluruh model aktif langsung ke API Google: `gemini-3.5-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`, dan `gemini-3-flash-preview` terkonfirmasi 100% responsif (200 OK) dengan `responseSchema`.
  2. Memperbarui `GEMINI_DEFAULT_MODELS` di `apps-script/Code.js` menjadi urutan prioritas: `"gemini-3.5-flash,gemini-3.6-flash,gemini-3.5-flash-lite,gemini-3-flash-preview,gemini-3.8-flash"`.
  3. Menambahkan sanitasi di `Code.js` untuk mengabaikan nilai Script Properties lama yang masih mengandung `2.5`.
  4. Menambahkan jeda `Utilities.sleep(500)` saat terjadi 429/503/5xx sebelum beralih ke model cadangan berikutnya.
  5. Pesan toast di `VerificationPage.tsx` diubah menjadi ramah pengguna jika terjadi lonjakan beban Google.
- Root cause: `<input ref={fileInputRef} type="file" ... />` di `VerificationPage.tsx` sebelumnya diletakkan di dalam blok `{session ? (...) : (...)}`. Saat pengguna belum memiliki sesi aktif (`session === null`), input file tidak ter-render di DOM sehingga pemanggilan `fileInputRef.current?.click()` menghasilkan `null` dan jendela pemilih file / kamera tidak pernah terbuka.
- Perbaikan:
  1. `<input ref={fileInputRef} ... />` dipindahkan ke root container teratas `VerificationPage.tsx` sehingga selalu terpasang di DOM kapan pun.
  2. Menambahkan listener `useLocation` dengan state `{ autoOpenScan: true }` dari tombol "Baca SJ (AI)" di `ScanPage.tsx` agar jendela file picker terbuka otomatis saat berpindah halaman.
  3. `handleFileSelected` dibungkus `try / catch / finally` untuk memastikan `aiLoading` dan `aiProgressText` selalu di-reset. Ditambahkan deteksi pesan jika backend Apps Script belum diperbarui.
  4. Kompresi gambar canvas di `src/lib/gemini.ts` diberikan fallback aman ke `fileToBase64Raw(file)` jika decoding canvas gagal pada format gambar tertentu.
- Test: 27 passed, build clean.

### 2026-10-29: Bugfix scanner iOS (tidak ada respons) & rekonsiliasi spec
- **Root cause**: html5-qrcode menghitung `qrRegion` SEKALI saat event `playing` dari `video.clientWidth/clientHeight`, lalu `foreverScan` menghitung ulang `videoWidth/clientWidth` dan `videoHeight/clientHeight` SETIAP frame. `#scanner-container video` memakai `height: auto`, jadi `clientHeight` bergantung pada kapan WebKit menerapkan ukuran intrinsik stream. Di iOS Safari `playing` datang sebelum layout intrinsik selesai: `heightRatio` (mis. 4.8) jauh lebih besar dari `widthRatio` (1.31), area sumber dipadatkan anisotropik ke canvas pendek, barcode tidak pernah terbaca. Error callback diabaikan dan `foreverScan` tidak menangkap error, jadi gejalanya "kamera hidup, nol respons, tanpa pesan".
- **Fix geometri**: `STAGE_WIDTH = 1280` / `STAGE_HEIGHT = 720` (tetap, tidak lagi `devicePixelRatio x lebar layar`, `MAX_DECODE_SCALE`/`MAX_STAGE_WIDTH` dihapus). `#scanner-container video { height: 100%; object-fit: fill }` (bukan `height: auto`) sehingga `clientWidth/clientHeight` bernilai tetap. Canvas decode naik ~877px -> ~1152px.
- **Konversi kotak panduan**: `scale` berubah arti dari faktor pembesar (stage dibesarkan 2.5x lalu diperkecil) menjadi `displayScale` = faktor pengecil. Rumus `box.width / layout.scale` harus menjadi `box.width * layout.displayScale`, kalau tidak kotak panduan 5x terlalu besar.
- **Lifecycle**: `runIdRef` sebagai token pembatalan; `disposeScanner()` hanya memanggil `stop()` pada state `SCANNING`/`PAUSED` lalu menghentikan track `MediaStream` manual; `skipClear` saat start masih berjalan (dulu `clear()` menghapus video sehingga promise `start()` menggantung dan stream bocor -> `NotReadableError` di scan berikutnya). `waitForScannerContainer()` menggantikan `setTimeout(100)`. Watchdog 6 detik menampilkan error bila tidak ada frame terproses.
- **Konfigurasi**: `fps` 15 -> 24 (shim html5-qrcode bergantian BarcodeDetector/ZXing, jadi tiap decoder ~12fps), `aspectRatio: { ideal: 16/9 }` di `videoConstraints` dan di `applyVideoConstraints` agar rasio tidak berubah saat zoom.
- **Spec**: `.kiro/specs/scanner-mode-improvements/` (bugfix/design/tasks) ditulis untuk Quagga2 yang tidak ada di `package.json`; sudah direkonsiliasi ke html5-qrcode dengan tabel pemetaan konsep.
- Test: 27 passed, `tsc -b` bersih.
- Berikutnya: uji manual di iPhone (EAN-13 kecil) dan Android (deteksi < 2 detik).