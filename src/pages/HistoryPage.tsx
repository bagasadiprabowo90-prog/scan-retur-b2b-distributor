import { useEffect, useMemo, useState } from "react";
import { Edit3, FileSpreadsheet, Package, RefreshCw, Search, Trash2, X } from "lucide-react";
import { fetchReturnHistory, editReturn, deleteReturn, type ReturnHistoryItem, type CreateReturnPayload } from "../lib/api";
import { syncDeleteWithActiveSession, syncEditWithActiveSession } from "../lib/session";

function getCategoryBadge(productName: string) {
  const p = (productName || "").toUpperCase();
  if (p.includes("CUSHION")) return { label: "CC", bg: "bg-purple-50 text-purple-700 border-purple-200/60" };
  if (p.includes("LIP") || p.includes("COAT")) return { label: "LC", bg: "bg-amber-50 text-amber-700 border-amber-200/60" };
  if (p.includes("BALM")) return { label: "BM", bg: "bg-rose-50 text-rose-700 border-rose-200/60" };
  if (p.includes("POWDER")) return { label: "PW", bg: "bg-blue-50 text-blue-700 border-blue-200/60" };
  if (p.includes("BROW") || p.includes("EYE")) return { label: "EB", bg: "bg-teal-50 text-teal-700 border-teal-200/60" };
  return { label: "PR", bg: "bg-slate-100 text-slate-700 border-slate-200/60" };
}

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
    <div className="space-y-3.5 pb-8">
      {/* Toast */}
      {toast && (
        <div
          className={`rounded-2xl px-4 py-3 text-xs font-semibold border shadow-xs ${
            toast.type === "ok"
              ? "bg-emerald-50 text-emerald-900 border-emerald-200"
              : "bg-red-50 text-red-900 border-red-200"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Bento Stats & Actions Grid */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Ringkasan Data
            </span>
            <div className="text-xl font-black text-slate-900 font-mono tracking-tight mt-0.5">
              {totalQty.toLocaleString()}{" "}
              <span className="text-xs font-sans font-semibold text-slate-500">pcs total</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              {filteredHistory.length} baris dari {history.length} data sheet
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadHistory()}
            disabled={loading}
            className="min-h-[40px] px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
            title="Refresh Data dari Sheet"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${loading ? "animate-spin" : ""}`} />
            <span>{loading ? "Memuat..." : "Refresh"}</span>
          </button>
        </div>

        {/* Search Micro-Trigger / Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" strokeWidth={2} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari produk, barcode, distri, atau lot..."
            className="w-full min-h-[44px] pl-10 pr-9 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
              aria-label="Hapus filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl px-4 py-3 text-xs font-semibold bg-red-50 text-red-900 border border-red-200">
          {error}
        </div>
      )}

      {!error && warnings.length > 0 && (
        <div className="rounded-2xl px-4 py-3 text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200 space-y-0.5">
          {warnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}

      {/* List History Bento Cards */}
      {loading && history.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl px-4 py-12 text-center text-xs font-semibold text-slate-400 animate-pulse">
          Memuat riwayat dari Google Sheet...
        </div>
      ) : !error && filteredHistory.length === 0 && !loading ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl px-4 py-12 text-center text-xs font-semibold text-slate-400">
          Tidak ada data riwayat yang cocok dengan pencarian.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleHistory.map((item) => {
            const key = `${item.sheet}-${item.rowNumber}`;
            const badge = getCategoryBadge(item.product);

            return (
              <div key={key} className="bg-white border border-slate-200/90 rounded-3xl p-4 shadow-2xs space-y-3">
                {/* Header: Category Badge + Product + Qty Pill */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center font-bold text-xs shrink-0 ${badge.bg}`}>
                    {badge.label}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-extrabold text-slate-900 leading-snug break-words">
                      {item.product || "-"}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                        {item.receiveDate || "-"}
                      </span>
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${
                          item.sheet === "Bagas"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : "bg-amber-50 text-amber-800 border-amber-200"
                        }`}
                      >
                        Sheet {item.sheet}
                      </span>
                      {item.pic && (
                        <span className="text-[10px] font-medium text-slate-500 bg-slate-50 border border-slate-200/80 px-2 py-0.5 rounded-md">
                          PIC: {item.pic}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="inline-block bg-slate-900 text-white font-mono text-xs font-black px-2.5 py-1 rounded-xl shadow-2xs whitespace-nowrap tabular-nums">
                      {item.qty.toLocaleString()} pcs
                    </span>
                  </div>
                </div>

                {/* Structured Details Bento Grid */}
                <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-2.5 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        Barcode
                      </span>
                      <span className="font-mono text-[11px] font-bold text-slate-800 break-all">
                        {item.barcode || "-"}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        Batch
                      </span>
                      <span className="font-mono text-[11px] font-bold text-slate-800 break-words">
                        {item.batch || "-"}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        Exp Date
                      </span>
                      <span className="text-[11px] font-bold text-emerald-700 break-words">
                        {item.expDate || "-"}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 flex items-baseline justify-between gap-3">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                      Distri / Event
                    </span>
                    <span className="text-xs font-bold text-slate-800 text-right break-words truncate">
                      {item.distriEvent || "-"}
                    </span>
                  </div>
                </div>

                {/* Keterangan */}
                {item.keterangan && (
                  <div className="text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-1.5 break-words">
                    Kondisi: <strong className="text-slate-900">{item.keterangan}</strong>
                  </div>
                )}

                {/* Edit & Hapus Buttons */}
                <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    className="min-h-[32px] px-3 py-1 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer flex items-center gap-1"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteItem(item)}
                    className="min-h-[32px] px-3 py-1 rounded-xl text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-all cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    <span>Hapus</span>
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
              className="w-full min-h-[44px] py-2.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200/90 text-xs font-bold text-slate-700 shadow-2xs transition-colors cursor-pointer"
            >
              Muat Lagi ({filteredHistory.length - visibleCount} tersisa)
            </button>
          )}

          {!hasMore && filteredHistory.length > 0 && (
            <p className="text-center text-xs font-medium text-slate-400 py-2">
              Semua {filteredHistory.length} data ditampilkan
            </p>
          )}
        </div>
      )}

      {/* Edit Modal (Bento Dialog) */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 overflow-y-auto">
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-xs" onClick={() => setEditItem(null)} />
          <div className="relative bg-white border border-slate-200 rounded-3xl p-5 max-w-sm w-full space-y-3.5 mb-8 shadow-2xl">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <h3 className="font-extrabold text-sm text-slate-900">Edit Data Sheet</h3>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                Sheet {editItem.sheet} · Row {editItem.rowNumber}
              </span>
            </div>

            <div className="space-y-2.5">
              <EField label="Produk">
                <input value={editForm.product} onChange={(e) => setEditForm(f => ({ ...f, product: e.target.value }))} className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400" />
              </EField>
              <EField label="Barcode">
                <input value={editForm.barcode} onChange={(e) => setEditForm(f => ({ ...f, barcode: e.target.value }))} className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400" />
              </EField>
              <div className="grid grid-cols-2 gap-2.5">
                <EField label="Batch">
                  <input value={editForm.batch} onChange={(e) => setEditForm(f => ({ ...f, batch: e.target.value }))} className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400" />
                </EField>
                <EField label="Exp Date">
                  <input value={editForm.expDate} onChange={(e) => setEditForm(f => ({ ...f, expDate: e.target.value }))} className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400" />
                </EField>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <EField label="Receive Date">
                  <input value={editForm.receiveDate} onChange={(e) => setEditForm(f => ({ ...f, receiveDate: e.target.value }))} className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400" />
                </EField>
                <EField label="Qty (Pcs)">
                  <input type="number" inputMode="numeric" value={editForm.qty} onChange={(e) => setEditForm(f => ({ ...f, qty: Number(e.target.value) }))} className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold text-xs text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400" />
                </EField>
              </div>
              <EField label="Distri / Event">
                <input value={editForm.distriEvent} onChange={(e) => setEditForm(f => ({ ...f, distriEvent: e.target.value }))} className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400" />
              </EField>
              <EField label="Keterangan">
                <input value={editForm.keterangan} onChange={(e) => setEditForm(f => ({ ...f, keterangan: e.target.value }))} className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400" />
              </EField>
              <EField label="PIC">
                <input value={editForm.pic} onChange={(e) => setEditForm(f => ({ ...f, pic: e.target.value }))} className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400" />
              </EField>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setEditItem(null)} className="flex-1 min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer">Batal</button>
              <button onClick={handleEditSave} disabled={editSaving} className="flex-1 min-h-[40px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer transition-colors shadow-xs">
                {editSaving ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal (Bento Dialog) */}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-xs" onClick={() => setDeleteItem(null)} />
          <div className="relative bg-white border border-slate-200 rounded-3xl p-5 max-w-xs w-full space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-base text-slate-900 text-center">Hapus Data Ini?</h3>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-1 text-xs">
              <p className="font-extrabold text-slate-900 leading-snug break-words">{deleteItem.product}</p>
              <p className="text-slate-600 font-medium">Sheet {deleteItem.sheet} • Row {deleteItem.rowNumber} • Qty {deleteItem.qty} pcs</p>
            </div>
            <p className="text-xs text-slate-500 text-center">Data yang dihapus dari Sheet tidak dapat dikembalikan.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteItem(null)} className="flex-1 min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer">Batal</button>
              <button onClick={handleDelete} disabled={deleteLoading} className="flex-1 min-h-[40px] bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold disabled:opacity-40 transition-colors shadow-xs cursor-pointer">
                {deleteLoading ? "Menghapus..." : "Hapus Permanen"}
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
