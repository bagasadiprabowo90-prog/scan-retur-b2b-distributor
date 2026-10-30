import { useState } from "react";
import {
  CloudDownload,
  Copy,
  Trash2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import type { ReconcileItem, SavedReconReport } from "../../lib/session";
import StatusBadge from "../ui/StatusBadge";
import ConfirmDialog from "../ui/ConfirmDialog";

type Props = {
  reconHistory: SavedReconReport[];
  onSyncFromCloud: () => Promise<void>;
  onCopyWhatsApp: (reportData: {
    storeName: string;
    noSJ?: string;
    receiveDate: string;
    pic: string;
    targetSheet: string;
    totalPhysicalQty: number;
    totalClaimQty: number;
    items: ReconcileItem[];
  }) => void;
  onDeleteHistory: (id: string) => void;
};

export default function ReconHistoryTab({
  reconHistory,
  onSyncFromCloud,
  onCopyWhatsApp,
  onDeleteHistory,
}: Props) {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportToDelete, setReportToDelete] = useState<SavedReconReport | null>(null);
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await onSyncFromCloud();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Riwayat Rekon ({reconHistory.length})
        </span>
        <button
          type="button"
          disabled={syncing}
          onClick={() => void handleSync()}
          className="inline-flex items-center gap-1.5 min-h-[38px] text-xs font-bold text-blue-700 hover:text-blue-900 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50"
        >
          <CloudDownload className={`w-4 h-4 ${syncing ? "animate-bounce" : ""}`} aria-hidden="true" />
          <span>{syncing ? "Menyinkronkan..." : "Sinkron dari Sheet"}</span>
        </button>
      </div>

      {reconHistory.length === 0 ? (
        <div className="card p-8 text-center text-xs text-gray-500">
          Belum ada riwayat verifikasi toko yang tersimpan.
        </div>
      ) : (
        reconHistory.map((rep) => {
          const dateStr = new Date(rep.verifiedAt).toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          const isOpen = selectedReportId === rep.id;

          return (
            <div key={rep.id} className="card p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-gray-900 truncate">{rep.storeName}</h3>
                  <p className="text-xs text-gray-500">
                    {rep.noSJ ? `SJ: ${rep.noSJ} · ` : ""}
                    {dateStr} · PIC: {rep.pic} (Sheet {rep.targetSheet})
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold shrink-0 ${
                    !rep.hasDiscrepancy
                      ? "bg-status-match-bg text-status-match"
                      : "bg-status-over-bg text-status-over"
                  }`}
                >
                  {!rep.hasDiscrepancy ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Sesuai</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{rep.discrepancySkuCount} Selisih</span>
                    </>
                  )}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-gray-50 p-2 rounded-xl text-center text-xs font-semibold">
                <div>
                  <span className="text-xs text-gray-500 block font-normal">Fisik</span>
                  <span className="text-sm font-bold text-gray-900 tabular-nums">
                    {rep.totalPhysicalQty} pcs
                  </span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block font-normal">Klaim SJ</span>
                  <span className="text-sm font-bold text-gray-900 tabular-nums">
                    {rep.totalClaimQty} pcs
                  </span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block font-normal">Total SKU</span>
                  <span className="text-sm font-bold text-gray-900 tabular-nums">
                    {rep.totalSku} SKU
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedReportId(isOpen ? null : rep.id)}
                  className="inline-flex items-center gap-1 min-h-[38px] px-2 -ml-2 rounded-lg font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors"
                >
                  <span>{isOpen ? "Tutup Rincian" : "Lihat Rincian"}</span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      onCopyWhatsApp({
                        storeName: rep.storeName,
                        noSJ: rep.noSJ,
                        receiveDate: rep.receiveDate,
                        pic: rep.pic,
                        targetSheet: rep.targetSheet,
                        totalPhysicalQty: rep.totalPhysicalQty,
                        totalClaimQty: rep.totalClaimQty,
                        items: rep.items,
                      })
                    }
                    className="inline-flex items-center gap-1.5 min-h-[38px] px-3 rounded-xl text-xs font-bold text-emerald-700 border border-emerald-300 bg-white hover:bg-emerald-50 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Salin WA</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportToDelete(rep)}
                    className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                    title="Hapus riwayat ini"
                    aria-label={`Hapus riwayat ${rep.storeName}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Expanded Details */}
              {isOpen && (
                <div className="pt-2 border-t border-gray-100 space-y-2">
                  <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Rincian Item:
                  </h5>
                  {rep.items.map((it, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-50 last:border-0 text-xs"
                    >
                      <div className="min-w-0 pr-2 flex-1">
                        <span className="font-bold text-gray-900 block truncate">
                          {it.product}
                        </span>
                        <span className="text-xs text-gray-500 font-mono block">
                          {it.sku}
                          {it.notes ? ` · Catatan: ${it.notes}` : ""}
                        </span>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        <span className="font-mono font-bold text-gray-900 tabular-nums">
                          {it.physicalQty} / {it.claimQty} pcs
                        </span>
                        <StatusBadge status={it.status} diff={it.diff} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      <ConfirmDialog
        open={!!reportToDelete}
        title="Hapus riwayat rekonsiliasi?"
        message={
          reportToDelete && (
            <>
              Laporan toko <strong>{reportToDelete.storeName}</strong> ({reportToDelete.totalSku} SKU)
              akan dihapus dari perangkat ini.
            </>
          )
        }
        confirmLabel="Hapus"
        danger
        onCancel={() => setReportToDelete(null)}
        onConfirm={() => {
          if (reportToDelete) {
            onDeleteHistory(reportToDelete.id);
          }
          setReportToDelete(null);
        }}
      />
    </div>
  );
}
