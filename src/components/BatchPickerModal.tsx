import { useEffect, useMemo, useRef, useState } from "react";
import { addBatch, type BatchItem, type ProductItem } from "../lib/api";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Produk yang sedang dipilih; kalau ada, hanya batch miliknya yang ditampilkan sebagai chip. */
  product?: ProductItem | null;
  /** Batch milik produk (dari masterdata per-barcode). */
  productBatches?: BatchItem[];
  productBatchesLoading?: boolean;
  /** Fallback: daftar batch global (dipakai kalau produk belum dipilih). */
  batches: BatchItem[];
  currentLot?: string;
  onPickExisting: (item: BatchItem) => void;
  onCreateNew: (lot: string, expDate: string) => void;
};

function BatchChip({
  item,
  active,
  onPick,
}: {
  item: BatchItem;
  active: boolean;
  onPick: (item: BatchItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(item)}
      className={`flex flex-col items-center rounded-2xl px-3.5 py-2 min-w-[92px] border transition-all active:scale-[0.98] ${
        active
          ? "bg-[#1C1917] text-white border-[#1C1917] shadow-sm"
          : "bg-white/80 text-stone-800 border-stone-200/90 hover:bg-white shadow-2xs"
      }`}
    >
      <span className="font-mono font-bold text-xs leading-tight break-all text-center">
        {item.lot}
      </span>
      <span
        className={`text-[10px] font-medium mt-0.5 leading-tight ${
          active ? "text-stone-300" : "text-stone-500"
        }`}
      >
        Exp {item.expDate || "-"}
      </span>
    </button>
  );
}

