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
        className={`${sizeClasses} rounded-full object-cover shrink-0 border border-[#0B0E14]`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses} rounded-full bg-[#0B0E14] text-[#FDE047] font-bold flex items-center justify-center shrink-0 border border-[#0B0E14]`}
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
  const isSubPage = !isHome && !isHistory && !isVerification;
  const showBottomNav = isHome || isHistory || isVerification;

  if (!user) return <LoginPage />;

  const handleOpenNewStore = () => {
    try {
      localStorage.setItem("scan-retur-flow-mode", "verify");
    } catch {}
    if (isHome) {
      window.dispatchEvent(new CustomEvent("scan-retur-open-new-store"));
    } else {
      navigate("/", { state: { openNewStore: true } });
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F3EE] text-[#0B0E14]">
      {/* Header Card */}
      <header className="sticky top-0 z-40 bg-[#F4F3EE]/95 backdrop-blur-xs pt-3 pb-2 px-4">
        <div className="max-w-lg mx-auto">
          <div className="bg-white border-2 border-[#0B0E14] shadow-[0_3px_0_#0B0E14] rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {isSubPage && (
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="w-8 h-8 rounded-xl bg-[#F4F3EE] border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] active:translate-y-[1px] active:shadow-none flex items-center justify-center text-[#0B0E14] font-bold shrink-0"
                  aria-label="Kembali"
                >
                  ←
                </button>
              )}
              <div className="min-w-0">
                <h1 className="text-base font-extrabold tracking-tight text-[#0B0E14] leading-tight">
                  Scan Retur B2B
                </h1>
                <p className="text-xs text-gray-500 font-medium leading-tight mt-0.5">
                  PIC: <span className="font-bold text-[#0B0E14]">{user.displayName}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleOpenNewStore}
                className="bg-[#FDE047] hover:bg-[#FACC15] text-[#0B0E14] border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] active:translate-y-[1px] active:shadow-none text-xs font-bold px-3 py-1.5 rounded-xl transition-all whitespace-nowrap"
              >
                + Toko Baru
              </button>
              <button
                type="button"
                onClick={() => setLogoutConfirm(true)}
                className="w-8 h-8 rounded-xl bg-[#F4F3EE] border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] active:translate-y-[1px] active:shadow-none flex items-center justify-center text-[#0B0E14] hover:bg-red-100 transition-all shrink-0"
                aria-label="Logout"
                title="Logout"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h5a2 2 0 012 2v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Logout Confirm Dialog */}
      {logoutConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setLogoutConfirm(false)} />
          <div className="relative card p-5 max-w-xs w-full space-y-4 text-center bg-white">
            <div className="flex justify-center mb-1">
              <UserAvatar user={user} size="lg" />
            </div>
            <h3 className="font-extrabold text-base text-[#0B0E14]">Logout?</h3>
            <p className="text-xs text-gray-600">
              Keluar dari akun <strong className="text-[#0B0E14]">{user.displayName}</strong>
              {user.email && (
                <span className="block text-[11px] text-gray-400 mt-0.5">{user.email}</span>
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
                className="flex-1 bg-red-500 text-white border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] py-2.5 rounded-xl text-xs font-bold hover:bg-red-600 active:translate-y-[1px] active:shadow-none transition-all"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pages */}
      <main className={`max-w-lg mx-auto px-4 py-3 ${showBottomNav ? "pb-24" : "pb-8"}`}>
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
        <nav className="fixed bottom-0 inset-x-0 z-50 bg-[#F4F3EE] border-t-2 border-[#0B0E14]">
          <div className="max-w-lg mx-auto grid grid-cols-3 gap-2.5 px-4 py-2.5">
            <NavTab
              active={isHome}
              label="Scan"
              icon={
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7V5a1 1 0 011-1h2M20 7V5a1 1 0 00-1-1h-2M4 17v2a1 1 0 001 1h2M20 17v2a1 1 0 01-1 1h-2M7 12h10" />
                </svg>
              }
              onClick={() => navigate("/")}
            />
            <NavTab
              active={isVerification}
              label="Verifikasi"
              icon={
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              onClick={() => navigate("/verification")}
            />
            <NavTab
              active={isHistory}
              label="Riwayat"
              icon={
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3}>
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
      className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-2 text-xs font-bold border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] active:translate-y-[1px] active:shadow-none transition-all ${
        active
          ? "bg-[#0B0E14] text-white"
          : "bg-white text-[#0B0E14] hover:bg-gray-50"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
