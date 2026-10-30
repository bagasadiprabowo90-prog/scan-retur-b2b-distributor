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
    setToast({ type: "ok", msg: "Data berhasil diperbarui (sesi aktif disinkronkan)" });
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
    setToast({ type: "ok", msg: "Data berhasil dihapus (sesi aktif disinkronkan)" });
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
    <div className="space-y-3">
      {/* Toast */}
      {toast && (
        <div
          className={`rounded-2xl px-3.5 py-2.5 font-mono text-xs font-bold border-2 border-[#0B0E14] shadow-[0_3px_0_#0B0E14] ${
            toast.type === "ok" ? "bg-[#16C784] text-[#0B0E14]" : "bg-red-100 text-red-900"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Stats + Search */}
      <div className="card p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="bg-[#FEF0C7] border-2 border-[#0B0E14] rounded-xl px-3 py-1.5">
              <p className="font-mono text-base font-black text-[#0B0E14] leading-none">
                {filteredHistory.length}
              </p>
              <p className="font-mono text-[10px] text-gray-600 font-bold uppercase mt-0.5">
                BARIS DATA
              </p>
            </div>
            <div className="bg-[#38BDF8] border-2 border-[#0B0E14] rounded-xl px-3 py-1.5">
              <p className="font-mono text-base font-black text-[#0B0E14] leading-none">
                {totalQty.toLocaleString()}
              </p>
              <p className="font-mono text-[10px] text-[#0B0E14] font-bold uppercase mt-0.5">
                TOTAL PCS
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadHistory()}
            disabled={loading}
            className="h-9 px-3 flex items-center justify-center gap-1.5 rounded-xl bg-white border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] active:translate-y-[1px] active:shadow-none font-mono text-xs font-bold disabled:opacity-40 transition-all shrink-0"
            title="Refresh"
          >
            <svg className={`w-4 h-4 text-[#0B0E14] ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>SYNC</span>
          </button>
        </div>

        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ketik produk, distri, batch, atau barcode..."
            className="input-field font-mono text-xs py-2.5"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-2xl px-3.5 py-2.5 font-mono text-xs font-bold bg-red-100 text-red-900 border-2 border-[#0B0E14]">
          {error}
        </div>
      )}

      {!error && warnings.length > 0 && (
        <div className="rounded-2xl px-3.5 py-2.5 font-mono text-xs font-bold bg-[#FEF0C7] text-[#0B0E14] border-2 border-[#0B0E14] space-y-0.5">
          {warnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}

      {/* List */}
      {loading && history.length === 0 ? (
        <div className="card px-4 py-12 text-center font-mono text-xs font-bold text-gray-500 animate-pulse">
          MEMUAT RIWAYAT SHEET...
        </div>
      ) : !error && filteredHistory.length === 0 && !loading ? (
        <div className="card px-4 py-12 text-center font-mono text-xs font-bold text-gray-500">
          TIDAK ADA DATA RIWAYAT
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleHistory.map((item) => {
            const key = `${item.sheet}-${item.rowNumber}`;
            return (
              <div key={key} className="card p-3.5">
                {/* Top: product + qty */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-xs font-black text-[#0B0E14] uppercase leading-snug min-w-0 truncate">
                    {item.product || "-"}
                  </p>
                  <span className="bg-[#0B0E14] text-[#16C784] font-mono text-xs font-black px-2 py-0.5 rounded-md whitespace-nowrap tabular-nums shrink-0">
                    {item.qty.toLocaleString()} PCS
                  </span>
                </div>

                {/* Badges */}
                <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                  <span className="font-mono text-[10px] font-bold text-[#0B0E14] bg-[#F4F3EE] border border-[#0B0E14] px-2 py-0.5 rounded-md">
                    {item.receiveDate || "-"}
                  </span>
                  <span
                    className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-md border border-[#0B0E14] ${
                      item.sheet === "Bagas"
                        ? "bg-[#38BDF8] text-[#0B0E14]"
                        : "bg-[#FDE047] text-[#0B0E14]"
                    }`}
                  >
                    SHEET {item.sheet.toUpperCase()}
                  </span>
                  {item.pic && (
                    <span className="font-mono text-[10px] font-bold text-gray-700 bg-[#F4F3EE] border border-[#0B0E14] px-2 py-0.5 rounded-md">
                      OPR: {item.pic.toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Info rows */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] bg-[#F4F3EE] border border-[#0B0E14] rounded-xl p-2.5">
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-bold">BARCODE</span>
                    <span className="font-bold text-[#0B0E14] truncate ml-1">{item.barcode || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-bold">BATCH</span>
                    <span className="font-bold text-[#0B0E14] truncate ml-1">{item.batch || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-bold">EXP</span>
                    <span className="font-bold text-[#0B0E14] truncate ml-1">{item.expDate || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-bold">DISTRI</span>
                    <span className="font-bold text-[#0B0E14] truncate ml-1">{item.distriEvent || "-"}</span>
                  </div>
                </div>

                {/* Keterangan */}
                {item.keterangan && (
                  <p className="mt-2 font-mono text-[11px] font-bold text-[#0B0E14] bg-[#FEF0C7] border border-[#0B0E14] rounded-lg px-2.5 py-1.5">
                    KONDISI: {item.keterangan}
                  </p>
                )}

                {/* Edit / Delete */}
                <div className="flex justify-end gap-2 mt-2.5 pt-2 border-t-2 border-gray-200">
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    className="px-3 py-1 rounded-lg font-mono text-[11px] font-bold text-[#0B0E14] bg-white border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] active:translate-y-[1px] active:shadow-none"
                  >
                    EDIT
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteItem(item)}
                    className="px-3 py-1 rounded-lg font-mono text-[11px] font-bold text-red-700 bg-red-100 border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] active:translate-y-[1px] active:shadow-none"
                  >
                    HAPUS
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
              MUAT LAGI ({filteredHistory.length - visibleCount} TERSISA)
            </button>
          )}

          {!hasMore && filteredHistory.length > 0 && (
            <p className="text-center font-mono text-[11px] font-bold text-gray-500 py-2">
              {filteredHistory.length} DATA DITAMPILKAN
            </p>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 overflow-y-auto">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditItem(null)} />
          <div className="relative card p-4 max-w-sm w-full space-y-3 mb-8 bg-white">
            <div className="flex items-center justify-between pb-2 border-b-2 border-[#0B0E14]">
              <h3 className="font-black text-sm text-[#0B0E14] uppercase">EDIT DATA SHEET</h3>
              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#FDE047] text-[#0B0E14] border border-[#0B0E14]">
                {editItem.sheet.toUpperCase()} • ROW {editItem.rowNumber}
              </span>
            </div>

            <div className="space-y-2.5">
              <EField label="PRODUK">
                <input value={editForm.product} onChange={(e) => setEditForm(f => ({ ...f, product: e.target.value }))} className="input-field text-xs py-2" />
              </EField>
              <EField label="BARCODE">
                <input value={editForm.barcode} onChange={(e) => setEditForm(f => ({ ...f, barcode: e.target.value }))} className="input-field font-mono text-xs py-2" />
              </EField>
              <div className="grid grid-cols-2 gap-2.5">
                <EField label="BATCH">
                  <input value={editForm.batch} onChange={(e) => setEditForm(f => ({ ...f, batch: e.target.value }))} className="input-field font-mono text-xs py-2" />
                </EField>
                <EField label="EXP DATE">
                  <input value={editForm.expDate} onChange={(e) => setEditForm(f => ({ ...f, expDate: e.target.value }))} className="input-field font-mono text-xs py-2" />
                </EField>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <EField label="RECEIVE DATE">
                  <input value={editForm.receiveDate} onChange={(e) => setEditForm(f => ({ ...f, receiveDate: e.target.value }))} className="input-field font-mono text-xs py-2" />
                </EField>
                <EField label="QTY">
                  <input type="number" inputMode="numeric" value={editForm.qty} onChange={(e) => setEditForm(f => ({ ...f, qty: Number(e.target.value) }))} className="input-field font-mono font-bold text-xs py-2" />
                </EField>
              </div>
              <EField label="DISTRI / EVENT">
                <input value={editForm.distriEvent} onChange={(e) => setEditForm(f => ({ ...f, distriEvent: e.target.value }))} className="input-field text-xs py-2" />
              </EField>
              <EField label="KETERANGAN">
                <input value={editForm.keterangan} onChange={(e) => setEditForm(f => ({ ...f, keterangan: e.target.value }))} className="input-field text-xs py-2" />
              </EField>
              <EField label="PIC">
                <input value={editForm.pic} onChange={(e) => setEditForm(f => ({ ...f, pic: e.target.value }))} className="input-field font-mono text-xs py-2" />
              </EField>
            </div>

            <div className="flex gap-2.5 pt-2 border-t-2 border-[#0B0E14]">
              <button onClick={() => setEditItem(null)} className="flex-1 btn-outline">BATAL</button>
              <button onClick={handleEditSave} disabled={editSaving} className="flex-1 bg-[#16C784] text-[#0B0E14] border-2 border-[#0B0E14] shadow-[0_3px_0_#0B0E14] py-2.5 rounded-xl font-mono text-xs font-bold uppercase">
                {editSaving ? "MENYIMPAN..." : "SIMPAN"}
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
            <h3 className="font-black text-base text-[#0B0E14] text-center uppercase">HAPUS DATA INI?</h3>
            <div className="bg-[#FEF0C7] border-2 border-[#0B0E14] rounded-xl p-3 space-y-1 font-mono text-xs">
              <p className="font-black text-[#0B0E14]">{deleteItem.product}</p>
              <p className="text-gray-700 font-bold">{deleteItem.sheet.toUpperCase()} • ROW {deleteItem.rowNumber} • QTY {deleteItem.qty}</p>
            </div>
            <p className="font-mono text-xs text-gray-600 text-center">Data yang dihapus dari Sheet tidak bisa dikembalikan.</p>
            <div className="flex gap-2.5">
              <button onClick={() => setDeleteItem(null)} className="flex-1 btn-outline">BATAL</button>
              <button onClick={handleDelete} disabled={deleteLoading} className="flex-1 bg-red-500 text-white border-2 border-[#0B0E14] shadow-[0_3px_0_#0B0E14] py-2.5 rounded-xl font-mono text-xs font-bold uppercase hover:bg-red-600 disabled:opacity-40 transition-all">
                {deleteLoading ? "MENGHAPUS..." : "HAPUS"}
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
