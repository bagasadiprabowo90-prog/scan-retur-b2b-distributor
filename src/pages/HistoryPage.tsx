import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Pencil, Trash2, AlertTriangle } from "lucide-react";
import {
  fetchReturnHistory,
  editReturn,
  deleteReturn,
  type ReturnHistoryItem,
  type CreateReturnPayload,
} from "../lib/api";
import { syncDeleteWithActiveSession, syncEditWithActiveSession } from "../lib/session";
import Sheet from "../components/ui/Sheet";
import Button from "../components/ui/Button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Toast from "../components/ui/Toast";

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
  const [editForm, setEditForm] = useState<CreateReturnPayload>({
    receiveDate: "",
    distriEvent: "",
    product: "",
    barcode: "",
    batch: "",
    expDate: "",
    qty: 0,
    keterangan: "",
    pic: "",
  });
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
        <Toast
          type={toast.type}
          message={toast.msg}
          onClose={() => setToast(null)}
        />
      )}

      {/* Stats + Search */}
      <div className="card">
        <div className="p-4 flex items-center gap-3">
          <div className="flex-1 flex items-center gap-4">
            <div>
              <p className="text-lg font-bold text-gray-900 leading-none tabular-nums">
                {filteredHistory.length}
              </p>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mt-0.5">
                Data
              </p>
            </div>
            <div className="w-px h-8 bg-gray-100" />
            <div>
              <p className="text-lg font-bold text-gray-900 leading-none tabular-nums">
                {totalQty.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mt-0.5">
                Total Qty
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadHistory()}
            disabled={loading}
            aria-label="Muat ulang riwayat"
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-gray-50 hover:bg-gray-100 disabled:opacity-40 transition-colors shrink-0"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-gray-600 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="px-4 pb-3">
          <div className="relative">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari produk, batch, toko, atau PIC..."
              className="input-field pl-10 text-sm"
            />
          </div>
        </div>
      </div>

      {error && <Toast type="error" message={error} onClose={() => setError("")} />}

      {!error && warnings.length > 0 && (
        <div className="rounded-xl px-3.5 py-2.5 text-xs bg-amber-50 text-amber-800 border border-amber-200 space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
              <span>{w}</span>
            </p>
          ))}
        </div>
      )}

      {/* List or Skeleton Loading (R14) */}
      {loading && history.length === 0 ? (
        <div className="space-y-2" aria-busy="true" aria-label="Memuat riwayat">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card p-3.5 space-y-3 animate-pulse">
              <div className="flex justify-between gap-4">
                <div className="h-4 bg-gray-200 rounded w-2/3" />
                <div className="h-4 bg-gray-200 rounded w-10" />
              </div>
              <div className="flex gap-2">
                <div className="h-5 bg-gray-100 rounded w-20" />
                <div className="h-5 bg-gray-100 rounded w-14" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="h-3.5 bg-gray-100 rounded" />
                <div className="h-3.5 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : !error && filteredHistory.length === 0 && !loading ? (
        <div className="card px-4 py-12 text-center text-sm text-gray-500">Tidak ada data</div>
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
                  <span className="text-base font-black text-gray-900 whitespace-nowrap tabular-nums">
                    {item.qty.toLocaleString()} <span className="text-xs font-normal text-gray-500">pcs</span>
                  </span>
                </div>

                {/* Badges */}
                <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                  <span className="text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-md">
                    {item.receiveDate || "-"}
                  </span>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                      item.sheet === "Bagas"
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : "bg-purple-50 text-purple-700 border border-purple-200"
                    }`}
                  >
                    {item.sheet}
                  </span>
                  {item.pic && (
                    <span className="text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-md">
                      {item.pic}
                    </span>
                  )}
                </div>

                {/* Info rows */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Barcode</span>
                    <span className="font-mono text-gray-700 truncate ml-1">
                      {item.barcode || "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Batch</span>
                    <span className="font-mono text-gray-700 truncate ml-1">
                      {item.batch || "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Exp</span>
                    <span className="text-gray-700 truncate ml-1">{item.expDate || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Distri</span>
                    <span className="text-gray-700 truncate ml-1">{item.distriEvent || "-"}</span>
                  </div>
                </div>

                {/* Keterangan */}
                {item.keterangan && (
                  <p className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-2.5 py-1.5">
                    {item.keterangan}
                  </p>
                )}

                {/* Edit / Delete */}
                <div className="flex justify-end gap-1.5 mt-2.5 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteItem(item)}
                    className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Hapus</span>
                  </button>
                </div>
              </div>
            );
          })}

          {/* Load More */}
          {hasMore && (
            <Button
              variant="secondary"
              block
              onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
            >
              Muat lagi ({filteredHistory.length - visibleCount} tersisa)
            </Button>
          )}

          {!hasMore && filteredHistory.length > 0 && (
            <p className="text-center text-xs text-gray-500 py-2">
              {filteredHistory.length} data ditampilkan
            </p>
          )}
        </div>
      )}

      {/* Edit Sheet */}
      <Sheet
        open={!!editItem}
        onClose={() => setEditItem(null)}
        title={
          editItem ? (
            <span className="flex items-center gap-2">
              <span>Edit Data</span>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                  editItem.sheet === "Bagas"
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-purple-50 text-purple-700 border border-purple-200"
                }`}
              >
                {editItem.sheet} · Row {editItem.rowNumber}
              </span>
            </span>
          ) : (
            "Edit Data"
          )
        }
        footer={
          <>
            <Button variant="secondary" block onClick={() => setEditItem(null)}>
              Batal
            </Button>
            <Button
              variant="primary"
              block
              disabled={editSaving}
              onClick={() => void handleEditSave()}
            >
              {editSaving ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <EField label="Produk">
            <input
              value={editForm.product}
              onChange={(e) => setEditForm((f) => ({ ...f, product: e.target.value }))}
              className="input-field text-sm py-2"
            />
          </EField>
          <EField label="Barcode">
            <input
              value={editForm.barcode}
              onChange={(e) => setEditForm((f) => ({ ...f, barcode: e.target.value }))}
              className="input-field font-mono text-sm py-2"
            />
          </EField>
          <div className="grid grid-cols-2 gap-3">
            <EField label="Batch">
              <input
                value={editForm.batch}
                onChange={(e) => setEditForm((f) => ({ ...f, batch: e.target.value }))}
                className="input-field text-sm py-2"
              />
            </EField>
            <EField label="Exp Date">
              <input
                value={editForm.expDate}
                onChange={(e) => setEditForm((f) => ({ ...f, expDate: e.target.value }))}
                className="input-field text-sm py-2"
              />
            </EField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <EField label="Receive Date">
              <input
                value={editForm.receiveDate}
                onChange={(e) => setEditForm((f) => ({ ...f, receiveDate: e.target.value }))}
                className="input-field text-sm py-2"
              />
            </EField>
            <EField label="Qty">
              <input
                type="number"
                inputMode="numeric"
                value={editForm.qty}
                onChange={(e) => setEditForm((f) => ({ ...f, qty: Number(e.target.value) }))}
                className="input-field text-sm py-2 font-bold"
              />
            </EField>
          </div>
          <EField label="Distri / Event">
            <input
              value={editForm.distriEvent}
              onChange={(e) => setEditForm((f) => ({ ...f, distriEvent: e.target.value }))}
              className="input-field text-sm py-2"
            />
          </EField>
          <EField label="Keterangan">
            <input
              value={editForm.keterangan}
              onChange={(e) => setEditForm((f) => ({ ...f, keterangan: e.target.value }))}
              className="input-field text-sm py-2"
            />
          </EField>
          <EField label="PIC">
            <input
              value={editForm.pic}
              onChange={(e) => setEditForm((f) => ({ ...f, pic: e.target.value }))}
              className="input-field text-sm py-2"
            />
          </EField>
        </div>
      </Sheet>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteItem}
        title="Hapus Data?"
        message={
          deleteItem && (
            <div className="space-y-2">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-1 text-xs">
                <p className="font-bold text-gray-900 text-sm">{deleteItem.product}</p>
                <p className="text-gray-600">
                  {deleteItem.sheet} · Row {deleteItem.rowNumber} · Qty {deleteItem.qty}
                </p>
              </div>
              <p className="text-xs text-gray-500">Data yang dihapus tidak bisa dikembalikan.</p>
            </div>
          )
        }
        confirmLabel={deleteLoading ? "Menghapus..." : "Hapus"}
        danger
        onCancel={() => setDeleteItem(null)}
        onConfirm={() => void handleDelete()}
      />
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
