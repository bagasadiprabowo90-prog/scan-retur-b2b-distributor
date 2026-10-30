import { useEffect, useMemo, useState } from "react";
import { fetchReturnHistory, editReturn, deleteReturn, type ReturnHistoryItem, type CreateReturnPayload } from "../lib/api";
import { syncDeleteWithActiveSession, syncEditWithActiveSession } from "../lib/session";

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
    syncEditWithActiveSession(editItem, editForm);
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
    syncDeleteWithActiveSession(deleteItem);
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

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search]);

  const visibleHistory = useMemo(
    () => filteredHistory.slice(0, visibleCount),
    [filteredHistory, visibleCount]
  );
  const hasMore = visibleCount < filteredHistory.length;

  const totalQty = filteredHistory.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="space-y-3.5">
      {/* Toast */}
      {toast && (
        <div
          className={`rounded-2xl px-4 py-3 text-xs font-bold border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] ${
            toast.type === "ok" ? "bg-[#16C784] text-[#0B0E14]" : "bg-red-100 text-red-900"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Stats + Search */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2.5">
          <div className="grid grid-cols-2 gap-2.5 flex-1">
            <div className="bg-[#FEF0C7] border-2 border-[#0B0E14] rounded-xl px-3 py-2">
              <p className="text-base font-extrabold text-[#0B0E14] leading-none tabular-nums">
                {filteredHistory.length}
              </p>
              <p className="text-[11px] text-gray-600 font-bold mt-1">
                Baris Data
              </p>
            </div>
            <div className="bg-[#38BDF8] border-2 border-[#0B0E14] rounded-xl px-3 py-2">
              <p className="text-base font-extrabold text-[#0B0E14] leading-none tabular-nums">
                {totalQty.toLocaleString()}
              </p>
              <p className="text-[11px] text-[#0B0E14] font-bold mt-1">
                Total Pcs
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadHistory()}
            disabled={loading}
            className="h-12 px-3.5 flex items-center justify-center gap-1.5 rounded-xl bg-white border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] active:translate-y-[1px] active:shadow-none text-xs font-bold disabled:opacity-40 transition-all shrink-0"
            title="Refresh"
          >
            <svg className={`w-4 h-4 text-[#0B0E14] ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>

        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari produk, distri, atau batch..."
            className="input-field pl-10 py-2.5 text-sm"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-2xl px-4 py-3 text-xs font-bold bg-red-100 text-red-900 border-2 border-[#0B0E14]">
          {error}
        </div>
      )}

      {!error && warnings.length > 0 && (
        <div className="rounded-2xl px-4 py-3 text-xs font-bold bg-[#FEF0C7] text-[#0B0E14] border-2 border-[#0B0E14] space-y-0.5">
          {warnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}

      {/* List */}
      {loading && history.length === 0 ? (
        <div className="card px-4 py-12 text-center text-xs font-bold text-gray-500 animate-pulse">
          Memuat riwayat...
        </div>
      ) : !error && filteredHistory.length === 0 && !loading ? (
        <div className="card px-4 py-12 text-center text-xs font-bold text-gray-500">
          Tidak ada data riwayat
        </div>
      ) : (
        <div className="space-y-3">
          {visibleHistory.map((item) => {
            const key = `${item.sheet}-${item.rowNumber}`;
            return (
              <div key={key} className="card p-4 space-y-2.5">
                {/* Top: Full Product Name (No Truncate) + Qty Badge */}
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-extrabold text-[#0B0E14] leading-snug break-words flex-1">
                    {item.product || "-"}
                  </p>
                  <span className="bg-[#0B0E14] text-[#16C784] font-mono text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap tabular-nums shrink-0">
                    {item.qty.toLocaleString()} pcs
                  </span>
                </div>

                {/* Metadata Badges */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-[#0B0E14] bg-[#F4F3EE] border border-[#0B0E14] px-2 py-0.5 rounded-md">
                    {item.receiveDate || "-"}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-md border border-[#0B0E14] ${
                      item.sheet === "Bagas"
                        ? "bg-[#38BDF8] text-[#0B0E14]"
                        : "bg-[#FDE047] text-[#0B0E14]"
                    }`}
                  >
                    Sheet {item.sheet}
                  </span>
                  {item.pic && (
                    <span className="text-[11px] font-bold text-gray-700 bg-[#F4F3EE] border border-[#0B0E14] px-2 py-0.5 rounded-md">
                      PIC: {item.pic}
                    </span>
                  )}
                </div>

                {/* Structured Details Grid (Well-spaced columns, no truncated barcode or distri) */}
                <div className="bg-[#F8F7F3] border-2 border-[#0B0E14] rounded-xl p-3 space-y-2">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <span className="block text-[10px] font-bold text-gray-500 uppercase">
                        Barcode
                      </span>
                      <span className="font-mono text-xs font-bold text-[#0B0E14] break-all">
                        {item.barcode || "-"}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-gray-500 uppercase">
                        Batch
                      </span>
                      <span className="font-mono text-xs font-bold text-[#0B0E14] break-words">
                        {item.batch || "-"}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-gray-500 uppercase">
                        Exp Date
                      </span>
                      <span className="text-xs font-bold text-[#0B0E14] break-words">
                        {item.expDate || "-"}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-200 flex items-baseline justify-between gap-3">
                    <span className="text-[10px] font-bold text-gray-500 uppercase shrink-0">
                      Distri / Event
                    </span>
                    <span className="text-xs font-bold text-[#0B0E14] text-right break-words">
                      {item.distriEvent || "-"}
                    </span>
                  </div>
                </div>

                {/* Keterangan */}
                {item.keterangan && (
                  <div className="text-xs font-semibold text-[#0B0E14] bg-[#FEF0C7] border border-[#0B0E14] rounded-xl px-3 py-1.5">
                    Kondisi: <span className="font-bold">{item.keterangan}</span>
                  </div>
                )}

                {/* Edit / Delete */}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-[#0B0E14] bg-white border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] active:translate-y-[1px] active:shadow-none hover:bg-gray-50 transition-all"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteItem(item)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-red-700 bg-red-50 border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] active:translate-y-[1px] active:shadow-none hover:bg-red-100 transition-all"
                  >
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
              className="w-full btn-outline py-2.5"
            >
              Muat Lagi ({filteredHistory.length - visibleCount} tersisa)
            </button>
          )}

          {!hasMore && filteredHistory.length > 0 && (
            <p className="text-center text-xs font-semibold text-gray-500 py-2">
              {filteredHistory.length} data ditampilkan
            </p>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 overflow-y-auto">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditItem(null)} />
          <div className="relative card p-4 max-w-sm w-full space-y-3.5 mb-8 bg-white">
            <div className="flex items-center justify-between pb-2.5 border-b-2 border-[#0B0E14]">
              <h3 className="font-extrabold text-sm text-[#0B0E14]">Edit Data Sheet</h3>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-[#FDE047] text-[#0B0E14] border border-[#0B0E14]">
                {editItem.sheet} • Row {editItem.rowNumber}
              </span>
            </div>

            <div className="space-y-2.5">
              <EField label="Produk">
                <input value={editForm.product} onChange={(e) => setEditForm(f => ({ ...f, product: e.target.value }))} className="input-field text-xs py-2" />
              </EField>
              <EField label="Barcode">
                <input value={editForm.barcode} onChange={(e) => setEditForm(f => ({ ...f, barcode: e.target.value }))} className="input-field font-mono text-xs py-2" />
              </EField>
              <div className="grid grid-cols-2 gap-3">
                <EField label="Batch">
                  <input value={editForm.batch} onChange={(e) => setEditForm(f => ({ ...f, batch: e.target.value }))} className="input-field font-mono text-xs py-2" />
                </EField>
                <EField label="Exp Date">
                  <input value={editForm.expDate} onChange={(e) => setEditForm(f => ({ ...f, expDate: e.target.value }))} className="input-field text-xs py-2" />
                </EField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <EField label="Receive Date">
                  <input value={editForm.receiveDate} onChange={(e) => setEditForm(f => ({ ...f, receiveDate: e.target.value }))} className="input-field text-xs py-2" />
                </EField>
                <EField label="Qty">
                  <input type="number" inputMode="numeric" value={editForm.qty} onChange={(e) => setEditForm(f => ({ ...f, qty: Number(e.target.value) }))} className="input-field font-bold text-xs py-2" />
                </EField>
              </div>
              <EField label="Distri / Event">
                <input value={editForm.distriEvent} onChange={(e) => setEditForm(f => ({ ...f, distriEvent: e.target.value }))} className="input-field text-xs py-2" />
              </EField>
              <EField label="Keterangan">
                <input value={editForm.keterangan} onChange={(e) => setEditForm(f => ({ ...f, keterangan: e.target.value }))} className="input-field text-xs py-2" />
              </EField>
              <EField label="PIC">
                <input value={editForm.pic} onChange={(e) => setEditForm(f => ({ ...f, pic: e.target.value }))} className="input-field text-xs py-2" />
              </EField>
            </div>

            <div className="flex gap-2.5 pt-2 border-t-2 border-[#0B0E14]">
              <button onClick={() => setEditItem(null)} className="flex-1 btn-outline">Batal</button>
              <button onClick={handleEditSave} disabled={editSaving} className="flex-1 bg-[#16C784] text-[#0B0E14] border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] py-2.5 rounded-xl text-xs font-bold">
                {editSaving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteItem(null)} />
          <div className="relative card p-5 max-w-xs w-full space-y-4 bg-white">
            <h3 className="font-extrabold text-base text-[#0B0E14] text-center">Hapus Data Ini?</h3>
            <div className="bg-[#FEF0C7] border-2 border-[#0B0E14] rounded-xl p-3 space-y-1 text-xs">
              <p className="font-extrabold text-[#0B0E14] leading-snug break-words">{deleteItem.product}</p>
              <p className="text-gray-700 font-semibold">Sheet {deleteItem.sheet} • Row {deleteItem.rowNumber} • Qty {deleteItem.qty}</p>
            </div>
            <p className="text-xs text-gray-500 text-center">Data yang dihapus dari Sheet tidak bisa dikembalikan.</p>
            <div className="flex gap-2.5">
              <button onClick={() => setDeleteItem(null)} className="flex-1 btn-outline">Batal</button>
              <button onClick={handleDelete} disabled={deleteLoading} className="flex-1 bg-red-500 text-white border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] py-2.5 rounded-xl text-xs font-bold hover:bg-red-600 disabled:opacity-40 transition-all">
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
      <label className="label-field">{label}</label>
      {children}
    </div>
  );
}
