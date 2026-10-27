// ============================================================
// KONFIGURASI KEAMANAN & SPREADSHEET
// ============================================================
// Rekomendasi: Simpan ID Spreadsheet dan Token di Script Properties
// (Apps Script > Project Settings > Script Properties) agar tidak
// terekspos jika repositori ini bersifat publik / dishare.
// Atau jalankan fungsi `setupEnvironment()` sekali di editor Apps Script.
const SPREADSHEET_ID_FALLBACK = "1Ppz3hQrVBMjYTo0qDpQfylGKAdxDG98sVPdD6TRqEiU";
const MASTER_SHEET_NAME = "Master Product & Lots";
const USERS_SHEET_NAME = "Users";
const REQUIRED_EMAIL_DOMAIN = "blpbeauty.com";
const REQUIRE_USER_WHITELIST = true;
const DEFAULT_HISTORY_LIMIT = 200;

// Sheet retur yang tersedia (nama harus PERSIS sama dengan tab di Google Sheet)
const ALLOWED_RETURN_SHEETS = ["Bagas", "Dimas"];

function getSpreadsheetId_() {
  try {
    var propId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    if (propId && propId.trim()) return propId.trim();
  } catch (e) {}

  try {
    var bound = SpreadsheetApp.getActiveSpreadsheet();
    if (bound) return bound.getId();
  } catch (e) {}

  return SPREADSHEET_ID_FALLBACK;
}

function getApiSecretToken_() {
  try {
    return PropertiesService.getScriptProperties().getProperty("API_SECRET_TOKEN") || "";
  } catch (e) {
    return "";
  }
}

function isAuthorized_(e, body) {
  var secret = getApiSecretToken_();
  // Jika API_SECRET_TOKEN belum diset di Script Properties, izinkan akses (backward-compatible)
  if (!secret) return true;

  var incoming = "";
  if (e && e.parameter && e.parameter.token) {
    incoming = String(e.parameter.token).trim();
  } else if (body && body.token) {
    incoming = String(body.token).trim();
  }
  return incoming === secret;
}

// Mencegah Formula Injection (CSV / Spreadsheet Formula Injection OWASP)
function sanitizeSheetValue_(val) {
  if (val == null) return "";
  var str = String(val).trim();
  if (/^[=\+\-@\t\r]/.test(str)) {
    return "'" + str;
  }
  return str;
}

function normalizeEmail_(email) {
  return String(email || "").trim().toLowerCase();
}

function ensureUsersSheet_() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(USERS_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(USERS_SHEET_NAME);
    sh.appendRow(["Email", "Nama Lengkap", "Role", "Status", "Terakhir Login"]);
    var initialUsers = [
      ["bagas@blpbeauty.com", "Bagas", "User", "Active", ""],
      ["dimas@blpbeauty.com", "Dimas", "User", "Active", ""],
      ["nur@blpbeauty.com", "Nur", "User", "Active", ""],
      ["irwan@blpbeauty.com", "Irwan", "User", "Active", ""],
    ];
    sh.getRange(2, 1, initialUsers.length, 5).setValues(initialUsers);
    SpreadsheetApp.flush();
  }
  return sh;
}

function verifyUserAccess_(email, fallbackName) {
  var cleanEmail = normalizeEmail_(email);
  if (!cleanEmail) {
    return { ok: false, error: "Email wajib diisi" };
  }

  // 1. Validasi domain email wajib @blpbeauty.com
  var expectedDomain = "@" + REQUIRED_EMAIL_DOMAIN.toLowerCase();
  if (!cleanEmail.endsWith(expectedDomain)) {
    return {
      ok: false,
      error: "Akses ditolak: Hanya akun email dengan domain @" + REQUIRED_EMAIL_DOMAIN + " yang diizinkan.",
    };
  }

  // 2. Jika whitelist tidak diwajibkan, izinkan semua akun berdomain @blpbeauty.com
  if (!REQUIRE_USER_WHITELIST) {
    return {
      ok: true,
      email: cleanEmail,
      displayName: fallbackName || cleanEmail.split("@")[0],
      role: "User",
    };
  }

  // 3. Pengecekan whitelist pada tab sheet 'Users'
  try {
    var sh = ensureUsersSheet_();
    var lastRow = sh.getLastRow();
    if (lastRow < 2) {
      // Jika sheet baru/kosong, masukkan akun pertama otomatis
      sh.appendRow([cleanEmail, fallbackName || cleanEmail.split("@")[0], "Admin", "Active", new Date()]);
      SpreadsheetApp.flush();
      return {
        ok: true,
        email: cleanEmail,
        displayName: fallbackName || cleanEmail.split("@")[0],
        role: "Admin",
      };
    }

    var map = getHeaderMap(sh);
    var colEmail = map["email"];
    var colName = map["nama lengkap"] || map["name"] || map["nama"];
    var colRole = map["role"];
    var colStatus = map["status"];
    var colLastLogin = map["terakhir login"] || map["last login"];

    if (!colEmail || !colStatus) {
      throw new Error("Sheet 'Users' wajib memiliki kolom: Email, Status");
    }

    var lastCol = map._lastCol || sh.getLastColumn();
    var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var rowEmail = normalizeEmail_(row[colEmail - 1]);
      if (rowEmail === cleanEmail) {
        var status = String(row[colStatus - 1] || "").trim().toLowerCase();
        if (status !== "active" && status !== "aktif") {
          return {
            ok: false,
            error: "Akun Anda (" + cleanEmail + ") berstatus non-aktif di sistem. Silakan hubungi Admin.",
          };
        }

        var userName = colName ? String(row[colName - 1] || "").trim() : "";
        var userRole = colRole ? String(row[colRole - 1] || "").trim() : "User";

        if (colLastLogin) {
          try {
            sh.getRange(i + 2, colLastLogin).setValue(new Date());
          } catch (e) {}
        }

        return {
          ok: true,
          email: cleanEmail,
          displayName: userName || fallbackName || cleanEmail.split("@")[0],
          role: userRole || "User",
        };
      }
    }

    return {
      ok: false,
      error: "Email '" + cleanEmail + "' belum terdaftar di daftar pengguna Scan Retur. Hubungi Admin BLP untuk didaftarkan.",
    };
  } catch (err) {
    return { ok: false, error: "Gagal memverifikasi akun: " + String(err && err.message ? err.message : err) };
  }
}

