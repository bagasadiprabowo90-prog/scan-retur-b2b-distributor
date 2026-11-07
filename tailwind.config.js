/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Aksi utama: satu warna untuk semua tombol primer
        primary: {
          DEFAULT: "#0f172a",
          hover: "#1e293b",
          soft: "#f1f5f9",
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
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "-apple-system", "BlinkMacSystemFont", "Inter", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      // Class bergaya Tailwind v4 yang sudah terpakai di kode; didefinisikan agar ter-generate di v3
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        "2xs": "0 1px 1px 0 rgb(0 0 0 / 0.03)",
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
