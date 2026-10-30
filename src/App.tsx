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
      className={`${sizeClasses} rounded-full bg-[#0F172A] text-white font-bold flex items-center justify-center shrink-0`}
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

  return (
    <div className="min-h-screen w-full max-w-[430px] mx-auto flex flex-col text-slate-900 relative">
      {/* Soft Mineral & Frosted Glass Header */}
      <header className="sticky top-0 z-40 px-4 pt-3 pb-2 bg-[#DCE5EA]/80 backdrop-blur-lg">
        <div className="flex items-center justify-between gap-2">
          {!isHome ? (
            <button
              type="button"
              onClick={() => navigate("/")}
              className="w-9 h-9 rounded-full bg-white/80 backdrop-blur-md border border-white/90 shadow-2xs flex items-center justify-center text-slate-800 hover:bg-white active:scale-95 transition-all shrink-0"
              aria-label="Kembali"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate("/verification")}
              className="w-9 h-9 rounded-full bg-white/80 backdrop-blur-md border border-white/90 shadow-2xs flex items-center justify-center text-slate-800 hover:bg-white active:scale-95 transition-all shrink-0"
              aria-label="Verifikasi & Batch"
              title="Verifikasi & Batch"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </button>
          )}

          <h1 className="text-sm font-bold text-slate-900 tracking-tight text-center">
            {headerTitle}
          </h1>

          <button
            type="button"
            onClick={() => setLogoutConfirm(true)}
            className="bg-white/85 backdrop-blur-md border border-white/90 rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-2xs hover:bg-white active:scale-95 transition-all shrink-0"
            title="Akun & Logout"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-xs font-bold text-slate-800">
              {user.displayName}
            </span>
          </button>
        </div>
      </header>

      {/* Logout Confirm Dialog */}
      {logoutConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-xs" onClick={() => setLogoutConfirm(false)} />
          <div className="relative bg-white/90 backdrop-blur-xl border border-white rounded-3xl shadow-xl p-5 max-w-xs w-full space-y-4 text-center">
            <div className="flex justify-center mb-1">
              <UserAvatar user={user} size="lg" />
            </div>
            <h3 className="font-bold text-base text-slate-900">Logout?</h3>
            <p className="text-xs text-slate-500">
              Keluar dari akun <strong className="text-slate-800">{user.displayName}</strong>
              {user.email && (
                <span className="block text-[11px] text-slate-400 mt-0.5">{user.email}</span>
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
      <main className={`flex-1 px-4 py-2 ${showBottomNav ? "pb-24" : "pb-8"}`}>
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
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50 px-4 pb-3 pt-1.5 bg-gradient-to-t from-[#BCCBD4] via-[#BCCBD4]/90 to-transparent">
          <div className="bg-white/75 backdrop-blur-xl border border-white/85 rounded-full p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.08)] grid grid-cols-3 gap-1">
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
      className={`flex items-center justify-center gap-1.5 rounded-full py-2 px-2 text-xs font-bold transition-all ${
        active
          ? "bg-[#0F172A] text-white shadow-xs"
          : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
