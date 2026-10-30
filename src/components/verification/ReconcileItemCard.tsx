import { ScanBarcode, FileEdit, Check, MessageSquare, Minus, Plus } from "lucide-react";
import type { ReconcileItem } from "../../lib/session";
import StatusBadge from "../ui/StatusBadge";

type Props = {
  item: ReconcileItem;
  onUpdateClaim: (item: ReconcileItem, newQty: number) => void;
  onScanBarcode: (barcode: string) => void;
  onOpenDiscrepancyNote: (item: ReconcileItem) => void;
};

export default function ReconcileItemCard({
  item,
  onUpdateClaim,
  onScanBarcode,
  onOpenDiscrepancyNote,
}: Props) {
  const isMatch = item.status === "match";
  const isUnscanned = item.status === "unscanned";
  const isUnder = item.status === "under";
  const isNotInSj = item.status === "not_in_sj";

  const borderClass = isMatch
    ? "border-emerald-200 bg-white"
    : isUnscanned
    ? "border-red-300 bg-red-50/40"
    : isNotInSj
    ? "border-purple-300 bg-purple-50/30"
    : "border-amber-300 bg-amber-50/30";

  return (
    <div className={`card p-3.5 transition-all border space-y-2.5 ${borderClass}`}>
      {/* Header row: StatusBadge + Product info */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusBadge status={item.status} diff={item.diff} />
            {item.confirmedDiscrepancy && !isMatch && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-gray-200 text-gray-700">
                <Check className="w-3 h-3" aria-hidden="true" />
                Terkonfirmasi
              </span>
            )}
          </div>

          <h4 className="text-sm font-bold text-gray-900 leading-snug">
            {item.product}
          </h4>
          <p className="text-xs text-gray-500 font-mono">
            SKU: {item.sku}
            {item.barcode ? ` · ${item.barcode}` : ""}
          </p>
        </div>
      </div>

      {/* Batches Breakdown */}
      {item.batches.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.batches.map((b, bIdx) => (
            <span
              key={bIdx}
              className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md border border-gray-200"
            >
              Lot: {b.batch || "-"} ({b.qty}×)
            </span>
          ))}
        </div>
      )}

      {/* Catatan Selisih */}
      {item.notes && (
        <p className="flex items-start gap-1.5 text-xs text-gray-700 bg-amber-100/70 border border-amber-200 rounded-lg px-2.5 py-1.5 font-medium">
          <MessageSquare className="w-3.5 h-3.5 shrink-0 text-amber-700 mt-0.5" aria-hidden="true" />
          <em className="not-italic">{item.notes}</em>
        </p>
      )}

      {/* Large Numbers + Claim Stepper + Quick Actions */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-200/60 flex-wrap">
        {/* Big Qty Comparators */}
        <div className="flex items-center gap-3">
          <div>
            <span className="text-xs text-gray-500 font-semibold block uppercase">
              Fisik
            </span>
            <span className="text-xl font-black text-gray-900 tabular-nums">
              {item.physicalQty}
            </span>
          </div>

          <span className="text-xs text-gray-400 font-bold">vs</span>

          {/* Klaim SJ Stepper */}
          <div>
            <span className="text-xs text-purple-700 font-semibold block uppercase mb-0.5">
              Klaim SJ
            </span>
            <div className="inline-flex items-center border border-gray-300 rounded-xl overflow-hidden bg-white shadow-xs">
              <button
                type="button"
                aria-label="Kurangi klaim"
                onClick={() => onUpdateClaim(item, Math.max(0, item.claimQty - 1))}
                className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="number"
                inputMode="numeric"
                aria-label={`Klaim SJ untuk ${item.product}`}
                value={item.claimQty}
                onChange={(e) => onUpdateClaim(item, Math.max(0, Number(e.target.value) || 0))}
                className="w-12 text-center text-base font-black text-purple-900 py-1 tabular-nums focus:outline-none"
              />
              <button
                type="button"
                aria-label="Tambah klaim"
                onClick={() => onUpdateClaim(item, item.claimQty + 1)}
                className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-1.5 ml-auto">
          {(isUnscanned || isUnder) && item.barcode && (
            <button
              type="button"
              onClick={() => onScanBarcode(item.barcode)}
              className="inline-flex items-center gap-1.5 min-h-[38px] text-xs font-bold bg-primary text-white px-3 py-1.5 rounded-xl hover:bg-primary-hover shadow-xs transition-colors"
            >
              <ScanBarcode className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Scan Ini</span>
            </button>
          )}

          {!isMatch && (
            <button
              type="button"
              onClick={() => onOpenDiscrepancyNote(item)}
              className="inline-flex items-center gap-1.5 min-h-[38px] text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 px-3 py-1.5 rounded-xl transition-colors"
            >
              <FileEdit className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{item.confirmedDiscrepancy ? "Edit Catatan" : "Catat Selisih"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
