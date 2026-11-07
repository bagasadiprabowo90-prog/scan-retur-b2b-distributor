import { useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { ChevronDown, ChevronLeft, CircleCheck, Clock, ScanLine } from "lucide-react";
import { useAuth, type AppUser } from "./lib/auth";
import LoginPage from "./pages/LoginPage";
import ScanPage from "./pages/ScanPage";
import ReturnFormPage from "./pages/ReturnFormPage";
import HistoryPage from "./pages/HistoryPage";
import VerificationPage from "./pages/VerificationPage";

function UserAvatar({ user, size = "sm" }: { user: AppUser; size?: "sm" | "lg" }) {
  const [hasError, setHasError] = useState(false);
  const initial = (user.displayName || user.username || "U").charAt(0).toUpperCase();

  const sizeClasses = size === "lg" ? "w-12 h-12 text-lg" : "w-5 h-5 text-xs";

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
      className={`${sizeClasses} rounded-full bg-slate-900 text-white font-bold flex items-center justify-center shrink-0`}
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
  const HeaderIcon = isHome ? ScanLine : isVerification ? CircleCheck : Clock;

  return (
    <div className="min-h-screen w-full max-w-[430px] mx-auto flex flex-col text-slate-900 relative bg-slate-50 shadow-[0_0_50px_rgba(15,23,42,0.08)]">
      {/* Header Bento Modern */}
      <header className="sticky top-0 z-40 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
        <div className="flex items-center justify-between gap-3">
          {/* Sisi Kiri: Brand / Tab Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            {showBottomNav ? (
              <div
                className="w-9 h-9 rounded-xl bg-slate-900 text-white shadow-xs flex items-center justify-center shrink-0"
                aria-hidden="true"
              >
                <HeaderIcon className="w-4 h-4 text-emerald-400" strokeWidth={2.2} />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/")}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200/80 border border-slate-200 shadow-2xs flex items-center justify-center text-slate-700 active:scale-95 transition-all shrink-0 cursor-pointer"
                aria-label="Kembali"
              >
                <ChevronLeft className="w-4 h-4" strokeWidth={2.2} />
              </button>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-[13px] font-extrabold text-slate-900 tracking-tight leading-tight truncate">
                  {headerTitle}
                </h1>
                {isHome && (
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-xs font-extrabold shrink-0">
                    B2B
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-slate-400 leading-tight mt-0.5 truncate">
                {headerSubtitle}
              </p>
            </div>
          </div>

          {/* Sisi Kanan: Akun Pengguna */}
          <button
            type="button"
            onClick={() => setLogoutConfirm(true)}
            className="min-h-[38px] bg-slate-100/90 hover:bg-slate-200/80 border border-slate-200/90 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all shrink-0 max-w-[130px] cursor-pointer"
            title="Akun & Logout"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20 shrink-0" />
            <span className="text-xs font-bold text-slate-800 truncate">
              {user.displayName}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
          </button>
        </div>
      </header>

      {/* Logout Confirm Dialog */}
      {logoutConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setLogoutConfirm(false)} />
          <div className="relative bg-white border border-slate-200 rounded-3xl shadow-2xl p-5 max-w-xs w-full space-y-4 text-center">
            <div className="flex justify-center mb-1">
              <UserAvatar user={user} size="lg" />
            </div>
            <h3 className="font-bold text-base text-slate-900">Logout?</h3>
            <p className="text-xs text-slate-500">
              Keluar dari akun <strong className="text-slate-800">{user.displayName}</strong>
              {user.email && (
                <span className="block text-xs text-slate-400 mt-0.5">{user.email}</span>
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
                className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-red-700 active:scale-95 transition-all cursor-pointer"
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

      {/* Bottom Navigation */}
      {showBottomNav && (
        <nav className="sticky bottom-0 z-50 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-2px_12px_rgba(15,23,42,0.04)]">
          <div className="bg-slate-100/90 border border-slate-200/80 rounded-2xl p-1 grid grid-cols-3 gap-1">
            <NavTab
              active={isHome}
              label="Scan"
              icon={
                <ScanLine className="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} />
              }
              onClick={() => navigate("/")}
            />
            <NavTab
              active={isVerification}
              label="Verifikasi"
              icon={
                <CircleCheck className="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} />
              }
              onClick={() => navigate("/verification")}
            />
            <NavTab
              active={isHistory}
              label="Riwayat"
              icon={
                <Clock className="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} />
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
      className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-2 text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
        active
          ? "bg-slate-900 text-white shadow-xs"
          : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
