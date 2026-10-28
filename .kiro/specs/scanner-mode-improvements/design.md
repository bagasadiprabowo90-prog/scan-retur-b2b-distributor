# Scanner Mode Improvements Bugfix Design

## Overview

Dokumen ini mendefinisikan design untuk perbaikan mode scanner pada aplikasi Scan Retur. Bug yang diidentifikasi mencakup masalah UI/UX, performa deteksi barcode yang lambat di Android, kegagalan total deteksi di iOS, dan ketidakmampuan mendeteksi barcode kosmetik berukuran kecil.

Strategi perbaikan menggunakan pendekatan:
1. **Redesign UI** - Tampilan fullscreen dengan scanning guide yang clean dan native-like
2. **Optimasi html5-qrcode** - Stage kamera berukuran tetap dan konfigurasi decode yang dioptimalkan untuk barcode kecil
3. **Cross-platform fixes** - Penanganan lifecycle kamera untuk iOS Safari dan Chrome Android
4. **Feedback improvement** - Visual dan audio feedback untuk user experience yang lebih baik

## Glossary

- **Bug_Condition (C)**: Kondisi ketika scanner gagal mendeteksi barcode atau UI tidak optimal - mencakup masalah UI, performa, dan cross-platform compatibility
- **Property (P)**: Perilaku yang diharapkan - scanner mendeteksi barcode dengan cepat dan akurat di semua platform dengan UI yang clean
- **Preservation**: Perilaku yang harus tetap berfungsi - navigasi, product search, manual input, error handling
- **ScanPage**: Komponen di `src/pages/ScanPage.tsx` yang menangani kamera dan barcode scanning
- **html5-qrcode**: Library `html5-qrcode@2.3.8` yang dipakai untuk barcode detection (bukan Quagga2)
- **qrbox**: Area decode yang diminta ke html5-qrcode, dihitung dari `clientWidth`/`clientHeight` video
- **qrRegion**: Area decode aktual, dihitung html5-qrcode **sekali** saat event `playing` lalu dipakai ulang setiap frame
- **Stage**: Container kamera di `ScanPage`; ukuran CSS-nya (1280x720) menentukan resolusi canvas decode
- **displayScale**: Faktor `transform: scale()` yang memperkecil stage agar muat di layar
- **torch**: Flashlight/kamera flash untuk penerangan tambahan saat scan

## Bug Details

### Bug Condition

Bug termanifestasi dalam beberapa skenario berikut:

1. **UI Tidak Optimal**: Camera preview terlalu kecil dengan aspect ratio 4:3, terlalu banyak kontrol (zoom slider, torch button) yang membuat UI cluttered dan tidak native-like.

2. **Resolusi Decode Terlalu Kecil**: html5-qrcode menyalin area `qrbox` ke canvas seukuran `qrbox` itu dalam CSS pixel, lalu memperkecil piksel kamera ke canvas tersebut. `MAX_DECODE_SCALE` mengikat ukuran stage pada `devicePixelRatio` (maks 2.5), sehingga canvas decode hanya ~877px walau kamera mengirim 1920px — detail barcode kecil hilang di proses downscale.

3. **Gagal Total di iOS**: `#scanner-container video` memakai `height: auto`, jadi `clientHeight` bergantung pada kapan WebKit menerapkan ukuran intrinsik stream. html5-qrcode menghitung `qrRegion` sekali saat `playing`, tetapi menghitung ulang `videoHeight/clientHeight` setiap frame.

4. **Barcode Kecil Tidak Terdeteksi**: barcode kosmetik butuh piksel per modul yang cukup. Downscale 1920px → 877px memotong detail hampir separuh sebelum decoder melihatnya.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type ScanContext
  OUTPUT: boolean
  
  RETURN (
    // Bug 1: UI tidak optimal
    (input.cameraPreviewAspectRatio = 4/3 AND input.cameraPreviewHeight < deviceHeight * 0.6)
    OR (input.visibleControlCount > 2 AND input.userFeedback = "cluttered")
    
    // Bug 2: Performa lambat di Android
    OR (input.platform = "Android" AND input.detectionTime > 3000)
    OR (input.platform = "Android" AND input.qrRegionMatchesDisplay = false)
    
    // Bug 3: Gagal di iOS
    OR (input.platform = "iOS" AND input.detectionResult = null AND input.error = undefined)
    OR (input.platform = "iOS" AND input.decodeScaleRatio <> 1)
    
    // Bug 4: Barcode kecil tidak terdeteksi
    OR (input.barcodeSize = "small" AND input.decodeCanvasWidth < 1000)
  )
