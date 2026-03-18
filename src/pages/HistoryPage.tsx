import { useEffect, useMemo, useState } from "react";
import { fetchReturnHistory, type ReturnHistoryItem } from "../lib/api";

const HISTORY_LIMIT = 500;

export default function HistoryPage() {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ReturnHistoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  async function loadHistory() {
    setLoading(true);
    setError("");
    setExpandedKey(null);
    const res = await fetchReturnHistory(HISTORY_LIMIT);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setHistory(res.history);
    setWarnings(res.warnings || []);
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

  const totalQty = filteredHistory.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

  return (
    <div className="space-y-3 pb-8">
      {/* Header summary */}
      <div className="bg-white rounded-2xl shadow-md overflow-hidden">
        <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold flex items-center gap-2"><span>🕘</span> Riwayat Retur</h2>
            <p className="text-xs text-gray-300 mt-0.5">Maks. {HISTORY_LIMIT} data terbaru · semua sheet</p>
          </div>
          <button
            type="button"
            onClick={() => void loadHistory()}
            disabled={loading}
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {loading ? "Memuat..." : "↺ Muat"}
          </button>
        </div>

        <div className="px-4 py-3 flex gap-4 border-b border-gray-100">
          <div className="text-center">
            <p className="text-xl font-bold text-gray-900">{filteredHistory.length}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Baris</p>
          </div>
          <div className="w-px bg-gray-200" />
          <div className="text-center">
            <p className="text-xl font-bold text-gray-900">{totalQty.toLocaleString()}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Total Qty</p>
          </div>
          <div className="flex-1" />
          <div className="flex items-center">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari..."
              className="border border-gray-300 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-36"
            />
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 text-sm bg-red-50 text-red-700 border-b border-red-100">❌ {error}</div>
        )}

        {!error && warnings.length > 0 && (
          <div className="px-4 py-3 text-sm bg-amber-50 text-amber-800 border-b border-amber-100 space-y-0.5">
            {warnings.map((w, i) => <p key={i}>⚠️ {w}</p>)}
          </div>
        )}

        {/* Compact list */}
        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400 animate-pulse">Memuat riwayat...</div>
        ) : !error && filteredHistory.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">Belum ada data riwayat yang cocok.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {/* Table header */}
            <div className="grid grid-cols-[72px_1fr_56px_48px] gap-x-2 px-4 py-2 bg-gray-50">
              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Tanggal</span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Produk / Batch</span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 text-right">Qty</span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 text-center">Sheet</span>
            </div>

            {filteredHistory.map((item) => {
              const key = `${item.sheet}-${item.rowNumber}`;
              const expanded = expandedKey === key;
              return (
                <div key={key}>
                  {/* Compact row */}
                  <button
                    type="button"
                    onClick={() => setExpandedKey(expanded ? null : key)}
                    className="w-full grid grid-cols-[72px_1fr_56px_48px] gap-x-2 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-xs text-gray-500 leading-tight self-center">{item.receiveDate || "-"}</span>
                    <div className="min-w-0 self-center">
                      <p className="text-sm font-medium text-gray-900 truncate leading-tight">{item.product}</p>
                      <p className="text-[11px] text-gray-400 leading-tight truncate">{item.batch}{item.expDate ? ` · ${item.expDate}` : ""}</p>
                    </div>
                    <span className="text-sm font-bold text-gray-900 text-right self-center">{item.qty}</span>
                    <span className={`text-[11px] font-bold text-center self-center rounded-full px-1.5 py-0.5 ${
                      item.sheet === "Bagas" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                    }`}>{item.sheet}</span>
                  </button>

                  {/* Expanded detail */}
                  {expanded && (
                    <div className="px-4 pb-3 pt-1 bg-gray-50 border-t border-gray-100 text-xs text-gray-600 space-y-1">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <p><span className="font-semibold text-gray-500">Barcode:</span> {item.barcode}</p>
                        <p><span className="font-semibold text-gray-500">Distri/Event:</span> {item.distriEvent || "-"}</p>
                        <p><span className="font-semibold text-gray-500">PIC:</span> {item.pic || "-"}</p>
                        <p><span className="font-semibold text-gray-500">Row:</span> {item.rowNumber}</p>
                      </div>
                      {item.keterangan && (
                        <p className="mt-1"><span className="font-semibold text-gray-500">Keterangan:</span> {item.keterangan}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

