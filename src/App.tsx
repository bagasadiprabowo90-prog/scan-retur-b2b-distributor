import { useEffect, useState, type ReactNode } from "react";
import {
  ScanBarcode,
  ClipboardCheck,
  History,
  ArrowLeft,
  Package,
  Store,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth, type AppUser } from "./lib/auth";
import { getActiveSession, type StoreSession } from "./lib/session";
import Sheet from "./components/ui/Sheet";
import Button from "./components/ui/Button";
import LoginPage from "./pages/LoginPage";
import ScanPage from "./pages/ScanPage";
import ReturnFormPage from "./pages/ReturnFormPage";
import HistoryPage from "./pages/HistoryPage";
import VerificationPage from "./pages/VerificationPage";

function UserAvatar({ user, size = "sm" }: { user: AppUser; size?: "sm" | "lg" }) {
  const [hasError, setHasError] = useState(false);
  const initial = (user.displayName || user.username || "U").charAt(0).toUpperCase();

  const sizeClasses = size === "lg" ? "w-12 h-12 text-lg" : "w-6 h-6 text-xs";

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
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<StoreSession | null>(getActiveSession);

  const isHome = location.pathname === "/" || location.pathname === "";
  const isHistory = location.pathname === "/history";
  const isVerification = location.pathname === "/verification";
  const showBottomNav = isHome || isHistory || isVerification;

  useEffect(() => {
    const sync = () => setActiveSession(getActiveSession());
    sync();
    window.addEventListener("scan-retur-session-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("scan-retur-session-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, [location.pathname]);

  if (!user) return <LoginPage />;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gray-900 text-white sticky top-0 z-50">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14 gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {!isHome && (
              <button
                type="button"
                onClick={() => navigate("/")}
                className="flex items-center justify-center w-11 h-11 -ml-2 rounded-lg hover:bg-white/10 transition-colors shrink-0"
                aria-label="Kembali"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <Package className="w-5 h-5 shrink-0 text-gray-300" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold leading-tight tracking-tight shrink-0">
                  Scan Retur
                </h1>
                {activeSession && (
                  <button
                    type="button"
                    onClick={() => navigate("/verification")}
                    className="inline-flex items-center gap-1 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 px-2 py-0.5 rounded-full text-xs font-semibold truncate max-w-[160px] hover:bg-emerald-500/30 transition-colors"
                    title={`Toko aktif: ${activeSession.storeName}`}
                  >
                    <Store className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{activeSession.storeName}</span>
                  </button>
                )}
              </div>
              {!activeSession && (
                <p className="text-xs text-gray-400 leading-tight truncate">B2B Distributor</p>
              )}
            </div>
          </div>

          {/* Profile Menu Trigger */}
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            aria-label="Menu profil pengguna"
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 text-white/95 text-xs font-medium pl-2 pr-2.5 min-h-[40px] rounded-xl transition-colors shrink-0"
          >
            <UserAvatar user={user} size="sm" />
            <span className="truncate max-w-[90px] hidden xs:inline sm:inline">
              {user.displayName}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Profile & Logout Sheet */}
      <Sheet
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title="Profil Pengguna"
        footer={
          <>
            <Button variant="secondary" block onClick={() => setProfileOpen(false)}>
              Tutup
            </Button>
            <Button
              variant="danger"
              block
              icon={<LogOut className="w-4 h-4" />}
              onClick={() => {
                setProfileOpen(false);
                logout();
              }}
            >
              Logout
            </Button>
          </>
        }
      >
        <div className="space-y-4 py-1">
          <div className="flex items-center gap-3">
            <UserAvatar user={user} size="lg" />
            <div className="min-w-0">
              <p className="font-bold text-base text-gray-900 truncate">{user.displayName}</p>
              {user.email && (
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              )}
            </div>
          </div>

          {activeSession && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-xs font-semibold text-gray-500 block">
                  Sesi Toko Aktif
                </span>
                <p className="text-sm font-bold text-gray-900 truncate">
                  {activeSession.storeName}
                </p>
                <p className="text-xs text-gray-500">
                  Sheet {activeSession.targetSheet} · {activeSession.items.length} scan
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setProfileOpen(false);
                  navigate("/verification");
                }}
              >
                Buka
              </Button>
            </div>
          )}
        </div>
      </Sheet>

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
            <NavTab
              active={isHome}
              label="Scan"
              icon={<ScanBarcode className="w-5 h-5" />}
              onClick={() => navigate("/")}
            />
            <NavTab
              active={isVerification}
              label="Verifikasi"
              icon={<ClipboardCheck className="w-5 h-5" />}
              onClick={() => navigate("/verification")}
            />
            <NavTab
              active={isHistory}
              label="Riwayat"
              icon={<History className="w-5 h-5" />}
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
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex flex-col items-center justify-center gap-0.5 rounded-xl min-h-[52px] text-xs font-semibold transition-all ${
        active ? "bg-primary text-white" : "text-gray-500 hover:bg-gray-50"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