END FUNCTION
```

### Examples

- **Example 1 (UI)**: User membuka scanner di iPhone 13. Camera preview hanya mengambil 60% layar dengan aspect ratio 4:3. Zoom slider dan torch button membuat tampilan tidak clean. Expected: Fullscreen camera dengan UI minimalis.

- **Example 2 (Android Performance)**: User mencoba scan barcode kosmetik EAN-13 berukuran 2cm x 1cm di Android. Deteksi membutuhkan 5+ detik atau gagal. Expected: Deteksi dalam <2 detik.

- **Example 3 (iOS Failure)**: User mencoba scan barcode di Safari iOS. Kamera menyala dan kotak hijau tampil, tetapi tidak ada barcode yang terdeteksi dan tidak ada pesan error. Expected: Barcode terdeteksi dengan feedback visual.

- **Example 4 (Small Barcode)**: User scan barcode Code128 berukuran kecil (1.5cm) di kondisi pencahayaan normal. html5-qrcode gagal mendeteksi karena canvas decode hanya ~877px. Expected: Barcode terdeteksi setelah stage decode diperbesar ke 1280px.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Navigasi ke return form setelah barcode berhasil terdeteksi harus tetap berfungsi
- Product search dropdown harus tetap dapat digunakan untuk memilih produk
- Manual input barcode harus tetap berfungsi sebagai fallback
- Stop scanner harus menghentikan kamera dan reset state
- Error handling untuk permission denied harus tetap menampilkan pesan yang informatif
- Torch/flash toggle harus tetap tersedia (dengan UI yang lebih bersih)

**Scope:**
Semua input yang TIDAK terkait dengan bug condition harus tetap berfungsi:
- Touch/tap interactions pada UI
- Keyboard input untuk manual barcode entry
- Product search dan selection flow
- Navigation antar halaman
- Error states dan messages

## Hypothesized Root Cause

Berdasarkan analisis kode dan bug description, akar masalah yang paling mungkin:

1. **Camera Preview Size**: 
   - Menggunakan `aspectRatio: "4/3"` yang tidak memanfaatkan fullscreen
   - Container terbatas oleh padding dan card-based layout
   - Perlu: Fullscreen approach dengan safe area insets

2. **Resolusi Decode Ditentukan devicePixelRatio**:
   - html5-qrcode memakai canvas seukuran `qrbox` (CSS pixel) lalu memperkecil piksel kamera ke situ
   - `MAX_DECODE_SCALE = 2.5` membuat stage = `devicePixelRatio × lebar layar` (maks 2.5×), jadi canvas ~877px
   - Perlu: stage berukuran tetap 1280x720, tidak bergantung pada `devicePixelRatio`

3. **Geometri Area Decode (akar masalah iOS)**:
   - `#scanner-container video` memakai `height: auto`; `clientHeight` bergantung pada kapan WebKit menerapkan ukuran intrinsik stream
   - html5-qrcode menghitung `qrRegion` SEKALI di `onRenderSurfaceReady` (event `playing`), tetapi `foreverScan` menghitung ulang `videoWidth/clientWidth` dan `videoHeight/clientHeight` SETIAP frame
   - Akibatnya bergantung timing (video 1280x720, elemen selebar 975px):
     - layout intrinsik belum diterapkan saat `playing` (`clientHeight` 150) -> `qrRegion` = 877x135 di `y = 7.5`; setelah layout settle `heightRatio` = 1.314 sehingga area yang di-decode hanya strip `y 10..187` dari 720, jauh dari posisi kotak panduan di layar
     - frame diproses selagi `clientHeight` masih 150 -> `heightRatio` 4.8 vs `widthRatio` 1.31, area sumber dipadatkan anisotropik ke canvas 135 baris
     - `clientHeight`/`clientWidth` transien 0 -> rasio `Infinity`, `drawImage` melempar error di dalam `setTimeout` yang tidak di-catch, `triggerNextScan()` tidak pernah dipanggil, dan loop mati tanpa pesan
   - Error callback diabaikan, jadi semua varian di atas tampil sebagai "kamera hidup tapi tidak ada respons"
   - Perlu: tinggi video eksplisit (`height: 100%` dari stage), sehingga rasio berhingga dan tetap di setiap frame

