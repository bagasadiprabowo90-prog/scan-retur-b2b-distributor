# Scanner Mode Improvements Bugfix Design

## Overview

Dokumen ini mendefinisikan design untuk perbaikan mode scanner pada aplikasi Scan Retur. Bug yang diidentifikasi mencakup masalah UI/UX, performa deteksi barcode yang lambat di Android, kegagalan total deteksi di iOS, dan ketidakmampuan mendeteksi barcode kosmetik berukuran kecil.

Strategi perbaikan menggunakan pendekatan:
1. **Redesign UI** - Tampilan fullscreen dengan scanning guide yang clean dan native-like
2. **Optimasi Quagga2** - Konfigurasi yang dioptimalkan untuk deteksi barcode kecil dan cepat
3. **Cross-platform fixes** - Penanganan khusus untuk iOS Safari dan Chrome Android
4. **Feedback improvement** - Visual dan audio feedback untuk user experience yang lebih baik

## Glossary

- **Bug_Condition (C)**: Kondisi ketika scanner gagal mendeteksi barcode atau UI tidak optimal - mencakup masalah UI, performa, dan cross-platform compatibility
- **Property (P)**: Perilaku yang diharapkan - scanner mendeteksi barcode dengan cepat dan akurat di semua platform dengan UI yang clean
- **Preservation**: Perilaku yang harus tetap berfungsi - navigasi, product search, manual input, error handling
- **ScanPage**: Komponen di `src/pages/ScanPage.tsx` yang menangani kamera dan barcode scanning
- **Quagga2**: Library `@ericblade/quagga2` yang digunakan untuk barcode detection
- **halfSample**: Konfigurasi Quagga yang jika `true` akan downsample gambar untuk performa, tapi mengurangi akurasi barcode kecil
- **patchSize**: Ukuran area yang dicari oleh Quagga locator - "small" untuk barcode kecil, "medium"/"large" untuk barcode besar
- **torch**: Flashlight/kamera flash untuk penerangan tambahan saat scan

## Bug Details

### Bug Condition

Bug termanifestasi dalam beberapa skenario berikut:

1. **UI Tidak Optimal**: Camera preview terlalu kecil dengan aspect ratio 4:3, terlalu banyak kontrol (zoom slider, torch button) yang membuat UI cluttered dan tidak native-like.

2. **Performa Lambat di Android**: Quagga2 dengan konfigurasi default (`halfSample: true`, `patchSize: "medium"`) tidak optimal untuk barcode kecil, menyebabkan deteksi lambat (>3 detik) atau gagal.

3. **Gagal Total di iOS**: iOS Safari memiliki penanganan khusus untuk `getUserMedia` dan Quagga2 memerlukan konfigurasi tambahan untuk bekerja dengan baik di iOS.

4. **Barcode Kecil Tidak Terdeteksi**: Barcode kosmetik berukuran kecil membutuhkan `halfSample: false` dan `patchSize: "small"` untuk deteksi yang akurat.

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
    OR (input.platform = "Android" AND input.quaggaConfig.halfSample = true AND input.barcodeSize = "small")
    
    // Bug 3: Gagal di iOS
    OR (input.platform = "iOS" AND input.detectionResult = null AND input.error = undefined)
    OR (input.platform = "iOS" AND input.videoReadyState < 3)
    
    // Bug 4: Barcode kecil tidak terdeteksi
    OR (input.barcodeSize = "small" AND input.quaggaConfig.patchSize IN ["medium", "large"])
    OR (input.barcodeSize = "small" AND input.quaggaConfig.halfSample = true)
  )
