# Implementation Plan

## Overview

Tasks untuk bugfix scanner-mode-improvements mengikuti exploratory bugfix workflow:
1. **Explore** - Tulis tests SEBELUM fix untuk memahami bug (Bug Condition)
2. **Preserve** - Tulis tests untuk behavior non-buggy (Preservation Requirements)
3. **Implement** - Terapkan fix berdasarkan pemahaman (Expected Behavior)
4. **Validate** - Verifikasi fix bekerja dan tidak merusak existing behavior

> **Rekonsiliasi (penting)**: rencana awal dokumen ini ditulis untuk **Quagga2**
> (`initQuagga`, `halfSample`, `patchSize`, `frequency`, `numOfWorkers`, `readers`).
> Implementasi nyata memakai **`html5-qrcode@2.3.8`**, dan Quagga2 tidak ada di
> `package.json`. Semua task sudah dipetakan ke html5-qrcode:
>
> | Konsep Quagga2 | Padanan html5-qrcode |
> |---|---|
> | `locator.halfSample: false` | ukuran stage tetap 1280x720 (menentukan ukuran canvas decode) |
> | `locator.patchSize: "small"` | `qrbox` 90% lebar x 40% lebar |
> | `frequency: 20` | `fps: 24` |
> | `numOfWorkers` | tidak ada (decode single-thread di main thread) |
> | `decoder.readers` | `formatsToSupport` + `useBarCodeDetectorIfSupported` |
> | `video.readyState` check | tinggi video eksplisit, bukan `height: auto` |

---

## Phase 1: Bug Condition Exploration Tests

- [x] 1. Write bug condition exploration test - UI Layout
  - **Property 1: Bug Condition** - Camera Preview Not Fullscreen
  - **Scoped PBT Approach**: verifikasi camera preview memakai aspect ratio 4/3 dengan tinggi < deviceHeight * 0.9
  - **EXPECTED OUTCOME**: Test FAILS (confirms UI is not fullscreen/optimized)
  - _Requirements: 1.1, 1.2_

- [ ] 2. Write bug condition exploration test - Resolusi Decode
  - **Property 1: Bug Condition** - Canvas decode terlalu kecil
  - **GOAL**: Surface counterexample bahwa canvas decode < 1000px
  - **Scoped PBT Approach**: `computeStageLayout()` dengan devicePixelRatio 1..4 harus menghasilkan lebar stage konstan `STAGE_WIDTH`
  - **EXPECTED OUTCOME pada kode lama**: lebar stage = `min(dpr, 2.5) x lebar layar`, canvas ~877px
  - Document counterexamples: "canvas 877px, sumber kamera 1920px -> downscale 2.2x"
  - _Requirements: 1.1, 2.1, 2.6_

- [ ] 3. Write bug condition exploration test - Geometri area decode
  - **Property 1: Bug Condition** - `heightRatio` != `widthRatio`
  - **GOAL**: Buktikan `qrRegion` dihitung dari `clientHeight` yang berbeda dari `clientHeight` saat frame diproses
  - **Scoped PBT Approach**: simulasi video 1280x720 dengan `clientHeight` 150 (stale) vs 720 (settled)
  - **EXPECTED OUTCOME pada kode lama** (`height: auto`): rasio 4.8 vs 1.31, area sumber dipadatkan ke canvas 877x135
  - Document counterexamples: "canvas 877x135 dari sumber 1151x648 -> barcode tidak pernah ter-decode"
  - _Requirements: 1.2, 1.3, 2.2, 2.3_

---

## Phase 2: Preservation Property Tests

- [~] 4. Write preservation property tests - Navigation Flow
  - **Property 2: Preservation** - Navigation After Scan
  - Observe: setelah barcode terdeteksi, `navigate('/return-form?barcode=...')` dipanggil
  - **EXPECTED OUTCOME**: Test PASSES (confirms baseline navigation behavior)
  - _Requirements: 3.1_

- [~] 5. Write preservation property tests - Product Search
  - **Property 2: Preservation** - Product Search Dropdown
  - Observe: memilih produk menavigasi ke return form dengan parameter barcode
  - **EXPECTED OUTCOME**: Test PASSES (confirms product search works)
  - _Requirements: 3.2_

- [~] 6. Write preservation property tests - Manual Input
  - **Property 2: Preservation** - Manual Barcode Input
  - Observe: input manual menerima barcode dan submit saat Enter
  - **EXPECTED OUTCOME**: Test PASSES (confirms manual input works)
  - _Requirements: 3.4_

- [~] 7. Write preservation property tests - Error Handling
  - **Property 2: Preservation** - Error Messages
  - Observe: izin ditolak menampilkan pesan informatif
  - **EXPECTED OUTCOME**: Test PASSES (confirms error handling works)
  - _Requirements: 3.5_

---

## Phase 3: UI Restructure

- [x] 8. Fix for UI - Scanner Overlay
  - [x] 8.1 Fullscreen container (`position: fixed; inset: 0`) + safe area insets
  - [x] 8.2 Scanning guide overlay (corner frame + animated scan line)
  - [x] 8.3 Kontrol minimalis: tombol close + zoom hanya bila kamera mendukung
  - [x] 8.4 CSS `.scanner-fullscreen`, `.scanner-stage`, `.scanner-guide`, `@keyframes scanLinePulse`
  - [x] 8.5 Verifikasi test bug condition task 1
  - [ ] 8.6 Verifikasi preservation tests tasks 4-7 (butuh device nyata)

---

## Phase 4: Geometri Decode dan Konfigurasi html5-qrcode