var _ssCache = null;
function getSpreadsheet() {
  if (!_ssCache) {
    _ssCache = SpreadsheetApp.openById(getSpreadsheetId_());
  }
  return _ssCache;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// ============================================================
// CACHE LAYER (CacheService — persist antar request HTTP)
// Variabel global JS TIDAK persist antar eksekusi Apps Script,
// jadi cache nyata harus lewat CacheService.
// ============================================================

var CACHE_TTL_SECONDS = 21600; // 6 jam (maksimum CacheService)
var CACHE_KEY_PRODUCTS = "products_v3";
var CACHE_KEY_BATCHES = "batches_v3";
var IDEM_TTL_SECONDS = 21600; // 6 jam

// Master data dicache singkat supaya perubahan manual di Google Sheets terlihat
// tanpa memaksa aplikasi melewati cache server setiap kali.
var MASTER_CACHE_TTL_SECONDS = 600; // 10 menit
var MASTER_GEN_PROPERTY = "master_generation";
var CACHE_KEY_MASTER_GEN = "master_gen_v1";

function getCache_() {
  return CacheService.getScriptCache();
}

function cacheGetText_(key) {
  try {
    return getCache_().get(key);
  } catch (e) {
    return null;
  }
}

function cachePutText_(key, value, ttlSeconds) {
  try {
    getCache_().put(key, value, ttlSeconds);
  } catch (e) {
    // cache gagal bukan error fatal
  }
}

function acquireWriteLock_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error("Server sedang sibuk menulis data lain. Coba lagi sebentar.");
  }
  return lock;
}

// Generation counter menandai versi master sheet. Disimpan di ScriptProperties
// supaya tetap ada walaupun CacheService dibersihkan.
function getMasterGeneration_() {
  var cached = cacheGetText_(CACHE_KEY_MASTER_GEN);
  if (cached) return cached;

  var value = "0";
  try {
    value = PropertiesService.getScriptProperties().getProperty(MASTER_GEN_PROPERTY) || "0";
  } catch (e) {
    return "0";
  }

  cachePutText_(CACHE_KEY_MASTER_GEN, value, CACHE_TTL_SECONDS);
  return value;
}

function bumpMasterGeneration_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var next = String(Number(props.getProperty(MASTER_GEN_PROPERTY) || 0) + 1);
    props.setProperty(MASTER_GEN_PROPERTY, next);
    cachePutText_(CACHE_KEY_MASTER_GEN, next, CACHE_TTL_SECONDS);
  } catch (e) {
    // Gagal menaikkan generation cukup ditangani oleh invalidasi cache.
  }
}

// CacheService dibatasi ~100KB per key, jadi payload besar dipecah jadi chunk.
function cachePutLarge_(key, value, ttlSeconds) {
  try {
    var json = JSON.stringify(value);
    // Batas CacheService dihitung dalam byte, bukan karakter. 40.000 karakter
    // tetap aman untuk nama produk multibyte dan batas 100 KB per key.
    var CHUNK = 40000;
    var total = Math.ceil(json.length / CHUNK);
    if (total > 12) return; // terlalu besar, lewati cache
    var payload = {};
    for (var i = 0; i < total; i++) {
      payload[key + "_p" + i] = json.substring(i * CHUNK, (i + 1) * CHUNK);
    }
    payload[key + "_meta"] = String(total);
    getCache_().putAll(payload, ttlSeconds || CACHE_TTL_SECONDS);
  } catch (e) {
    // cache gagal bukan error fatal
  }
}

