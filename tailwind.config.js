/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Aksi utama: satu warna untuk semua tombol primer
        primary: {
          DEFAULT: "#111827",
          hover: "#1f2937",
          soft: "#f3f4f6",
        },
        // Status rekonsiliasi (lihat src/components/ui/StatusBadge.tsx)
        status: {
          match: "#047857",
          "match-bg": "#ecfdf5",
          short: "#b91c1c",
          "short-bg": "#fef2f2",
          over: "#b45309",
          "over-bg": "#fffbeb",
          extra: "#6d28d9",
          "extra-bg": "#f5f3ff",
        },
      },
      // Class bergaya Tailwind v4 yang sudah terpakai di kode; didefinisikan agar ter-generate di v3
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
      backdropBlur: {
        xs: "2px",
      },
      borderRadius: {
        xs: "0.125rem",
      },
      keyframes: {
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
      },
      animation: {
        "scale-in": "scale-in 150ms ease-out",
        "slide-up": "slide-up 200ms ease-out",
      },
    },
  },
  plugins: [],
};
