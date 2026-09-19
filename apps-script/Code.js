// ⚠️  WAJIB DIGANTI: Paste Google Sheet ID kamu di sini
// Cara mendapatkan ID: buka spreadsheet, URL-nya seperti
// https://docs.google.com/spreadsheets/d/SHEET_ID_DISINI/edit
const SPREADSHEET_ID = "1Ppz3hQrVBMjYTo0qDpQfylGKAdxDG98sVPdD6TRqEiU";
const MASTER_SHEET_NAME = "Master Product & Lots";
const DEFAULT_HISTORY_LIMIT = 200;

// Sheet retur yang tersedia (nama harus PERSIS sama dengan tab di Google Sheet)
const ALLOWED_RETURN_SHEETS = ["Bagas", "Dimas"];

var _ssCache = null;
function getSpreadsheet() {
  if (!_ssCache) {
    _ssCache = SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return _ssCache;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
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
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return { _lastCol: 0 };
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = { _lastCol: lastCol };
  for (var i = 0; i < headers.length; i++) {
    map[normalizeHeader(headers[i])] = i + 1;
  }
  _headerMapCache[name] = map;
  return map;
}

function findMasterByBarcode_(barcode) {
  const sh = getSheet(MASTER_SHEET_NAME);
  const map = getHeaderMap(sh);

  const colBarcode = map["barcode"];
  const colSku = map["sku"];
  const colProduct = map["product"];
  if (!colBarcode || !colSku || !colProduct) {
    throw new Error("MASTER sheet must have headers: SKU, barcode, Product");
  }

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return null;

  const lastCol = map._lastCol || sh.getLastColumn();
  const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const target = String(barcode).trim();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const bc = String(row[colBarcode - 1] || "").trim();
    if (bc === target) {
      return {
        sku: String(row[colSku - 1] || "").trim(),
        barcode: bc,
        product: String(row[colProduct - 1] || "").trim(),
      };
    }
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

function listBatches_() {
  const sh = getSheet(MASTER_SHEET_NAME);
  const map = getHeaderMap(sh);
  const colLot = map["lots"];
  const colExp = map["exp date"];

  if (!colLot) throw new Error("MASTER sheet must have header: Lots");
  if (!colExp) throw new Error("MASTER sheet must have header: Exp Date");

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const lastCol = map._lastCol || sh.getLastColumn();
  const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const uniq = {};
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const lot = String(row[colLot - 1] || "").trim();
    if (!lot) continue;
    const rawExp = row[colExp - 1];
    const exp = formatExpDate_(rawExp);
    if (!uniq[lot] || (!uniq[lot].expDate && exp)) {
      uniq[lot] = { lot, expDate: exp };
    }
  }

  return Object.values(uniq).sort(function (a, b) {
    return parseExpDate_(a.expDate) - parseExpDate_(b.expDate);
  });
}

function listProducts_() {
  const sh = getSheet(MASTER_SHEET_NAME);
  const map = getHeaderMap(sh);
  const colBarcode = map["barcode"];
  const colSku = map["sku"];
  const colProduct = map["product"];

  if (!colBarcode || !colSku || !colProduct) {
    throw new Error("MASTER sheet must have headers: barcode, SKU, Product");
  }

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const lastCol = map._lastCol || sh.getLastColumn();
  const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const seen = {};
  const results = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var bc = String(row[colBarcode - 1] || "").trim();
    if (!bc || seen[bc]) continue;
    seen[bc] = true;
    results.push({
      barcode: bc,
      sku: String(row[colSku - 1] || "").trim(),
      product: String(row[colProduct - 1] || "").trim(),
    });
  }

  results.sort(function (a, b) {
    return a.product.localeCompare(b.product);
  });

  return results;
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

  var lock = LockService.getScriptLock();
  var hasLock = lock.tryLock(15000);

  try {
    var sh = getSheet(MASTER_SHEET_NAME);
    var map = getHeaderMap(sh);

    var colLot = map["lots"];
    var colExp = map["exp date"];
    if (!colLot) throw new Error("MASTER sheet must have header: Lots");
    if (!colExp) throw new Error("MASTER sheet must have header: Exp Date");

    var lastRow = sh.getLastRow();
    var lastCol = map._lastCol || sh.getLastColumn();

    if (lastRow >= 2) {
      var lotValues = sh.getRange(2, colLot, lastRow - 1, 1).getValues();
      for (var r = 0; r < lotValues.length; r++) {
        var existLot = String(lotValues[r][0] || "").trim().toUpperCase();
        if (existLot === lotTrimmed) {
          throw new Error("Batch/Lot '" + lotTrimmed + "' sudah ada di Master.");
        }
      }
    }

    var targetRow = lastRow + 1;
    var newRow = new Array(lastCol);
    for (var c = 0; c < lastCol; c++) newRow[c] = "";
    newRow[colLot - 1] = lotTrimmed;
    newRow[colExp - 1] = expTrimmed;

    sh.getRange(targetRow, 1, 1, lastCol).setValues([newRow]);
    SpreadsheetApp.flush();
    return targetRow;
  } finally {
    if (hasLock) lock.releaseLock();
  }
}

