import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BatchPickerModal from "../components/BatchPickerModal";
import {
  createReturn,
  fetchBatches,
  fetchMasterByBarcode,
  type BatchItem,
} from "../lib/api";

function todayFormatted() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

const DISTRI_STORAGE_KEY = "scan-retur-distri-history";

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
  const barcode = searchParams.get("barcode") ?? "";

  const [loadingMaster, setLoadingMaster] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [sku, setSku] = useState("");
  const [product, setProduct] = useState("");

  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [batch, setBatch] = useState("");
  const [expDate, setExpDate] = useState("");

  const [receiveDate, setReceiveDate] = useState(todayFormatted());
  const [distriEvent, setDistriEvent] = useState("");
  const [distriHistory] = useState<string[]>(getDistriHistory);
  const [showDistriDropdown, setShowDistriDropdown] = useState(false);
  const [qty, setQty] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [pic, setPic] = useState("");
  const [targetSheet, setTargetSheet] = useState<"Bagas" | "Dimas">("Bagas");

  const [batchModal, setBatchModal] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [envError] = useState<string | null>(() => {
    const url = import.meta.env.VITE_APPS_SCRIPT_URL;
    if (!url) return "VITE_APPS_SCRIPT_URL belum diisi di file .env. Aplikasi tidak bisa terhubung ke Google Sheet.";
    return null;
  });

  // Fetch master data
  useEffect(() => {
    if (!barcode) return;
    let alive = true;
    (async () => {
      setLoadingMaster(true);
      const res = await fetchMasterByBarcode(barcode);
      if (!alive) return;
      setLoadingMaster(false);
      if (!res.ok) {
        setToast({ type: "error", msg: res.error });
        return;
      }
      setSku(res.sku);
      setProduct(res.product);
    })();
    return () => { alive = false; };
  }, [barcode]);

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
      barcode.trim() &&
      product.trim() &&
      batch.trim() &&
      expDate.trim() &&
      receiveDate.trim() &&
      distriEvent.trim() &&
      Number.isFinite(q) &&
      q > 0
    );
  }, [barcode, product, batch, expDate, receiveDate, distriEvent, qty]);

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
        product,
        barcode,
        batch,
        expDate,
        qty: Number(qty),
        keterangan,
        pic,
      }, targetSheet);

      if (!res.ok) {
        setToast({ type: "error", msg: res.error });
        return;
      }

      setToast({ type: "success", msg: `✅ Tersimpan di sheet "${res.sheet}" row ${res.appendedRow}` });
      setTimeout(() => navigate("/"), 1800);
    } finally {
      setSubmitting(false);
    }
  }

  if (!barcode) {
    return (
      <div className="bg-white rounded-2xl shadow-md p-6 text-center space-y-3">
        <p className="text-gray-500">Barcode tidak ditemukan.</p>
        <button
          onClick={() => navigate("/")}
          className="bg-gray-900 text-white px-6 py-2 rounded-xl font-semibold text-sm"
        >
          Kembali ke Scan
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {/* ENV Error Banner */}
      {envError && (
        <div className="rounded-xl px-4 py-3 text-sm font-medium bg-amber-50 text-amber-800 border border-amber-300">
          ⚙️ <strong>Setup diperlukan:</strong> {envError}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium ${toast.type === "success"
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-red-50 text-red-700 border border-red-200"
            }`}
        >
          {toast.type === "success" ? "✅" : "❌"} {toast.msg}
        </div>
      )}

      {/* Form Card */}
      <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow-md overflow-hidden">
        <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <span>📋</span> Input Retur
          </h2>
          {(loadingMaster || loadingBatches) && (
            <span className="text-xs flex items-center gap-1 bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full animate-pulse">
              ⏳ Memuat data...
            </span>
          )}
        </div>

        <div className="p-4 space-y-4">
          {/* Sheet Selector */}
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">🎯 Sheet Tujuan</label>
            <div className="flex gap-2">
              {(["Bagas", "Dimas"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTargetSheet(s)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${targetSheet === s
                    ? "bg-gray-900 text-white shadow-md"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Barcode (readonly) */}
          <Field label="Barcode">
            <input
              value={barcode}
              readOnly
              className="input-field bg-gray-100 cursor-not-allowed font-mono"
            />
          </Field>

          {/* SKU (readonly) */}
          <Field label="SKU">
            <input
              value={loadingMaster ? "Loading..." : sku}
              readOnly
              className="input-field bg-gray-100 cursor-not-allowed"
            />
          </Field>

          {/* Product (readonly) */}
          <Field label="Product">
            <input
              value={loadingMaster ? "Loading..." : product}
              readOnly
              className="input-field bg-gray-100 cursor-not-allowed"
            />
          </Field>

          {/* Batch (picker) */}
          <Field label="Batch">
            <button
              type="button"
              onClick={() => setBatchModal(true)}
              className="input-field text-left flex items-center justify-between"
            >
              <span className={batch ? "text-gray-900 font-medium" : "text-gray-400"}>
                {batch || "Pilih / Buat batch"}
              </span>
              <span className="text-gray-400">▼</span>
            </button>
          </Field>

          {/* Exp Date — format Mmm-YYYY */}
          <Field label="Exp Date">
            <input
              value={expDate}
              onChange={(e) => setExpDate(e.target.value)}
              placeholder="Mis: Jun-2027"
              className="input-field"
            />
            <p className="text-xs text-gray-400 mt-1">Format: Bln-Tahun (contoh: Jun-2027, Agu-2025)</p>
          </Field>

          {/* Receive Date — format DD-MM-YYYY */}
          <Field label="Receive Date">
            <input
              value={receiveDate}
              onChange={(e) => setReceiveDate(e.target.value)}
              placeholder="DD-MM-YYYY"
              className="input-field"
            />
            <p className="text-xs text-gray-400 mt-1">Format: DD-MM-YYYY (contoh: 17-03-2026)</p>
          </Field>

          {/* Distri/Event — dropdown + input baru */}
          <Field label="Distri/Event">
            <div className="relative">
              {distriHistory.length > 0 && !distriEvent ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowDistriDropdown(!showDistriDropdown)}
                    className="input-field text-left flex items-center justify-between"
                  >
                    <span className="text-gray-400">Pilih atau ketik baru...</span>
                    <span className="text-gray-400">▼</span>
                  </button>
                  {showDistriDropdown && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {distriHistory.map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setDistriEvent(item);
                            setShowDistriDropdown(false);
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                        >
                          {item}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setDistriEvent(" ");
                          setShowDistriDropdown(false);
                          setTimeout(() => setDistriEvent(""), 0);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-blue-600 font-semibold hover:bg-blue-50"
                      >
                        + Ketik baru...
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={distriEvent}
                    onChange={(e) => setDistriEvent(e.target.value)}
                    placeholder="Mis: Event BFF"
                    className="input-field flex-1"
                    autoFocus={distriHistory.length > 0}
                  />
                  {distriHistory.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setDistriEvent("");
                        setShowDistriDropdown(false);
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700 px-2"
                    >
                      Pilih ▼
                    </button>
                  )}
                </div>
              )}
            </div>
          </Field>

          {/* Qty */}
          <Field label="Qty">
            <input
              type="number"
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Mis: 119"
              min="1"
              className="input-field"
            />
          </Field>

          {/* Keterangan */}
          <Field label="Keterangan">
            <input
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Opsional"
              className="input-field"
            />
          </Field>

          {/* PIC */}
          <Field label="PIC">
            <input
              value={pic}
              onChange={(e) => setPic(e.target.value)}
              placeholder="Opsional"
              className="input-field"
            />
          </Field>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors"
            >
              ← Scan Lagi
            </button>
            <button
              type="submit"
              disabled={!canSubmit || submitting || loadingMaster || loadingBatches}
              className="flex-1 bg-gray-900 text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 disabled:opacity-40 transition-colors"
            >
              {submitting ? "Menyimpan..." : "💾 Simpan"}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 mx-4 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-lg text-gray-900">Konfirmasi Simpan</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <p><span className="font-semibold text-gray-800">🎯 Sheet:</span> <span className="font-bold text-gray-900">{targetSheet}</span></p>
              <p><span className="font-semibold text-gray-800">Produk:</span> {product}</p>
              <p><span className="font-semibold text-gray-800">Barcode:</span> {barcode}</p>
              <p><span className="font-semibold text-gray-800">Batch:</span> {batch} — Exp: {expDate}</p>
              <p><span className="font-semibold text-gray-800">Distri/Event:</span> {distriEvent}</p>
              <p><span className="font-semibold text-gray-800">Qty:</span> {qty}</p>
              {pic && <p><span className="font-semibold text-gray-800">PIC:</span> {pic}</p>}
              {keterangan && <p><span className="font-semibold text-gray-800">Keterangan:</span> {keterangan}</p>}
            </div>
            <p className="text-sm text-gray-500">Yakin ingin menyimpan data retur ini?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={doSubmit}
                className="flex-1 bg-gray-900 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors"
              >
                Ya, Simpan
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
      <label className="block text-sm font-semibold text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