function cacheGetLarge_(key) {
  try {
    var cache = getCache_();
    var meta = cache.get(key + "_meta");
    if (!meta) return null;
    var total = parseInt(meta, 10);
    if (!isFinite(total) || total <= 0) return null;

    var keys = [];
    for (var i = 0; i < total; i++) keys.push(key + "_p" + i);
    var parts = cache.getAll(keys);

    var json = "";
    for (var j = 0; j < total; j++) {
      var piece = parts[key + "_p" + j];
      if (piece == null) return null; // ada chunk kedaluwarsa -> cache miss
      json += piece;
    }
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function cacheInvalidateLarge_(key) {
  try {
    var cache = getCache_();
    var meta = cache.get(key + "_meta");
    var keys = [key + "_meta"];
    if (meta) {
      var total = parseInt(meta, 10);
      if (isFinite(total)) {
        for (var i = 0; i < total; i++) keys.push(key + "_p" + i);
      }
    }
    cache.removeAll(keys);
  } catch (e) {
    // abaikan
  }
}

function getSheet(name) {
  const ss = getSpreadsheet();
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error(`Sheet not found: ${name}`);
  return sh;
}

function normalizeHeader(h) {
  return String(h || "").trim().toLowerCase();
}

function toText_(value) {
  return String(value == null ? "" : value).trim();
}

var _headerMapCache = {};
function getHeaderMap(sheet) {
  var name = sheet.getName();
  if (_headerMapCache[name]) return _headerMapCache[name];

  var cacheKey = "headers_v3_" + name;
  try {
    var cached = getCache_().get(cacheKey);
    if (cached) {
      var cachedMap = JSON.parse(cached);
      _headerMapCache[name] = cachedMap;
      return cachedMap;
    }
  } catch (e) {
    // cache miss/rusak -> baca header langsung dari sheet
  }

  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return { _lastCol: 0 };
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = { _lastCol: lastCol };
  for (var i = 0; i < headers.length; i++) {
    map[normalizeHeader(headers[i])] = i + 1;
  }

  _headerMapCache[name] = map;
  try {
    getCache_().put(cacheKey, JSON.stringify(map), CACHE_TTL_SECONDS);
  } catch (e) {
    // cache gagal bukan error fatal
  }
  return map;
}

function ensureRequestIdColumn_(sheet, map) {
  if (map["request id"]) return map["request id"];

  var col = (map._lastCol || sheet.getLastColumn()) + 1;
  sheet.getRange(1, col).setValue("Request ID");
  try {
    sheet.hideColumns(col);
  } catch (e) {
    // Kolom tetap dapat dipakai walaupun gagal disembunyikan.
  }

  map["request id"] = col;
  map._lastCol = col;
  _headerMapCache[sheet.getName()] = map;
  cachePutText_(
    "headers_v3_" + sheet.getName(),
    JSON.stringify(map),
    CACHE_TTL_SECONDS
  );
  return col;
}

// Dipakai aplikasi untuk memastikan apakah sebuah submit benar-benar tersimpan
// setelah koneksi timeout. Hanya membaca, tanpa lock, jadi selalu cepat.
function findReturnRowByRequestId_(sheetName, clientId) {
  if (!ALLOWED_RETURN_SHEETS.includes(sheetName)) {
    throw new Error("Sheet tidak diizinkan: " + sheetName);
  }
  var cleanId = String(clientId || "").trim();
  if (!cleanId) throw new Error("Request ID tidak boleh kosong");

  var idemKey = "idem_" + sheetName + "_" + cleanId;
  var cached = cacheGetText_(idemKey);
  if (cached) {
    var cachedRow = parseInt(cached, 10);
    if (isFinite(cachedRow) && cachedRow > 0) return cachedRow;
  }

  var sh = getSheet(sheetName);
  var map = getHeaderMap(sh);
  var col = map["request id"];
  if (!col) return 0;

  var row = findRowByRequestId_(sh, col, cleanId);
  if (row > 0) cachePutText_(idemKey, String(row), IDEM_TTL_SECONDS);
  return row;
}

function findRowByRequestId_(sheet, requestIdCol, clientId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var found = sheet
    .getRange(2, requestIdCol, lastRow - 1, 1)
    .createTextFinder(clientId)
    .matchEntireCell(true)
    .findNext();
  return found ? found.getRow() : 0;
}

// Cari lewat daftar produk yang sudah di-cache, bukan baca ulang sheet.
function findMasterByBarcode_(barcode) {
  var target = String(barcode).trim();
  if (!target) return null;

  var products = listProducts_(false);
  for (var i = 0; i < products.length; i++) {
    if (products[i].barcode === target) return products[i];
  }

  // Cache mungkin basi (produk baru ditambahkan manual di sheet) -> refresh sekali.
  products = listProducts_(true);
  for (var j = 0; j < products.length; j++) {
    if (products[j].barcode === target) return products[j];
  }
  return null;
}

// Parse Exp Date — support bulan Indonesia & Inggris
function parseExpDate_(exp) {
  if (!exp) return Infinity;
  var s = String(exp).trim();

  var monthMap = {
    jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, may: 4,
    jun: 5, jul: 6, agu: 7, aug: 7, sep: 8, okt: 9, oct: 9,
    nov: 10, des: 11, dec: 11
  };

  var m1 = s.match(/^([A-Za-z]{3})[\-\s](\d{4})$/);
  if (m1) {
    var mon = monthMap[m1[1].toLowerCase()];
    if (mon !== undefined) return new Date(parseInt(m1[2], 10), mon, 1).getTime();
  }

  var d = new Date(s);
  if (!isNaN(d.getTime())) return d.getTime();

  return Infinity;
}

function parseReceiveDate_(value) {
  if (!value) return 0;

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.getTime();
  }

  var s = String(value).trim();
  if (!s) return 0;

  var monthMap = {
    jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, may: 4,
    jun: 5, jul: 6, agu: 7, aug: 7, sep: 8, okt: 9, oct: 9,
    nov: 10, des: 11, dec: 11,
  };

  var m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})$/);
  if (m) {
    var day = parseInt(m[1], 10);
    var mon = monthMap[m[2].toLowerCase()];
    var year = parseInt(m[3], 10);
    if (mon !== undefined) {
      return new Date(year, mon, day).getTime();
    }
  }

  var d = new Date(s);
  if (!isNaN(d.getTime())) return d.getTime();

  return 0;
}

var MONTH_NAMES_ = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function formatExpDate_(raw) {
  if (!raw) return "";
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return MONTH_NAMES_[raw.getMonth()] + " " + raw.getFullYear();
  }
  var s = String(raw).trim();
  if (!s) return "";
  var d = new Date(s);
  if (!isNaN(d.getTime()) && s.length > 10) {
    return MONTH_NAMES_[d.getMonth()] + " " + d.getFullYear();
  }
  return s;
}

function formatReceiveDate_(raw) {
  if (!raw) return "";
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    var dd = String(raw.getDate()).padStart(2, "0");
    return dd + "-" + MONTH_NAMES_[raw.getMonth()] + "-" + raw.getFullYear();
  }
  return String(raw).trim();
}

// PENTING: fungsi ini TIDAK BOLEH mengambil write lock. Membaca master sheet
// di dalam lock yang sama dengan appendReturn_ membuat penyimpanan retur
// mengantre di belakang pembacaan, lalu timeout di sisi aplikasi walaupun
// barisnya tetap tertulis. Konsistensi cache dijaga generation counter.
function getMasterData_(force) {
  if (!force) {
    var cachedProducts = cacheGetLarge_(CACHE_KEY_PRODUCTS);
    var cachedBatches = cacheGetLarge_(CACHE_KEY_BATCHES);
    if (cachedProducts && cachedBatches) {
      return { products: cachedProducts, batches: cachedBatches };
    }
  }

  var generationBefore = getMasterGeneration_();

  var sh = getSheet(MASTER_SHEET_NAME);
  var map = getHeaderMap(sh);
  var colBarcode = map["barcode"];
  var colSku = map["sku"];
  var colProduct = map["product"];
  var colLot = map["lots"];
  var colExp = map["exp date"];

  if (!colBarcode || !colSku || !colProduct || !colLot || !colExp) {
    throw new Error("MASTER sheet must have headers: barcode, SKU, Product, Lots, Exp Date");
  }

  var products = [];
  var batches = [];
  var lastRow = sh.getLastRow();

  if (lastRow >= 2) {
    // Satu kali baca sheet menghasilkan daftar produk DAN batch.
    var lastCol = map._lastCol || sh.getLastColumn();
    var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var seenBarcode = {};
    var seenLot = {};

    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var barcode = String(row[colBarcode - 1] || "").trim();
      if (barcode && !seenBarcode[barcode]) {
        seenBarcode[barcode] = true;
        products.push({
          barcode: barcode,
          sku: String(row[colSku - 1] || "").trim(),
          product: String(row[colProduct - 1] || "").trim(),
        });
      }

      var lot = String(row[colLot - 1] || "").trim();
      if (lot) {
        var expDate = formatExpDate_(row[colExp - 1]);
        if (!seenLot[lot]) {
          seenLot[lot] = { lot: lot, expDate: expDate };
        } else if (!seenLot[lot].expDate && expDate) {
          seenLot[lot].expDate = expDate;
        }
      }
    }

    batches = Object.values(seenLot);
    products.sort(function (a, b) {
      return a.product.localeCompare(b.product);
    });
    batches.sort(function (a, b) {
      return parseExpDate_(a.expDate) - parseExpDate_(b.expDate);
    });
  }

  // Publikasikan hanya jika master sheet tidak berubah selama pembacaan.
  // Snapshot lama tidak boleh menimpa hasil append batch yang lebih baru.
  if (getMasterGeneration_() === generationBefore) {
    cachePutLarge_(CACHE_KEY_PRODUCTS, products, MASTER_CACHE_TTL_SECONDS);
    cachePutLarge_(CACHE_KEY_BATCHES, batches, MASTER_CACHE_TTL_SECONDS);
  }

  return { products: products, batches: batches };
}

