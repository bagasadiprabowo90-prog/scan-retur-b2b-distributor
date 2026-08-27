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

async function safeFetchJson<T>(
  input: string,
  init?: RequestInit,
  fallbackError = "Gagal memproses request",
  timeoutMs = 25000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      if (text.includes("<title>") || text.includes("<!DOCTYPE") || text.includes("<html")) {
        const match = text.match(/<title>([^<]+)<\/title>/i);
        const title = match ? match[1].trim() : "Google Apps Script Error";
        throw new Error(`${fallbackError}: ${title}`);
      }
      throw new Error(`${fallbackError}: Format respon tidak valid`);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Koneksi timeout. Mohon periksa jaringan internet Anda.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchMasterByBarcode(barcode: string): Promise<MasterLookupResponse> {
  try {
    const base = getBaseUrl();
    const url = `${base}?action=master&barcode=${encodeURIComponent(barcode)}`;
    return await safeFetchJson<MasterLookupResponse>(url, undefined, "Gagal fetch master data");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Gagal fetch master data";
    return { ok: false, error: msg };
  }
}

// In-memory cache for batches & products (cleared on page reload)
let batchesCache: BatchesResponse | null = null;
let productsCache: ProductsResponse | null = null;

export async function fetchBatches(force = false): Promise<BatchesResponse> {
  if (!force && batchesCache) return batchesCache;
  try {
    const base = getBaseUrl();
    const url = `${base}?action=batches`;
    const data = await safeFetchJson<BatchesResponse>(url, undefined, "Gagal fetch batches");
    if (data.ok) batchesCache = data;
    return data;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Gagal fetch batches";
    return { ok: false, error: msg };
  }
}

export async function fetchProducts(force = false): Promise<ProductsResponse> {
  if (!force && productsCache) return productsCache;
  try {
    const base = getBaseUrl();
    const url = `${base}?action=products`;
    const data = await safeFetchJson<ProductsResponse>(url, undefined, "Gagal fetch products");
    if (data.ok) productsCache = data;
    return data;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Gagal fetch products";
    return { ok: false, error: msg };
  }
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

export async function createReturn(
  payload: CreateReturnPayload,
  sheet: string
): Promise<CreateReturnResponse> {
  try {
    const base = getBaseUrl();
    return await safeFetchJson<CreateReturnResponse>(
      base,
      {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "returns", sheet, payload }),
      },
      "Gagal submit retur",
      30000
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
      "Gagal mengedit data retur"
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
    return await safeFetchJson<DeleteReturnResponse>(
      base,
      {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "deleteReturn", sheet, rowNumber }),
      },
      "Gagal menghapus data retur"
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
      "Gagal menyimpan batch baru"
    );
    if (data.ok) batchesCache = null;
    return data;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Gagal menyimpan batch baru";
    return { ok: false, error: msg };
  }
}
