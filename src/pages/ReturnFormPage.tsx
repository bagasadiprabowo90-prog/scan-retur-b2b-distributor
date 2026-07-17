import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import BatchPickerModal from "../components/BatchPickerModal";
import {
  createReturn,
  fetchBatches,
  fetchProducts,
  type BatchItem,
  type ProductItem,
} from "../lib/api";

const MONTH_ABBR = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function todayFormatted() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mon = MONTH_ABBR[d.getMonth()];
  const yyyy = d.getFullYear();
  return `${dd}-${mon}-${yyyy}`;
}

const KETERANGAN_OPTIONS = [
  "Ok",
  "Packaging Rusak, Penyok, Sobek, Kotor",
  "Pudar Hilang (IB, Batch & Exp Date)",
  "Tidak ada seal / Seal lepas",
  "Ada sticker harga",
  "Ada Sticker Barcode",
  "Defect (Pecah, Rusak)",
];

const DISTRI_STORAGE_KEY = "scan-retur-distri-history";
const SHEET_STORAGE_KEY = "scan-retur-target-sheet";

function getSavedSheet(): "Bagas" | "Dimas" {
  try {
    const raw = localStorage.getItem(SHEET_STORAGE_KEY);
    if (raw === "Bagas" || raw === "Dimas") return raw;
  } catch {}
  return "Bagas";
}

function saveSheet(sheet: "Bagas" | "Dimas") {
  try { localStorage.setItem(SHEET_STORAGE_KEY, sheet); } catch {}
}

