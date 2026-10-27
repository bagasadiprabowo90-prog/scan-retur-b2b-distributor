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
        className={`${sizeClasses} rounded-full object-cover shrink-0 ring-1 ring-white/20`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses} rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 ring-1 ring-white/20`}
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gray-900 text-white sticky top-0 z-50">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2.5 min-w-0">
            {!isHome && (
              <button
                onClick={() => navigate("/")}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 transition-colors shrink-0"
                aria-label="Kembali"
              >
                <span className="text-base">←</span>
              </button>
            )}
            <span className="text-xl shrink-0">📦</span>
            <div className="min-w-0">
              <h1 className="text-sm font-bold leading-tight tracking-tight">Scan Retur</h1>
              <p className="text-[10px] text-gray-400 leading-tight">B2B Distributor</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex items-center gap-1.5 bg-white/10 text-white/90 text-[11px] font-medium px-2 py-1 rounded-lg">
              <UserAvatar user={user} size="sm" />
              <span className="truncate max-w-[110px]">{user.displayName}</span>
            </div>
            <button
              onClick={() => setLogoutConfirm(true)}
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Logout"
              title="Logout"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h5a2 2 0 012 2v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Logout Confirm Dialog */}
      {logoutConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setLogoutConfirm(false)} />
          <div className="relative card p-5 max-w-xs w-full space-y-4 text-center">
            <div className="flex justify-center mb-1">
              <UserAvatar user={user} size="lg" />
            </div>
            <h3 className="font-bold text-base text-gray-900">Logout?</h3>
            <p className="text-sm text-gray-500">
              Keluar dari akun <strong className="text-gray-700">{user.displayName}</strong>
              {user.email && (
                <span className="block text-xs text-gray-400 mt-0.5">{user.email}</span>
              )}?
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
                className="flex-1 bg-red-500 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-red-600 active:scale-[0.98] transition-all"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pages */}
      <main className={`max-w-lg mx-auto px-4 py-4 ${showBottomNav ? "pb-24" : "pb-6"}`}>
        <Routes>
          <Route path="/" element={<ScanPage />} />
          <Route path="/return-form" element={<ReturnFormPage />} />
          <Route path="/verification" element={<VerificationPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {showBottomNav && (
        <nav className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-100 shadow-lg">
          <div className="max-w-lg mx-auto grid grid-cols-3 gap-1.5 px-3 py-2">
            <NavTab active={isHome} label="Scan" icon="📷" onClick={() => navigate("/")} />
            <NavTab active={isVerification} label="Verifikasi" icon="🔍" onClick={() => navigate("/verification")} />
            <NavTab active={isHistory} label="Riwayat" icon="🕘" onClick={() => navigate("/history")} />
          </div>
        </nav>
      )}
    </div>
  );
}

function NavTab({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all ${
        active
          ? "bg-gray-900 text-white"
          : "text-gray-400 hover:bg-gray-50"
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