function listBatches_(force) {
  return getMasterData_(force).batches;
}

function listProducts_(force) {
  return getMasterData_(force).products;
}

function listReturnHistory_(limit) {
  var maxItems = Number(limit);
  if (!isFinite(maxItems) || maxItems <= 0) {
    maxItems = DEFAULT_HISTORY_LIMIT;
  }

  var results = [];
  var warnings = [];

  for (var s = 0; s < ALLOWED_RETURN_SHEETS.length; s++) {
    var sheetName = ALLOWED_RETURN_SHEETS[s];
    var sh = getSheet(sheetName);
    var map = getHeaderMap(sh);

    var required = [
      "receive date",
      "distri/event",
      "product",
      "barcode",
      "batch",
      "exp date",
      "qty",
    ];
    var missingHeaders = required.filter(function (h) {
      return !map[h];
    });
    if (missingHeaders.length > 0) {
      warnings.push(
        "Sheet '" + sheetName + "' dilewati karena header belum lengkap: " + missingHeaders.join(", ")
      );
      continue;
    }

    var lastRow = sh.getLastRow();
    if (lastRow < 2) continue;

    var fetchCount = Math.min(lastRow - 1, maxItems);
    var startRow = lastRow - fetchCount + 1;
    var lastCol = map._lastCol || sh.getLastColumn();
    var data = sh.getRange(startRow, 1, fetchCount, lastCol).getValues();

    for (var r = 0; r < data.length; r++) {
      var row = data[r];
      var product = toText_(row[map["product"] - 1]);
      var barcode = toText_(row[map["barcode"] - 1]);
      var batch = toText_(row[map["batch"] - 1]);
      if (!product && !barcode && !batch) continue;

      var receiveRaw = row[map["receive date"] - 1];
      results.push({
        sheet: sheetName,
        rowNumber: startRow + r,
        receiveDate: formatReceiveDate_(receiveRaw),
        distriEvent: toText_(row[map["distri/event"] - 1]),
        product: product,
        barcode: barcode,
        batch: batch,
        expDate: formatExpDate_(row[map["exp date"] - 1]),
        qty: Number(row[map["qty"] - 1] || 0),
        keterangan: map["keterangan"] ? toText_(row[map["keterangan"] - 1]) : "",
        pic: map["pic"] ? toText_(row[map["pic"] - 1]) : "",
        _sortTime: parseReceiveDate_(receiveRaw),
      });
    }
  }

  results.sort(function (a, b) {
    if (b._sortTime !== a._sortTime) return b._sortTime - a._sortTime;
    if (a.sheet === b.sheet) return b.rowNumber - a.rowNumber;
    return a.sheet.localeCompare(b.sheet);
  });

  return {
    history: results.slice(0, maxItems).map(function (item) {
      return {
        sheet: item.sheet,
        rowNumber: item.rowNumber,
        receiveDate: item.receiveDate,
        distriEvent: item.distriEvent,
        product: item.product,
        barcode: item.barcode,
        batch: item.batch,
        expDate: item.expDate,
        qty: item.qty,
        keterangan: item.keterangan,
        pic: item.pic,
      };
    }),
    warnings: warnings,
  };
}

function appendBatch_(lot, expDate) {
  var lotTrimmed = String(lot || "").trim().toUpperCase();
  var expTrimmed = String(expDate || "").trim();
  if (!lotTrimmed) throw new Error("Lot tidak boleh kosong");
  if (!expTrimmed) throw new Error("Exp Date tidak boleh kosong");

  var lock = acquireWriteLock_();

  try {
    var sh = getSheet(MASTER_SHEET_NAME);
    var map = getHeaderMap(sh);

    var colLot = map["lots"];
    var colExp = map["exp date"];
    if (!colLot) throw new Error("MASTER sheet must have header: Lots");
    if (!colExp) throw new Error("MASTER sheet must have header: Exp Date");

    var lastRow = sh.getLastRow();
    var lastCol = map._lastCol || sh.getLastColumn();

    // Idempoten: kalau lot sudah ada dengan Exp Date yang SAMA, anggap sukses.
    // Ini penting karena client boleh mengulang request setelah timeout;
    // tanpa ini retry akan memunculkan error "sudah ada" yang menyesatkan.
    if (lastRow >= 2) {
      var lotRange = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
      for (var r = 0; r < lotRange.length; r++) {
        var existLot = String(lotRange[r][colLot - 1] || "").trim().toUpperCase();
        if (existLot !== lotTrimmed) continue;

        var existExp = formatExpDate_(lotRange[r][colExp - 1]);
        if (existExp === expTrimmed) {
          return r + 2; // sudah tercatat identik -> kembalikan row yang ada
        }
        throw new Error(
          "Batch/Lot '" + lotTrimmed + "' sudah ada di Master dengan Exp Date '" + existExp + "'."
        );
      }
    }

    var targetRow = lastRow + 1;
    var newRow = new Array(lastCol);
    for (var c = 0; c < lastCol; c++) newRow[c] = "";
    newRow[colLot - 1] = sanitizeSheetValue_(lotTrimmed);
    newRow[colExp - 1] = sanitizeSheetValue_(expTrimmed);

    sh.getRange(targetRow, 1, 1, lastCol).setValues([newRow]);
    SpreadsheetApp.flush();

    // Batch baru -> cache batches wajib dibuang supaya langsung muncul di aplikasi.
    // Generation dinaikkan agar pembacaan yang sedang berjalan tidak
    // mempublikasikan snapshot sebelum append ini.
    bumpMasterGeneration_();
    cacheInvalidateLarge_(CACHE_KEY_BATCHES);

    return targetRow;
  } finally {
    lock.releaseLock();
  }
}

