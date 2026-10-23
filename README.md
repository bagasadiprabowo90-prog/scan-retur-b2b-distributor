# Scan Retur B2B Distributor (PWA — React + Vite)

Aplikasi Web & PWA (Progressive Web App) untuk manajemen retur barang distributor B2B:
- 📷 Scan barcode produk retur dengan kamera perangkat
- 🔍 Auto-fill SKU & Product dari master data Google Sheets
- 📦 Pilih Batch/Lot dengan pencarian/filter cepat & modal tambah batch baru
- 📝 Input data retur dan simpan langsung ke Google Sheets (multi-tab: Bagas, Dimas, dll.)
- 🕘 Riwayat retur tersinkronisasi dengan proteksi double-submit & verifikasi status penyimpanan
- 🔒 **Keamanan & Privasi Data**:
  - **Google Workspace SSO**: Login resmi Google Sign-In dikunci khusus domain `@blpbeauty.com`
  - **Sheet Whitelist (`Users`)**: Hanya email terdaftar & berstatus `Active` yang dapat masuk
  - **Auto-Fill PIC**: Nama lengkap pengguna dari akun BLP otomatis terisi sebagai PIC retur
  - **Session TTL**: Sesi login otomatis kedaluwarsa setelah 12 jam (1 shift kerja)
  - **Sanitasi Formula Injection**: Proteksi sel Google Sheets dari injeksi formula (`=`, `+`, `-`, `@`)
  - **Proteksi Repositori Git**: File `.env` & kredensial rahasia diabaikan dari Git tracking

---

## 🚀 Panduan Setup & Instalasi

### 1. Setup Google Apps Script (Backend)

1. Buka spreadsheet Google Sheets Anda → **Extensions → Apps Script** (atau script.google.com).
2. Salin seluruh isi [`apps-script/Code.js`](apps-script/Code.js) ke dalam editor Apps Script.
3. **Amankan Spreadsheet ID & Siapkan Tab `Users`**:
   - Di editor Apps Script, pilih fungsi `setupEnvironment` lalu klik **Run** (Jalankan).
   - Fungsi ini otomatis:
     - Menyimpan `SPREADSHEET_ID` ke **Script Properties** Google Cloud.
     - Membuat tab sheet **`Users`** dengan kolom `Email | Nama Lengkap | Role | Status | Terakhir Login` dan mengisikan akun awal (`bagas@blpbeauty.com`, `dimas@blpbeauty.com`, dll.).
4. Deploy sebagai Web App:
   - Klik **Deploy → New deployment**
   - Pilih jenis: **Web app**
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
   - Klik **Deploy**, lalu salin URL yang muncul (`https://script.google.com/macros/s/.../exec`).

### 2. Dapatkan Google OAuth Client ID (3 Menit)

1. Kunjungi [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
2. Pilih project Google Cloud Anda (atau buat baru, gratis).
3. Klik **Create Credentials → OAuth client ID**.
4. Application type: **Web application**.
5. Pada bagian **Authorized JavaScript origins**, tambahkan:
   - `http://localhost:5173` (untuk pengujian dev lokal)
   - `https://domain-anda.vercel.app` (URL website Anda di Vercel)
6. Klik **Create**, lalu salin **Client ID** yang berakhiran `.apps.googleusercontent.com`.

### 3. Setup File `.env`

1. Salin template `.env.example` menjadi `.env`:
   ```bash
   cp .env.example .env
   ```
2. Buka `.env` dan masukkan:
   ```env
   VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/DEPLOYMENT_ID_ANDA/exec
   VITE_GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
   ```
   > ⚠️ **PERHATIAN**: File `.env` sudah dimasukkan ke `.gitignore` dan tidak boleh di-commit ke Git.

### 4. Menjalankan & Membangun Aplikasi

```bash
# Install dependencies
npm install

# Jalankan server development lokal
npm run dev

# Jalankan build production
npm run build
```

---

## 👥 Pengelolaan Pengguna (Tab Sheet `Users`)

Aplikasi dilengkapi proteksi ganda:
1. **Validasi Domain**: Hanya akun yang berakhiran `@blpbeauty.com` yang bisa login melalui Google. Akun `@gmail.com` atau domain lain akan langsung ditolak.
2. **Whitelist Karyawan**: Di spreadsheet Google Sheets, tab **`Users`** memuat:
   | Email | Nama Lengkap | Role | Status | Terakhir Login |
   |---|---|---|---|---|
   | `bagas@blpbeauty.com` | Bagas Adi | User | Active | 23-10-2026 19:30 |
   | `dimas@blpbeauty.com` | Dimas | User | Active | ... |
   | `nur@blpbeauty.com` | Nur | User | Active | ... |
   | `irwan@blpbeauty.com` | Irwan | User | Active | ... |

- **Menambah Karyawan**: Cukup tambahkan baris baru dengan email `@blpbeauty.com` dan status `Active`.
- **Mencabut Akses**: Ubah status menjadi `Inactive` atau hapus barisnya; karyawan tersebut tidak akan bisa masuk lagi ke aplikasi.
