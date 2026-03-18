import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import ScanPage from "./pages/ScanPage";
import ReturnFormPage from "./pages/ReturnFormPage";
import HistoryPage from "./pages/HistoryPage";

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/" || location.pathname === "";
  const isHistory = location.pathname === "/history";

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

          {/* Scan button — hanya muncul di halaman selain home */}
          <div className="flex items-center gap-2">
            {!isHistory && (
              <button
                onClick={() => navigate("/history")}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
              >
                <span>🕘</span> Riwayat
              </button>
            )}
            {!isHome && (
              <button
                onClick={() => navigate("/")}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
              >
                <span>📷</span> Scan
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Pages */}
      <main className="max-w-lg mx-auto p-4">
        <Routes>
          <Route path="/" element={<ScanPage />} />
          <Route path="/return-form" element={<ReturnFormPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
