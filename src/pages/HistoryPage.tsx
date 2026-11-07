import { useEffect, useMemo, useState } from "react";
import { ChevronDown, RefreshCw, Search, X } from "lucide-react";
import BatchPickerModal from "../components/BatchPickerModal";
import {
  fetchReturnHistory,
  fetchBatchesForBarcode,
  editReturn,
  deleteReturn,
  type BatchItem,
  type ReturnHistoryItem,
  type CreateReturnPayload,
} from "../lib/api";
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

const fieldClass =
  "w-full min-h-[44px] px-3 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900";

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

  // Batch picker (logika chip yang sama dengan form scan)
  const [batchModal, setBatchModal] = useState(false);
  const [productBatches, setProductBatches] = useState<BatchItem[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

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

  // Muat batch milik produk yang sedang diedit
  const editBarcode = editItem ? editForm.barcode : "";
  useEffect(() => {
    if (!editItem) {
      setProductBatches([]);
      setBatchModal(false);
      return;
    }
    const barcode = editBarcode.trim();
    if (!barcode) {
      setProductBatches([]);
      return;
    }
    let alive = true;
    (async () => {
      setLoadingBatches(true);
      const res = await fetchBatchesForBarcode(barcode);
      if (!alive) return;
      setLoadingBatches(false);
      setProductBatches(res.ok ? res.batches : []);
    })();
    return () => {
      alive = false;
    };
  }, [editItem, editBarcode]);

  function handleBatchPicked(item: BatchItem) {
    setEditForm((f) => ({ ...f, batch: item.lot, expDate: item.expDate || "" }));
    setBatchModal(false);
  }

  function handleBatchCreated(lot: string, exp: string) {
    setEditForm((f) => ({ ...f, batch: lot, expDate: exp }));
    setBatchModal(false);
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
    <div className="space-y-3 pb-8">
      {/* Toast */}
      {toast && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium border ${
            toast.type === "ok"
              ? "bg-emerald-50 text-emerald-900 border-emerald-200"
              : "bg-red-50 text-red-900 border-red-200"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Ringkasan: dua angka sejajar, satuan di label agar tidak bertumpuk */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-3">
          <p className="text-xs text-slate-500">Jumlah baris</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums leading-tight mt-0.5">
            {filteredHistory.length.toLocaleString("id-ID")}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-3">
          <p className="text-xs text-slate-500">Total qty (pcs)</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums leading-tight mt-0.5">
            {totalQty.toLocaleString("id-ID")}
          </p>
        </div>
      </div>

      {/* Cari + refresh */}
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari produk, barcode, distri, lot"
            className={`${fieldClass} pl-9 pr-9`}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-500 cursor-pointer"
              aria-label="Hapus pencarian"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => void loadHistory()}
          disabled={loading}
          className="w-11 min-h-[44px] shrink-0 rounded-lg bg-white border border-slate-300 flex items-center justify-center text-slate-700 disabled:opacity-50 cursor-pointer"
          aria-label="Muat ulang dari Sheet"
          title="Muat ulang"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm font-medium bg-red-50 text-red-900 border border-red-200">
          {error}
        </div>
      )}

      {!error && warnings.length > 0 && (
        <div className="rounded-lg px-4 py-3 text-sm bg-amber-50 text-amber-900 border border-amber-200 space-y-0.5">
          {warnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}

      {/* Daftar */}
      {loading && history.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-12 text-center text-sm text-slate-500">
          Memuat riwayat...
        </div>
      ) : !error && filteredHistory.length === 0 && !loading ? (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-12 text-center text-sm text-slate-500">
          Tidak ada data yang cocok.
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleHistory.map((item) => {
            const key = `${item.sheet}-${item.rowNumber}`;
            const meta = [item.receiveDate, `Sheet ${item.sheet}`, item.pic ? `PIC ${item.pic}` : ""]
              .filter(Boolean)
              .join(" · ");

            return (
              <div key={key} className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 leading-snug break-words">
                      {item.product || "-"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 break-words">{meta}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-slate-900 tabular-nums whitespace-nowrap">
                    {item.qty.toLocaleString("id-ID")} pcs
                  </span>
                </div>

                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-slate-500">Barcode</dt>
                  <dd className="font-mono text-slate-900 break-all">{item.barcode || "-"}</dd>
                  <dt className="text-slate-500">Batch</dt>
                  <dd className="font-mono text-slate-900 break-words">{item.batch || "-"}</dd>
                  <dt className="text-slate-500">Exp</dt>
                  <dd className="text-slate-900">{item.expDate || "-"}</dd>
                  <dt className="text-slate-500">Distri</dt>
                  <dd className="text-slate-900 break-words">{item.distriEvent || "-"}</dd>
                  {item.keterangan && (
                    <>
                      <dt className="text-slate-500">Kondisi</dt>
                      <dd className="text-slate-900 break-words">{item.keterangan}</dd>
                    </>
                  )}
                </dl>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    className="min-h-[44px] rounded-lg bg-white border border-slate-300 text-sm font-semibold text-slate-800 cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteItem(item)}
                    className="min-h-[44px] rounded-lg bg-white border border-red-300 text-sm font-semibold text-red-700 cursor-pointer"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            );
          })}

          {hasMore && (
            <button
              type="button"
              onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
              className="w-full min-h-[48px] rounded-lg bg-white border border-slate-300 text-sm font-semibold text-slate-800 cursor-pointer"
            >
              Muat lagi ({filteredHistory.length - visibleCount} tersisa)
            </button>
          )}

          {!hasMore && filteredHistory.length > 0 && (
            <p className="text-center text-xs text-slate-500 py-2">
              {filteredHistory.length} data ditampilkan
            </p>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setEditItem(null)} />
          <div className="relative bg-white rounded-xl p-4 max-w-sm w-full space-y-3.5 mb-8 shadow-xl">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-bold text-base text-slate-900">Edit data</h3>
                <p className="text-xs text-slate-500">
                  Sheet {editItem.sheet} · baris {editItem.rowNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditItem(null)}
                className="w-10 h-10 -mt-1 -mr-1 flex items-center justify-center text-slate-500 cursor-pointer"
                aria-label="Tutup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <EField label="Produk">
                <input value={editForm.product} onChange={(e) => setEditForm(f => ({ ...f, product: e.target.value }))} className={fieldClass} />
              </EField>
              <EField label="Barcode">
                <input value={editForm.barcode} onChange={(e) => setEditForm(f => ({ ...f, barcode: e.target.value }))} className={`${fieldClass} font-mono`} />
              </EField>
              <div className="grid grid-cols-2 gap-3">
                <EField label="Batch">
                  <button
                    type="button"
                    onClick={() => setBatchModal(true)}
                    className={`${fieldClass} flex items-center justify-between text-left font-mono cursor-pointer`}
                  >
                    <span className={`truncate ${editForm.batch ? "text-slate-900" : "text-slate-500"}`}>
                      {editForm.batch ? (editForm.batch === "-" ? "Tanpa batch" : editForm.batch) : "Pilih batch"}
                    </span>
                    <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-1" />
                  </button>
                </EField>
                <EField label="Exp date">
                  <input value={editForm.expDate} onChange={(e) => setEditForm(f => ({ ...f, expDate: e.target.value }))} className={fieldClass} />
                </EField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <EField label="Tanggal terima">
                  <input value={editForm.receiveDate} onChange={(e) => setEditForm(f => ({ ...f, receiveDate: e.target.value }))} className={fieldClass} />
                </EField>
                <EField label="Qty (pcs)">
                  <input type="number" inputMode="numeric" value={editForm.qty} onChange={(e) => setEditForm(f => ({ ...f, qty: Number(e.target.value) }))} className={`${fieldClass} font-semibold`} />
                </EField>
              </div>
              <EField label="Distri / Event">
                <input value={editForm.distriEvent} onChange={(e) => setEditForm(f => ({ ...f, distriEvent: e.target.value }))} className={fieldClass} />
              </EField>
              <EField label="Keterangan">
                <input value={editForm.keterangan} onChange={(e) => setEditForm(f => ({ ...f, keterangan: e.target.value }))} className={fieldClass} />
              </EField>
              <EField label="PIC">
                <input value={editForm.pic} onChange={(e) => setEditForm(f => ({ ...f, pic: e.target.value }))} className={fieldClass} />
              </EField>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-200">
              <button type="button" onClick={() => setEditItem(null)} className="min-h-[48px] rounded-lg bg-white border border-slate-300 text-sm font-semibold text-slate-800 cursor-pointer">Batal</button>
              <button type="button" onClick={handleEditSave} disabled={editSaving} className="min-h-[48px] rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer">
                {editSaving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch picker untuk form edit */}
      <BatchPickerModal
        open={batchModal}
        onClose={() => setBatchModal(false)}
        product={
          editItem
            ? { barcode: editForm.barcode, sku: "", product: editForm.product }
            : null
        }
        productBatches={productBatches}
        productBatchesLoading={loadingBatches}
        batches={[]}
        currentLot={editForm.batch}
        onPickExisting={handleBatchPicked}
        onCreateNew={handleBatchCreated}
      />

      {/* Konfirmasi hapus */}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDeleteItem(null)} />
          <div className="relative bg-white rounded-xl p-4 max-w-xs w-full space-y-3 shadow-xl">
            <h3 className="font-bold text-base text-slate-900">Hapus data ini?</h3>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1 text-sm">
              <p className="font-semibold text-slate-900 leading-snug break-words">{deleteItem.product}</p>
              <p className="text-slate-600">Sheet {deleteItem.sheet} · baris {deleteItem.rowNumber} · {deleteItem.qty} pcs</p>
            </div>
            <p className="text-sm text-slate-600">Data yang dihapus dari Sheet tidak dapat dikembalikan.</p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button type="button" onClick={() => setDeleteItem(null)} className="min-h-[48px] rounded-lg bg-white border border-slate-300 text-sm font-semibold text-slate-800 cursor-pointer">Batal</button>
              <button type="button" onClick={handleDelete} disabled={deleteLoading} className="min-h-[48px] rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer">
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
    <div className="space-y-1">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}