function appendReturn_(payload, sheetName) {
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

  var lock = LockService.getScriptLock();
  var hasLock = lock.tryLock(15000);

  try {
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

    var lastRow = sh.getLastRow();
    var lastCol = map._lastCol || sh.getLastColumn();

    // Cek duplikat cepat: hanya anggap duplikat jika data PERSIS sama ditulis dalam 60 detik terakhir
    // Ini mencegah double-click / network retry, tapi tetap membolehkan input ulang yang disengaja
    if (lastRow >= 2) {
      var checkRowCount = Math.min(lastRow - 1, 5);
      var startRow = lastRow - checkRowCount + 1;
      var recentValues = sh.getRange(startRow, 1, checkRowCount, lastCol).getValues();
      var now = new Date().getTime();
      var DUPLICATE_WINDOW_MS = 60 * 1000; // 60 detik

      for (var r = recentValues.length - 1; r >= 0; r--) {
        var row = recentValues[r];
        var existBarcode = String(row[map["barcode"] - 1] || "").trim();
        var existBatch = String(row[map["batch"] - 1] || "").trim();
        var existDate = formatReceiveDate_(row[map["receive date"] - 1]) || String(row[map["receive date"] - 1] || "").trim();
        var existQty = Number(row[map["qty"] - 1] || 0);
        var existDistri = String(row[map["distri/event"] - 1] || "").trim();

        if (
          existBarcode === String(payload.barcode).trim() &&
          existBatch === String(payload.batch).trim() &&
          existDate === String(payload.receiveDate).trim() &&
          existQty === qty &&
          existDistri === String(payload.distriEvent).trim()
        ) {
          // Cek timestamp: hanya blokir jika row ditulis dalam window waktu singkat
          var rowTimestamp = 0;
          if (map["timestamp"]) {
            var tsVal = row[map["timestamp"] - 1];
            if (tsVal instanceof Date) rowTimestamp = tsVal.getTime();
            else if (tsVal) rowTimestamp = new Date(tsVal).getTime();
          }
          // Jika ada kolom timestamp dan masih dalam window → duplikat
          // Jika tidak ada kolom timestamp, skip pengecekan (izinkan insert)
          if (map["timestamp"] && rowTimestamp > 0 && (now - rowTimestamp) < DUPLICATE_WINDOW_MS) {
            return { rowNumber: startRow + r, isDuplicate: true };
          }
          // Jika tidak ada timestamp atau sudah lewat window, lanjut insert baris baru
        }
      }
    }

    var newRow = new Array(lastCol);
    for (var c = 0; c < lastCol; c++) newRow[c] = "";

    newRow[map["receive date"] - 1] = payload.receiveDate || "";
    newRow[map["distri/event"] - 1] = payload.distriEvent || "";
    newRow[map["product"] - 1] = payload.product || "";
    newRow[map["barcode"] - 1] = payload.barcode || "";
    newRow[map["batch"] - 1] = payload.batch || "";
    newRow[map["exp date"] - 1] = payload.expDate || "";
    newRow[map["qty"] - 1] = qty;
    newRow[map["keterangan"] - 1] = payload.keterangan || "";
    newRow[map["pic"] - 1] = payload.pic || "";
    // Tulis timestamp untuk deteksi duplikat berbasis waktu
    if (map["timestamp"]) {
      newRow[map["timestamp"] - 1] = new Date();
    }

    var targetRow = lastRow + 1;
    sh.getRange(targetRow, 1, 1, lastCol).setValues([newRow]);
    SpreadsheetApp.flush();

    return { rowNumber: targetRow, isDuplicate: false };
  } finally {
    if (hasLock) {
      lock.releaseLock();
    }
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

  var lock = LockService.getScriptLock();
  var hasLock = lock.tryLock(15000);

  try {
    var sh = getSheet(sheetName);
    var lastRow = sh.getLastRow();
    if (row > lastRow) {
      throw new Error("Row " + row + " tidak ditemukan di sheet " + sheetName);
    }

    var map = getHeaderMap(sh);
    var lastCol = map._lastCol || sh.getLastColumn();
    var existingRow = sh.getRange(row, 1, 1, lastCol).getValues()[0];

    if (map["receive date"]) existingRow[map["receive date"] - 1] = payload.receiveDate || "";
    if (map["distri/event"]) existingRow[map["distri/event"] - 1] = payload.distriEvent || "";
    if (map["product"]) existingRow[map["product"] - 1] = payload.product || "";
    if (map["barcode"]) existingRow[map["barcode"] - 1] = payload.barcode || "";
    if (map["batch"]) existingRow[map["batch"] - 1] = payload.batch || "";
    if (map["exp date"]) existingRow[map["exp date"] - 1] = payload.expDate || "";
    if (map["qty"]) existingRow[map["qty"] - 1] = qty;
    if (map["keterangan"]) existingRow[map["keterangan"] - 1] = payload.keterangan || "";
    if (map["pic"]) existingRow[map["pic"] - 1] = payload.pic || "";

    sh.getRange(row, 1, 1, lastCol).setValues([existingRow]);
    SpreadsheetApp.flush();
  } finally {
    if (hasLock) lock.releaseLock();
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

  var lock = LockService.getScriptLock();
  var hasLock = lock.tryLock(15000);

  try {
    var sh = getSheet(sheetName);
    var lastRow = sh.getLastRow();
    if (row > lastRow) {
      throw new Error("Row " + row + " tidak ditemukan di sheet " + sheetName);
    }

    sh.deleteRow(row);
    SpreadsheetApp.flush();
  } finally {
    if (hasLock) lock.releaseLock();
  }
}

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || "";
    if (action === "master") {
      const barcode = (e.parameter.barcode || "").trim();
      if (!barcode) return jsonOut({ ok: false, error: "Missing barcode" });

      const found = findMasterByBarcode_(barcode);
      if (!found) return jsonOut({ ok: false, error: "Barcode not found in master" });

      return jsonOut({ ok: true, ...found });
    }

    if (action === "batches") {
      const batches = listBatches_();
      return jsonOut({ ok: true, batches });
    }

    if (action === "sheets") {
      return jsonOut({ ok: true, sheets: ALLOWED_RETURN_SHEETS });
    }

    if (action === "products") {
      const products = listProducts_();
      return jsonOut({ ok: true, products });
    }

    if (action === "history") {
      const result = listReturnHistory_(e.parameter.limit);
      return jsonOut({ ok: true, history: result.history, warnings: result.warnings });
    }

    return jsonOut({ ok: false, error: "Unknown action" });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const action = body.action || "";
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

    if (action !== "returns") return jsonOut({ ok: false, error: "Unknown action: " + action });

    const payload = body.payload || {};
    const sheetName = String(body.sheet || ALLOWED_RETURN_SHEETS[0]).trim();
    const result = appendReturn_(payload, sheetName);
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