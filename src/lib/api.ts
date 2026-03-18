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
  | { ok: true; history: ReturnHistoryItem[] }
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
  | { ok: true; appendedRow: number; sheet: string }
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

export async function fetchMasterByBarcode(barcode: string): Promise<MasterLookupResponse> {
  try {
    const base = getBaseUrl();
    const url = `${base}?action=master&barcode=${encodeURIComponent(barcode)}`;
    const res = await fetch(url);
    return await res.json();
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
    const res = await fetch(url);
    const data: BatchesResponse = await res.json();
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
    const res = await fetch(url);
    const data: ProductsResponse = await res.json();
    if (data.ok) productsCache = data;
    return data;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Gagal fetch products";
    return { ok: false, error: msg };
  }
}

export async function fetchReturnHistory(limit = 100): Promise<ReturnHistoryResponse> {
  try {
    const base = getBaseUrl();
    const url = `${base}?action=history&limit=${encodeURIComponent(String(limit))}`;
    const res = await fetch(url);
    return await res.json();
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
    const res = await fetch(base, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "returns", sheet, payload }),
    });
    return await res.json();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Gagal submit retur";
    return { ok: false, error: msg };
  }
}
