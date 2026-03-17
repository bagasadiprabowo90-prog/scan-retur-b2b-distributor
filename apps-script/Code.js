// ⚠️  WAJIB DIGANTI: Paste Google Sheet ID kamu di sini
// Cara mendapatkan ID: buka spreadsheet, URL-nya seperti
// https://docs.google.com/spreadsheets/d/SHEET_ID_DISINI/edit
const SPREADSHEET_ID = "1Ppz3hQrVBMjYTo0qDpQfylGKAdxDG98sVPdD6TRqEiU";
const MASTER_SHEET_NAME = "Master Product & Lots";

// Sheet retur yang tersedia (nama harus PERSIS sama dengan tab di Google Sheet)
const ALLOWED_RETURN_SHEETS = ["Bagas", "Dimas"];

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error(`Sheet not found: ${name}`);
  return sh;
}

function normalizeHeader(h) {
  return String(h || "").trim().toLowerCase();
}

function getHeaderMap(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, idx) => (map[normalizeHeader(h)] = idx + 1));
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

  const values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
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
// Contoh: "Jun-2027", "Agu-2027", "Des-2025", "2027-06", "2027-06-15"
function parseExpDate_(exp) {
  if (!exp) return Infinity;
  var s = String(exp).trim();

  // Map bulan Indonesia + Inggris -> index (0-based)
  var monthMap = {
    jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, may: 4,
    jun: 5, jul: 6, agu: 7, aug: 7, sep: 8, okt: 9, oct: 9,
    nov: 10, des: 11, dec: 11
  };

  // Format: "Agu-2027" atau "Agu 2027"
  var m1 = s.match(/^([A-Za-z]{3})[\-\s](\d{4})$/);
  if (m1) {
    var mon = monthMap[m1[1].toLowerCase()];
    if (mon !== undefined) return new Date(parseInt(m1[2]), mon, 1).getTime();
  }

  // Format ISO: "2027-08" atau "2027-08-15"
  var d = new Date(s);
  if (!isNaN(d.getTime())) return d.getTime();

  return Infinity;
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

  const values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  const uniq = {};
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const lot = String(row[colLot - 1] || "").trim();
    if (!lot) continue;
    const exp = String(row[colExp - 1] || "").trim();
    if (!uniq[lot] || (!uniq[lot].expDate && exp)) {
      uniq[lot] = { lot, expDate: exp };
    }
  }

  // FEFO: batch paling dekat expired muncul paling atas
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

  const values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
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

function appendReturn_(payload, sheetName) {
  // Validasi nama sheet
  if (!ALLOWED_RETURN_SHEETS.includes(sheetName)) {
    throw new Error("Sheet tidak diizinkan: " + sheetName + ". Pilihan: " + ALLOWED_RETURN_SHEETS.join(", "));
  }

  // Server-side validation
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
  required.forEach(function (h) {
    if (!map[h]) throw new Error("Sheet '" + sheetName + "' missing header: " + h);
  });

  // Duplicate check: same barcode + batch + receiveDate
  var lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    var data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
    for (var r = 0; r < data.length; r++) {
      var row = data[r];
      var existBarcode = String(row[map["barcode"] - 1] || "").trim();
      var existBatch = String(row[map["batch"] - 1] || "").trim();
      var existDate = String(row[map["receive date"] - 1] || "").trim();
      if (
        existBarcode === String(payload.barcode).trim() &&
        existBatch === String(payload.batch).trim() &&
        existDate === String(payload.receiveDate).trim()
      ) {
        throw new Error("Data duplikat: barcode " + payload.barcode + " batch " + payload.batch + " tanggal " + payload.receiveDate + " sudah ada di row " + (r + 2));
      }
    }
  }

  var newRow = [];
  var lastCol = sh.getLastColumn();
  for (var c = 1; c <= lastCol; c++) newRow.push("");

  newRow[map["receive date"] - 1] = payload.receiveDate || "";
  newRow[map["distri/event"] - 1] = payload.distriEvent || "";
  newRow[map["product"] - 1] = payload.product || "";
  newRow[map["barcode"] - 1] = payload.barcode || "";
  newRow[map["batch"] - 1] = payload.batch || "";
  newRow[map["exp date"] - 1] = payload.expDate || "";
  newRow[map["qty"] - 1] = qty;
  newRow[map["keterangan"] - 1] = payload.keterangan || "";
  newRow[map["pic"] - 1] = payload.pic || "";

  sh.appendRow(newRow);
  return sh.getLastRow();
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

    // Kembalikan daftar sheet yang tersedia
    if (action === "sheets") {
      return jsonOut({ ok: true, sheets: ALLOWED_RETURN_SHEETS });
    }

    // Kembalikan semua produk unik (barcode + sku + product) dari Master
    if (action === "products") {
      const products = listProducts_();
      return jsonOut({ ok: true, products });
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
    if (action !== "returns") return jsonOut({ ok: false, error: "Unknown action" });

    const payload = body.payload || {};
    // sheet dari payload, default ke sheet pertama
    const sheetName = String(body.sheet || ALLOWED_RETURN_SHEETS[0]).trim();
    const appendedRow = appendReturn_(payload, sheetName);
    return jsonOut({ ok: true, appendedRow, sheet: sheetName });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}