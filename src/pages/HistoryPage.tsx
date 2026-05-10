import { useEffect, useMemo, useState } from "react";
import { fetchReturnHistory, editReturn, deleteReturn, type ReturnHistoryItem, type CreateReturnPayload } from "../lib/api";

const HISTORY_LIMIT = 200;
const PAGE_SIZE = 20;
const CACHE_KEY = "scan-retur-history-cache";

function loadCache(): { history: ReturnHistoryItem[]; ts: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveCache(history: ReturnHistoryItem[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ history, ts: Date.now() }));
  } catch {}
}

export default function HistoryPage() {
  const cached = loadCache();
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ReturnHistoryItem[]>(cached?.history ?? []);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Edit / Delete state
  const [editItem, setEditItem] = useState<ReturnHistoryItem | null>(null);
  const [editForm, setEditForm] = useState<CreateReturnPayload>({ receiveDate: "", distriEvent: "", product: "", barcode: "", batch: "", expDate: "", qty: 0, keterangan: "", pic: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState<ReturnHistoryItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  function openEdit(item: ReturnHistoryItem) {
    setEditItem(item);
    setEditForm({
      receiveDate: item.receiveDate,
      distriEvent: item.distriEvent,
      product: item.product,
      barcode: item.barcode,
      batch: item.batch,
      expDate: item.expDate,
      qty: item.qty,
      keterangan: item.keterangan,
      pic: item.pic,
    });
  }

  async function handleEditSave() {
    if (!editItem) return;
    setEditSaving(true);
    const res = await editReturn(editItem.sheet, editItem.rowNumber, editForm);
    setEditSaving(false);
    if (!res.ok) {
      setToast({ type: "err", msg: res.error });
      return;
    }
    setToast({ type: "ok", msg: "Data berhasil diperbarui" });
    setEditItem(null);
    void loadHistory();
  }

  async function handleDelete() {
    if (!deleteItem) return;
    setDeleteLoading(true);
    const res = await deleteReturn(deleteItem.sheet, deleteItem.rowNumber);
    setDeleteLoading(false);
    if (!res.ok) {
      setToast({ type: "err", msg: res.error });
      return;
    }
    setToast({ type: "ok", msg: "Data berhasil dihapus" });
    setDeleteItem(null);
    void loadHistory();
  }

  async function loadHistory() {
    setLoading(true);
    setError("");
    const res = await fetchReturnHistory(HISTORY_LIMIT);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setHistory(res.history);
    setWarnings(res.warnings || []);
    saveCache(res.history);
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  const filteredHistory = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return history;
    return history.filter((item) =>
      [
        item.sheet,
        item.receiveDate,
        item.distriEvent,
        item.product,
        item.barcode,
        item.batch,
        item.expDate,
        item.keterangan,
        item.pic,
      ].some((value) => value.toLowerCase().includes(query))
    );
  }, [history, search]);

  // Reset visible count when search changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search]);

  const visibleHistory = useMemo(
    () => filteredHistory.slice(0, visibleCount),
    [filteredHistory, visibleCount]
  );
  const hasMore = visibleCount < filteredHistory.length;

  const totalQty = filteredHistory.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="space-y-3">
      {/* Toast */}
      {toast && (
        <div className={`rounded-xl px-3.5 py-2.5 text-sm border ${
          toast.type === "ok" ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-600 border-red-100"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Stats + Search */}
      <div className="card">
        <div className="p-4 flex items-center gap-3">
          <div className="flex-1 flex items-center gap-4">
            <div>
              <p className="text-lg font-bold text-gray-900 leading-none">{filteredHistory.length}</p>
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mt-0.5">Data</p>
            </div>
            <div className="w-px h-8 bg-gray-100" />
            <div>
              <p className="text-lg font-bold text-gray-900 leading-none">{totalQty.toLocaleString()}</p>
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mt-0.5">Total Qty</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadHistory()}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 hover:bg-gray-100 disabled:opacity-40 transition-colors shrink-0"
            title="Refresh"
          >
            <svg className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
        <div className="px-4 pb-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari riwayat..."
              className="input-field pl-9"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl px-3.5 py-2.5 text-sm bg-red-50 text-red-600 border border-red-100">{error}</div>
      )}

      {!error && warnings.length > 0 && (
        <div className="rounded-xl px-3.5 py-2.5 text-sm bg-amber-50 text-amber-700 border border-amber-100 space-y-0.5">
          {warnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}

      {/* List */}
      {loading && history.length === 0 ? (
        <div className="card px-4 py-12 text-center text-sm text-gray-300 animate-pulse">Memuat riwayat...</div>
      ) : !error && filteredHistory.length === 0 && !loading ? (
        <div className="card px-4 py-12 text-center text-sm text-gray-300">Tidak ada data</div>
      ) : (
        <div className="space-y-2">
          {visibleHistory.map((item) => {
            const key = `${item.sheet}-${item.rowNumber}`;
            return (
              <div key={key} className="card p-3.5">
                {/* Top: product + qty */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold text-gray-900 leading-snug min-w-0 truncate">
                    {item.product || "-"}
                  </p>
                  <span className="text-sm font-bold text-gray-900 whitespace-nowrap tabular-nums">
                    {item.qty.toLocaleString()}
                  </span>
                </div>

                {/* Badges */}
                <div className="flex items-center gap-1.5 mb-2.5">
                  <span className="text-[10px] font-medium text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-md">
                    {item.receiveDate || "-"}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                    item.sheet === "Bagas"
                      ? "bg-blue-50 text-blue-600 border border-blue-100"
                      : "bg-purple-50 text-purple-600 border border-purple-100"
                  }`}>
                    {item.sheet}
                  </span>
                  {item.pic && (
                    <span className="text-[10px] font-medium text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-md">
                      {item.pic}
                    </span>
                  )}
                </div>

                {/* Info rows */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Barcode</span>
                    <span className="font-mono text-gray-600 truncate ml-1">{item.barcode || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Batch</span>
                    <span className="text-gray-600 truncate ml-1">{item.batch || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Exp</span>
                    <span className="text-gray-600 truncate ml-1">{item.expDate || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Distri</span>
                    <span className="text-gray-600 truncate ml-1">{item.distriEvent || "-"}</span>
                  </div>
                </div>

                {/* Keterangan */}
                {item.keterangan && (
                  <p className="mt-2 text-[11px] text-gray-400 bg-gray-50 rounded-lg px-2.5 py-1.5">
                    {item.keterangan}
                  </p>
                )}

                {/* Edit / Delete */}
                <div className="flex justify-end gap-1.5 mt-2.5 pt-2 border-t border-gray-50">
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteItem(item)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-red-400 hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Hapus
                  </button>
                </div>
              </div>
            );
          })}

          {/* Load More */}
          {hasMore && (
            <button
              type="button"
              onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
              className="w-full py-2.5 rounded-xl bg-white border border-gray-100 text-sm font-medium text-gray-400 hover:bg-gray-50 transition-colors"
            >
              Muat lagi ({filteredHistory.length - visibleCount} tersisa)
            </button>
          )}

          {!hasMore && filteredHistory.length > 0 && (
            <p className="text-center text-[11px] text-gray-300 py-2">
              {filteredHistory.length} data ditampilkan
            </p>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 overflow-y-auto">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setEditItem(null)} />
          <div className="relative card p-5 max-w-sm w-full space-y-4 mb-8">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-gray-900">Edit Data</h3>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                editItem.sheet === "Bagas" ? "bg-blue-50 text-blue-600 border border-blue-100" : "bg-purple-50 text-purple-600 border border-purple-100"
              }`}>{editItem.sheet} · Row {editItem.rowNumber}</span>
            </div>

            <div className="space-y-3">
              <EField label="Produk">
                <input value={editForm.product} onChange={(e) => setEditForm(f => ({ ...f, product: e.target.value }))} className="input-field" />
              </EField>
              <EField label="Barcode">
                <input value={editForm.barcode} onChange={(e) => setEditForm(f => ({ ...f, barcode: e.target.value }))} className="input-field font-mono" />
              </EField>
              <div className="grid grid-cols-2 gap-3">
                <EField label="Batch">
                  <input value={editForm.batch} onChange={(e) => setEditForm(f => ({ ...f, batch: e.target.value }))} className="input-field" />
                </EField>
                <EField label="Exp Date">
                  <input value={editForm.expDate} onChange={(e) => setEditForm(f => ({ ...f, expDate: e.target.value }))} className="input-field" />
                </EField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <EField label="Receive Date">
                  <input value={editForm.receiveDate} onChange={(e) => setEditForm(f => ({ ...f, receiveDate: e.target.value }))} className="input-field" />
                </EField>
                <EField label="Qty">
                  <input type="number" inputMode="numeric" value={editForm.qty} onChange={(e) => setEditForm(f => ({ ...f, qty: Number(e.target.value) }))} className="input-field" />
                </EField>
              </div>
              <EField label="Distri / Event">
                <input value={editForm.distriEvent} onChange={(e) => setEditForm(f => ({ ...f, distriEvent: e.target.value }))} className="input-field" />
              </EField>
              <EField label="Keterangan">
                <input value={editForm.keterangan} onChange={(e) => setEditForm(f => ({ ...f, keterangan: e.target.value }))} className="input-field" />
              </EField>
              <EField label="PIC">
                <input value={editForm.pic} onChange={(e) => setEditForm(f => ({ ...f, pic: e.target.value }))} className="input-field" />
              </EField>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button onClick={() => setEditItem(null)} className="flex-1 btn-outline">Batal</button>
              <button onClick={handleEditSave} disabled={editSaving} className="flex-1 btn-primary">
                {editSaving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setDeleteItem(null)} />
          <div className="relative card p-5 max-w-xs w-full space-y-4">
            <h3 className="font-bold text-base text-gray-900 text-center">Hapus Data?</h3>
            <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-[11px]">
              <p className="font-semibold text-gray-900 text-sm">{deleteItem.product}</p>
              <p className="text-gray-500">{deleteItem.sheet} · Row {deleteItem.rowNumber} · Qty {deleteItem.qty}</p>
            </div>
            <p className="text-sm text-gray-400 text-center">Data yang dihapus tidak bisa dikembalikan.</p>
            <div className="flex gap-2.5">
              <button onClick={() => setDeleteItem(null)} className="flex-1 btn-outline">Batal</button>
              <button onClick={handleDelete} disabled={deleteLoading} className="flex-1 bg-red-500 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-red-600 active:scale-[0.98] disabled:opacity-40 transition-all">
                {deleteLoading ? "Menghapus..." : "Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

