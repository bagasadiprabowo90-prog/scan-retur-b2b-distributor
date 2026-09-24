export type MasterLookupResponse =
  | { ok: true; sku: string; barcode: string; product: string }
  | { ok: false; error: string };

export type BatchItem = {
  lot: string;
  expDate: string;
};

export type BatchesResponse =
  | { ok: true; batches: BatchItem[] }
  | { ok: false; error: string };

export type ProductItem = {
  barcode: string;
  sku: string;
  product: string;
};

export type ProductsResponse =
  | { ok: true; products: ProductItem[] }
  | { ok: false; error: string };

type MasterDataResponse =
  | { ok: true; products: ProductItem[]; batches: BatchItem[] }
  | { ok: false; error: string };

export type ReturnHistoryItem = {
  sheet: string;
  rowNumber: number;
  receiveDate: string;
  distriEvent: string;
  product: string;
  barcode: string;
  batch: string;
  expDate: string;
  qty: number;
  keterangan: string;
  pic: string;
};

export type ReturnHistoryResponse =
  | { ok: true; history: ReturnHistoryItem[]; warnings?: string[] }
  | { ok: false; error: string };

export type CreateReturnPayload = {
  receiveDate: string;
  distriEvent: string;
  product: string;
  barcode: string;
  batch: string;
  expDate: string;
  qty: number;
  keterangan: string;
  pic: string;
};

// sheet: nama sheet tujuan, mis "Bagas" atau "Dimas"
export type CreateReturnResponse =
  | { ok: true; appendedRow: number; sheet: string; isDuplicate?: boolean }
  | { ok: false; error: string };

export type AddBatchResponse =
  | { ok: true; appendedRow: number; lot: string; expDate: string }
  | { ok: false; error: string };

function getBaseUrl(): string {
  const url = import.meta.env.VITE_APPS_SCRIPT_URL;
  if (!url) {
    throw new Error(
      "Missing VITE_APPS_SCRIPT_URL. Buat file .env dan isi URL Apps Script Web App."
    );
  }
  return url as string;
}

// ============================================================
// FETCH CORE: timeout + retry dengan backoff
// Apps Script sering lambat/cold start, jadi satu kegagalan
// transient tidak boleh langsung jadi error ke user.
// ============================================================

class TransientError extends Error {}

const TRANSIENT_SERVER_ERROR =
  /server sedang sibuk|service invoked too many times|internal error|timed out|timeout|try again|temporarily unavailable|service unavailable/i;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchOnce<T>(
  input: string,
  init: RequestInit | undefined,
  fallbackError: string,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    const text = await res.text();

    try {
      const parsed = JSON.parse(text) as unknown;
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "ok" in parsed &&
        parsed.ok === false &&
        "error" in parsed &&
        typeof parsed.error === "string" &&
        TRANSIENT_SERVER_ERROR.test(parsed.error)
      ) {
        throw new TransientError(parsed.error);
      }
      return parsed as T;
    } catch (err: unknown) {
      if (err instanceof TransientError) throw err;
      // Apps Script mengembalikan halaman HTML saat error internal / kuota / cold start gagal.
      if (text.includes("<title>") || text.includes("<!DOCTYPE") || text.includes("<html")) {
        const match = text.match(/<title>([^<]+)<\/title>/i);
        const title = match ? match[1].trim() : "Google Apps Script Error";
        throw new TransientError(`${fallbackError}: ${title}`);
      }
      throw new TransientError(`${fallbackError}: Format respon tidak valid`);
    }
  } catch (err: unknown) {
    if (err instanceof TransientError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new TransientError("Koneksi timeout");
    }
    // TypeError dari fetch = masalah jaringan, layak dicoba ulang.
    throw new TransientError(
      err instanceof Error ? err.message : fallbackError
    );
  } finally {
    clearTimeout(timer);
  }
}

async function safeFetchJson<T>(
  input: string,
  init?: RequestInit,
  fallbackError = "Gagal memproses request",
  timeoutMs = 15000,
  retries = 1
): Promise<T> {
  let lastError: Error = new Error(fallbackError);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchOnce<T>(input, init, fallbackError, timeoutMs);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(fallbackError);
      if (attempt < retries) {
        // backoff: 800ms, 1600ms
        await sleep(800 * Math.pow(2, attempt));
      }
    }
  }

  throw new Error(`${lastError.message}. Coba lagi.`);
}