4. **Lifecycle Kamera (start/stop)**:
   - `stopScanner()` hanya memanggil `stop()` bila state sudah `SCANNING`; saat start masih berjalan, `clear()` menghapus video dari DOM sehingga event `playing` tidak pernah datang dan promise `start()` menggantung
   - Stream yang belum dihentikan tetap memegang kamera; di iOS scan berikutnya gagal `NotReadableError`
   - Perlu: token pembatalan (`runIdRef`), penghentian track manual, dan pembersihan tetap saat unmount

5. **Throughput Decode**:
   - `fps: 15` dibagi dua oleh mekanisme `Html5QrcodeShim.getDecoder()` yang bergantian memakai BarcodeDetector dan ZXing saat keduanya tersedia
   - Perlu: `fps: 24` agar tiap decoder tetap mendapat ~12 fps

## Correctness Properties

Property 1: Bug Condition - Stage Kamera Berukuran Tetap

_For any_ user yang membuka scanner di perangkat mobile, stage kamera SHALL berukuran tetap (1280x720) dengan tinggi eksplisit, diperkecil via `transform: scale()` sehingga tampil selebar layar.

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition - Decode Cepat dan Konsisten

_For any_ barcode yang di-scan, sistem SHALL memproses frame pada `fps: 24` menggunakan canvas decode ~1152px, tidak bergantung pada `devicePixelRatio` maupun platform.

**Validates: Requirements 2.3, 2.6**

Property 3: Bug Condition - Deteksi Barcode di iOS

_For any_ barcode yang di-scan di Safari iOS, `videoWidth/clientWidth` dan `videoHeight/clientHeight` SHALL bernilai rasio yang sama (tidak anisotropik), sehingga area yang di-decode identik dengan kotak panduan di layar.

**Validates: Requirements 2.3**

Property 4: Bug Condition - Deteksi Barcode Kecil

_For any_ barcode kosmetik berukuran kecil, sistem SHALL men-decode dengan canvas minimal 1000px sehingga piksel per modul cukup untuk decoder.

**Validates: Requirements 2.1, 2.6**

Property 5: Preservation - Navigasi dan Fungsi Existing

_For any_ interaksi yang tidak terkait dengan bug condition (manual input, product search, navigation), sistem SHALL mempertahankan perilaku yang sama seperti sebelum perbaikan, termasuk navigasi ke return form dan error handling.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

#### 1. UI Redesign - Fullscreen Scanner

**File**: `src/pages/ScanPage.tsx`

**Changes**:
- Ubah camera container dari card-based ke fullscreen overlay
- Hapus zoom slider (gunakan auto-focus dan camera API zoom jika tersedia)
- Sederhanakan kontrol: hanya tombol close dan torch toggle
- Tambahkan scanning guide overlay dengan animasi
- Implementasi safe area insets untuk notch/home indicator

**CSS Changes** (`src/index.css`):
- Tambahkan styles untuk fullscreen scanner
- Animasi scanning line
- Safe area handling untuk iOS

#### 2. Stage Kamera dan Konfigurasi html5-qrcode

**File**: `src/pages/ScanPage.tsx` + `src/index.css`

html5-qrcode tidak mengenal `halfSample` / `patchSize` / `numOfWorkers`. Padanan yang menentukan akurasi barcode kecil adalah **ukuran stage** (menentukan ukuran canvas decode) dan `fps`.

**Konfigurasi (implementasi sekarang)**:
```typescript
const CAMERA_WIDTH = 1920;
const CAMERA_HEIGHT = 1080;
const CAMERA_ASPECT_RATIO = CAMERA_WIDTH / CAMERA_HEIGHT;            // 16/9
const STAGE_WIDTH = 1280;                                             // canvas decode ~1152px
const STAGE_HEIGHT = Math.round(STAGE_WIDTH / CAMERA_ASPECT_RATIO);   // 720
const SCAN_FPS = 24;

await scanner.start(
  { facingMode: "environment" },
  {
    fps: SCAN_FPS,
    qrbox: (w, h) => scanBoxFor(w, h),   // 90% lebar, tinggi 40% dari lebar
    disableFlip: true,                    // kamera belakang tidak mirror
    videoConstraints: {
      facingMode: { ideal: "environment" },
      width: { ideal: CAMERA_WIDTH },
      height: { ideal: CAMERA_HEIGHT },
      aspectRatio: { ideal: CAMERA_ASPECT_RATIO },  // 'ideal' tidak pernah reject
    },
  },
  onSuccess,
  onFrameError,
);
```