END FUNCTION
```

### Examples

- **Example 1 (UI)**: User membuka scanner di iPhone 13. Camera preview hanya mengambil 60% layar dengan aspect ratio 4:3. Zoom slider dan torch button membuat tampilan tidak clean. Expected: Fullscreen camera dengan UI minimalis.

- **Example 2 (Android Performance)**: User mencoba scan barcode kosmetik EAN-13 berukuran 2cm x 1cm di Android. Deteksi membutuhkan 5+ detik atau gagal. Expected: Deteksi dalam <2 detik.

- **Example 3 (iOS Failure)**: User mencoba scan barcode di Safari iOS. Kamera menyala tapi tidak ada barcode yang terdeteksi sama sekali. Expected: Barcode terdeteksi dengan feedback visual.

- **Example 4 (Small Barcode)**: User scan barcode Code128 berukuran kecil (1.5cm) di kondisi pencahayaan normal. Quagga gagal mendeteksi. Expected: Barcode terdeteksi dengan konfigurasi yang dioptimalkan.

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

2. **Quagga2 Configuration untuk Barcode Kecil**:
   - `halfSample: true` menyebabkan downsampling gambar, mengurangi detail barcode kecil
   - `patchSize: "medium"` tidak cocok untuk barcode kosmetik yang lebih kecil
   - `frequency: 10` terlalu rendah untuk respons yang cepat
   - Perlu: `halfSample: false`, `patchSize: "small"`, `frequency: 20+`

3. **iOS Safari Compatibility Issues**:
   - iOS Safari memerlukan `playsInline` attribute yang sudah ada, tapi mungkin ada timing issues
   - Quagga2 memerlukan video element yang sudah fully loaded sebelum inisialisasi
   - iOS mungkin memerlukan user gesture sebelum memulai Quagga
   - Perlu: Proper video ready state check dan user gesture handling

4. **Worker Thread Issues**:
   - `numOfWorkers` menggunakan `navigator.hardwareConcurrency` yang mungkin tidak konsisten di semua device
   - Web Workers mungkin tidak didukung dengan baik di beberapa browser mobile
   - Perlu: Fallback untuk environments tanpa Worker support

5. **Camera Constraints**:
   - Resolution `1280x720` mungkin tidak optimal untuk semua devices
   - `facingMode: "environment"` bisa pilih kamera yang salah di beberapa devices
   - Perlu: Better camera selection dengan deviceId fallback

## Correctness Properties

Property 1: Bug Condition - Fullscreen Camera Preview dengan UI Clean

_For any_ user yang membuka scanner di perangkat mobile, camera preview SHALL ditampilkan dalam mode fullscreen dengan aspect ratio yang optimal untuk device tersebut, dengan UI kontrol yang minimalis (hanya tombol close dan optional torch toggle).

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition - Deteksi Barcode Cepat di Android

_For any_ barcode yang di-scan di perangkat Android, sistem SHALL mendeteksi barcode dalam waktu kurang dari 2 detik dengan konfigurasi Quagga2 yang dioptimalkan (`halfSample: false`, `patchSize: "small"`, `frequency: 20`).

**Validates: Requirements 2.3, 2.6**

Property 3: Bug Condition - Deteksi Barcode di iOS

_For any_ barcode yang di-scan di Safari iOS, sistem SHALL mendeteksi barcode dengan sukses menggunakan proper video initialization dan user gesture handling untuk Quagga2.

**Validates: Requirements 2.4, 2.6**

Property 4: Bug Condition - Deteksi Barcode Kecil

_For any_ barcode kosmetik berukuran kecil, sistem SHALL mendeteksi barcode dengan akurasi yang baik menggunakan konfigurasi Quagga2 yang dioptimalkan untuk resolusi tinggi dan detail kecil.

**Validates: Requirements 2.5, 2.6**

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

#### 2. Quagga2 Configuration Optimization

**File**: `src/pages/ScanPage.tsx`

**Function**: `initQuagga()`

**Current Configuration** (Bermasalah):
```javascript
{
  inputStream: {
    constraints: {
      width: { min: 640 },
      height: { min: 480 },
      facingMode: "environment",
      aspectRatio: { min: 4/3, max: 16/9 },
    },
  },
  locator: {
    patchSize: "medium",      // BUG: tidak optimal untuk barcode kecil
    halfSample: true,          // BUG: mengurangi detail barcode kecil
  },
  frequency: 10,               // BUG: terlalu rendah untuk respons cepat
  numOfWorkers: navigator.hardwareConcurrency || 4,
  decoder: {
    readers: [/* ... */],
  },
}
```

**Optimized Configuration**:
```javascript
{
  inputStream: {
    constraints: {
      width: { min: 1280, ideal: 1920 },    // Resolusi lebih tinggi
      height: { min: 720, ideal: 1080 },
      facingMode: "environment",
      aspectRatio: { min: 1, max: 2 },       // Lebih fleksibel
    },
  },
  locator: {
    patchSize: "small",        // FIX: optimal untuk barcode kecil
    halfSample: false,         // FIX: pertahankan detail
  },
  frequency: 20,               // FIX: scanning lebih sering
  numOfWorkers: Math.min(navigator.hardwareConcurrency || 2, 4), // FIX: cap workers
  decoder: {
    readers: [
      "ean_reader",            // Prioritaskan EAN untuk kosmetik
      "ean_8_reader",
      "code_128_reader",       // Code128 untuk barcode umum
      "code_39_reader",
      "upc_reader",
      "upc_e_reader",
    ],
    multiple: false,           // FIX: single barcode mode lebih cepat
  },
  locate: true,                // Enable locator untuk barcode kecil
}
```

#### 3. iOS Safari Compatibility

**File**: `src/pages/ScanPage.tsx`

**Changes**:
- Tambahkan proper video ready state check sebelum Quagga init
- Implementasi user gesture requirement untuk iOS
- Gunakan `video.oncanplay` atau `video.onplaying` untuk timing
- Tambahkan retry mechanism untuk Quagga initialization

**Implementation**:
```javascript
const initQuagga = () => {
  const video = videoRef.current;
  if (!video || video.readyState < 3) {
    // Wait for video to be ready
    video?.addEventListener('canplay', initQuagga, { once: true });
    return;
  }
  
  // iOS requires user gesture - check if we're in user gesture context
  Quagga.init(config, (err) => {
    if (err) {
      // Retry with fallback configuration
      if (err.name === 'NotAllowedError') {
        // iOS permission issue
      }
      return;
    }
    Quagga.start();
  });
};
```

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

#### Phase 2: Quagga2 Optimization
1. Update configuration dengan optimized settings
2. Implementasi proper error handling
3. Add detection confidence filtering
4. Implementasi debouncing untuk rapid detections

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

- Test Quagga2 initialization dengan berbagai configurations
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
