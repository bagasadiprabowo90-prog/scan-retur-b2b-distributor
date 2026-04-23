import { useEffect, useMemo, useState } from "react";
import { fetchReturnHistory, type ReturnHistoryItem } from "../lib/api";

const HISTORY_LIMIT = 500;

export default function HistoryPage() {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ReturnHistoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

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

        {/* Card list */}
        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400 animate-pulse">Memuat riwayat...</div>
        ) : !error && filteredHistory.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">Belum ada data riwayat yang cocok.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredHistory.map((item, idx) => {
              const key = `${item.sheet}-${item.rowNumber}`;
              return (
                <div
                  key={key}
                  className={`px-4 py-3 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/70"}`}
                >
                  {/* Top row: Date + Sheet badge + Qty */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex items-center justify-center bg-gray-100 text-gray-600 text-[11px] font-bold px-2 py-0.5 rounded-lg whitespace-nowrap">
                        {item.receiveDate || "-"}
                      </span>
                      <span
                        className={`inline-block text-[11px] font-bold rounded-full px-2 py-0.5 whitespace-nowrap ${
                          item.sheet === "Bagas"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-purple-100 text-purple-700"
                        }`}
                      >
                        {item.sheet}
                      </span>
                    </div>
                    <span className="text-base font-bold text-gray-900 whitespace-nowrap">
                      {item.qty.toLocaleString()}
                    </span>
                  </div>

                  {/* Product name */}
                  <p className="text-sm font-semibold text-gray-900 leading-snug mb-1.5">
                    {item.product || "-"}
                  </p>

                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-gray-600">
                    <div className="flex items-start gap-1 min-w-0">
                      <span className="text-gray-400 shrink-0">Barcode</span>
                      <span className="font-medium text-gray-700 truncate">{item.barcode || "-"}</span>
                    </div>
                    <div className="flex items-start gap-1 min-w-0">
                      <span className="text-gray-400 shrink-0">Batch</span>
                      <span className="font-medium text-gray-700 truncate">{item.batch || "-"}</span>
                    </div>
                    <div className="flex items-start gap-1 min-w-0">
                      <span className="text-gray-400 shrink-0">Exp</span>
                      <span className="font-medium text-gray-700 truncate">{item.expDate || "-"}</span>
                    </div>
                    <div className="flex items-start gap-1 min-w-0">
                      <span className="text-gray-400 shrink-0">Distri/Event</span>
                      <span className="font-medium text-gray-700 truncate">{item.distriEvent || "-"}</span>
                    </div>
                    <div className="flex items-start gap-1 min-w-0">
                      <span className="text-gray-400 shrink-0">PIC</span>
                      <span className="font-medium text-gray-700 truncate">{item.pic || "-"}</span>
                    </div>
                    <div className="flex items-start gap-1 min-w-0">
                      <span className="text-gray-400 shrink-0">Row</span>
                      <span className="font-medium text-gray-700">{item.rowNumber}</span>
                    </div>
                  </div>

                  {/* Keterangan */}
                  {item.keterangan && (
                    <div className="mt-1.5 text-[11px] text-gray-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                      <span className="text-amber-700 font-semibold">Keterangan: </span>
                      <span className="text-gray-700">{item.keterangan}</span>
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

