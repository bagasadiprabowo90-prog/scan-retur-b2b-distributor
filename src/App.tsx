import { useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "./lib/auth";
import LoginPage from "./pages/LoginPage";
import ScanPage from "./pages/ScanPage";
import ReturnFormPage from "./pages/ReturnFormPage";
import HistoryPage from "./pages/HistoryPage";

export default function App() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const isHome = location.pathname === "/" || location.pathname === "";
  const isHistory = location.pathname === "/history";
  const showBottomNav = isHome || isHistory;

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
            <span className="bg-white/10 text-white/90 text-[11px] font-medium px-2.5 py-1 rounded-lg">
              {user.displayName}
            </span>
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
          <div className="relative card p-5 max-w-xs w-full space-y-4">
            <h3 className="font-bold text-base text-gray-900 text-center">Logout?</h3>
            <p className="text-sm text-gray-500 text-center">
              Keluar dari akun <strong className="text-gray-700">{user.displayName}</strong>?
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
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {showBottomNav && (
        <nav className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-100">
          <div className="max-w-lg mx-auto grid grid-cols-2 gap-1.5 px-4 py-2.5">
            <NavTab active={isHome} label="Scan" icon="📷" onClick={() => navigate("/")} />
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
