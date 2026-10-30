import type { ReconcileItem } from "../../lib/session";

type Status = ReconcileItem["status"];

// Status selalu tampil sebagai warna + simbol + teks, tidak hanya warna
const STATUS: Record<Status, { label: string; symbol: string; className: string }> = {
  match: { label: "Sesuai", symbol: "✓", className: "bg-status-match-bg text-status-match" },
  under: { label: "Fisik Kurang", symbol: "−", className: "bg-status-short-bg text-status-short" },
  unscanned: { label: "Belum Scan", symbol: "!", className: "bg-status-short-bg text-status-short" },
  over: { label: "Fisik Lebih", symbol: "+", className: "bg-status-over-bg text-status-over" },
  not_in_sj: { label: "Tidak Ada di SJ", symbol: "?", className: "bg-status-extra-bg text-status-extra" },
};

export default function StatusBadge({ status, diff }: { status: Status; diff?: number }) {
  const s = STATUS[status] ?? STATUS.over;
  const diffSuffix =
    diff !== undefined && status !== "match" && status !== "unscanned" && diff !== 0
      ? ` (${diff > 0 ? `+${diff}` : diff})`
      : "";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${s.className}`}
    >
      <span aria-hidden="true">{s.symbol}</span>
      <span>
        {s.label}
        {diffSuffix}
      </span>
    </span>
  );
}