function getDistriHistory(): string[] {
  try {
    const raw = localStorage.getItem(DISTRI_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDistriHistory(value: string) {
  const list = getDistriHistory();
  const trimmed = value.trim();
  if (!trimmed) return;
  const filtered = list.filter((v) => v !== trimmed);
  filtered.unshift(trimmed);
  localStorage.setItem(DISTRI_STORAGE_KEY, JSON.stringify(filtered.slice(0, 20)));
}

/** Highlight matching substring with bold */
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-gray-900 rounded-sm px-0.5 font-bold">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

/** Debounce hook */
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function ReturnFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const initialBarcode = searchParams.get("barcode") ?? "";

  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [selectedBarcode, setSelectedBarcode] = useState(initialBarcode);
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);

  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [batch, setBatch] = useState("");
  const [expDate, setExpDate] = useState("");

  const [receiveDate, setReceiveDate] = useState(todayFormatted());
  const [distriEvent, setDistriEvent] = useState("");
  const [distriHistory] = useState<string[]>(getDistriHistory);
  const [qty, setQty] = useState("");
  const [keteranganList, setKeteranganList] = useState<string[]>([]);
  const [pic, setPic] = useState(user?.displayName ?? "");
  const [targetSheet, setTargetSheet] = useState<"Bagas" | "Dimas">(getSavedSheet);

  const [showDistriDropdown, setShowDistriDropdown] = useState(false);
  const [batchModal, setBatchModal] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [envError] = useState<string | null>(() => {
    const url = import.meta.env.VITE_APPS_SCRIPT_URL;
    if (!url) return "VITE_APPS_SCRIPT_URL belum diisi di file .env. Aplikasi tidak bisa terhubung ke Google Sheet.";
    return null;
  });

  // === REFS for auto-tab ===
  const productInputRef = useRef<HTMLInputElement>(null);
  const batchBtnRef = useRef<HTMLButtonElement>(null);
  const expDateRef = useRef<HTMLInputElement>(null);
  const receiveDateRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const distriRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce the product search for performance
  const debouncedSearch = useDebounce(productSearch, 150);

  // Fetch products
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingProducts(true);
      const res = await fetchProducts();
      if (!alive) return;
      setLoadingProducts(false);
      if (!res.ok) {
        setToast({ type: "error", msg: res.error });
        return;
      }
      setProducts(res.products);
    })();
    return () => { alive = false; };
  }, []);

  const selectedProduct = useMemo(
    () => products.find((item) => item.barcode === selectedBarcode) ?? null,
    [products, selectedBarcode]
  );

  const filteredProducts = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((item) =>
      item.product.toLowerCase().includes(q) ||
      item.barcode.toLowerCase().includes(q) ||
      item.sku.toLowerCase().includes(q)
    );
  }, [products, debouncedSearch]);

  // Reset highlighted index when filtered list changes
  useEffect(() => {
    setHighlightedIdx(-1);
  }, [filteredProducts]);

  useEffect(() => {
    if (!selectedProduct && selectedBarcode && products.length > 0) {
      setToast({ type: "error", msg: `Barcode ${selectedBarcode} tidak ditemukan di master data.` });
    }
  }, [products, selectedBarcode, selectedProduct]);

  useEffect(() => {
    if (selectedProduct) {
      setProductSearch(selectedProduct.product);
    } else if (!selectedBarcode) {
      setProductSearch("");
    }
  }, [selectedBarcode, selectedProduct]);

  // Fetch batches
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingBatches(true);
      const res = await fetchBatches();
      if (!alive) return;
      setLoadingBatches(false);
      if (!res.ok) {
        setToast({ type: "error", msg: res.error });
        return;
      }
      setBatches(res.batches);
    })();
    return () => { alive = false; };
  }, []);

  const canSubmit = useMemo(() => {
    const q = Number(qty);
    return (
      !!selectedProduct &&
      batch.trim() &&
      expDate.trim() &&
      receiveDate.trim() &&
      distriEvent.trim() &&
      Number.isFinite(q) &&
      q > 0
    );
  }, [selectedProduct, batch, expDate, receiveDate, distriEvent, qty]);

  // === AUTO-TAB HELPERS ===
  const selectProduct = useCallback((item: ProductItem) => {
    setSelectedBarcode(item.barcode);
    setProductSearch(item.product);
    setShowProductDropdown(false);
    setHighlightedIdx(-1);
    // Auto-tab → Batch button
    setTimeout(() => batchBtnRef.current?.focus(), 80);
  }, []);

  const handleBatchPicked = useCallback((item: BatchItem) => {
    setBatch(item.lot);
    setExpDate(item.expDate || "");
    setBatchModal(false);
    // Auto-tab → Qty (since exp date is auto-filled from batch)
    setTimeout(() => qtyRef.current?.focus(), 80);
  }, []);

  const handleBatchCreated = useCallback((lot: string, exp: string) => {
    setBatch(lot);
    setExpDate(exp);
    setBatchModal(false);
    // Auto-tab → Qty
    setTimeout(() => qtyRef.current?.focus(), 80);
  }, []);

  // === KEYBOARD NAVIGATION for product dropdown ===
  const displayedProducts = useMemo(() => filteredProducts.slice(0, 30), [filteredProducts]);

  const handleProductKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showProductDropdown || displayedProducts.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIdx((prev) => (prev < displayedProducts.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx((prev) => (prev > 0 ? prev - 1 : displayedProducts.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIdx >= 0 && highlightedIdx < displayedProducts.length) {
        selectProduct(displayedProducts[highlightedIdx]);
      }
    } else if (e.key === "Escape") {
      setShowProductDropdown(false);
    }
  }, [showProductDropdown, displayedProducts, highlightedIdx, selectProduct]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIdx >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll("[data-dropdown-item]");
      items[highlightedIdx]?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIdx]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !canSubmit) return;
    // Tampilkan dialog konfirmasi dulu
    setConfirmOpen(true);
  }

  async function doSubmit() {
    setConfirmOpen(false);
    setSubmitting(true);
    setToast(null);

    try {
      // Simpan distri/event ke history untuk dropdown berikutnya
      saveDistriHistory(distriEvent);

      const res = await createReturn({
        receiveDate,
        distriEvent,
        product: selectedProduct?.product || "",
        barcode: selectedProduct?.barcode || "",
        batch,
        expDate,
        qty: Number(qty),
        keterangan: keteranganList.join("; "),
        pic,
      }, targetSheet);

      if (!res.ok) {
        setToast({ type: "error", msg: res.error });
        return;
      }

      navigate("/", {
        replace: true,
        state: {
          successMessage: `Data berhasil disimpan di sheet ${res.sheet} (row ${res.appendedRow}).`,
        },
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3 pb-6">
      {/* ENV Error Banner */}
      {envError && (
        <div className="rounded-xl px-3.5 py-2.5 text-sm bg-amber-50 text-amber-700 border border-amber-100">
          {envError}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`rounded-xl px-3.5 py-2.5 text-sm border ${
          toast.type === "success"
            ? "bg-green-50 text-green-700 border-green-100"
            : "bg-red-50 text-red-600 border-red-100"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Form Card */}
      <form onSubmit={onSubmit} className="card">
        {/* Loading indicator */}
        {(loadingProducts || loadingBatches) && (
          <div className="h-0.5 bg-gray-100 overflow-hidden">
            <div className="h-full w-1/3 bg-gray-900 rounded-full animate-pulse" />
          </div>
        )}

        <div className="p-4 space-y-5">
          {/* Sheet Selector */}
          <div>
            <label className="label-field">Sheet Tujuan</label>
            <div className="flex gap-2">
              {(["Bagas", "Dimas"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setTargetSheet(s); saveSheet(s); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${targetSheet === s
                    ? "bg-gray-900 text-white shadow-md"
                    : "bg-gray-50 text-gray-400 border border-gray-100 hover:bg-gray-100"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-gray-100" />

          {/* Product Picker */}
          <Field label="Produk">
            <div className="relative">
              <input
                ref={productInputRef}
                type="text"
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setSelectedBarcode("");
                  setShowProductDropdown(true);
                }}
                onFocus={() => setShowProductDropdown(true)}
                onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                onKeyDown={handleProductKeyDown}
                placeholder={loadingProducts ? "Memuat..." : "Cari produk / barcode / SKU"}
                disabled={loadingProducts}
                className="input-field"
              />
              {showProductDropdown && displayedProducts.length > 0 && (
                <div
                  ref={dropdownRef}
                  className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-y-auto"
                >
                  {displayedProducts.map((item, idx) => (
                    <button
                      key={item.barcode}
                      type="button"
                      data-dropdown-item
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectProduct(item)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 transition-colors ${
                        idx === highlightedIdx
                          ? "bg-gray-100"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <span className="text-base font-medium text-gray-900 block truncate">
                        <HighlightText text={item.product} query={debouncedSearch} />
                      </span>
                      <span className="text-xs text-gray-400 mt-0.5 block">
                        <HighlightText text={item.barcode} query={debouncedSearch} />
                        {" · "}
                        <HighlightText text={item.sku} query={debouncedSearch} />
                      </span>
                    </button>
                  ))}
                  {filteredProducts.length > 30 && (
                    <div className="px-4 py-2.5 text-xs text-gray-400 text-center bg-gray-50 font-medium">
                      +{filteredProducts.length - 30} produk lagi — ketik lebih spesifik
                    </div>
                  )}
                </div>
              )}
              {showProductDropdown && productSearch.trim() && filteredProducts.length === 0 && !loadingProducts && (
                <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-400 text-center">
                  Tidak ditemukan
                </div>
              )}
            </div>
          </Field>

          {/* Selected product info */}
          {selectedProduct && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-emerald-600 text-sm font-semibold">✓ Produk Terpilih</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Barcode</span>
                <span className="font-mono font-semibold text-gray-800">{selectedProduct.barcode}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">SKU</span>
                <span className="font-semibold text-gray-800">{selectedProduct.sku}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Produk</span>
                <span className="font-semibold text-gray-800 text-right max-w-[60%]">{selectedProduct.product}</span>
              </div>
            </div>
          )}

          <div className="h-px bg-gray-100" />

          {/* Batch */}
          <Field label="Batch">
            <button
              ref={batchBtnRef}
              type="button"
              onClick={() => setBatchModal(true)}
              className="input-field text-left flex items-center justify-between"
            >
              <span className={batch ? "text-gray-900 font-semibold" : "text-gray-400"}>
                {batch || "Pilih / Buat batch"}
              </span>
              <svg className="w-5 h-5 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </Field>

          {/* Exp Date */}
          <Field label="Exp Date">
            <input
              ref={expDateRef}
              value={expDate}
              onChange={(e) => setExpDate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Tab") {
                  if (e.key === "Enter") e.preventDefault();
                  // Auto-tab → Receive Date
                  setTimeout(() => receiveDateRef.current?.focus(), 50);
                }
              }}
              placeholder="Sep 2027"
              className="input-field"
            />
          </Field>

          {/* Two-column: Receive Date + Qty */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Receive Date">
              <input
                ref={receiveDateRef}
                value={receiveDate}
                onChange={(e) => setReceiveDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    // Auto-tab → Qty
                    setTimeout(() => qtyRef.current?.focus(), 50);
                  }
                }}
                placeholder="DD-Mon-YYYY"
                className="input-field"
              />
            </Field>
            <Field label="Qty">
              <input
                ref={qtyRef}
                type="number"
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    // Auto-tab → Distri/Event
                    setTimeout(() => distriRef.current?.focus(), 50);
                  }
                }}
                placeholder="0"
                min="1"
                className="input-field"
              />
            </Field>
          </div>

          {/* Distri/Event */}
          <Field label="Distri / Event">
            <div className="relative">
              <input
                ref={distriRef}
                value={distriEvent}
                onChange={(e) => {
                  setDistriEvent(e.target.value);
                  setShowDistriDropdown(true);
                }}
                onFocus={() => setShowDistriDropdown(true)}
                onBlur={() => setTimeout(() => setShowDistriDropdown(false), 150)}
                placeholder="Ketik atau pilih..."
                className="input-field"
              />
              {showDistriDropdown && distriHistory.length > 0 && (
                <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                  {distriHistory
                    .filter((h) => !distriEvent.trim() || h.toLowerCase().includes(distriEvent.toLowerCase()))
                    .map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setDistriEvent(item);
                          setShowDistriDropdown(false);
                        }}
                        className="w-full text-left px-4 py-3 text-base text-gray-700 hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors"
                      >
                        {item}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </Field>

          <div className="h-px bg-gray-100" />

          {/* Keterangan */}
          <Field label="Keterangan">
            <div className="space-y-2 bg-gray-50 rounded-xl p-3.5">
              {KETERANGAN_OPTIONS.map((opt) => (
                <label key={opt} className="flex items-start gap-3 cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    checked={keteranganList.includes(opt)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setKeteranganList((prev) => [...prev, opt]);
                      } else {
                        setKeteranganList((prev) => prev.filter((v) => v !== opt));
                      }
                    }}
                    className="w-5 h-5 rounded border-gray-300 text-gray-900 focus:ring-gray-900 shrink-0 mt-0.5"
                  />
                  <span className="text-sm text-gray-700 leading-snug">{opt}</span>
                </label>
              ))}
            </div>
            {keteranganList.length > 0 && (
              <p className="text-xs text-gray-400 mt-1.5">{keteranganList.join("; ")}</p>
            )}
          </Field>

          {/* PIC */}
          <Field label="PIC">
            <input value={pic} onChange={(e) => setPic(e.target.value)} placeholder="Opsional" className="input-field" />
          </Field>

          {/* Buttons */}
          <div className="flex gap-2.5 pt-1">
            <button type="button" onClick={() => navigate("/")} className="flex-1 btn-outline py-3">
              Kembali
            </button>
            <button
              type="submit"
              disabled={!canSubmit || submitting || loadingProducts || loadingBatches}
              className="flex-1 btn-primary py-3"
            >
              {submitting ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>
      </form>

      {/* Batch Picker Modal */}
      <BatchPickerModal
        open={batchModal}
        onClose={() => setBatchModal(false)}
        batches={batches}
        onPickExisting={handleBatchPicked}
        onCreateNew={handleBatchCreated}
      />

      {/* Confirm Dialog */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setConfirmOpen(false)} />
          <div className="relative card p-5 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-base text-gray-900">Konfirmasi</h3>
            <div className="bg-gray-50 rounded-xl p-3.5 space-y-2 text-sm">
              <Row label="Sheet" value={targetSheet} />
              <Row label="Produk" value={selectedProduct?.product || "-"} />
              <Row label="Barcode" value={selectedProduct?.barcode || "-"} mono />
              <Row label="Batch" value={`${batch} — ${expDate}`} />
              <Row label="Distri/Event" value={distriEvent} />
              <Row label="Qty" value={qty} />
              {pic && <Row label="PIC" value={pic} />}
              {keteranganList.length > 0 && <Row label="Keterangan" value={keteranganList.join("; ")} />}
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => setConfirmOpen(false)} className="flex-1 btn-outline">
                Batal
              </button>
              <button onClick={doSubmit} className="flex-1 btn-primary">
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label-field">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className={`text-gray-800 font-medium text-right truncate ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