// ============================================================
// CACHE LOKAL
// Data master jarang berubah. Cache segar dipakai langsung tanpa jaringan;
// cache basi tetap menjadi fallback jika Google Apps Script gagal diakses.
// ============================================================

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 menit
const LS_PRODUCTS = "scan-retur-cache-products-v2";
const LS_BATCHES = "scan-retur-cache-batches-v2";

type CacheEnvelope<T> = { t: number; d: T };

function readCache<T>(key: string): { data: T; fresh: boolean } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.t !== "number" || parsed.d == null) return null;
    return { data: parsed.d, fresh: Date.now() - parsed.t < CACHE_TTL_MS };
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data } as CacheEnvelope<T>));
  } catch {
    // kuota localStorage penuh -> abaikan, bukan error fatal
  }
}

function clearCache(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // abaikan
  }
}

export async function fetchMasterByBarcode(barcode: string): Promise<MasterLookupResponse> {
  // Coba dari cache produk lokal dulu supaya tidak perlu round-trip.
  const cached = readCache<ProductItem[]>(LS_PRODUCTS);
  if (cached) {
    const hit = cached.data.find((p) => p.barcode === barcode.trim());
    if (hit) return { ok: true, ...hit };
  }

  try {
    const base = getBaseUrl();
    const url = `${base}?action=master&barcode=${encodeURIComponent(barcode)}`;
    return await safeFetchJson<MasterLookupResponse>(url, undefined, "Gagal fetch master data");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Gagal fetch master data";
    return { ok: false, error: msg };
  }
}

type InFlightMasterData = {
  force: boolean;
  promise: Promise<MasterDataResponse>;
};

let masterDataInFlight: InFlightMasterData | null = null;

async function fetchMasterDataNetwork(force: boolean): Promise<MasterDataResponse> {
  // Gabungkan request paralel produk+batch. Request force tidak boleh memakai
  // request non-force yang mungkin mengembalikan cache server lama.
  if (masterDataInFlight && (!force || masterDataInFlight.force)) {
    return masterDataInFlight.promise;
  }

  const base = getBaseUrl();
  const url = `${base}?action=masterdata${force ? "&force=1" : ""}`;
  const request = safeFetchJson<MasterDataResponse>(
    url,
    undefined,
    "Gagal fetch master data",
    15000,
    1
  );
  const activeRequest: InFlightMasterData = { force, promise: request };
  masterDataInFlight = activeRequest;

  try {
    const data = await request;
    if (data.ok) {
      writeCache(LS_PRODUCTS, data.products);
      writeCache(LS_BATCHES, data.batches);
    }
    return data;
  } finally {
    if (masterDataInFlight === activeRequest) {
      masterDataInFlight = null;
    }
  }
}

async function fetchBatchesNetwork(force: boolean): Promise<BatchesResponse> {
  const data = await fetchMasterDataNetwork(force);
  return data.ok ? { ok: true, batches: data.batches } : data;
}

async function fetchProductsNetwork(force: boolean): Promise<ProductsResponse> {
  const data = await fetchMasterDataNetwork(force);
  return data.ok ? { ok: true, products: data.products } : data;
}

export async function fetchBatches(force = false): Promise<BatchesResponse> {
  const cached = readCache<BatchItem[]>(LS_BATCHES);

  // Cache segar langsung dipakai tanpa request jaringan tambahan.
  if (!force && cached?.fresh) {
    return { ok: true, batches: cached.data };
  }

  try {
    // Cache lokal kedaluwarsa berarti server juga harus melewati cache-nya,
    // supaya edit langsung di Google Sheets terlihat paling lambat 30 menit.
    const data = await fetchBatchesNetwork(force || Boolean(cached && !cached.fresh));
    if (data.ok) writeCache(LS_BATCHES, data.batches);
    return data;
  } catch (e: unknown) {
    // Jaringan gagal tapi ada cache basi -> lebih baik tampilkan data basi daripada error.
    if (cached) return { ok: true, batches: cached.data };
    const msg = e instanceof Error ? e.message : "Gagal fetch batches";
    return { ok: false, error: msg };
  }
}