**CSS yang mengunci geometri** (`src/index.css`):
```css
#scanner-container { width: 100%; height: 100%; }
#scanner-container video {
  width: 100% !important;
  height: 100% !important;   /* BUKAN height: auto */
  object-fit: fill;
}
```

**Dampak**: canvas decode naik dari ~877px ke ~1152px, dan `clientWidth`/`clientHeight` menjadi nilai tetap sehingga `qrRegion` selalu cocok dengan kotak panduan.


#### 3. Geometri Area Decode (iOS Safari)

**File**: `src/pages/ScanPage.tsx`

**Perubahan**:
- Stage punya tinggi eksplisit (`STAGE_HEIGHT`), bukan hasil layout intrinsik video
- `computeStageLayout()` mengembalikan `{ width, height, displayScale }`; `displayScale` dipakai untuk `transform: scale()` sekaligus mengubah ukuran kotak panduan ke CSS pixel layar
- Kotak panduan dihitung `box.width * displayScale`, bukan `box.width / displayScale`
- `tuneCamera` / `changeZoom` menyertakan `aspectRatio` saat `applyVideoConstraints` agar rasio tidak berubah di tengah scan

**Kenapa bukan video readyState check**: pemeriksaan `video.readyState` tidak menyelesaikan masalahnya, karena `qrRegion` dihitung dari ukuran CSS, bukan dari kesiapan video. Yang harus dijamin adalah ukuran CSS itu sendiri.


#### 4. Enhanced Feedback

**File**: `src/pages/ScanPage.tsx`

**Changes**:
- Tambahkan visual scanning animation (moving scan line)
- Tambahkan haptic feedback (vibration) saat barcode detected
- Tambahkan success sound (optional)
- Tambahkan progress indicator saat initializing

#### 5. Camera Selection Fallback

**File**: `src/pages/ScanPage.tsx`

**Changes**:
- Enumerate cameras dan pilih back camera secara eksplisit
- Fallback ke camera manapun yang tersedia jika environment mode gagal
- Store deviceId untuk session

### Detailed Implementation Plan

#### Phase 1: UI Restructure
1. Buat fullscreen container untuk scanner
2. Implementasi scanning overlay dengan animasi
3. Simplify controls (remove zoom, keep torch)
4. Add close button yang prominent

#### Phase 2: Optimasi html5-qrcode
1. Stage berukuran tetap (1280x720) dengan tinggi eksplisit
2. `fps: 24` dan `aspectRatio: { ideal: 16/9 }` pada `videoConstraints`
3. Watchdog untuk loop decode yang berhenti diam-diam
4. Debounce deteksi berlapis sudah ditangani `detectedRef` (satu deteksi per sesi scan)

#### Phase 3: Cross-Platform Fixes
1. iOS Safari specific fixes
2. Android Chrome optimization
3. Worker fallback implementation
4. Camera selection improvement

#### Phase 4: Enhanced UX
1. Scanning animation
2. Haptic feedback
3. Success/error states
4. Loading states

## Testing Strategy

### Validation Approach

Testing strategy mengikuti pendekatan tiga fase:
1. **Exploratory Testing**: Verifikasi bug conditions pada unfixed code
2. **Fix Checking**: Verifikasi perbaikan untuk semua bug conditions
3. **Preservation Checking**: Verifikasi fungsi existing tetap berjalan

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples yang mendemonstrasikan bug SEBELUM implementasi fix. Konfirmasi atau sangkal root cause analysis.

**Test Plan**: Jalankan tests pada UNFIXED code di berbagai devices untuk mengamati failures.

