import { useEffect, useMemo, useState } from "react";
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

  // Reset state setiap kali modal ditutup
  useEffect(() => {
    if (!open) {
      setQ("");
      setNewLot("");
      setNewExp("");
      setMode("pick");
      setSaving(false);
      setSaveError("");
      setConfirmOpen(false);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return batches;
    return batches.filter((b) => (b.lot ?? "").toLowerCase().includes(query));
  }, [batches, q]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-bold text-lg">Pilih / Buat Batch</h3>
          <button
            onClick={onClose}
            className="text-blue-600 font-semibold text-sm hover:text-blue-800"
          >
            Tutup ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-4 pt-3">
          <button
            onClick={() => setMode("pick")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === "pick"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
          >
            Pilih
          </button>
          <button
            onClick={() => setMode("new")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === "new"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
          >
            Buat Baru
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {mode === "pick" ? (
            <div className="space-y-3">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari batch (contoh: CBF)..."
                className="input-field"
                autoFocus
              />

              {filtered.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">Tidak ada batch.</p>
              ) : (
                <div className="space-y-2">
                  {filtered.map((item, idx) => (
                    <button
                      key={`${item.lot}-${idx}`}
                      onClick={() => onPickExisting(item)}
                      className="w-full text-left border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                    >
                      <span className="font-semibold text-gray-900">{item.lot}</span>
                      <span className="text-sm text-gray-500 ml-2">
                        Exp: {item.expDate || "-"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <input
                value={newLot}
                onChange={(e) => setNewLot(e.target.value.toUpperCase())}
                placeholder="Batch/Lot baru (mis: CBF2801)"
                className="input-field"
                autoFocus
              />
              <input
                value={newExp}
                onChange={(e) => setNewExp(e.target.value)}
                placeholder="Exp Date (mis: Jun-2027)"
                className="input-field"
              />
              {saveError && (
                <div className="rounded-xl px-3 py-2 text-sm bg-red-50 text-red-700 border border-red-200">
                  ❌ {saveError}
                </div>
              )}
              <button
                disabled={!newLot.trim() || !newExp.trim() || saving}
                onClick={() => { setSaveError(""); setConfirmOpen(true); }}
                className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 disabled:opacity-40 transition-colors"
              >
                {saving ? "Menyimpan..." : "Simpan Batch Baru"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Confirm Dialog */}
      {confirmOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 mx-4 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-lg text-gray-900">Simpan Batch Baru?</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <p><span className="font-semibold text-gray-800">Batch/Lot:</span> {newLot.trim().toUpperCase()}</p>
              <p><span className="font-semibold text-gray-800">Exp Date:</span> {newExp.trim()}</p>
            </div>
            <p className="text-sm text-gray-500">Batch ini akan disimpan ke sheet <strong>Master Product &amp; Lots</strong>.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors"
              >
                Batal
              </button>
              <button
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
