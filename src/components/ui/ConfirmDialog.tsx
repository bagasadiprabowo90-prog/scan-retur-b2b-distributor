import type { ReactNode } from "react";
import Sheet from "./Sheet";
import Button from "./Button";

type Props = {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// Pengganti window.confirm()
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Lanjutkan",
  cancelLabel = "Batal",
  danger,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" block onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} block onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-gray-700 leading-relaxed">{message}</div>
    </Sheet>
  );
}