function appendReturn_(payload, sheetName, clientId) {
  if (!ALLOWED_RETURN_SHEETS.includes(sheetName)) {
    throw new Error("Sheet tidak diizinkan: " + sheetName + ". Pilihan: " + ALLOWED_RETURN_SHEETS.join(", "));
  }

  var requiredFields = ["receiveDate", "distriEvent", "product", "barcode", "batch", "expDate", "qty"];
  for (var i = 0; i < requiredFields.length; i++) {
    var f = requiredFields[i];
    var v = payload[f];
    if (v === undefined || v === null || String(v).trim() === "") {
      throw new Error("Field wajib kosong: " + f);
    }
  }
  var qty = Number(payload.qty);
  if (!isFinite(qty) || qty <= 0) {
    throw new Error("Qty harus angka positif");
  }

  // Idempotency key: kalau client timeout lalu retry dengan clientId yang sama,
  // server mengembalikan row yang sudah ditulis, bukan insert ganda.
  var idemKey = null;
  var cleanClientId = String(clientId || "").trim();
  if (cleanClientId) {
    idemKey = "idem_" + sheetName + "_" + cleanClientId;
    var alreadyDone = cacheGetText_(idemKey);
    if (alreadyDone) {
      return { rowNumber: parseInt(alreadyDone, 10), isDuplicate: true };
    }
  }

  var lock = acquireWriteLock_();

  try {
    // Cek ulang di dalam lock: request kembar bisa lolos pengecekan di atas.
    if (idemKey) {
      var doneInLock = cacheGetText_(idemKey);
      if (doneInLock) {
        return { rowNumber: parseInt(doneInLock, 10), isDuplicate: true };
      }
    }

    var sh = getSheet(sheetName);
    var map = getHeaderMap(sh);

    var required = [
      "receive date",
      "distri/event",
      "product",
      "barcode",
      "batch",
      "exp date",
      "qty",
      "keterangan",
      "pic",
    ];
    for (var rIdx = 0; rIdx < required.length; rIdx++) {
      if (!map[required[rIdx]]) throw new Error("Sheet '" + sheetName + "' missing header: " + required[rIdx]);
    }

    // Request ID ditulis di baris retur yang sama, sehingga status submit
    // tetap dapat ditemukan walaupun CacheService terhapus atau gagal.
    var requestIdCol = map["request id"] || 0;
    if (cleanClientId) {
      requestIdCol = ensureRequestIdColumn_(sh, map);
      var existingRequestRow = findRowByRequestId_(sh, requestIdCol, cleanClientId);
      if (existingRequestRow > 0) {
        if (idemKey) {
          cachePutText_(idemKey, String(existingRequestRow), IDEM_TTL_SECONDS);
        }
        return { rowNumber: existingRequestRow, isDuplicate: true };
      }
    }

    var lastRow = sh.getLastRow();
    var lastCol = map._lastCol || sh.getLastColumn();

    // Catatan: tidak ada lagi pembandingan isi baris untuk deteksi duplikat.
    // Perlindungan double-submit sepenuhnya ditangani idempotency key (clientId) di atas,
    // sehingga input produk yang sama secara sengaja SELALU menghasilkan baris baru.

    var newRow = new Array(lastCol);
    for (var c = 0; c < lastCol; c++) newRow[c] = "";

    newRow[map["receive date"] - 1] = sanitizeSheetValue_(payload.receiveDate);
    newRow[map["distri/event"] - 1] = sanitizeSheetValue_(payload.distriEvent);
    newRow[map["product"] - 1] = sanitizeSheetValue_(payload.product);
    newRow[map["barcode"] - 1] = sanitizeSheetValue_(payload.barcode);
    newRow[map["batch"] - 1] = sanitizeSheetValue_(payload.batch);
    newRow[map["exp date"] - 1] = sanitizeSheetValue_(payload.expDate);
    newRow[map["qty"] - 1] = qty;
    newRow[map["keterangan"] - 1] = sanitizeSheetValue_(payload.keterangan);
    newRow[map["pic"] - 1] = sanitizeSheetValue_(payload.pic);
    if (map["timestamp"]) {
      newRow[map["timestamp"] - 1] = new Date();
    }
    if (requestIdCol && cleanClientId) {
      newRow[requestIdCol - 1] = cleanClientId;
    }

    var targetRow = lastRow + 1;
    sh.getRange(targetRow, 1, 1, lastCol).setValues([newRow]);
    SpreadsheetApp.flush();

    // Tandai clientId sebagai SUDAH diproses. Harus setelah flush,
    // supaya retry tidak pernah mendapat row yang gagal tertulis.
    if (idemKey) {
      cachePutText_(idemKey, String(targetRow), IDEM_TTL_SECONDS);
    }

    return { rowNumber: targetRow, isDuplicate: false };
  } finally {
    lock.releaseLock();
  }
}

