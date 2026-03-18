import { useEffect, useMemo, useState } from "react";
import { fetchReturnHistory, type ReturnHistoryItem } from "../lib/api";

export default function HistoryPage() {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ReturnHistoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  async function loadHistory() {
    setLoading(true);
    setError("");
    const res = await fetchReturnHistory(100);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setHistory(res.history);
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
    <div className="space-y-4 pb-8">
      <div className="bg-white rounded-2xl shadow-md overflow-hidden">
        <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <span>🕘</span> Riwayat Retur
            </h2>
            <p className="text-xs text-gray-300 mt-1">Menampilkan 100 data retur terbaru dari semua sheet.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadHistory()}
            disabled={loading}
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {loading ? "Memuat..." : "Muat Ulang"}
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <SummaryCard label="Total Baris" value={String(filteredHistory.length)} />
            <SummaryCard label="Total Qty" value={String(totalQty)} />
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari produk, barcode, batch, PIC, atau sheet..."
            className="input-field"
          />

          {error && (
            <div className="rounded-xl px-4 py-3 text-sm font-medium bg-red-50 text-red-700 border border-red-200">
              ❌ {error}
            </div>
          )}

          {!loading && !error && filteredHistory.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
              Belum ada data riwayat yang cocok.
            </div>
          )}

          <div className="space-y-3">
            {filteredHistory.map((item) => (
              <div key={`${item.sheet}-${item.rowNumber}`} className="rounded-2xl border border-gray-200 p-4 bg-gray-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{item.product}</p>
                    <p className="text-xs text-gray-500 mt-1">{item.barcode} • Batch {item.batch} • Exp {item.expDate || "-"}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-900 text-white text-xs font-semibold px-3 py-1">
                    {item.sheet}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm mt-4 text-gray-700">
                  <InfoItem label="Receive Date" value={item.receiveDate || "-"} />
                  <InfoItem label="Qty" value={String(item.qty)} />
                  <InfoItem label="Distri/Event" value={item.distriEvent || "-"} />
                  <InfoItem label="PIC" value={item.pic || "-"} />
                </div>

                {item.keterangan && (
                  <div className="mt-3 rounded-xl bg-white border border-gray-200 px-3 py-2 text-sm text-gray-600">
                    <span className="font-semibold text-gray-700">Keterangan:</span> {item.keterangan}
                  </div>
                )}

                <p className="text-[11px] text-gray-400 mt-3">Row {item.rowNumber} di sheet {item.sheet}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-sm text-gray-700">{value}</p>
    </div>
  );
}