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

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-gray-900 rounded-xs px-0.5 font-bold">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

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
  const [keteranganList, setKeteranganList] = useState<string[]>(["Ok"]);
  const [pic, setPic] = useState(user?.displayName ?? "");
  const [targetSheet, setTargetSheet] = useState<"Bagas" | "Dimas">(getSavedSheet);

  const [showDistriDropdown, setShowDistriDropdown] = useState(false);
  const [batchModal, setBatchModal] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // === REFS for auto-focus & scrolling ===
  const productInputRef = useRef<HTMLInputElement>(null);
  const batchBtnRef = useRef<HTMLButtonElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const distriRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const submitLockRef = useRef(false);

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

  // === AUTO-TAB & SCROLL HELPERS ===
  const selectProduct = useCallback((item: ProductItem) => {
    setSelectedBarcode(item.barcode);
    setProductSearch(item.product);
    setShowProductDropdown(false);
    setHighlightedIdx(-1);
    setTimeout(() => {
      batchBtnRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      batchBtnRef.current?.focus();
    }, 60);
  }, []);

  const handleBatchPicked = useCallback((item: BatchItem) => {
    setBatch(item.lot);
    setExpDate(item.expDate || "");
    setBatchModal(false);
    setTimeout(() => {
      qtyRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      qtyRef.current?.focus();
    }, 80);
  }, []);

  const handleBatchCreated = useCallback((lot: string, exp: string) => {
    setBatch(lot);
    setExpDate(exp);
    setBatchModal(false);
    setTimeout(() => {
      qtyRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      qtyRef.current?.focus();
    }, 80);
  }, []);

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

  useEffect(() => {
    if (highlightedIdx >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll("[data-dropdown-item]");
      items[highlightedIdx]?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIdx]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !canSubmit || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    setToast(null);

    try {
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan data";
      setToast({ type: "error", msg });
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  }

  const toggleKeterangan = (opt: string) => {
    setKeteranganList((prev) => {
      if (opt === "Ok") {
        return prev.includes("Ok") ? [] : ["Ok"];
      }
      const withoutOk = prev.filter((v) => v !== "Ok");
      if (withoutOk.includes(opt)) {
        const next = withoutOk.filter((v) => v !== opt);
        return next.length === 0 ? ["Ok"] : next;
      }
      return [...withoutOk, opt];
    });
  };

  return (
    <div className="space-y-3 pb-8">
      {/* Toast Notification */}
      {toast && (
        <div className={`rounded-xl px-3.5 py-2.5 text-xs font-semibold border ${
          toast.type === "success"
            ? "bg-green-50 text-green-700 border-green-200"
            : "bg-red-50 text-red-600 border-red-200"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Main Form Card */}
      <form onSubmit={onSubmit} className="card overflow-hidden">
        {/* Loading Progress Bar */}
        {(loadingProducts || loadingBatches) && (
          <div className="h-1 bg-gray-100 overflow-hidden">
            <div className="h-full w-1/3 bg-gray-900 rounded-full animate-pulse" />
          </div>
        )}

        <div className="p-3.5 sm:p-4 space-y-3.5">
          {/* Header Bar: Title + Compact Sheet Switcher */}
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Sheet Tujuan
            </span>
            <div className="flex bg-gray-100 p-0.5 rounded-xl">
              {(["Bagas", "Dimas"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setTargetSheet(s); saveSheet(s); }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    targetSheet === s
                      ? "bg-gray-900 text-white shadow-xs"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Section 1: Produk Selection */}
          <div>
            <label className="label-field">Produk Retur</label>
            {selectedProduct ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-bold text-gray-900 truncate">
                    {selectedProduct.product}
                  </p>
                  <p className="text-[11px] text-emerald-800 font-mono">
                    {selectedProduct.sku} · {selectedProduct.barcode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBarcode("");
                    setProductSearch("");
                    setTimeout(() => productInputRef.current?.focus(), 60);
                  }}
                  className="shrink-0 text-xs font-bold text-emerald-700 hover:text-emerald-900 bg-white border border-emerald-200 px-2.5 py-1 rounded-lg transition-colors"
                >
                  Ganti
                </button>
              </div>
            ) : (
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
                  placeholder={loadingProducts ? "Memuat produk..." : "Ketik nama produk, barcode, atau SKU"}
                  disabled={loadingProducts}
                  className="input-field text-sm py-2.5"
                />
                {showProductDropdown && displayedProducts.length > 0 && (
                  <div
                    ref={dropdownRef}
                    className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-56 overflow-y-auto"
                  >
                    {displayedProducts.map((item, idx) => (
                      <button
                        key={item.barcode}
                        type="button"
                        data-dropdown-item
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectProduct(item)}
                        className={`w-full text-left px-3.5 py-2.5 border-b border-gray-100 last:border-0 transition-colors ${
                          idx === highlightedIdx ? "bg-gray-100" : "hover:bg-gray-50"
                        }`}
                      >
                        <span className="text-xs font-bold text-gray-900 block truncate">
                          <HighlightText text={item.product} query={debouncedSearch} />
                        </span>
                        <span className="text-[11px] text-gray-400 block font-mono">
                          <HighlightText text={item.barcode} query={debouncedSearch} />
                          {" · "}
                          <HighlightText text={item.sku} query={debouncedSearch} />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Batch & Exp Date (Grid 2 Kolom, Terlihat Langsung) */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="label-field">Nomor Batch</label>
              <button
                ref={batchBtnRef}
                type="button"
                onClick={() => setBatchModal(true)}
                className={`w-full text-left input-field py-2.5 flex items-center justify-between font-mono text-sm ${
                  batch ? "text-gray-900 font-bold bg-white border-gray-300" : "text-gray-400"
                }`}
              >
                <span className="truncate">{batch || "Pilih Batch..."}</span>
                <svg className="w-4 h-4 text-gray-400 shrink-0 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            <div>
              <label className="label-field">Exp Date</label>
              <input
                value={expDate}
                onChange={(e) => setExpDate(e.target.value)}
                placeholder="Mis: Sep 2027"
                className="input-field text-sm py-2.5"
              />
            </div>
          </div>

          {/* Section 3: Receive Date + Qty */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="label-field">Receive Date</label>
              <input
                value={receiveDate}
                onChange={(e) => setReceiveDate(e.target.value)}
                placeholder="DD-Mon-YYYY"
                className="input-field text-sm py-2.5 font-medium"
              />
            </div>
            <div>
              <label className="label-field">Jumlah (Qty)</label>
              <input
                ref={qtyRef}
                type="number"
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    distriRef.current?.focus();
                  }
                }}
                placeholder="0"
                min="1"
                className="input-field text-sm py-2.5 font-bold"
              />
            </div>
          </div>

          {/* Section 4: Distri / Event + PIC (Grid 2 Kolom) */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="relative">
              <label className="label-field">Distri / Event</label>
              <input
                ref={distriRef}
                value={distriEvent}
                onChange={(e) => {
                  setDistriEvent(e.target.value);
                  setShowDistriDropdown(true);
                }}
                onFocus={() => setShowDistriDropdown(true)}
                onBlur={() => setTimeout(() => setShowDistriDropdown(false), 150)}
                placeholder="Ketik distri..."
                className="input-field text-sm py-2.5"
              />
              {showDistriDropdown && distriHistory.length > 0 && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
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
                        className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 border-b border-gray-50 last:border-0 truncate"
                      >
                        {item}
                      </button>
                    ))}
                </div>
              )}
            </div>

            <div>
              <label className="label-field">PIC</label>
              <input
                value={pic}
                onChange={(e) => setPic(e.target.value)}
                placeholder="PIC"
                className="input-field text-sm py-2.5"
              />
            </div>
          </div>

          {/* Section 5: Keterangan (Pill Chips) */}
          <div>
            <label className="label-field">Kondisi / Keterangan</label>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {KETERANGAN_OPTIONS.map((opt) => {
                const active = keteranganList.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleKeterangan(opt)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                      active
                        ? "bg-gray-900 text-white border-gray-900 shadow-xs"
                        : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    {active ? "✓ " : ""}{opt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="flex-1 btn-outline py-2.5 text-xs font-bold"
            >
              Kembali
            </button>
            <button
              type="submit"
              disabled={!canSubmit || submitting || loadingProducts || loadingBatches}
              className="flex-1 btn-primary py-2.5 text-xs font-bold"
            >
              {submitting ? "Menyimpan..." : "Simpan Retur"}
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
    </div>
  );
}