function editReturn_(sheetName, rowNumber, payload) {
  if (!ALLOWED_RETURN_SHEETS.includes(sheetName)) {
    throw new Error("Sheet tidak diizinkan: " + sheetName);
  }

  var row = Number(rowNumber);
  if (!isFinite(row) || row < 2) {
    throw new Error("Row number tidak valid: " + rowNumber);
  }

  var qty = Number(payload.qty);
  if (!isFinite(qty) || qty <= 0) {
    throw new Error("Qty harus angka positif");
  }

  var lock = acquireWriteLock_();

  try {
    var sh = getSheet(sheetName);
    var lastRow = sh.getLastRow();
    if (row > lastRow) {
      throw new Error("Row " + row + " tidak ditemukan di sheet " + sheetName);
    }

    var map = getHeaderMap(sh);
    var lastCol = map._lastCol || sh.getLastColumn();
    var existingRow = sh.getRange(row, 1, 1, lastCol).getValues()[0];

    if (map["receive date"]) existingRow[map["receive date"] - 1] = sanitizeSheetValue_(payload.receiveDate);
    if (map["distri/event"]) existingRow[map["distri/event"] - 1] = sanitizeSheetValue_(payload.distriEvent);
    if (map["product"]) existingRow[map["product"] - 1] = sanitizeSheetValue_(payload.product);
    if (map["barcode"]) existingRow[map["barcode"] - 1] = sanitizeSheetValue_(payload.barcode);
    if (map["batch"]) existingRow[map["batch"] - 1] = sanitizeSheetValue_(payload.batch);
    if (map["exp date"]) existingRow[map["exp date"] - 1] = sanitizeSheetValue_(payload.expDate);
    if (map["qty"]) existingRow[map["qty"] - 1] = qty;
    if (map["keterangan"]) existingRow[map["keterangan"] - 1] = sanitizeSheetValue_(payload.keterangan);
    if (map["pic"]) existingRow[map["pic"] - 1] = sanitizeSheetValue_(payload.pic);

    sh.getRange(row, 1, 1, lastCol).setValues([existingRow]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

function deleteReturn_(sheetName, rowNumber) {
  if (!ALLOWED_RETURN_SHEETS.includes(sheetName)) {
    throw new Error("Sheet tidak diizinkan: " + sheetName);
  }

  var row = Number(rowNumber);
  if (!isFinite(row) || row < 2) {
    throw new Error("Row number tidak valid: " + rowNumber);
  }

  var lock = acquireWriteLock_();

  try {
    var sh = getSheet(sheetName);
    var lastRow = sh.getLastRow();
    if (row > lastRow) {
      throw new Error("Row " + row + " tidak ditemukan di sheet " + sheetName);
    }

    sh.deleteRow(row);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// LAPORAN REKONSILIASI TOKO (Audit Trail di Spreadsheet)
// ============================================================

var RECON_SHEET_NAME = "Laporan Rekon";

function ensureReconSheet_() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(RECON_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(RECON_SHEET_NAME);
    sh.appendRow([
      "Timestamp",
      "ID Laporan",
      "Tanggal Terima",
      "Nama Toko",
      "No SJ",
      "PIC",
      "Target Sheet",
      "Total Fisik",
      "Total Klaim",
      "Selisih Total",
      "Status Selisih",
      "Total SKU",
      "SKU Sesuai",
      "SKU Selisih",
      "Rincian Item (JSON)",
    ]);
    SpreadsheetApp.flush();
  }
  return sh;
}

function saveReconReport_(report) {
  if (!report || !report.storeName) {
    throw new Error("Data laporan rekonsiliasi tidak valid: nama toko kosong");
  }

  var lock = acquireWriteLock_();
  try {
    var sh = ensureReconSheet_();
    var lastRow = sh.getLastRow();
    var targetRow = lastRow + 1;

    var diffTotal = (Number(report.totalPhysicalQty) || 0) - (Number(report.totalClaimQty) || 0);
    var statusSelisih = diffTotal === 0 ? "PAS" : (diffTotal > 0 ? "LEBIH (" + diffTotal + ")" : "KURANG (" + diffTotal + ")");

    var rowData = [
      new Date(),
      sanitizeSheetValue_(report.id || ""),
      sanitizeSheetValue_(report.receiveDate || ""),
      sanitizeSheetValue_(report.storeName || ""),
      sanitizeSheetValue_(report.noSJ || ""),
      sanitizeSheetValue_(report.pic || ""),
      sanitizeSheetValue_(report.targetSheet || ""),
      Number(report.totalPhysicalQty) || 0,
      Number(report.totalClaimQty) || 0,
      diffTotal,
      statusSelisih,
      Number(report.totalSku) || 0,
      Number(report.matchSkuCount) || 0,
      Number(report.discrepancySkuCount) || 0,
      JSON.stringify(report.items || []),
    ];

    sh.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
    SpreadsheetApp.flush();
    return { ok: true, rowNumber: targetRow };
  } finally {
    lock.releaseLock();
  }
}

function listReconReports_(limit) {
  var max = Number(limit) || 50;
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(RECON_SHEET_NAME);
  if (!sh || sh.getLastRow() < 2) {
    return { ok: true, reports: [] };
  }

  var lastRow = sh.getLastRow();
  var count = Math.min(lastRow - 1, max);
  var start = lastRow - count + 1;
  var values = sh.getRange(start, 1, count, 15).getValues();

  var reports = [];
  for (var i = values.length - 1; i >= 0; i--) {
    var r = values[i];
    var items = [];
    try {
      items = JSON.parse(r[14] || "[]");
    } catch (e) {}

    reports.push({
      id: String(r[1] || ""),
      receiveDate: String(r[2] || ""),
      storeName: String(r[3] || ""),
      noSJ: String(r[4] || ""),
      pic: String(r[5] || ""),
      targetSheet: String(r[6] || ""),
      totalPhysicalQty: Number(r[7] || 0),
      totalClaimQty: Number(r[8] || 0),
      verifiedAt: r[0] instanceof Date ? r[0].getTime() : Date.now(),
      totalSku: Number(r[11] || 0),
      matchSkuCount: Number(r[12] || 0),
      discrepancySkuCount: Number(r[13] || 0),
      hasDiscrepancy: Number(r[13] || 0) > 0,
      items: items,
    });
  }

  return { ok: true, reports: reports };
}

function doGet(e) {
  try {
    if (!isAuthorized_(e, null)) {
      return jsonOut({ ok: false, error: "Akses ditolak: Token API tidak valid atau belum diisi." });
    }

    const action = (e && e.parameter && e.parameter.action) || "";
    if (action === "master") {
      const barcode = (e.parameter.barcode || "").trim();
      if (!barcode) return jsonOut({ ok: false, error: "Missing barcode" });

      const found = findMasterByBarcode_(barcode);
      if (!found) return jsonOut({ ok: false, error: "Barcode not found in master" });

      return jsonOut({ ok: true, ...found });
    }

    if (action === "checkreturn") {
      const checkSheet = String((e.parameter && e.parameter.sheet) || "").trim();
      const checkRequestId = String((e.parameter && e.parameter.requestId) || "").trim();
      const foundRow = findReturnRowByRequestId_(checkSheet, checkRequestId);
      return jsonOut({
        ok: true,
        saved: foundRow > 0,
        rowNumber: foundRow,
        sheet: checkSheet,
      });
    }

    const force = String((e.parameter && e.parameter.force) || "") === "1";

    if (action === "masterdata") {
      const masterData = getMasterData_(force);
      return jsonOut({
        ok: true,
        products: masterData.products,
        batches: masterData.batches,
      });
    }

    if (action === "batches") {
      const batches = listBatches_(force);
      return jsonOut({ ok: true, batches });
    }

    if (action === "sheets") {
      return jsonOut({ ok: true, sheets: ALLOWED_RETURN_SHEETS });
    }

    if (action === "products") {
      const products = listProducts_(force);
      return jsonOut({ ok: true, products });
    }

    // Buang cache manual bila master sheet diedit langsung di Google Sheets.
    if (action === "refreshcache") {
      cacheInvalidateLarge_(CACHE_KEY_PRODUCTS);
      cacheInvalidateLarge_(CACHE_KEY_BATCHES);
      try {
        var headerKeys = ["headers_v3_" + MASTER_SHEET_NAME];
        for (var h = 0; h < ALLOWED_RETURN_SHEETS.length; h++) {
          headerKeys.push("headers_v3_" + ALLOWED_RETURN_SHEETS[h]);
        }
        getCache_().removeAll(headerKeys);
      } catch (e) {
        // cache gagal bukan error fatal
      }
      return jsonOut({ ok: true, refreshed: true });
    }

    if (action === "verifyuser") {
      const email = String((e.parameter && e.parameter.email) || "").trim();
      const name = String((e.parameter && e.parameter.name) || "").trim();
      return jsonOut(verifyUserAccess_(email, name));
    }

    if (action === "history") {
      const result = listReturnHistory_(e.parameter.limit);
      return jsonOut({ ok: true, history: result.history, warnings: result.warnings });
    }

    if (action === "reconreports") {
      return jsonOut(listReconReports_(e.parameter && e.parameter.limit));
    }

    return jsonOut({ ok: false, error: "Unknown action" });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

// ============================================================
// GEMINI PROXY: baca foto/PDF Surat Jalan retur
// API key disimpan di Script Properties (GEMINI_API_KEY), tidak pernah dikirim ke browser.
// Daftar model bisa diubah lewat Script Properties GEMINI_MODELS (dipisah koma).
// ============================================================

var GEMINI_API_KEY_FALLBACK = ""; // Simpan di Apps Script > Project Settings > Script Properties (GEMINI_API_KEY)
var GEMINI_DEFAULT_MODELS = "gemini-3.5-flash,gemini-3.6-flash,gemini-3.5-flash-lite,gemini-3-flash-preview,gemini-3.8-flash";
var GEMINI_ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
var GEMINI_MAX_BASE64_LENGTH = 14 * 1024 * 1024; // ~10 MB file asli

var SJ_PROMPT_BASE =
  'Anda adalah sistem pembaca dokumen gudang untuk brand kosmetik BLP Beauty (By Lizzie Parra).\n' +
  'Tugas Anda mengekstrak data dari foto/scan lembar "Surat Jalan (SJ) Retur" / "Form Retur Toko / Distributor":\n' +
  '1. storeName: nama toko, distributor, atau event (misal: "Sociolla PIM", "Watsons GI", "Guardian"). Kosongkan bila tidak ada.\n' +
  '2. noSJ: nomor surat jalan / dokumen retur. Kosongkan bila tidak ada.\n' +
  '3. items: setiap baris barang retur yang diklaim, berisi:\n' +
  '   - product: nama produk lengkap dari dokumen fisik.\n' +
  '   - sku: kode SKU resmi dari DAFTAR REFERENSI MASTER di bawah yang paling cocok. Jika benar-benar tidak cocok dengan master, kosongkan string "".\n' +
  '   - claimQty: jumlah klaim retur (bilangan bulat positif >= 1).\n' +
  'PENTING: Jangan menebak baris atau shade yang tidak tertulis. Utamakan ketepatan shade/varian.';

var SJ_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    storeName: { type: "STRING" },
    noSJ: { type: "STRING" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          product: { type: "STRING" },
          sku: { type: "STRING" },
          claimQty: { type: "INTEGER" },
        },
        required: ["product", "claimQty"],
      },
    },
  },
  required: ["items"],
};

function parseSJWithGemini_(mimeType, base64Data, masterCatalog) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty("GEMINI_API_KEY") || GEMINI_API_KEY_FALLBACK;
  if (!apiKey) {
    return { ok: false, error: "GEMINI_API_KEY belum diatur di Script Properties Apps Script." };
  }
  if (GEMINI_ALLOWED_MIME.indexOf(mimeType) === -1) {
    return { ok: false, error: "Format file tidak didukung: " + mimeType };
  }
  if (!base64Data) return { ok: false, error: "File kosong." };
  if (base64Data.length > GEMINI_MAX_BASE64_LENGTH) {
    return { ok: false, error: "File terlalu besar (maks ~10 MB)." };
  }

  // Gunakan master data yang dikirim client atau ambil dari master sheet lokal
  var masterProducts = (masterCatalog && Array.isArray(masterCatalog) && masterCatalog.length > 0)
    ? masterCatalog
    : listProducts_(false);

  var masterReferenceText = "";
  if (masterProducts && masterProducts.length > 0) {
    masterReferenceText = "\n\nDAFTAR REFERENSI MASTER PRODUK & SKU BLP BEAUTY (Cocokkan ke SKU di bawah):\n" +
      masterProducts.slice(0, 300).map(function (p) {
        return "- SKU: " + (p.sku || "-") + " | " + p.product;
      }).join("\n");
  }

  var promptText = SJ_PROMPT_BASE + masterReferenceText;

  var configuredModels = String(props.getProperty("GEMINI_MODELS") || "");
  // Abaikan konfigurasi jika masih merujuk ke model usang 2.5 atau kosong
  if (!configuredModels || configuredModels.indexOf("2.5") !== -1) {
    configuredModels = GEMINI_DEFAULT_MODELS;
  }

  var models = configuredModels
    .split(",")
    .map(function (m) { return m.trim(); })
    .filter(function (m) { return m; });

  var requestBody = JSON.stringify({
    contents: [{ parts: [{ text: promptText }, { inlineData: { mimeType: mimeType, data: base64Data } }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: SJ_RESPONSE_SCHEMA,
    },
  });

  var lastError = "";
  for (var i = 0; i < models.length; i++) {
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(models[i]) + ":generateContent";
    var res;
    try {
      res = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        headers: { "x-goog-api-key": apiKey },
        payload: requestBody,
        muteHttpExceptions: true,
      });
    } catch (err) {
      // Error jaringan / timeout UrlFetch: coba model berikutnya
      lastError = String(err && err.message ? err.message : err);
      continue;
    }

    var status = res.getResponseCode();
    var text = res.getContentText();
    if (status !== 200) {
      lastError = "Gemini " + models[i] + " (" + status + "): " + text.slice(0, 300);
      // 404 = model tidak ada, 429/503/5xx = beban tinggi / sementara: jeda sejenak lalu coba model berikutnya. Error lain langsung berhenti.
      if (status === 404 || status === 429 || status === 503 || status >= 500) {
        Utilities.sleep(500);
        continue;
      }
      return { ok: false, error: lastError };
    }

    try {
      var data = JSON.parse(text);
      var raw = (((data.candidates || [])[0] || {}).content || {}).parts;
      var rawText = raw && raw[0] && raw[0].text ? String(raw[0].text).trim() : "";
      if (!rawText) return { ok: false, error: "AI tidak menghasilkan teks dari file ini." };
      var parsed = JSON.parse(rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, ""));
      return {
        ok: true,
        model: models[i],
        storeName: String(parsed.storeName || ""),
        noSJ: String(parsed.noSJ || ""),
        items: Array.isArray(parsed.items) ? parsed.items : [],
      };
    } catch (err) {
      return { ok: false, error: "Respons AI tidak valid: " + String(err && err.message ? err.message : err) };
    }
  }

  if (lastError.indexOf("503") !== -1 || lastError.indexOf("high demand") !== -1) {
    return {
      ok: false,
      error: "Layanan Gemini sedang mengalami lonjakan beban sementara (503). Silakan coba lagi dalam beberapa detik.",
    };
  }
  return { ok: false, error: lastError || "Tidak ada model Gemini yang dikonfigurasi." };
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!isAuthorized_(e, body)) {
      return jsonOut({ ok: false, error: "Akses ditolak: Token API tidak valid atau belum diisi." });
    }

    const action = body.action || "";
    if (action === "verifyuser") {
      const email = String(body.email || "").trim();
      const name = String(body.name || "").trim();
      return jsonOut(verifyUserAccess_(email, name));
    }

    if (action === "parsesj") {
      return jsonOut(parseSJWithGemini_(String(body.mimeType || ""), String(body.data || ""), body.masterList));
    }

    if (action === "addbatch") {
      var lot = String(body.lot || "").trim();
      var expDate = String(body.expDate || "").trim();
      var batchRow = appendBatch_(lot, expDate);
      return jsonOut({ ok: true, appendedRow: batchRow, lot: lot.toUpperCase(), expDate: expDate });
    }

    if (action === "editReturn") {
      var editSheet = String(body.sheet || "").trim();
      var editRow = body.rowNumber;
      var editPayload = body.payload || {};
      editReturn_(editSheet, editRow, editPayload);
      return jsonOut({ ok: true });
    }

    if (action === "deleteReturn") {
      var delSheet = String(body.sheet || "").trim();
      var delRow = body.rowNumber;
      deleteReturn_(delSheet, delRow);
      return jsonOut({ ok: true });
    }

    if (action === "saveReconReport") {
      var reportPayload = body.report || {};
      return jsonOut(saveReconReport_(reportPayload));
    }

    if (action !== "returns") return jsonOut({ ok: false, error: "Unknown action: " + action });

    const payload = body.payload || {};
    const sheetName = String(body.sheet || ALLOWED_RETURN_SHEETS[0]).trim();
    const clientId = String(body.clientId || "").trim();
    const result = appendReturn_(payload, sheetName, clientId);
    return jsonOut({
      ok: true,
      appendedRow: result.rowNumber,
      sheet: sheetName,
      isDuplicate: result.isDuplicate,
    });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/**
 * ============================================================
 * HELPER SETUP KEAMANAN & SCRIPT PROPERTIES
 * ============================================================
 * Jalankan fungsi ini satu kali di Apps Script Editor (pilih setupEnvironment lalu klik Run)
 * untuk menyimpan SPREADSHEET_ID dan API_SECRET_TOKEN secara aman di Google Cloud
 * tanpa harus mengeksposnya di repositori publik.
 */
