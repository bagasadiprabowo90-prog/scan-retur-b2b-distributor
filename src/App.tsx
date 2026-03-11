import { Routes, Route, Navigate } from "react-router-dom";
import ScanPage from "./pages/ScanPage";
import ReturnFormPage from "./pages/ReturnFormPage";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gray-900 text-white px-4 py-3 shadow-lg sticky top-0 z-50">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <span className="text-2xl">📦</span>
          <div>
            <h1 className="text-lg font-bold leading-tight">Scan Retur</h1>
            <p className="text-xs text-gray-400">B2B Distributor</p>
          </div>
        </div>
      </header>

      {/* Pages */}
      <main className="max-w-lg mx-auto p-4">
        <Routes>
          <Route path="/" element={<ScanPage />} />
          <Route path="/return-form" element={<ReturnFormPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