- [x] 9. Fix geometri area decode - barcode kecil
  - [x] 9.1 Stage berukuran tetap, bukan kelipatan `devicePixelRatio`
    - `STAGE_WIDTH = 1280`, `STAGE_HEIGHT = round(1280 / (16/9)) = 720`
    - `displayScale = lebarLayar / STAGE_WIDTH` -> dipakai `transform: scale()`
    - _Expected_Behavior: canvas decode ~1152px, tidak bergantung pada platform_
    - _Requirements: 2.1, 2.6_
  - [x] 9.2 Kunci tinggi video agar geometri tidak bergantung pada timing layout
    - `#scanner-container video { height: 100% !important; object-fit: fill }` (bukan `height: auto`)
    - `#scanner-container { height: 100% }` + tinggi stage inline
    - _Bug_Condition: `height: auto` + event `playing` sebelum layout intrinsik diterapkan_
    - _Expected_Behavior: `clientWidth`/`clientHeight` bernilai tetap sejak video terpasang_
    - _Requirements: 2.2, 2.3_
  - [x] 9.3 `qrbox` 90% lebar x 40% lebar; kotak panduan = `qrbox x displayScale`
    - Perbaikan bug: konversi lama memakai `box.width / scale`, harus dikali `displayScale`
    - _Requirements: 2.3_
  - [x] 9.4 Throughput decode
    - `fps: 15` -> `SCAN_FPS = 24` (shim bergantian BarcodeDetector/ZXing, jadi tiap decoder ~12 fps)
    - `disableFlip: true` dipertahankan (kamera belakang tidak mirror)
    - _Requirements: 1.6, 2.6_
  - [x] 9.5 `aspectRatio: { ideal: 16/9 }` pada `videoConstraints` dan pada `applyVideoConstraints` (zoom)
    - _Bug_Condition: rasio kamera berubah di tengah scan -> pemetaan area decode meleset_
    - _Requirements: 2.6, 3.6_
  - [ ] 9.6 Verifikasi test bug condition task 2 & 3
  - [ ] 9.7 Verifikasi preservation tests tasks 4-7

---

## Phase 5: Lifecycle Kamera dan Cross-Platform

- [x] 10. Fix lifecycle start/stop (akar masalah "iOS tidak merespons")
  - [x] 10.1 `runIdRef` sebagai token pembatalan; start yang selesai setelah dibatalkan langsung dispose
  - [x] 10.2 `disposeScanner()`: `stop()` hanya pada `SCANNING`/`PAUSED`, lalu track `MediaStream` dihentikan manual
  - [x] 10.3 `skipClear` saat start masih berjalan (mencegah promise `start()` menggantung)
  - [x] 10.4 `waitForScannerContainer()` menggantikan `setTimeout(100)` acak; gagal cepat bila container 0x0
  - [x] 10.5 Pemeriksaan pasca-start: `videoWidth > 0` dan `clientHeight != 0`
  - [x] 10.6 Watchdog 6 detik: tidak ada frame terproses -> tampilkan pesan error
  - [x] 10.7 `describeStartError()` menambah kasus `NotReadableError` (kamera dipakai aplikasi lain)
  - [x] 10.8 Cleanup on unmount tetap memanggil `stopScanner()`, kini aman terhadap start yang berjalan
  - _Requirements: 2.4, 2.5_

- [ ] 11. Android Chrome optimization
  - [ ] 11.1 Uji deteksi < 2 detik pada device nyata
  - [ ] 11.2 Uji perilaku saat `getCapabilities()` tidak tersedia (zoom/focus di-skip)
  - _Requirements: 2.6_

- [ ] 11a. iOS Safari optimization
  - [ ] 11a.1 Uji scan EAN-13 barcode kosmetik di iPhone (Safari + Chrome iOS)
  - [ ] 11a.2 Uji tutup scanner saat "Memulai kamera..." lalu buka lagi (tidak boleh NotReadableError)
  - _Requirements: 2.3, 2.5_

---

## Phase 6: Enhanced UX

- [x] 12. Feedback
  - [x] 12.1 Animasi scan line + kotak panduan
  - [x] 12.2 Haptic feedback (`navigator.vibrate(100)`)
  - [x] 12.3 Success flash + delay 200ms sebelum navigasi
  - [x] 12.4 Loading state "Memulai kamera..."
  - [ ] 12.5 Verifikasi semua test pass di device nyata

---

## Phase 7: Checkpoint

- [x] 13. `npx tsc -b` bersih dan `npm test` lulus (27 test)
- [ ] 13.1 Manual test iOS Safari: scan barcode kosmetik kecil
- [ ] 13.2 Manual test Android Chrome: waktu deteksi < 2 detik
- [ ] 13.3 Verifikasi kotak hijau = area yang benar-benar di-decode

---

## Summary

**Total Tasks**: 13 main tasks dengan sub-tasks
**Priority Order**: Phase 1 (geometri) -> Phase 3 (UI) -> Phase 4 (decode) -> Phase 5 (lifecycle)

**Key Bug Fixes Addressed**:
1. Area decode ditentukan ukuran CSS yang tidak deterministik (akar masalah iOS)
2. Canvas decode terlalu kecil untuk barcode kosmetik
3. Lifecycle start/stop membocorkan `MediaStream`
4. Loop decode mati tanpa pesan error

**Preserved Behaviors**:
- Navigation to return form (Requirement 3.1)
- Product search dropdown (Requirement 3.2)
- Manual barcode input (Requirement 3.4)
- Stop scanner functionality (Requirement 3.3)
- Error handling messages (Requirement 3.5)
- Zoom control (Requirement 3.6)
