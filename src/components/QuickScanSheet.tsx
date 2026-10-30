import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Minus, Plus, RotateCcw, Store } from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  addBatch,
  createReturn,
  createReturnRequestId,
  fetchBatchesForBarcode,
  type BatchItem,
  type ProductItem,
} from "../lib/api";
import {
  addScannedItemToSession,
  getSessionStoreConflict,
  getTodayReceiveDate,
  type StoreSession,
} from "../lib/session";
import Sheet from "./ui/Sheet";
import Button from "./ui/Button";

const QUICK_KETERANGAN = [
  "Ok",
  "Packaging Rusak, Penyok, Sobek, Kotor",
  "Tidak ada seal / Seal lepas",
  "Defect (Pecah, Rusak)",
];

type Props = {
  barcode: string | null;
  product: ProductItem | null;
  session: StoreSession | null;
  onCloseAndResume: () => void;
  onSavedAndResume: (updatedSession: StoreSession, msg: string) => void;
  onOpenFullForm: (barcode: string) => void;
};

export default function QuickScanSheet({
  barcode,
  product,
  session,
  onCloseAndResume,
  onSavedAndResume,
  onOpenFullForm,
}: Props) {
  const { user } = useAuth();
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [batch, setBatch] = useState("");
  const [expDate, setExpDate] = useState("");
  const [customBatchMode, setCustomBatchMode] = useState(false);
  const [newLot, setNewLot] = useState("");
  const [newExp, setNewExp] = useState("");
  const [qty, setQty] = useState("1");
  const [keterangan, setKeterangan] = useState("Ok");
  const [storeName, setStoreName] = useState("");
  const [targetSheet, setTargetSheet] = useState<"Bagas" | "Dimas">(
    () => session?.targetSheet || (user?.displayName === "Dimas" ? "Dimas" : "Bagas")
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const qtyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!barcode) return;
    setQty("1");
    setKeterangan("Ok");
    setError("");
    setSaving(false);
    setCustomBatchMode(false);
    setNewLot("");
    setNewExp("");
    setStoreName(session?.storeName || "");
    setTargetSheet(session?.targetSheet || (user?.displayName === "Dimas" ? "Dimas" : "Bagas"));

    if (!product) {
      setBatches([]);
      setBatch("");
      setExpDate("");
      return;
    }

    let alive = true;
    setLoadingBatches(true);
    setBatch("");
    setExpDate("");
    fetchBatchesForBarcode(product.barcode).then((res) => {
      if (!alive) return;
      setLoadingBatches(false);
      const list = res.ok ? res.batches : [];
      setBatches(list);
      if (list.length === 1) {
        setBatch(list[0].lot);
        setExpDate(list[0].expDate || "-");
      } else if (list.length === 0) {
        setBatch("-");
        setExpDate("-");
      }
    });

    return () => {
      alive = false;
    };
  }, [barcode, product, session, user?.displayName]);

  if (!barcode) return null;

  const effectiveStore = (session?.storeName || storeName).trim();
  const effectiveBatch = customBatchMode ? newLot.trim().toUpperCase() : batch.trim();
  const effectiveExp = customBatchMode ? newExp.trim() || "-" : expDate.trim() || "-";
  const numQty = Number(qty);
  const canSave =
    !!product &&
    !!effectiveStore &&
    !!effectiveBatch &&
    Number.isFinite(numQty) &&
    numQty > 0 &&
    !saving;

  const handleSave = async () => {
    if (!product || !canSave) return;
    setSaving(true);
    setError("");

    try {
      const conflict = getSessionStoreConflict(effectiveStore);
      if (conflict) {
        setError(`Sesi aktif milik toko "${conflict}".`);
        setSaving(false);
        return;
      }

      if (customBatchMode && effectiveBatch && effectiveBatch !== "-") {
        await addBatch(effectiveBatch, effectiveExp, product).catch(() => {});
      }

      const receiveDate = session?.receiveDate || getTodayReceiveDate();
      const pic = user?.displayName || "PIC";

      const payload = {
        receiveDate,
        distriEvent: effectiveStore,
        product: product.product,
        barcode: product.barcode,
        batch: effectiveBatch,
        expDate: effectiveExp,
        qty: numQty,
        keterangan,
        pic,
      };

      const res = await createReturn(payload, targetSheet, createReturnRequestId());
      if (!res.ok) {
        setError(res.error || "Gagal menyimpan ke Spreadsheet.");
        setSaving(false);
        return;
      }

      const updated = addScannedItemToSession({
        ...payload,
        sku: product.sku || product.barcode,
        targetSheet,
      });

      onSavedAndResume(
        updated,
        `✓ ${product.product} (${numQty} pcs · Lot ${effectiveBatch}) tersimpan!`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan scan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={!!barcode}
      onClose={onCloseAndResume}
      title={product ? "Hasil Scan Produk" : "Barcode Tidak Dikenal"}
      footer={
        product ? (
          <>
            <Button
              variant="secondary"
              icon={<ExternalLink className="w-4 h-4" />}
              onClick={() => onOpenFullForm(barcode)}
            >
              Form Lengkap
            </Button>
            <Button
              variant="primary"
              block
              disabled={!canSave}
              icon={<Check className="w-4 h-4" />}
              onClick={() => void handleSave()}
            >
              {saving ? "Menyimpan..." : "Simpan & Scan Lagi"}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              block
              icon={<RotateCcw className="w-4 h-4" />}
              onClick={onCloseAndResume}
            >
              Scan Ulang
            </Button>
            <Button
              variant="primary"
              block
              onClick={() => onOpenFullForm(barcode)}
            >
              Pilih Produk Manual
            </Button>
          </>
        )
      }
    >
      {!product ? (
        <div className="space-y-2 py-2 text-center">
          <p className="font-mono text-sm font-bold text-gray-900 bg-gray-100 py-2 px-3 rounded-xl">
            {barcode}
          </p>
          <p className="text-xs text-gray-600">
            Barcode ini belum ditemukan di master produk. Anda bisa scan ulang atau pilih produk
            secara manual.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Product Header */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
            <p className="text-sm font-bold text-gray-900 leading-snug">{product.product}</p>
            <p className="text-xs text-emerald-800 font-mono mt-0.5">
              {product.sku} · {product.barcode}
            </p>
          </div>

          {/* Store Input if no active session */}
          {!session ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="label-field">Nama Toko / Distri</label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Mis: Sociolla PIM..."
                  className="input-field text-xs py-2 font-semibold"
                />
              </div>
              <div>
                <label className="label-field">Sheet</label>
                <div className="flex bg-gray-100 p-0.5 rounded-xl">
                  {(["Bagas", "Dimas"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setTargetSheet(s)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${
                        targetSheet === s ? "bg-primary text-white" : "text-gray-600"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-200">
              <Store className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden="true" />
              <span className="truncate">
                Toko: <strong>{session.storeName}</strong> · Sheet {session.targetSheet}
              </span>
            </div>
          )}

          {/* Batch Selection */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label-field mb-0">Pilih Nomor Batch</label>
              <button
                type="button"
                onClick={() => setCustomBatchMode((v) => !v)}
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                {customBatchMode ? "Pilih dari daftar" : "+ Batch baru / manual"}
              </button>
            </div>

            {customBatchMode ? (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newLot}
                  onChange={(e) => setNewLot(e.target.value.toUpperCase())}
                  placeholder="Nomor Lot (mis: CBF2801)"
                  className="input-field text-xs py-2 font-mono uppercase"
                />
                <input
                  type="text"
                  value={newExp}
                  onChange={(e) => setNewExp(e.target.value)}
                  placeholder="Exp (mis: Sep 2027)"
                  className="input-field text-xs py-2"
                />
              </div>
            ) : loadingBatches ? (
              <div className="flex gap-1.5 py-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 w-24 rounded-xl bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto py-0.5">
                {batches.map((b, idx) => {
                  const active = batch === b.lot;
                  return (
                    <button
                      key={`${b.lot}-${idx}`}
                      type="button"
                      onClick={() => {
                        setBatch(b.lot);
                        setExpDate(b.expDate || "-");
                        setTimeout(() => qtyInputRef.current?.focus(), 50);
                      }}
                      className={`px-3 py-1.5 rounded-xl border text-left transition-all ${
                        active
                          ? "bg-primary text-white border-primary shadow-xs"
                          : "bg-white text-gray-800 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <span className="font-mono font-bold text-xs block">{b.lot}</span>
                      <span
                        className={`text-xs block ${
                          active ? "text-gray-300" : "text-gray-500"
                        }`}
                      >
                        Exp {b.expDate || "-"}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setBatch("-");
                    setExpDate("-");
                  }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                    batch === "-"
                      ? "bg-primary text-white border-primary"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  Tanpa Batch (-)
                </button>
              </div>
            )}
          </div>

          {/* Qty Stepper + Presets */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label-field mb-0">Jumlah (Qty)</label>
              <div className="flex gap-1">
                {[1, 2, 5, 10].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setQty(String(n))}
                    className={`px-2 py-0.5 rounded-md text-xs font-bold border ${
                      Number(qty) === n
                        ? "bg-primary text-white border-primary"
                        : "bg-gray-100 text-gray-700 border-gray-200"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Kurangi jumlah"
                onClick={() => setQty(String(Math.max(1, (Number(qty) || 1) - 1)))}
                className="w-11 h-11 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-700"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                ref={qtyInputRef}
                type="number"
                inputMode="numeric"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="input-field text-center text-lg font-black py-2 tabular-nums flex-1"
              />
              <button
                type="button"
                aria-label="Tambah jumlah"
                onClick={() => setQty(String((Number(qty) || 0) + 1))}
                className="w-11 h-11 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-700"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Kondisi */}
          <div>
            <label className="label-field">Kondisi</label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_KETERANGAN.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKeterangan(k)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                    keterangan === k
                      ? "bg-primary text-white border-primary"
                      : "bg-gray-50 text-gray-600 border-gray-200"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-xl px-3 py-2 text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
              {error}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
