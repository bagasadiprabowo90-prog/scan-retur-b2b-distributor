import { useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth, type AppUser } from "./lib/auth";
import LoginPage from "./pages/LoginPage";
import ScanPage from "./pages/ScanPage";
import ReturnFormPage from "./pages/ReturnFormPage";
import HistoryPage from "./pages/HistoryPage";
import VerificationPage from "./pages/VerificationPage";

function UserAvatar({ user, size = "sm" }: { user: AppUser; size?: "sm" | "lg" }) {
  const [hasError, setHasError] = useState(false);
  const initial = (user.displayName || user.username || "U").charAt(0).toUpperCase();

  const sizeClasses = size === "lg" ? "w-12 h-12 text-lg" : "w-5 h-5 text-[10px]";

  if (user.picture && !hasError) {
    return (
      <img
        src={user.picture}
        alt={user.displayName}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onError={() => setHasError(true)}
        className={`${sizeClasses} rounded-full object-cover shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses} rounded-full bg-[#1C1917] text-white font-bold flex items-center justify-center shrink-0`}
    >
      {initial}
    </div>
  );
}

export default function App() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  const isHome = location.pathname === "/" || location.pathname === "";
  const isHistory = location.pathname === "/history";
  const isVerification = location.pathname === "/verification";
  const showBottomNav = isHome || isHistory || isVerification;

  if (!user) return <LoginPage />;

  const headerTitle = isHome
    ? "Scan Retur B2B"
    : isVerification
    ? "Verifikasi & Batch"
    : isHistory
    ? "Riwayat Sheet"
    : "Form Retur Produk";

  const headerSubtitle = isHome
    ? "Scan & Input Retur"
    : isVerification
    ? "Klaim SJ & Rekonsiliasi"
    : isHistory
    ? "Data Google Sheet"
    : "Isi Detail Barang";

  // Ikon kiri header = ikon tab aktif, sehingga header dan tab bawah selalu seragam.
  const headerIconPath = isHome
    ? "M4 7V5a1 1 0 011-1h2M20 7V5a1 1 0 00-1-1h-2M4 17v2a1 1 0 001 1h2M20 17v2a1 1 0 01-1 1h-2M7 12h10"
    : isVerification
    ? "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
    : "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z";

  return (
    <div className="min-h-screen w-full max-w-[430px] mx-auto flex flex-col text-stone-900 relative bg-gradient-to-b from-[#ECE8E0] via-[#E2DDD3] to-[#D6D0C4] shadow-[0_0_48px_rgba(28,25,23,0.12)]">
      {/* Header seragam untuk semua tab: ikon tab | judul + subjudul | akun */}
      <header className="sticky top-0 z-40 px-4 py-3 bg-[#E6E1D8]/95 backdrop-blur-md border-b border-white/70 shadow-[0_2px_12px_rgba(28,25,23,0.06)]">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          {showBottomNav ? (
            <div
              className="w-10 h-10 rounded-full bg-[#1C1917] text-white shadow-sm flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={headerIconPath} />
              </svg>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate("/")}
              className="w-10 h-10 rounded-full bg-white/80 backdrop-blur-md border border-white/90 shadow-sm flex items-center justify-center text-stone-800 hover:bg-white active:scale-95 transition-all shrink-0"
              aria-label="Kembali"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          <div className="min-w-0 text-center">
            <h1 className="text-sm font-extrabold text-stone-900 tracking-tight leading-tight">
              {headerTitle}
            </h1>
            <p className="text-[11px] font-medium text-stone-500 leading-tight mt-0.5">
              {headerSubtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setLogoutConfirm(true)}
            className="bg-white/85 backdrop-blur-md border border-white/90 rounded-full px-3 py-2 flex items-center gap-1.5 shadow-sm hover:bg-white active:scale-95 transition-all shrink-0"
            title="Akun & Logout"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-xs font-bold text-stone-800">
              {user.displayName}
            </span>
          </button>
        </div>
      </header>

      {/* Logout Confirm Dialog */}
      {logoutConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-900/35 backdrop-blur-xs" onClick={() => setLogoutConfirm(false)} />
          <div className="relative bg-white/90 backdrop-blur-xl border border-white rounded-3xl shadow-xl p-5 max-w-xs w-full space-y-4 text-center">
            <div className="flex justify-center mb-1">
              <UserAvatar user={user} size="lg" />
            </div>
            <h3 className="font-bold text-base text-stone-900">Logout?</h3>
            <p className="text-xs text-stone-500">
              Keluar dari akun <strong className="text-stone-800">{user.displayName}</strong>
              {user.email && (
                <span className="block text-[11px] text-stone-400 mt-0.5">{user.email}</span>
              )}
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setLogoutConfirm(false)}
                className="flex-1 btn-outline"
              >
                Batal
              </button>
              <button
                onClick={() => { setLogoutConfirm(false); logout(); }}
                className="flex-1 bg-red-500 text-white py-2.5 rounded-full text-xs font-bold hover:bg-red-600 active:scale-95 transition-all"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className={`flex-1 px-4 py-3 ${showBottomNav ? "pb-4" : "pb-8"}`}>
        <Routes>
          <Route path="/" element={<ScanPage />} />
          <Route path="/return-form" element={<ReturnFormPage />} />
          <Route path="/verification" element={<VerificationPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Bottom Frosted Pill Navigation */}
      {showBottomNav && (
        <nav className="sticky bottom-0 z-50 px-4 pt-2 pb-3 bg-[#DDD8CD]/95 backdrop-blur-md border-t border-white/70 shadow-[0_-2px_12px_rgba(28,25,23,0.06)]">
          <div className="bg-white/75 border border-white/85 rounded-full p-1 grid grid-cols-3 gap-1">
            <NavTab
              active={isHome}
              label="Scan"
              icon={
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7V5a1 1 0 011-1h2M20 7V5a1 1 0 00-1-1h-2M4 17v2a1 1 0 001 1h2M20 17v2a1 1 0 01-1 1h-2M7 12h10" />
                </svg>
              }
              onClick={() => navigate("/")}
            />
            <NavTab
              active={isVerification}
              label="Verifikasi"
              icon={
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              onClick={() => navigate("/verification")}
            />
            <NavTab
              active={isHistory}
              label="Riwayat"
              icon={
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              onClick={() => navigate("/history")}
            />
          </div>
        </nav>
      )}
    </div>
  );
}

function NavTab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-full py-2.5 px-2 text-xs font-bold whitespace-nowrap transition-all ${
        active
          ? "bg-[#1C1917] text-white shadow-xs"
          : "text-stone-600 hover:text-stone-900 hover:bg-white/50"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
