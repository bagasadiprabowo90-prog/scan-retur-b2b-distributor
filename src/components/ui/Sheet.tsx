import { useEffect, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

// Bottom sheet di HP, dialog tengah di layar lebar
export default function Sheet({ open, onClose, title, children, footer }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col animate-slide-up sm:animate-scale-in"
      >
        <div className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-gray-200" />
        {title && (
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 border-b border-gray-100">
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="w-11 h-11 -mr-2 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 text-xl leading-none"
            >
              ×
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && (
          <div className="px-4 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] border-t border-gray-100 flex gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
