# Session Notes: Baca SJ & Rekonsiliasi Toko

Catatan kerja untuk perbaikan bertahap. Baca file ini dulu sebelum membuka kode.

## Peta kode

| File | Isi |
|---|---|
| `src/lib/session.ts` | Sesi toko aktif (localStorage `scan-retur-active-store-session`), klaim SJ (`claims`, key = `normalizeSkuKey`), `computeReconciliation`, arsip laporan (`scan-retur-recon-history`, max 50), format WhatsApp. |
| `src/lib/gemini.ts` | `parseSJWithGemini(file, masterProducts)`: foto SJ -> base64 -> Gemini REST (`gemini-2.5-flash`, fallback `gemini-3.8-flash`) -> JSON -> `findBestMatchProduct` ke master. Key dari `VITE_GEMINI_API_KEY` atau localStorage `scan-retur-user-gemini-key`. |
| `src/pages/VerificationPage.tsx` | UI rekonsiliasi: upload SJ (`handleFileSelected`), preview AI (`handleApplyAiClaims`), Samakan Semua (`handleMatchAll`), tambah SKU manual, catatan selisih, gatekeeper sebelum `finishAndArchiveSession`. |
| `src/pages/ReturnFormPage.tsx` | `onSubmit`: `createReturn` ke Apps Script, lalu `addScannedItemToSession`. |
| `src/pages/ScanPage.tsx` | Tombol Baca SJ / Mulai Toko, modal mulai sesi toko. |
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
- [ ] 4. Pindahkan panggilan Gemini ke Apps Script (key di Script Properties), hapus `VITE_GEMINI_API_KEY` dari client.
- [ ] 5. Kompresi gambar (resize ~1600px, JPEG 0.8) sebelum kirim.
- [ ] 6. Timeout `AbortController` + fallback model hanya untuk 429/5xx/timeout. Verifikasi nama model `gemini-3.8-flash`.
- [ ] 7. PDF: kirim `application/pdf` apa adanya (sekarang dipaksa `image/jpeg`).

### Tahap 3: akurasi
- [ ] 8. `responseSchema` di `generationConfig`.
- [ ] 9. Kirim daftar SKU+nama master di prompt, minta AI kembalikan SKU master.
- [ ] 10. Matching fuzzy berskor + tandai item tidak cocok di preview, wajib mapping manual.
- [ ] 11. Upload multi-gambar untuk SJ multi-halaman.

### Tahap 4: data & integritas
- [ ] 12. Status terpisah `not_in_sj` untuk fisik tanpa klaim.
- [ ] 13. UI hapus scan dari sesi (`removeScannedItemFromSession` belum dipakai); sinkron dengan edit/hapus di HistoryPage.
- [ ] 14. Sesi dari SJ: jangan hardcode sheet `"Bagas"` / `receiveDate` kosong; peringatan bila nama toko SJ != sesi aktif.
- [ ] 15. Simpan laporan rekon ke Sheet via Apps Script (bukan hanya localStorage).
- [ ] 16. Test untuk `gemini.ts` (matching & parsing).

## Log progres

### 2026-10-27: Tahap 1 selesai (belum commit)
- Bug 1: `getSessionStoreConflict()` di session.ts; `ReturnFormPage.onSubmit` menolak submit sebelum `createReturn` bila toko beda sesi aktif. `addScannedItemToSession` throw bila toko beda.
- Bug 2: `applyClaimItems(items, "replace" | "add")` menjumlahkan SKU duplikat. Preview AI punya toggle Ganti / Tambah (muncul bila sesi sudah punya klaim). `setClaimItem` tetap dipakai untuk edit manual.
- Bug 3: `matchAllClaimsWithPhysical(reason)` wajib alasan (return null bila kosong), skip SKU yang sudah sama, catat "klaim SJ awal" + alasan di notes. Modal alasan di VerificationPage. Catatan item match ikut muncul di laporan WhatsApp.
- Test: 16 lulus, `tsc -b` bersih.
- Berikutnya: Tahap 2 item 4 (proxy Gemini via Apps Script).
