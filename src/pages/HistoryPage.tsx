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
            <div className="grid grid-cols-[80px_1.4fr_1fr_56px_52px] gap-x-2 px-4 py-2 bg-gray-50 sticky top-0 z-10">
              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Tanggal</span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Produk / Batch</span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Distri/Event</span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 text-right">Qty</span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 text-center">Sheet</span>
            </div>

            {filteredHistory.map((item, idx) => {
              const key = `${item.sheet}-${item.rowNumber}`;
              const expanded = expandedKey === key;
              return (
                <div key={key} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/70"}>
                  {/* Compact row */}
                  <button
                    type="button"
                    onClick={() => setExpandedKey(expanded ? null : key)}
                    className="w-full grid grid-cols-[80px_1.4fr_1fr_56px_52px] gap-x-2 px-4 py-2.5 text-left hover:bg-yellow-50 transition-colors"
                  >
                    <span className="text-xs text-gray-500 leading-tight self-start break-words">{item.receiveDate || "-"}</span>
                    <div className="min-w-0 self-start">
                      <p className="text-sm font-medium text-gray-900 leading-tight break-words">{item.product || "-"}</p>
                      <p className="text-[11px] text-gray-500 leading-tight break-words mt-0.5">{item.batch || "-"}{item.expDate ? ` · ${item.expDate}` : ""}</p>
                    </div>
                    <span className="text-xs text-gray-700 leading-tight self-start break-words">{item.distriEvent || "-"}</span>
                    <span className="text-sm font-bold text-gray-900 text-right self-start">{item.qty}</span>
                    <span className={`text-[11px] font-bold text-center self-start rounded-full px-1.5 py-0.5 ${
                      item.sheet === "Bagas" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                    }`}>{item.sheet}</span>
                  </button>

                  {/* Expanded detail */}
                  {expanded && (
                    <div className="px-4 pb-3 pt-2 bg-yellow-50 border-t border-yellow-100 text-xs text-gray-700 space-y-1.5">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <p className="break-words"><span className="font-semibold text-gray-600">Barcode:</span> {item.barcode || "-"}</p>
                        <p className="break-words"><span className="font-semibold text-gray-600">Distri/Event:</span> {item.distriEvent || "-"}</p>
                        <p className="break-words"><span className="font-semibold text-gray-600">PIC:</span> {item.pic || "-"}</p>
                        <p className="break-words"><span className="font-semibold text-gray-600">Row:</span> {item.rowNumber}</p>
                      </div>
                      {item.keterangan && (
                        <p className="break-words"><span className="font-semibold text-gray-600">Keterangan:</span> {item.keterangan}</p>
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

