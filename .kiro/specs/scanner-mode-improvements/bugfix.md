# Bugfix Requirements Document

## Introduction

Dokumen ini mendefinisikan requirements untuk perbaikan mode scanner pada aplikasi Scan Retur. Bug yang dilaporkan mencakup:
- Tampilan UI yang kurang native dan kurang bersih pada perangkat mobile
- Camera preview terlalu kecil sehingga menyulitkan pembacaan barcode
- Terlalu banyak kontrol button/zoom yang membuat UI cluttered
- Pembacaan barcode lambat dan tidak responsif di Android
- Pembacaan barcode tidak berfungsi sama sekali di iOS, khususnya untuk barcode kosmetik berukuran kecil

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN user membuka halaman scanner THEN camera preview ditampilkan dengan aspect ratio 4:3 yang terlalu kecil untuk membaca barcode dengan nyaman

1.2 WHEN user melihat UI scanner THEN terdapat slider zoom dan button torch yang membuat tampilan cluttered dan tidak clean

1.3 WHEN user mencoba scan barcode di Android THEN sistem membutuhkan waktu lama untuk mendeteksi barcode (lebih dari 3 detik) atau gagal mendeteksi

1.4 WHEN user mencoba scan barcode di iOS THEN sistem tidak memberikan respons apa pun dan tidak dapat mendeteksi barcode sama sekali

1.5 WHEN user mencoba scan barcode kosmetik berukuran kecil THEN sistem tidak dapat mendeteksi barcode baik di Android maupun iOS

1.6 WHEN user menggunakan Quagga2 dengan konfigurasi `halfSample: true` dan `patchSize: "medium"` THEN sistem mengurangi akurasi deteksi barcode untuk barcode berukuran kecil

### Expected Behavior (Correct)

2.1 WHEN user membuka halaman scanner THEN camera preview ditampilkan dalam ukuran fullscreen/lebih besar dengan aspect ratio yang optimal untuk mobile

2.2 WHEN user melihat UI scanner THEN tampilan harus bersih, minimalis, dan native-like tanpa kontrol yang tidak perlu

2.3 WHEN user mencoba scan barcode di Android THEN sistem SHALL mendeteksi barcode dalam waktu kurang dari 2 detik dengan feedback visual yang jelas

2.4 WHEN user mencoba scan barcode di iOS THEN sistem SHALL mendeteksi barcode dengan lancar dan memberikan feedback visual saat barcode terdeteksi

2.5 WHEN user mencoba scan barcode kosmetik berukuran kecil THEN sistem SHALL dapat mendeteksi barcode dengan akurasi yang baik

2.6 WHEN user menggunakan Quagga2 THEN sistem SHALL menggunakan konfigurasi yang dioptimalkan untuk deteksi barcode kecil (halfSample: false, patchSize: "small")

### Unchanged Behavior (Regression Prevention)

3.1 WHEN user berhasil scan barcode THEN sistem SHALL CONTINUE TO navigate ke halaman return form dengan parameter barcode

3.2 WHEN user memilih produk dari dropdown pencarian THEN sistem SHALL CONTINUE TO navigate ke halaman return form dengan parameter barcode produk tersebut

3.3 WHEN user menekan tombol stop scanner THEN sistem SHALL CONTINUE TO menghentikan kamera dan mengembalikan ke state awal

3.4 WHEN user memasukkan barcode secara manual melalui input field THEN sistem SHALL CONTINUE TO navigate ke halaman return form dengan parameter barcode

3.5 WHEN kamera tidak memiliki izin THEN sistem SHALL CONTINUE TO menampilkan pesan error yang informatif