**Test Cases**:
1. **UI Layout Test**: Buka scanner di berbagai device sizes, verifikasi camera preview size dan control count
2. **Android Performance Test**: Scan berbagai barcode di Android, ukur detection time
3. **iOS Detection Test**: Scan berbagai barcode di iOS Safari, verifikasi detection rate
4. **Small Barcode Test**: Scan barcode kosmetik kecil, verifikasi detection accuracy

**Expected Counterexamples**:
- Android: Detection time >3 detik untuk barcode kecil
- iOS: No detection atau errors di console
- UI: Camera preview tidak fullscreen, controls >2

### Fix Checking

**Goal**: Verifikasi bahwa untuk semua inputs dimana bug condition holds, fixed function menghasilkan expected behavior.

**Pseudocode:**
```
FOR ALL platform IN ["Android", "iOS"] DO
  FOR ALL barcodeSize IN ["small", "medium", "large"] DO
    result := scanBarcode(platform, barcodeSize)
    ASSERT result.detectionTime < 2000
    ASSERT result.detected = true
  END FOR
END FOR

ASSERT cameraPreviewSize >= deviceHeight * 0.9
ASSERT visibleControlCount <= 2
```

### Preservation Checking

**Goal**: Verifikasi bahwa untuk semua inputs dimana bug condition TIDAK hold, fixed function menghasilkan hasil yang sama dengan original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT handleNavigation_fixed(input) = handleNavigation_original(input)
  ASSERT handleProductSearch_fixed(input) = handleProductSearch_original(input)
  ASSERT handleManualInput_fixed(input) = handleManualInput_original(input)
END FOR
```

**Testing Approach**: Property-based testing untuk preservation checking karena:
- Menggenerate banyak test cases secara otomatis
- Menangkap edge cases yang mungkin terlewat
- Memberikan jaminan kuat bahwa behavior tidak berubah

**Test Cases**:
1. **Navigation Preservation**: Verifikasi navigasi ke return form setelah scan
2. **Product Search Preservation**: Verifikasi dropdown product search tetap berfungsi
3. **Manual Input Preservation**: Verifikasi manual barcode input tetap berfungsi
4. **Error Handling Preservation**: Verifikasi error messages tetap ditampilkan dengan benar

### Unit Tests

- Test geometri stage: `computeStageLayout()`, `scanBoxFor()`, dan konversi `displayScale` (helper perlu di-export dari `ScanPage.tsx` agar bisa diuji tanpa render kamera)
- Test camera selection dan fallback logic
- Test barcode detection callback handling
- Test UI state transitions (idle → scanning → detected → stopped)

### Property-Based Tests

- Generate random camera constraints dan verifikasi initialization succeeds
- Generate random barcode formats dan verifikasi detection
- Test preservation: random interactions non-scanning harus produce same results

### Integration Tests

- Test full scan flow: open → detect → navigate
- Test cross-platform behavior di berbagai device simulators
- Test error recovery flows (permission denied, camera error)

### Device-Specific Testing

**Android Testing**:
1. Chrome Android (latest 2 versions)
2. Samsung Internet
3. Firefox Android

**iOS Testing**:
1. Safari iOS (iOS 15+)
2. Chrome iOS
3. Test di iPhone dengan notch dan tanpa notch

**Barcode Types untuk Testing**:
1. EAN-13 (kosmetik umum)
2. EAN-8 (produk kecil)
3. Code128 (barcode umum)
4. UPC-A/UPC-E (produk US)
5. Barcode berukuran kecil (< 2cm width)

### Performance Benchmarks

| Metric | Target | Current (Bug) |
|--------|--------|---------------|
| Detection Time Android | < 2s | > 3s |
| Detection Time iOS | < 2s | Timeout/Error |
| Small Barcode Detection Rate | > 90% | < 50% |
| UI Response Time | < 100ms | Acceptable |
| Camera Startup Time | < 1s | ~1s |

### Testing Checklist

- [ ] Android: Scan EAN-13 barcode dalam < 2 detik
- [ ] Android: Scan barcode kecil (1.5cm) berhasil
- [ ] iOS: Scanner berfungsi di Safari
- [ ] iOS: Barcode detection dengan feedback visual
- [ ] UI: Fullscreen camera preview
- [ ] UI: Controls minimalis (≤2 visible controls)
- [ ] Preservation: Navigation ke return form
- [ ] Preservation: Product search dropdown
- [ ] Preservation: Manual input
- [ ] Preservation: Error handling
