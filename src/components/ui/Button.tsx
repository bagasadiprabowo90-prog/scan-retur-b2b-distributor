import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "bg-white text-gray-800 border border-gray-200 hover:bg-gray-50",
  ghost: "bg-transparent text-gray-700 hover:bg-gray-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

// Tinggi minimum 44px (md) / 52px (lg) agar mudah ditekan di gudang
const SIZE: Record<Size, string> = {
  md: "min-h-[44px] px-4 text-sm",
  lg: "min-h-[52px] px-5 text-base",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  block?: boolean;
};

export default function Button({
  variant = "primary",
  size = "md",
  icon,
  block,
  className = "",
  children,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/30 ${VARIANT[variant]} ${SIZE[size]} ${block ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
