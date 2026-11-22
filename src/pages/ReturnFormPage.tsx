import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, ChevronDown, ChevronLeft, FileCheck2, Layers, Minus, Plus, Save, Store, Trash2, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import BatchPickerModal from "../components/BatchPickerModal";
import { getActiveSession, addScannedItemToSession, getSessionStoreConflict, getDistriHistory, saveDistriHistory, normalizeSkuKey, type StoreSession } from "../lib/session";
import {
  createReturn,
  createReturnRequestId,
  fetchBatches,
  fetchBatchesForBarcode,
  fetchProducts,
  type BatchItem,
  type ProductItem,
  type ReturnHistoryItem,
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

type ReturnLine = { id: string; qty: string; keterangan: string[] };

function newLine(): ReturnLine {
  return { id: `ln_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, qty: "", keterangan: [] };
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
  // Satu produk+batch bisa punya beberapa baris kondisi (mis. 3 Ok, 2 Pudar, 1 Sticker harga)
  const [lines, setLines] = useState<ReturnLine[]>(() => [newLine()]);
  const [sessionSnap, setSessionSnap] = useState<StoreSession | null>(activeSession);
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
  // fingerprint baris -> clientId, supaya retry tidak menggandakan baris di Sheet
  const pendingIdsRef = useRef<Map<string, string>>(new Map());

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

  const totalLineQty = useMemo(
    () => lines.reduce((acc, l) => acc + (Number(l.qty) > 0 ? Number(l.qty) : 0), 0),
    [lines]
  );

  const linesValid = useMemo(
    () =>
      lines.length > 0 &&
      lines.every((l) => Number.isFinite(Number(l.qty)) && Number(l.qty) > 0 && l.keterangan.length > 0),
    [lines]
  );

  const canSubmit = useMemo(
    () =>
      !!selectedProduct &&
      !!batch.trim() &&
      !!expDate.trim() &&
      !!receiveDate.trim() &&
      !!distriEvent.trim() &&
      linesValid,
    [selectedProduct, batch, expDate, receiveDate, distriEvent, linesValid]
  );

  // Info klaim SJ untuk SKU terpilih (hanya saat verifikasi sesi)
  const claimInfo = useMemo(() => {
    if (!isVerifyMode || !sessionSnap || !selectedProduct) return null;
    const key = normalizeSkuKey(selectedProduct.sku, selectedProduct.product, selectedProduct.barcode);
    const claim = sessionSnap.claims[key];
    const physical = sessionSnap.items
      .filter((i) => normalizeSkuKey(i.sku, i.product, i.barcode) === key)
      .reduce((acc, i) => acc + i.qty, 0);
    return {
      inSj: !!claim,
      claimQty: claim?.claimQty ?? 0,
      physicalQty: physical,
      remaining: Math.max(0, (claim?.claimQty ?? 0) - physical),
    };
  }, [isVerifyMode, sessionSnap, selectedProduct]);

  const isNewBatch =
    !!batch && batch !== "-" && productBatches.length > 0 && !productBatches.some((b) => b.lot === batch);

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

  const updateLine = useCallback((id: string, patch: Partial<ReturnLine>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const adjustLineQty = useCallback((id: string, delta: number) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = Math.max(1, (Number(l.qty) || 0) + delta);
        return { ...l, qty: String(next) };
      })
    );
  }, []);

  const toggleLineKeterangan = useCallback((id: string, opt: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        if (opt === "Ok") {
          return { ...l, keterangan: l.keterangan.includes("Ok") ? [] : ["Ok"] };
        }
        const withoutOk = l.keterangan.filter((v) => v !== "Ok");
        return {
          ...l,
          keterangan: withoutOk.includes(opt) ? withoutOk.filter((v) => v !== opt) : [...withoutOk, opt],
        };
      })
    );
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

  type AfterSave = "scan" | "list" | "batch";

  async function doSubmit(after: AfterSave) {
    if (submitting || !canSubmit || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    setToast(null);

    const savedLineIds = new Set<string>();
    let lastSheet = targetSheet as string;
    let lastRow = 0;

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

      for (const line of lines) {
        const keterangan = line.keterangan.join("; ");
        const payload = {
          receiveDate,
          distriEvent,
          product: selectedProduct?.product || "",
          barcode: selectedProduct?.barcode || "",
          batch,
          expDate,
          qty: Number(line.qty),
          keterangan,
          pic,
        };
        const fingerprint = JSON.stringify({ sheet: targetSheet, payload, lineId: line.id });
        let clientId = pendingIdsRef.current.get(fingerprint);
        if (!clientId) {
          clientId = createReturnRequestId();
          pendingIdsRef.current.set(fingerprint, clientId);
        }

        const res = await createReturn(payload, targetSheet, clientId);
        if (!res.ok) {
          const done = savedLineIds.size;
          setToast({
            type: "error",
            msg:
              done > 0
                ? `${done} baris sudah tersimpan, baris berikutnya gagal: ${res.error}. Tekan simpan lagi untuk melanjutkan sisanya.`
                : res.error,
          });
          return;
        }

        pendingIdsRef.current.delete(fingerprint);
        savedLineIds.add(line.id);
        lastSheet = res.sheet;
        lastRow = res.appendedRow;

        // Update cache riwayat lokal langsung agar sinkron seketika
        try {
          const raw = localStorage.getItem("scan-retur-history-cache");
          const parsed = raw ? JSON.parse(raw) : { history: [], ts: Date.now() };
          const newHistItem: ReturnHistoryItem = {
            sheet: res.sheet,
            rowNumber: res.appendedRow,
            receiveDate,
            distriEvent,
            product: selectedProduct?.product || "",
            barcode: selectedProduct?.barcode || "",
            batch,
            expDate,
            qty: Number(line.qty),
            keterangan,
            pic,
          };
          const updatedHistory = [newHistItem, ...(Array.isArray(parsed.history) ? parsed.history : [])];
          localStorage.setItem(
            "scan-retur-history-cache",
            JSON.stringify({ history: updatedHistory, ts: Date.now() })
          );
        } catch {}

        // Flow 1 (Verifikasi SJ): simpan juga ke sesi toko aktif untuk rekonsiliasi
        if (isVerifyMode) {
          const updatedSession = addScannedItemToSession({
            receiveDate,
            distriEvent,
            product: selectedProduct?.product || "",
            barcode: selectedProduct?.barcode || "",
            sku: selectedProduct?.sku || selectedProduct?.barcode || "",
            batch,
            expDate,
            qty: Number(line.qty),
            keterangan,
            pic,
            targetSheet,
          });
          setSessionSnap(updatedSession);
        }
      }

      const savedPcs = totalLineQty;
      const savedRows = lines.length;
      const summary = `${savedRows} baris (${savedPcs} pcs) tersimpan di sheet ${lastSheet} (row ${lastRow}).`;

      if (after === "batch") {
        // Tetap di produk yang sama, siap input batch lain
        setLines([newLine()]);
        setBatch("");
        setExpDate("");
        setBatchModal(true);
        setToast({ type: "success", msg: `${summary} Pilih batch berikutnya untuk produk ini.` });
        return;
      }

      const sessionNote = isVerifyMode
        ? ` Total toko "${distriEvent}": ${getActiveSession()?.items.reduce((a, i) => a + i.qty, 0) ?? 0} pcs.`
        : "";
      navigate(after === "list" && isVerifyMode ? "/verification" : "/", {
        replace: true,
        state: { successMessage: `Data berhasil disimpan: ${summary}${sessionNote}` },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan data";
      setToast({ type: "error", msg });
    } finally {
      // Baris yang sudah tersimpan jangan ikut terkirim ulang pada retry
      if (savedLineIds.size > 0) {
        setLines((prev) => {
          const rest = prev.filter((l) => !savedLineIds.has(l.id));
          return rest.length > 0 ? rest : prev;
        });
      }
      setSubmitting(false);
      submitLockRef.current = false;
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void doSubmit("scan");
  }

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

      {/* Mode & Session Bento Banner */}
      {activeSession ? (
        isVerifyMode ? (
          <div className="bg-white border border-slate-200/90 rounded-3xl p-4 shadow-2xs flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs ">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Sesi Siap
                </span>
                <span className="text-xs font-black text-slate-900 leading-snug break-words">
                  {activeSession.storeName}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">
                {activeSession.noSJ ? `SJ #${activeSession.noSJ} · ` : ""}
                Total: <strong className="text-slate-800 font-mono">{activeSession.items.reduce((a, b) => a + b.qty, 0)} pcs</strong> ({activeSession.items.length} scan)
              </p>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleToggleVerifyMode(false)}
                className="min-h-[32px] px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer transition-colors"
              >
                Ke Sheet Saja
              </button>
              <button
                type="button"
                onClick={() => navigate("/verification")}
                className="min-h-[32px] px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer transition-colors flex items-center justify-center gap-1 shadow-2xs"
              >
                <FileCheck2 className="w-3 h-3 text-emerald-400" />
                <span>Cek SJ</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200/90 rounded-3xl p-4 shadow-2xs flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-xs font-extrabold ">
                Input Manual (Sheet Saja)
              </span>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Data akan disimpan langsung tanpa masuk sesi "{activeSession.storeName}".
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleVerifyMode(true)}
              className="shrink-0 min-h-[36px] px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer transition-colors shadow-2xs"
            >
              Ikut Sesi
            </button>
          </div>
        )
      ) : null}

      {/* Main Form Bento Card */}
      <form onSubmit={onSubmit} className="bg-white border border-slate-200/90 rounded-3xl shadow-2xs overflow-hidden">
        {/* Loading Progress Bar */}
        {(loadingProducts || loadingBatches) && (
          <div className="h-1 bg-slate-100 overflow-hidden">
            <div className="h-full w-1/3 bg-slate-900 animate-pulse" />
          </div>
        )}

        <div className="p-4 space-y-4">
          {/* Header Bar: Title + Sheet Switcher */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <span className="text-xs font-extrabold text-slate-900 block">
                Sheet Tujuan
              </span>
              <span className="text-xs text-slate-400 font-medium">Tab spreadsheet target</span>
            </div>
            <div className="flex p-0.5 bg-slate-100 rounded-xl border border-slate-200/80">
              {(["Bagas", "Dimas"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setTargetSheet(s); saveSheet(s); }}
                  className={`min-h-[36px] px-4 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                    targetSheet === s
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Section 1: Produk Selection (Full Product Name, Never Truncated) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500  block">
              Produk Retur
            </label>
            {selectedProduct ? (
              <div className="flex items-start justify-between gap-3 bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold text-slate-900 leading-snug break-words">
                    {selectedProduct.product}
                  </p>
                  <p className="text-xs text-slate-500 font-mono font-bold mt-1">
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
                  className="shrink-0 min-h-[32px] px-3 py-1 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 transition-all cursor-pointer shadow-2xs"
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
                  className="w-full min-h-[44px] px-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                />
                {showProductDropdown && displayedProducts.length > 0 && (
                  <div
                    ref={dropdownRef}
                    className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100"
                  >
                    {displayedProducts.map((item, idx) => (
                      <button
                        key={item.barcode}
                        type="button"
                        data-dropdown-item
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectProduct(item)}
                        className={`w-full text-left px-3.5 py-2.5 transition-colors cursor-pointer ${
                          idx === highlightedIdx ? "bg-emerald-50/70" : "hover:bg-slate-50"
                        }`}
                      >
                        <span className="text-xs font-bold text-slate-900 block leading-snug break-words">
                          <HighlightText text={item.product} query={debouncedSearch} />
                        </span>
                        <span className="text-xs text-slate-500 block font-mono font-medium mt-0.5">
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
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500  block">
                Nomor Batch (Lot)
              </label>
              <button
                ref={batchBtnRef}
                type="button"
                onClick={() => setBatchModal(true)}
                className={`w-full min-h-[44px] px-3 text-left rounded-xl bg-slate-50 hover:bg-slate-100/70 border border-slate-200 flex items-center justify-between font-mono text-xs transition-colors cursor-pointer ${
                  batch ? "text-slate-900 font-bold" : "text-slate-400"
                }`}
              >
                <span className="break-all leading-snug truncate">{batch ? (batch === "-" ? "Tanpa batch" : batch) : "Pilih Batch..."}</span>
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500  block">
                Exp Date
              </label>
              <input
                value={expDate}
                onChange={(e) => setExpDate(e.target.value)}
                placeholder="Mis: Sep 2027"
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
              />
            </div>
          </div>

          {/* Section 3: Receive Date + ringkasan klaim */}
          <div className="grid grid-cols-2 gap-3 items-start">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500  block">
                Receive Date
              </label>
              <input
                value={receiveDate}
                onChange={(e) => setReceiveDate(e.target.value)}
                placeholder="DD-Mon-YYYY"
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-500 block">Total diinput</span>
              <div className="min-h-[44px] px-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center text-sm font-black font-mono text-emerald-800">
                {totalLineQty} pcs
              </div>
            </div>
          </div>

          {/* Section 3b: Info klaim SJ untuk SKU ini */}
          {claimInfo && (
            <div
              className={`rounded-2xl border p-3 text-xs leading-snug ${
                !claimInfo.inSj
                  ? "bg-indigo-50 border-indigo-200 text-indigo-900"
                  : totalLineQty > claimInfo.remaining
                  ? "bg-amber-50 border-amber-200 text-amber-900"
                  : "bg-slate-50 border-slate-200 text-slate-700"
              }`}
            >
              {!claimInfo.inSj ? (
                <p className="font-bold">SKU ini tidak ada di klaim SJ. Barang akan tercatat sebagai "Tidak ada di SJ".</p>
              ) : (
                <>
                  <p className="font-bold">
                    Klaim SJ {claimInfo.claimQty} pcs · sudah discan {claimInfo.physicalQty} · sisa {claimInfo.remaining}
                  </p>
                  {totalLineQty > claimInfo.remaining && (
                    <p className="mt-0.5">
                      Total yang akan disimpan ({totalLineQty}) melebihi sisa klaim ({claimInfo.remaining}). Pastikan qty benar.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {isNewBatch && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
              Batch "{batch}" belum ada di master untuk produk ini. Cek ulang tulisan batch di kemasan.
            </div>
          )}

          {/* Section 3c: Qty & Kondisi per baris */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-slate-500 block">
              Qty &amp; Kondisi (1 baris = 1 kondisi)
            </label>
            {lines.map((line, li) => {
              const qtyNum = Number(line.qty) || 0;
              return (
                <div key={line.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-400 w-5 shrink-0">#{li + 1}</span>
                    <div className="flex-1 flex items-center rounded-2xl border border-slate-200 bg-white overflow-hidden">
                      <button
                        type="button"
                        onClick={() => adjustLineQty(line.id, -1)}
                        disabled={qtyNum <= 1}
                        className="h-12 w-12 flex items-center justify-center text-slate-700 active:bg-slate-200 shrink-0 disabled:opacity-25"
                        aria-label="Kurangi qty"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        ref={li === 0 ? qtyRef : undefined}
                        type="number"
                        inputMode="numeric"
                        value={line.qty}
                        onChange={(e) => updateLine(line.id, { qty: e.target.value })}
                        placeholder="0"
                        min="1"
                        className="w-full text-center font-black font-mono text-lg py-2.5 bg-transparent border-x border-slate-200 focus:outline-none text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => adjustLineQty(line.id, 1)}
                        className="h-12 w-12 flex items-center justify-center text-slate-700 active:bg-slate-200 shrink-0"
                        aria-label="Tambah qty"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLines((prev) => prev.filter((l) => l.id !== line.id))}
                        className="h-12 w-12 shrink-0 flex items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 hover:text-red-600"
                        aria-label="Hapus baris"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex gap-1.5">
                    {[1, 5, 10].map((add) => (
                      <button
                        key={add}
                        type="button"
                        onClick={() => adjustLineQty(line.id, add)}
                        className="flex-1 min-h-[40px] rounded-xl bg-white active:scale-95 text-slate-700 text-sm font-bold border border-slate-200"
                      >
                        +{add}
                      </button>
                    ))}
                    {claimInfo && claimInfo.inSj && claimInfo.remaining > 0 && lines.length === 1 && (
                      <button
                        type="button"
                        onClick={() => updateLine(line.id, { qty: String(claimInfo.remaining) })}
                        className="flex-1 min-h-[40px] rounded-xl bg-teal-50 border border-teal-300 text-teal-800 text-sm font-bold active:scale-95"
                      >
                        = sisa {claimInfo.remaining}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {KETERANGAN_OPTIONS.map((opt) => {
                      const active = line.keterangan.includes(opt);
                      const isOk = opt === "Ok";
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => toggleLineKeterangan(line.id, opt)}
                          className={`min-h-[44px] px-2.5 py-1.5 rounded-xl text-xs font-bold text-left leading-snug border active:scale-[0.98] ${
                            isOk ? "col-span-2 text-center text-sm" : ""
                          } ${
                            active
                              ? isOk
                                ? "bg-emerald-600 text-white border-emerald-600"
                                : "bg-red-600 text-white border-red-600"
                              : "bg-white text-slate-700 border-slate-300"
                          }`}
                        >
                          {active ? "✓ " : ""}
                          {isOk ? "Semua OK" : opt}
                        </button>
                      );
                    })}
                  </div>
                  {line.keterangan.length === 0 && (
                    <p className="text-xs font-bold text-red-600">Pilih kondisi barang (wajib).</p>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, newLine()])}
              className="w-full min-h-[46px] rounded-2xl border-2 border-dashed border-slate-300 text-sm font-bold text-slate-700 flex items-center justify-center gap-1.5 active:bg-slate-100"
            >
              <Plus className="w-4 h-4" />
              Tambah kondisi lain (batch sama)
            </button>
          </div>

          {/* Section 4: Distri / Event + PIC */}
          <div className="grid grid-cols-2 gap-3">
            <div className="relative space-y-1.5">
              <label className="text-xs font-bold text-slate-500  block">
                Distri / Event
              </label>
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
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
              />
              {showDistriDropdown && distriHistory.length > 0 && (
                <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
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
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 break-words cursor-pointer"
                      >
                        {item}
                      </button>
                    ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500  block">
                PIC
              </label>
              <input
                value={pic}
                onChange={(e) => setPic(e.target.value)}
                placeholder="PIC"
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
              />
            </div>
          </div>

          {/* Submit Action Buttons */}
          <div className="space-y-2 pt-3 border-t border-slate-100">
            <button
              type="submit"
              disabled={!canSubmit || submitting || loadingProducts || loadingBatches}
              className="w-full min-h-[52px] rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-extrabold shadow-sm active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4 text-emerald-400" />
              <span>{submitting ? "Menyimpan..." : "Simpan & Scan Berikutnya"}</span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void doSubmit("batch")}
                disabled={!canSubmit || submitting}
                className="min-h-[46px] rounded-2xl bg-teal-50 border border-teal-300 text-teal-900 text-xs font-extrabold disabled:opacity-50 active:scale-[0.98]"
              >
                Simpan & Batch Lain
              </button>
              {isVerifyMode ? (
                <button
                  type="button"
                  onClick={() => void doSubmit("list")}
                  disabled={!canSubmit || submitting}
                  className="min-h-[46px] rounded-2xl bg-slate-100 border border-slate-200 text-slate-800 text-xs font-extrabold disabled:opacity-50 active:scale-[0.98]"
                >
                  Simpan & Ke Daftar SJ
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="min-h-[46px] rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 text-xs font-extrabold"
                >
                  Kembali
                </button>
              )}
            </div>
            {isVerifyMode && (
              <button
                type="button"
                onClick={() => navigate("/")}
                className="w-full min-h-[40px] text-xs font-bold text-slate-500"
              >
                Batal / Kembali
              </button>
            )}
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
