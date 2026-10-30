import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import BatchPickerModal from "../components/BatchPickerModal";
import { getActiveSession, addScannedItemToSession, getSessionStoreConflict } from "../lib/session";
import {
  createReturn,
  createReturnRequestId,
  fetchBatches,
  fetchBatchesForBarcode,
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
const FLOW_MODE_KEY = "scan-retur-flow-mode";

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
      <mark className="bg-teal-200/80 text-stone-900 rounded-xs px-0.5 font-bold">{text.slice(idx, idx + query.length)}</mark>
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
  const modeParam = searchParams.get("mode");

  const activeSession = useMemo(() => getActiveSession(), []);

  // Tentukan apakah form ini berjalan dalam Flow Verifikasi SJ atau Flow Input Manual (Ke Sheet Saja)
  const [isVerifyMode, setIsVerifyMode] = useState<boolean>(() => {
    if (!activeSession) return false;
    if (modeParam === "direct") return false;
    if (modeParam === "verify") return true;
    try {
      return localStorage.getItem(FLOW_MODE_KEY) === "verify";
    } catch {
      return false;
    }
  });

  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [selectedBarcode, setSelectedBarcode] = useState(initialBarcode);
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);

  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [productBatches, setProductBatches] = useState<BatchItem[]>([]);
  const [batchesLoadedFor, setBatchesLoadedFor] = useState("");
  const [loadingProductBatches, setLoadingProductBatches] = useState(false);
  const [batch, setBatch] = useState("");
  const [expDate, setExpDate] = useState("");

  const [receiveDate, setReceiveDate] = useState(() =>
    isVerifyMode && activeSession?.receiveDate ? activeSession.receiveDate : todayFormatted()
  );
  const [distriEvent, setDistriEvent] = useState(() =>
    isVerifyMode && activeSession?.storeName ? activeSession.storeName : ""
  );
  const [distriHistory] = useState<string[]>(getDistriHistory);
  const [qty, setQty] = useState("");
  const [keteranganList, setKeteranganList] = useState<string[]>(["Ok"]);
  const [pic, setPic] = useState(user?.displayName ?? "");
  const [targetSheet, setTargetSheet] = useState<"Bagas" | "Dimas">(
    () => (isVerifyMode && activeSession?.targetSheet ? activeSession.targetSheet : getSavedSheet())
  );

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
  const pendingSubmitRef = useRef<{
    fingerprint: string;
    clientId: string;
  } | null>(null);

  const debouncedSearch = useDebounce(productSearch, 150);

  const handleToggleVerifyMode = (nextVerify: boolean) => {
    setIsVerifyMode(nextVerify);
    try {
      localStorage.setItem(FLOW_MODE_KEY, nextVerify ? "verify" : "direct");
    } catch {}
    if (nextVerify && activeSession) {
      setDistriEvent(activeSession.storeName);
      if (activeSession.receiveDate) setReceiveDate(activeSession.receiveDate);
      if (activeSession.targetSheet) setTargetSheet(activeSession.targetSheet);
    } else if (!nextVerify && distriEvent === activeSession?.storeName) {
      setDistriEvent("");
    }
  };

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

  // Batch milik produk terpilih (chip picker setelah scan)
  useEffect(() => {
    if (!selectedProduct) {
      setProductBatches([]);
      setBatchesLoadedFor("");
      setLoadingProductBatches(false);
      return;
    }
    let alive = true;
    (async () => {
      setLoadingProductBatches(true);
      const res = await fetchBatchesForBarcode(selectedProduct.barcode);
      if (!alive) return;
      setLoadingProductBatches(false);
      setProductBatches(res.ok ? res.batches : []);
      setBatchesLoadedFor(selectedProduct.barcode);
    })();
    return () => { alive = false; };
  }, [selectedProduct]);

  // Ganti produk = reset batch; batch produk sebelumnya tidak boleh ikut.
  useEffect(() => {
    setBatch("");
    setExpDate("");
  }, [selectedBarcode]);

  // Setelah batch produk selesai dimuat:
  // - ada batch  -> langsung buka picker chip (hasil scan/ketik)
  // - tanpa batch (mis. merchandise) -> isi "-" supaya retur bisa langsung disimpan
  useEffect(() => {
    if (!selectedProduct || loadingProductBatches) return;
    if (batchesLoadedFor !== selectedProduct.barcode) return;
    if (batch) return;
    if (productBatches.length > 0) {
      setBatchModal(true);
    } else {
      setBatch("-");
      setExpDate("-");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct?.barcode, loadingProductBatches, batchesLoadedFor]);

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
      // Hanya cek konflik toko apabila sedang dalam Flow 1 (Verifikasi Klaim SJ)
      if (isVerifyMode) {
        const conflictStore = getSessionStoreConflict(distriEvent);
        if (conflictStore) {
          setToast({
            type: "error",
            msg: `Sesi toko "${conflictStore}" masih aktif. Selesaikan verifikasinya dulu, ubah Distri/Event menjadi "${conflictStore}", atau pilih mode "Ke Sheet Saja".`,
          });
          return;
        }
      }

      saveDistriHistory(distriEvent);

      const payload = {
        receiveDate,
        distriEvent,
        product: selectedProduct?.product || "",
        barcode: selectedProduct?.barcode || "",
        batch,
        expDate,
        qty: Number(qty),
        keterangan: keteranganList.join("; "),
        pic,
      };
      const fingerprint = JSON.stringify({ sheet: targetSheet, payload });

      if (pendingSubmitRef.current?.fingerprint !== fingerprint) {
        pendingSubmitRef.current = {
          fingerprint,
          clientId: createReturnRequestId(),
        };
      }

      const res = await createReturn(
        payload,
        targetSheet,
        pendingSubmitRef.current.clientId
      );

      if (!res.ok) {
        setToast({ type: "error", msg: res.error });
        return;
      }

      pendingSubmitRef.current = null;

      // Flow 1 (Verifikasi SJ): Simpan juga ke sesi toko aktif untuk rekonsiliasi
      if (isVerifyMode) {
        const updatedSession = addScannedItemToSession({
          receiveDate,
          distriEvent,
          product: selectedProduct?.product || "",
          barcode: selectedProduct?.barcode || "",
          sku: selectedProduct?.sku || selectedProduct?.barcode || "",
          batch,
          expDate,
          qty: Number(qty),
          keterangan: keteranganList.join("; "),
          pic,
          targetSheet,
        });

        const totalSessionPcs = updatedSession.items.reduce((acc, i) => acc + i.qty, 0);

        navigate("/", {
          replace: true,
          state: {
            successMessage: `Data berhasil disimpan di sheet ${res.sheet} (row ${res.appendedRow})! Total toko "${distriEvent}": ${totalSessionPcs} pcs.`,
          },
        });
      } else {
        // Flow 2 (Input Manual ke Sheet Saja Tanpa Verifikasi)
        navigate("/", {
          replace: true,
          state: {
            successMessage: `Data berhasil disimpan di sheet ${res.sheet} (row ${res.appendedRow})!`,
          },
        });
      }
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
    <div className="space-y-3.5 pb-8">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`rounded-2xl px-4 py-3 text-xs font-semibold backdrop-blur-xl border shadow-xs ${
            toast.type === "success"
              ? "bg-emerald-50/90 text-emerald-900 border-emerald-200/80"
              : "bg-red-50/90 text-red-900 border-red-200/80"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Mode & Session Banner */}
      {activeSession ? (
        isVerifyMode ? (
          <div className="card px-4 py-3 flex items-center justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="bg-[#1C1917] text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shrink-0">
                  Verifikasi SJ
                </span>
                <span className="text-xs font-extrabold text-stone-900 leading-snug break-words">
                  {activeSession.storeName}
                </span>
              </div>
              <p className="text-[11px] text-stone-500 font-medium mt-0.5">
                {activeSession.noSJ ? `SJ: ${activeSession.noSJ} • ` : ""}
                Total Sesi: {activeSession.items.reduce((a, b) => a + b.qty, 0)} pcs ({activeSession.items.length} scan)
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleToggleVerifyMode(false)}
                className="text-xs font-semibold text-stone-700 bg-white/85 border border-white/90 px-3 py-1.5 rounded-full hover:bg-white transition-colors"
              >
                Ke Sheet Saja
              </button>
              <button
                type="button"
                onClick={() => navigate("/verification")}
                className="text-xs font-semibold text-white bg-[#1C1917] px-3 py-1.5 rounded-full hover:bg-stone-800 transition-colors"
              >
                Cek SJ
              </button>
            </div>
          </div>
        ) : (
          <div className="card px-4 py-3 flex items-center justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <span className="bg-stone-200/90 text-stone-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full inline-block">
                Input Manual (Sheet)
              </span>
              <p className="text-[11px] text-stone-500 font-medium mt-1">
                Simpan tanpa masuk sesi "{activeSession.storeName}".
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleVerifyMode(true)}
              className="shrink-0 text-xs font-semibold text-white bg-[#1C1917] px-3.5 py-1.5 rounded-full hover:bg-stone-800 transition-colors"
            >
              Ikut Verifikasi
            </button>
          </div>
        )
      ) : null}

      {/* Main Form Card */}
      <form onSubmit={onSubmit} className="card overflow-hidden">
        {/* Loading Progress Bar */}
        {(loadingProducts || loadingBatches) && (
          <div className="h-1 bg-white/50 overflow-hidden">
            <div className="h-full w-1/3 bg-[#1C1917] animate-pulse" />
          </div>
        )}

        <div className="p-4 space-y-4">
          {/* Header Bar: Title + Sheet Switcher */}
          <div className="flex items-center justify-between pb-3 border-b border-stone-200/70">
            <span className="text-xs font-bold text-stone-800">
              Sheet Tujuan
            </span>
            <div className="flex gap-1 bg-white/60 p-0.5 rounded-full border border-white/80">
              {(["Bagas", "Dimas"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setTargetSheet(s); saveSheet(s); }}
                  className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all ${
                    targetSheet === s
                      ? "bg-[#1C1917] text-white shadow-xs"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Section 1: Produk Selection (Full Product Name, Never Truncated) */}
          <div>
            <label className="label-field">Produk Retur</label>
            {selectedProduct ? (
              <div className="flex items-start justify-between gap-3 bg-white/80 border border-white rounded-xl px-3.5 py-3 shadow-2xs">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-stone-900 leading-snug break-words">
                    {selectedProduct.product}
                  </p>
                  <p className="text-[11px] text-stone-500 font-mono font-semibold mt-1">
                    {selectedProduct.sku} • {selectedProduct.barcode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBarcode("");
                    setProductSearch("");
                    setTimeout(() => productInputRef.current?.focus(), 60);
                  }}
                  className="shrink-0 text-xs font-semibold text-stone-700 bg-stone-100/90 hover:bg-stone-200/80 px-3 py-1 rounded-full transition-all"
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
                    className="absolute z-30 left-0 right-0 mt-1.5 bg-white/95 backdrop-blur-xl border border-stone-200/90 rounded-2xl shadow-lg max-h-56 overflow-y-auto divide-y divide-stone-100"
                  >
                    {displayedProducts.map((item, idx) => (
                      <button
                        key={item.barcode}
                        type="button"
                        data-dropdown-item
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectProduct(item)}
                        className={`w-full text-left px-3.5 py-2.5 transition-colors ${
                          idx === highlightedIdx ? "bg-teal-50/80" : "hover:bg-stone-50"
                        }`}
                      >
                        <span className="text-xs font-bold text-stone-900 block leading-snug break-words">
                          <HighlightText text={item.product} query={debouncedSearch} />
                        </span>
                        <span className="text-[11px] text-stone-500 block font-mono font-medium mt-0.5">
                          <HighlightText text={item.barcode} query={debouncedSearch} />
                          {" • "}
                          <HighlightText text={item.sku} query={debouncedSearch} />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Batch & Exp Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-field">Nomor Batch</label>
              <button
                ref={batchBtnRef}
                type="button"
                onClick={() => setBatchModal(true)}
                className={`w-full text-left input-field py-2.5 flex items-center justify-between font-mono text-xs ${
                  batch ? "text-stone-900 font-bold" : "text-stone-400"
                }`}
              >
                <span className="break-all leading-snug">{batch ? (batch === "-" ? "Tanpa batch" : batch) : "Pilih Batch..."}</span>
                <svg className="w-4 h-4 text-stone-500 shrink-0 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
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
                className="input-field text-xs py-2.5 font-semibold"
              />
            </div>
          </div>

          {/* Section 3: Receive Date + Qty */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-field">Receive Date</label>
              <input
                value={receiveDate}
                onChange={(e) => setReceiveDate(e.target.value)}
                placeholder="DD-Mon-YYYY"
                className="input-field text-xs py-2.5 font-semibold"
              />
            </div>
            <div>
              <label className="label-field">Jumlah Fisik (Qty)</label>
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

          {/* Section 4: Distri / Event + PIC */}
          <div className="grid grid-cols-2 gap-3">
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
                className="input-field text-xs py-2.5 font-semibold"
              />
              {showDistriDropdown && distriHistory.length > 0 && (
                <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white/95 backdrop-blur-xl border border-stone-200 rounded-xl shadow-lg max-h-40 overflow-y-auto divide-y divide-stone-100">
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
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-50 break-words"
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
                className="input-field text-xs py-2.5 font-semibold"
              />
            </div>
          </div>

          {/* Section 5: Keterangan (Soft Frosted Pill Chips) */}
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
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                      active
                        ? "bg-[#1C1917] text-white border-[#1C1917] shadow-xs"
                        : "bg-white/75 text-stone-700 border-white/90 hover:bg-white"
                    }`}
                  >
                    {active ? "✓ " : ""}{opt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2.5 pt-3 border-t border-stone-200/70">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="flex-1 btn-outline py-3 text-xs"
            >
              Kembali
            </button>
            <button
              type="submit"
              disabled={!canSubmit || submitting || loadingProducts || loadingBatches}
              className="flex-1 btn-primary py-3 px-4 text-xs"
            >
              {submitting
                ? "Menyimpan..."
                : isVerifyMode
                ? "Simpan & Verifikasi"
                : "Simpan ke Sheet"}
            </button>
          </div>
        </div>
      </form>

      {/* Batch Picker Modal */}
      <BatchPickerModal
        open={batchModal}
        onClose={() => setBatchModal(false)}
        product={selectedProduct}
        productBatches={productBatches}
        productBatchesLoading={loadingProductBatches}
        batches={batches}
        currentLot={batch}
        onPickExisting={handleBatchPicked}
        onCreateNew={handleBatchCreated}
      />
    </div>
  );
}
