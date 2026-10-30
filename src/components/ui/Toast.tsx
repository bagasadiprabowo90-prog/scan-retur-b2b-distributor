import { CheckCircle2, AlertCircle, X } from "lucide-react";

type Props = {
  type: "success" | "error" | "ok" | "err";
  message: string;
  onClose?: () => void;
};

export default function Toast({ type, message, onClose }: Props) {
  const isSuccess = type === "success" || type === "ok";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold border shadow-xs ${
        isSuccess
          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
          : "bg-red-50 text-red-700 border-red-200"
      }`}
    >
      {isSuccess ? (
        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" aria-hidden="true" />
      ) : (
        <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" aria-hidden="true" />
      )}
      <span className="flex-1 leading-relaxed">{message}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup notifikasi"
          className="text-current opacity-60 hover:opacity-100 p-0.5 -mr-1 rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
