import { useEffect, useMemo, useRef, useState } from "react";
import { addBatch, type BatchItem } from "../lib/api";

type Props = {
  open: boolean;
  onClose: () => void;
  batches: BatchItem[];
  onPickExisting: (item: BatchItem) => void;
  onCreateNew: (lot: string, expDate: string) => void;
};

export default function BatchPickerModal({
  open,
  onClose,
  batches,
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
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  useEffect(() => {
    if (mode === "new") {
      setTimeout(() => {
        newLotInputRef.current?.focus();
      }, 100);
    } else {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [mode]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return batches;
    return batches.filter(
      (b) =>
        (b.lot ?? "").toLowerCase().includes(query) ||
        (b.expDate ?? "").toLowerCase().includes(query)
    );
  }, [batches, q]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/70">
          <h3 className="font-bold text-sm text-gray-900 uppercase tracking-wide">Pilih / Buat Batch</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 text-lg transition-colors"
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
            Daftar Batch ({batches.length})
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
                  placeholder="Cari nomor batch (mis: CBF)..."
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

              {filtered.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-gray-400 text-xs font-medium">Batch tidak ditemukan</p>
                  <button
                    type="button"
                    onClick={() => {
                      setNewLot(q.trim().toUpperCase());
                      setMode("new");
                    }}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    + Buat batch "{q.trim().toUpperCase()}"
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-0.5">
                  {filtered.map((item, idx) => (
                    <button
                      key={`${item.lot}-${idx}`}
                      type="button"
                      onClick={() => onPickExisting(item)}
                      className="w-full text-left bg-gray-50/80 hover:bg-gray-100/90 border border-gray-100 hover:border-gray-200 rounded-xl px-3.5 py-2.5 flex items-center justify-between transition-colors group"
                    >
                      <span className="font-bold text-gray-900 text-sm font-mono group-hover:text-black">
                        {item.lot}
                      </span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-white border border-gray-200/80 text-gray-600">
                        Exp: {item.expDate || "-"}
                      </span>
                    </button>
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
                  const res = await addBatch(newLot.trim(), newExp.trim());
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
