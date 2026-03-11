# Scan Retur B2B Distributor (Expo React Native)

Mobile app untuk:
- Scan barcode produk retur
- Auto-fill SKU & Product dari **Google Sheets (Master)**
- Pilih Batch/Lot via modal **search/filter** (global list)
- Atau **Create New Batch** (batch + exp date)
- Submit data retur ke Google Sheets (append row) via **Google Apps Script Web App**

## Sheet yang dipakai

### Master sheet
Tab name: **`Master Product & Lots`**

Header minimal (baris 1):
- `SKU`
- `barcode`
- `Product`
- `Lots`
- `Exp Date`

### Return log sheet
Tab name: **`Bagas retur`**

Header (baris 1):
- `Receive Date`
- `Distri/Event`
- `Product`
- `Barcode`
- `Batch`
- `Exp Date`
- `Qty`
- `Keterangan`
- `PIC`

## Setup Google Apps Script

1. Buka Google Sheets Anda → **Extensions → Apps Script**
2. Copy isi `apps-script/Code.js` ke editor Apps Script
3. Set `SPREADSHEET_ID` (ambil dari URL Google Sheet)
4. Deploy:
   - **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Klik Deploy
   - Copy **Web app URL**

## Setup aplikasi (Expo)

1. Buat `.env`:
   ```
   EXPO_PUBLIC_APPS_SCRIPT_URL=PASTE_WEB_APP_URL
   ```

2. Install:
   ```bash
   npm install
   npx expo install expo-camera
   npm install @react-navigation/native @react-navigation/native-stack
   npx expo install react-native-screens react-native-safe-area-context
   ```

3. Run:
   ```bash
   npx expo start
   ```

## Endpoint (Apps Script)

- `GET ?action=master&barcode=...`
- `GET ?action=batches`
- `POST`:
  ```json
  { "action": "returns", "payload": { "...": "..." } }
  ```