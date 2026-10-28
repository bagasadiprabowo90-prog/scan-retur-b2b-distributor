# Bugfix Requirements Document

## Introduction

Dokumen ini mendefinisikan requirements untuk perbaikan mode scanner pada aplikasi Scan Retur. Bug yang dilaporkan mencakup:
- Tampilan UI yang kurang native dan kurang bersih pada perangkat mobile
- Camera preview terlalu kecil sehingga menyulitkan pembacaan barcode
- Pembacaan barcode lambat dan tidak responsif di Android
- Pembacaan barcode tidak berfungsi sama sekali di iOS, khususnya untuk barcode kosmetik berukuran kecil

> **Catatan rekonsiliasi**: revisi sebelumnya dokumen ini menulis requirements terhadap **Quagga2** (`halfSample`, `patchSize`, `numOfWorkers`, `frequency`, `readers`). Implementasi nyata di `src/pages/ScanPage.tsx` memakai **`html5-qrcode@2.3.8`**. Requirements di bawah sudah disesuaikan dengan library yang benar-benar dipakai; konsep Quagga2 dipetakan ke padanannya di html5-qrcode.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN user membuka halaman scanner THEN stage kamera berukuran `devicePixelRatio × lebar layar` (maks 2.5×) sehingga canvas decode hanya ~877px walau kamera mengirim 1920px

1.2 WHEN user melihat UI scanner THEN stage kamera tidak punya tinggi eksplisit (`height: auto` pada video), sehingga ukuran area decode bergantung pada timing layout intrinsik video

1.3 WHEN scanner berjalan di iOS Safari THEN html5-qrcode menghitung `qrRegion` sekali saat event `playing` dari `clientWidth`/`clientHeight` video, sementara `foreverScan` menghitung ulang rasio dari `videoWidth/clientWidth` setiap frame; bila layout intrinsik belum diterapkan, area sumber dipadatkan anisotropik ke canvas pendek sehingga barcode tidak pernah terbaca

1.4 WHEN loop decode berhenti karena `drawImage` gagal THEN `foreverScan` tidak punya penanganan error, sehingga layar kamera membeku tanpa pesan apa pun

1.5 WHEN user menutup scanner saat proses `start()` masih berjalan THEN `stopScanner()` tidak memanggil `stop()` (state belum `SCANNING`) dan `clear()` menghapus video dari DOM; `MediaStream` tetap hidup dan memegang kamera

1.6 WHEN FPS disetel `15` dengan decoder cadangan aktif THEN html5-qrcode bergantian memakai BarcodeDetector dan ZXing setiap frame sehingga tiap decoder hanya mendapat ~7.5 fps

### Expected Behavior (Correct)

2.1 WHEN user membuka halaman scanner THEN stage kamera SHALL berukuran tetap (1280x720) dan diperkecil dengan `transform: scale()` agar tampil selebar layar, sehingga canvas decode ~1152px tanpa bergantung pada `devicePixelRatio`

2.2 WHEN video kamera dirender THEN tinggi video SHALL bernilai tetap (`height: 100%` dari stage), bukan `height: auto`, agar `clientWidth`/`clientHeight` yang dibaca html5-qrcode tidak bergantung pada timing layout

2.3 WHEN scanner berjalan di iOS Safari maupun Android Chrome THEN kotak panduan hijau di layar SHALL identik dengan area yang benar-benar di-decode, dan rasio `widthRatio`/`heightRatio` SHALL berhingga di setiap frame

2.4 WHEN loop decode berhenti diam-diam THEN sistem SHALL menampilkan pesan error yang bisa ditindaklanjuti (watchdog: tidak ada frame terproses dalam 6 detik)

2.5 WHEN user menutup scanner atau halaman berpindah saat `start()` masih berjalan THEN seluruh track `MediaStream` SHALL dihentikan, sehingga scan berikutnya tidak gagal `NotReadableError`

2.6 WHEN scanner berjalan THEN decode SHALL memakai `fps: 24` dan `aspectRatio: { ideal: 16/9 }` pada `videoConstraints`

### Unchanged Behavior (Regression Prevention)

3.1 WHEN user berhasil scan barcode THEN sistem SHALL CONTINUE TO navigate ke halaman return form dengan parameter barcode

3.2 WHEN user memilih produk dari dropdown pencarian THEN sistem SHALL CONTINUE TO navigate ke halaman return form dengan parameter barcode produk tersebut

3.3 WHEN user menekan tombol close scanner THEN sistem SHALL CONTINUE TO menghentikan kamera dan mengembalikan ke state awal

3.4 WHEN user memasukkan barcode secara manual melalui input field THEN sistem SHALL CONTINUE TO navigate ke halaman return form dengan parameter barcode

3.5 WHEN kamera tidak memiliki izin THEN sistem SHALL CONTINUE TO menampilkan pesan error yang informatif

3.6 WHEN kamera mendukung zoom THEN kontrol zoom SHALL CONTINUE TO mempertahankan resolusi dan rasio 16:9 setelah `applyConstraints`
