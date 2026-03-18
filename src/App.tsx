import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import ScanPage from "./pages/ScanPage";
import ReturnFormPage from "./pages/ReturnFormPage";
import HistoryPage from "./pages/HistoryPage";

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/" || location.pathname === "";
  const isHistory = location.pathname === "/history";
  const showBottomNav = isHome || isHistory;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gray-900 text-white px-4 py-3 shadow-lg sticky top-0 z-50">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Back button — hanya muncul di halaman selain home */}
            {!isHome && (
              <button
                onClick={() => navigate("/")}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                aria-label="Kembali"
              >
                <span className="text-lg">←</span>
              </button>
            )}
            <span className="text-2xl">📦</span>
            <div>
              <h1 className="text-lg font-bold leading-tight">Scan Retur</h1>
              <p className="text-xs text-gray-400">B2B Distributor</p>
            </div>
          </div>
        </div>
      </header>

      {/* Pages */}
      <main className={`max-w-lg mx-auto p-4 ${showBottomNav ? "pb-24" : "pb-6"}`}>
        <Routes>
          <Route path="/" element={<ScanPage />} />
          <Route path="/return-form" element={<ReturnFormPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {showBottomNav && (
        <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-gray-200 bg-white/95 backdrop-blur-sm shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
          <div className="max-w-lg mx-auto grid grid-cols-2 gap-2 px-4 py-3">
            <BottomNavButton
              active={isHome}
              icon="📷"
              label="Scan Retur"
              onClick={() => navigate("/")}
            />
            <BottomNavButton
              active={isHistory}
              icon="🕘"
              label="Riwayat"
              onClick={() => navigate("/history")}
            />
          </div>
        </nav>
      )}
    </div>
  );
}

function BottomNavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors ${
        active
          ? "bg-gray-900 text-white shadow-md"
          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
      }`}
    >
      <span className="text-lg leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