function setupEnvironment() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty("SPREADSHEET_ID", "1Ppz3hQrVBMjYTo0qDpQfylGKAdxDG98sVPdD6TRqEiU");
  // Fitur Baca SJ: Simpan GEMINI_API_KEY di Project Settings > Script Properties
  // props.setProperty("GEMINI_API_KEY", "masukkan_gemini_api_key_di_sini");
  
  // Jika ingin mengaktifkan proteksi API token, aktifkan baris berikut:
  // props.setProperty("API_SECRET_TOKEN", "ganti_dengan_token_rahasia_kamu");

  // Fitur Baca SJ: API key Gemini otomatis disimpan di atas.
  props.setProperty("GEMINI_MODELS", GEMINI_DEFAULT_MODELS);

  // Buat dan inisialisasi sheet 'Users' jika belum ada
  ensureUsersSheet_();

  Logger.log("Konfigurasi keamanan berhasil disimpan ke Script Properties!");
  Logger.log("SPREADSHEET_ID: " + props.getProperty("SPREADSHEET_ID"));
  Logger.log("API_SECRET_TOKEN: " + (props.getProperty("API_SECRET_TOKEN") ? "(Terpasang)" : "(Tidak aktif/kosong)"));
  Logger.log("Sheet 'Users' telah siap untuk Google Sign-In whitelist!");
}