export async function fetchProducts(force = false): Promise<ProductsResponse> {
  const cached = readCache<ProductItem[]>(LS_PRODUCTS);

  if (!force && cached?.fresh) {
    return { ok: true, products: cached.data };
  }

  try {
    const data = await fetchProductsNetwork(force || Boolean(cached && !cached.fresh));
    if (data.ok) writeCache(LS_PRODUCTS, data.products);
    return data;
  } catch (e: unknown) {
    if (cached) return { ok: true, products: cached.data };
    const msg = e instanceof Error ? e.message : "Gagal fetch products";
    return { ok: false, error: msg };
  }
}

// Paksa ambil ulang master data dari sheet (buang cache lokal + cache server).
export async function refreshMasterData(): Promise<void> {
  clearCache(LS_PRODUCTS);
  clearCache(LS_BATCHES);
  const base = getBaseUrl();
  const result = await safeFetchJson<{ ok: boolean; error?: string }>(
    `${base}?action=refreshcache`,
    undefined,
    "Gagal refresh cache",
    15000,
    1
  );
  if (!result.ok) {
    throw new Error(result.error || "Gagal refresh cache");
  }

  const refreshed = await fetchMasterDataNetwork(true);
  if (!refreshed.ok) throw new Error(refreshed.error);
}

export async function fetchReturnHistory(limit = 200): Promise<ReturnHistoryResponse> {
  try {
    const base = getBaseUrl();
    const url = `${base}?action=history&limit=${encodeURIComponent(String(limit))}`;
    return await safeFetchJson<ReturnHistoryResponse>(url, undefined, "Gagal fetch riwayat retur");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Gagal fetch riwayat retur";
    return { ok: false, error: msg };
  }
}

export function createReturnRequestId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // lanjut ke fallback
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function createReturn(
  payload: CreateReturnPayload,
  sheet: string,
  clientId: string
): Promise<CreateReturnResponse> {
  // clientId dibuat oleh form dan dipertahankan ketika hasil submit ambigu.
  // Retry otomatis maupun retry manual memakai ID yang sama.

  try {
    const base = getBaseUrl();
    return await safeFetchJson<CreateReturnResponse>(
      base,
      {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "returns", sheet, clientId, payload }),
      },
      "Gagal submit retur",
      20000,
      1
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Gagal submit retur";
    return { ok: false, error: msg };
  }
}

export type EditReturnResponse =
  | { ok: true }
  | { ok: false; error: string };

export type DeleteReturnResponse =
  | { ok: true }
  | { ok: false; error: string };

export async function editReturn(
  sheet: string,
  rowNumber: number,
  payload: CreateReturnPayload
): Promise<EditReturnResponse> {
  try {
    const base = getBaseUrl();
    return await safeFetchJson<EditReturnResponse>(
      base,
      {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "editReturn", sheet, rowNumber, payload }),
      },
      "Gagal mengedit data retur",
      20000,
      0
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Gagal mengedit data retur";
    return { ok: false, error: msg };
  }
}

export async function deleteReturn(
  sheet: string,
  rowNumber: number
): Promise<DeleteReturnResponse> {
  try {
    const base = getBaseUrl();
    // Hapus baris TIDAK boleh diulang otomatis: nomor baris bergeser setelah
    // penghapusan, retry bisa menghapus baris lain. retries = 0.
    return await safeFetchJson<DeleteReturnResponse>(
      base,
      {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "deleteReturn", sheet, rowNumber }),
      },
      "Gagal menghapus data retur",
      20000,
      0
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Gagal menghapus data retur";
    return { ok: false, error: msg };
  }
}

export async function addBatch(lot: string, expDate: string): Promise<AddBatchResponse> {
  try {
    const base = getBaseUrl();
    const data = await safeFetchJson<AddBatchResponse>(
      base,
      {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "addbatch", lot, expDate }),
      },
      "Gagal menyimpan batch baru",
      20000,
      1
    );
    if (data.ok) clearCache(LS_BATCHES);
    return data;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Gagal menyimpan batch baru";
    return { ok: false, error: msg };
  }
}
