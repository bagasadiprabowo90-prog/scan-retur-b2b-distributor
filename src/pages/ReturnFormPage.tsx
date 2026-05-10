import { useEffect, useMemo, useState } from "react";
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
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((item) =>
      item.product.toLowerCase().includes(q) ||
      item.barcode.toLowerCase().includes(q) ||
      item.sku.toLowerCase().includes(q)
    );
  }, [products, productSearch]);

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

        <div className="p-4 space-y-4">
          {/* Sheet Selector */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Sheet Tujuan</label>
            <div className="flex gap-2">
              {(["Bagas", "Dimas"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setTargetSheet(s); saveSheet(s); }}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${targetSheet === s
                    ? "bg-gray-900 text-white"
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
                type="text"
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setSelectedBarcode("");
                  setShowProductDropdown(true);
                }}
                onFocus={() => setShowProductDropdown(true)}
                placeholder={loadingProducts ? "Memuat..." : "Cari produk / barcode / SKU"}
                disabled={loadingProducts}
                className="input-field"
              />
              {showProductDropdown && filteredProducts.length > 0 && (
                <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-gray-100 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                  {filteredProducts.slice(0, 50).map((item) => (
                    <button
                      key={item.barcode}
                      type="button"
                      onClick={() => {
                        setSelectedBarcode(item.barcode);
                        setProductSearch(item.product);
                        setShowProductDropdown(false);
                      }}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
                    >
                      <span className="text-sm font-medium text-gray-900 block truncate">{item.product}</span>
                      <span className="text-[11px] text-gray-400">{item.barcode} · {item.sku}</span>
                    </button>
                  ))}
                  {filteredProducts.length > 50 && (
                    <div className="px-3.5 py-2 text-[11px] text-gray-400 text-center bg-gray-50">
                      +{filteredProducts.length - 50} produk lagi
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
            <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-400">Barcode</span>
                <span className="font-mono font-medium text-gray-700">{selectedProduct.barcode}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-400">SKU</span>
                <span className="font-medium text-gray-700">{selectedProduct.sku}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-400">Produk</span>
                <span className="font-medium text-gray-700 text-right max-w-[60%] truncate">{selectedProduct.product}</span>
              </div>
            </div>
          )}

          <div className="h-px bg-gray-100" />

          {/* Batch */}
          <Field label="Batch">
            <button
              type="button"
              onClick={() => setBatchModal(true)}
              className="input-field text-left flex items-center justify-between"
            >
              <span className={batch ? "text-gray-900 font-medium" : "text-gray-400"}>
                {batch || "Pilih / Buat batch"}
              </span>
              <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </Field>

          {/* Exp Date */}
          <Field label="Exp Date">
            <input value={expDate} onChange={(e) => setExpDate(e.target.value)} placeholder="Sep 2027" className="input-field" />
          </Field>

          {/* Two-column: Receive Date + Qty */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Receive Date">
              <input value={receiveDate} onChange={(e) => setReceiveDate(e.target.value)} placeholder="DD-Mon-YYYY" className="input-field" />
            </Field>
            <Field label="Qty">
              <input type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" min="1" className="input-field" />
            </Field>
          </div>

          {/* Distri/Event */}
          <Field label="Distri / Event">
            <div className="relative">
              <input
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
                <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-gray-100 rounded-xl shadow-lg max-h-48 overflow-y-auto">
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
                        className="w-full text-left px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
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
            <div className="space-y-1.5 bg-gray-50 rounded-xl p-3">
              {KETERANGAN_OPTIONS.map((opt) => (
                <label key={opt} className="flex items-center gap-2.5 cursor-pointer py-0.5">
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
                    className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 shrink-0"
                  />
                  <span className="text-sm text-gray-600">{opt}</span>
                </label>
              ))}
            </div>
            {keteranganList.length > 0 && (
              <p className="text-[11px] text-gray-400 mt-1.5">{keteranganList.join("; ")}</p>
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
        onPickExisting={(item) => {
          setBatch(item.lot);
          setExpDate(item.expDate || "");
          setBatchModal(false);
        }}
        onCreateNew={(lot, exp) => {
          setBatch(lot);
          setExpDate(exp);
          setBatchModal(false);
        }}
      />

      {/* Confirm Dialog */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setConfirmOpen(false)} />
          <div className="relative card p-5 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-base text-gray-900">Konfirmasi</h3>
            <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm">
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
      <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className={`text-gray-700 font-medium text-right truncate ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
