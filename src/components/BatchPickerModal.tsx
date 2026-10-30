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
      className={`flex flex-col items-center rounded-xl px-3 py-2 min-w-[88px] border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] active:translate-y-[1px] active:shadow-none transition-all ${
        active
          ? "bg-[#0B0E14] text-[#FDE047]"
          : "bg-[#F4F3EE] text-[#0B0E14] hover:bg-[#FEF0C7]"
      }`}
    >
      <span className="font-mono font-extrabold text-sm leading-tight break-all text-center">
        {item.lot}
      </span>
      <span
        className={`text-[10px] font-bold mt-0.5 leading-tight ${
          active ? "text-[#16C784]" : "text-gray-500"
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
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white w-full max-w-md rounded-2xl border-2 border-[#0B0E14] shadow-[0_4px_0_#0B0E14] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header (Full Product Name, Not Truncated) */}
        <div className="flex items-start justify-between px-4 py-3 border-b-2 border-[#0B0E14] bg-[#FEF0C7]">
          <div className="min-w-0 pr-3 flex-1">
            <h3 className="font-extrabold text-sm text-[#0B0E14]">
              {hasProduct ? "Pilih Batch Produk" : "Pilih / Buat Batch"}
            </h3>
            {hasProduct ? (
              <p className="text-xs text-[#0B0E14] font-semibold leading-snug break-words mt-0.5">
                {product!.product}
                <span className="font-mono font-bold text-gray-700"> • {product!.sku}</span>
              </p>
            ) : (
              <p className="text-xs text-gray-600 mt-0.5">
                Pilih produk dulu untuk melihat batch per produk
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl bg-white border-2 border-[#0B0E14] text-sm font-bold text-[#0B0E14]"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-2 p-3.5 pb-0 bg-white">
          <button
            type="button"
            onClick={() => setMode("pick")}
            className={`py-2 rounded-xl text-xs font-bold border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] transition-all ${
              mode === "pick"
                ? "bg-[#0B0E14] text-white"
                : "bg-[#F4F3EE] text-[#0B0E14] hover:bg-gray-200"
            }`}
          >
            {hasProduct ? `Batch Produk (${chips.length})` : `Semua Batch (${chips.length})`}
          </button>
          <button
            type="button"
            onClick={() => setMode("new")}
            className={`py-2 rounded-xl text-xs font-bold border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] transition-all ${
              mode === "new"
                ? "bg-[#0B0E14] text-white"
                : "bg-[#FDE047] text-[#0B0E14] hover:bg-[#FACC15]"
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
                    className="input-field font-mono py-2.5 text-xs"
                  />
                  {q && (
                    <button
                      type="button"
                      onClick={() => setQ("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0B0E14] font-bold text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}

              {productBatchesLoading && hasProduct ? (
                <div className="flex flex-wrap gap-2 py-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-12 w-24 rounded-xl bg-[#F4F3EE] border-2 border-[#0B0E14] animate-pulse" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-6 space-y-2.5 bg-[#F4F3EE] border-2 border-[#0B0E14] rounded-xl p-4">
                  <p className="text-[#0B0E14] text-xs font-bold">
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
                      className="bg-[#FDE047] text-[#0B0E14] border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] rounded-xl px-4 py-2 text-xs font-bold"
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
                  className="input-field uppercase font-mono font-bold text-sm py-2.5"
                />
              </div>

              <div>
                <label className="label-field">Expired Date</label>
                <input
                  value={newExp}
                  onChange={(e) => setNewExp(e.target.value)}
                  placeholder="Mis: Jun-2027 atau 2027-06"
                  className="input-field text-sm py-2.5 font-semibold"
                />
              </div>

              {hasProduct && (
                <p className="text-xs text-gray-600 leading-snug">
                  Batch baru akan dicatat di master data untuk SKU{" "}
                  <span className="font-bold text-[#0B0E14]">{product!.sku}</span>.
                </p>
              )}

              {saveError && (
                <div className="rounded-xl px-3 py-2 text-xs font-bold bg-red-100 text-red-900 border-2 border-[#0B0E14]">
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
                className="w-full bg-[#16C784] text-[#0B0E14] border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] active:translate-y-[1px] active:shadow-none py-2.5 rounded-xl text-xs font-bold disabled:opacity-40 mt-2"
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
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmOpen(false)} />
          <div className="relative bg-white rounded-2xl border-2 border-[#0B0E14] shadow-[0_4px_0_#0B0E14] p-5 max-w-xs w-full space-y-3">
            <h3 className="font-extrabold text-sm text-[#0B0E14]">Simpan Batch Baru?</h3>
            <div className="bg-[#FEF0C7] border-2 border-[#0B0E14] rounded-xl p-3 space-y-1.5 text-xs text-[#0B0E14]">
              <div className="flex justify-between">
                <span className="font-semibold">Batch:</span>
                <span className="font-mono font-extrabold">{newLot.trim().toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">Exp:</span>
                <span className="font-bold">{newExp.trim()}</span>
              </div>
              {hasProduct && (
                <div className="flex justify-between">
                  <span className="font-semibold">SKU:</span>
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
                className="flex-1 bg-[#16C784] text-[#0B0E14] border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] py-2 rounded-xl text-xs font-bold"
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
