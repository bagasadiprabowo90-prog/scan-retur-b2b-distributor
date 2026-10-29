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
      className={`flex flex-col items-center rounded-xl px-3 py-2 min-w-[84px] border transition-all active:scale-95 ${
        active
          ? "bg-gray-900 text-white border-gray-900 shadow-sm"
          : "bg-white text-gray-900 border-gray-200 hover:border-gray-400 hover:bg-gray-50"
      }`}
    >
      <span className="font-mono font-bold text-sm leading-tight break-all text-center">
        {item.lot}
      </span>
      <span
        className={`text-[10px] font-semibold mt-0.5 leading-tight ${
          active ? "text-gray-300" : "text-gray-400"
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

  // Reset & auto-focus saat modal dibuka
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

  // Pencarian tetap tersedia untuk jumlah banyak, tapi tidak mengganggu kalau chip sedikit.
  const showSearch = chips.length > 10 || !!q.trim();

  // Kalau tab "cari manual" tidak relevan (produk dipilih + ada batch-nya), langsung ke mode pilih.
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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/70">
          <div className="min-w-0 pr-2">
            <h3 className="font-bold text-sm text-gray-900 uppercase tracking-wide">
              {hasProduct ? "Pilih Batch" : "Pilih / Buat Batch"}
            </h3>
            {hasProduct ? (
              <p className="text-[11px] text-gray-500 truncate mt-0.5">
                {product!.product}
                <span className="font-mono text-gray-400"> · {product!.sku}</span>
              </p>
            ) : (
              <p className="text-[11px] text-gray-400 mt-0.5">Pilih produk dulu untuk melihat batch per produk</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 text-lg transition-colors"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 p-3 pb-0 bg-white">
          <button
            type="button"
            onClick={() => setMode("pick")}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
              mode === "pick"
                ? "bg-gray-900 text-white shadow-xs"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {hasProduct ? `Batch Produk (${chips.length})` : `Semua Batch (${chips.length})`}
          </button>
          <button
            type="button"
            onClick={() => setMode("new")}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
              mode === "new"
                ? "bg-gray-900 text-white shadow-xs"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
                  <svg
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    ref={searchInputRef}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Cari nomor batch..."
                    className="input-field pl-9.5 py-2.5 text-sm"
                  />
                  {q && (
                    <button
                      type="button"
                      onClick={() => setQ("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}

              {productBatchesLoading && hasProduct ? (
                <div className="flex flex-wrap gap-1.5 py-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-11 w-24 rounded-xl bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-gray-400 text-xs font-medium">
                    {chips.length === 0
                      ? hasProduct
                        ? "Produk ini belum punya batch di master data"
                        : "Belum ada batch"
                      : "Batch tidak ditemukan"}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (q.trim()) setNewLot(q.trim().toUpperCase());
                      setMode("new");
                    }}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    {q.trim()
                      ? `+ Buat batch "${q.trim().toUpperCase()}"`
                      : "+ Buat batch baru"}
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-[55vh] overflow-y-auto pr-0.5 py-0.5">
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
                  className="input-field uppercase font-mono text-sm py-2.5"
                />
              </div>

              <div>
                <label className="label-field">Expired Date</label>
                <input
                  value={newExp}
                  onChange={(e) => setNewExp(e.target.value)}
                  placeholder="Mis: Jun-2027 atau 2027-06"
                  className="input-field text-sm py-2.5"
                />
              </div>

              {hasProduct && (
                <p className="text-[11px] text-gray-400 leading-snug">
                  Batch baru akan dicatat di master data untuk produk <span className="font-semibold text-gray-600">{product!.sku}</span>.
                </p>
              )}

              {saveError && (
                <div className="rounded-xl px-3 py-2 text-xs bg-red-50 text-red-700 border border-red-200">
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
                className="w-full btn-primary py-2.5 mt-2"
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
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-5 max-w-xs w-full space-y-3">
            <h3 className="font-bold text-sm text-gray-900">Simpan Batch Baru?</h3>
            <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-xs text-gray-700">
              <div className="flex justify-between">
                <span className="text-gray-500">Batch:</span>
                <span className="font-mono font-bold text-gray-900">{newLot.trim().toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Exp:</span>
                <span className="font-semibold text-gray-900">{newExp.trim()}</span>
              </div>
              {hasProduct && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Produk:</span>
                  <span className="font-semibold text-gray-900">{product!.sku}</span>
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