export default function BatchPickerModal({
  open,
  onClose,
  product,
  productBatches,
  productBatchesLoading,
  batches,
  currentLot,
  onPickExisting,
  onCreateNew,
}: Props) {
  const [q, setQ] = useState("");
  const [newLot, setNewLot] = useState("");
  const [newExp, setNewExp] = useState("");
  const [mode, setMode] = useState<"pick" | "new">("pick");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const newLotInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setNewLot("");
      setNewExp("");
      setMode("pick");
      setSaving(false);
      setSaveError("");
      setConfirmOpen(false);
    }
  }, [open]);

  const hasProduct = !!product;
  const chips = useMemo(
    () => (hasProduct ? productBatches ?? [] : batches),
    [hasProduct, productBatches, batches]
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return chips;
    return chips.filter(
      (b) =>
        (b.lot ?? "").toLowerCase().includes(query) ||
        (b.expDate ?? "").toLowerCase().includes(query)
    );
  }, [chips, q]);

  const showSearch = chips.length > 10 || !!q.trim();

  useEffect(() => {
    if (mode === "new" && newLotInputRef.current) {
      setTimeout(() => newLotInputRef.current?.focus(), 100);
    } else if (mode === "pick" && showSearch && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [mode, showSearch, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white/95 backdrop-blur-xl w-full max-w-md rounded-3xl border border-white shadow-xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header (Full Product Name, Not Truncated) */}
        <div className="flex items-start justify-between px-4 py-3.5 border-b border-stone-200/70">
          <div className="min-w-0 pr-3 flex-1">
            <h3 className="font-extrabold text-sm text-stone-900">
              {hasProduct ? "Pilih Batch Produk" : "Pilih / Buat Batch"}
            </h3>
            {hasProduct ? (
              <p className="text-xs text-stone-600 font-medium leading-snug break-words mt-0.5">
                {product!.product}
                <span className="font-mono font-semibold text-stone-500"> • {product!.sku}</span>
              </p>
            ) : (
              <p className="text-xs text-stone-500 mt-0.5">
                Pilih produk dulu untuk melihat batch per produk
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full bg-stone-100 hover:bg-stone-200 text-xs font-bold text-stone-700"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-1.5 p-3 pb-0">
          <button
            type="button"
            onClick={() => setMode("pick")}
            className={`py-2 rounded-full text-xs font-semibold transition-all ${
              mode === "pick"
                ? "bg-[#1C1917] text-white shadow-xs"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {hasProduct ? `Batch Produk (${chips.length})` : `Semua Batch (${chips.length})`}
          </button>
          <button
            type="button"
            onClick={() => setMode("new")}
            className={`py-2 rounded-full text-xs font-semibold transition-all ${
              mode === "new"
                ? "bg-[#1C1917] text-white shadow-xs"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            + Buat Batch Baru
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
          {mode === "pick" ? (
            <>
              {showSearch && (
                <div className="relative">
                  <input
                    ref={searchInputRef}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Cari nomor batch..."
                    className="input-field font-mono py-2 text-xs"
                  />
                  {q && (
                    <button
                      type="button"
                      onClick={() => setQ("")}
                      className="absolute right-3 top-1/2 -transtone-y-1/2 text-stone-500 font-bold text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}

              {productBatchesLoading && hasProduct ? (
                <div className="flex flex-wrap gap-2 py-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-12 w-24 rounded-2xl bg-stone-100 animate-pulse" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-6 space-y-2.5 bg-stone-50 border border-stone-200/80 rounded-2xl p-4">
                  <p className="text-stone-700 text-xs font-semibold">
                    {chips.length === 0
                      ? hasProduct
                        ? "Produk ini belum punya batch di master data"
                        : "Belum ada batch"
                      : "Batch tidak ditemukan"}
                  </p>
                  <div className="flex flex-col items-center gap-2 pt-1">
                    {chips.length === 0 && hasProduct && (
                      <button
                        type="button"
                        onClick={() => onPickExisting({ lot: "-", expDate: "-" })}
                        className="btn-outline py-2 px-4 text-xs"
                      >
                        Lanjut Tanpa Batch (-)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (q.trim()) setNewLot(q.trim().toUpperCase());
                        setMode("new");
                      }}
                      className="btn-primary px-4 py-2 text-xs"
                    >
                      {q.trim()
                        ? `+ Buat Batch "${q.trim().toUpperCase()}"`
                        : "+ Buat Batch Baru"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-[55vh] overflow-y-auto pr-0.5 py-0.5">
                  {filtered.map((item, idx) => (
                    <BatchChip
                      key={`${item.lot}-${idx}`}
                      item={item}
                      active={!!currentLot && item.lot === currentLot}
                      onPick={onPickExisting}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3 pt-1">
              <div>
                <label className="label-field">Nomor Batch / Lot</label>
                <input
                  ref={newLotInputRef}
                  value={newLot}
                  onChange={(e) => setNewLot(e.target.value.toUpperCase())}
                  placeholder="Mis: CBF2801"
                  className="input-field uppercase font-mono font-bold text-xs py-2.5"
                />
              </div>

              <div>
                <label className="label-field">Expired Date</label>
                <input
                  value={newExp}
                  onChange={(e) => setNewExp(e.target.value)}
                  placeholder="Mis: Jun-2027 atau 2027-06"
                  className="input-field text-xs py-2.5 font-semibold"
                />
              </div>

              {hasProduct && (
                <p className="text-xs text-stone-500 leading-snug">
                  Batch baru akan dicatat di master data untuk SKU{" "}
                  <span className="font-bold text-stone-900">{product!.sku}</span>.
                </p>
              )}

              {saveError && (
                <div className="rounded-xl px-3 py-2 text-xs font-semibold bg-red-50 text-red-900 border border-red-200">
                  {saveError}
                </div>
              )}

              <button
                type="button"
                disabled={!newLot.trim() || !newExp.trim() || saving}
                onClick={() => {
                  setSaveError("");
                  setConfirmOpen(true);
                }}
                className="w-full btn-primary py-3 text-xs mt-2"
              >
                {saving ? "Menyimpan..." : "Simpan Batch Baru"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Confirm Dialog */}
      {confirmOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={() => setConfirmOpen(false)} />
          <div className="relative bg-white/95 backdrop-blur-xl rounded-3xl border border-white shadow-xl p-5 max-w-xs w-full space-y-3">
            <h3 className="font-bold text-sm text-stone-900">Simpan Batch Baru?</h3>
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 space-y-1.5 text-xs text-stone-800">
              <div className="flex justify-between">
                <span className="font-medium text-stone-500">Batch:</span>
                <span className="font-mono font-bold">{newLot.trim().toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-stone-500">Exp:</span>
                <span className="font-bold">{newExp.trim()}</span>
              </div>
              {hasProduct && (
                <div className="flex justify-between">
                  <span className="font-medium text-stone-500">SKU:</span>
                  <span className="font-mono font-bold">{product!.sku}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex-1 btn-outline py-2 text-xs"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmOpen(false);
                  setSaving(true);
                  setSaveError("");
                  const res = await addBatch(newLot.trim(), newExp.trim(), product ?? undefined);
                  setSaving(false);
                  if (!res.ok) {
                    setSaveError(res.error);
                    return;
                  }
                  onCreateNew(res.lot, res.expDate);
                }}
                className="flex-1 btn-primary py-2 text-xs"
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
