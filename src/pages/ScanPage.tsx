import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";

export default function ScanPage() {
  const navigate = useNavigate();
  const [manualBarcode, setManualBarcode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleScanResult = useCallback(
    (decodedText: string) => {
      const barcode = decodedText.trim();
      if (!barcode) return;

      // Stop scanner before navigating
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }

      navigate(`/return-form?barcode=${encodeURIComponent(barcode)}`);
    },
    [navigate]
  );

  const startScanner = useCallback(async () => {
    if (!containerRef.current) return;
    setError("");

    try {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 280, height: 150 },
          aspectRatio: 1.0,
        },
        handleScanResult,
        () => {} // ignore errors during scanning
      );

      setScanning(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Permission")) {
        setError("Izin kamera ditolak. Silakan izinkan akses kamera di pengaturan browser.");
      } else {
        setError("Tidak bisa membuka kamera: " + msg);
      }
    }
  }, [handleScanResult]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current?.isScanning) {
      await scannerRef.current.stop();
    }
    scannerRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => {
    startScanner();
    return () => {
      stopScanner();
    };
  }, [startScanner, stopScanner]);

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = manualBarcode.trim();
    if (!code) return;
    stopScanner();
    navigate(`/return-form?barcode=${encodeURIComponent(code)}`);
  }

  return (
    <div className="space-y-4">
      {/* Scanner Card */}
      <div className="bg-white rounded-2xl shadow-md overflow-hidden">
        <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📷</span>
            <span className="font-semibold">Scan Barcode</span>
          </div>
          {scanning && (
            <span className="text-xs bg-green-500 px-2 py-0.5 rounded-full animate-pulse">
              LIVE
            </span>
          )}
        </div>

        {/* Camera view */}
        <div ref={containerRef} className="bg-black">
          <div id="qr-reader" className="w-full" />
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-50 text-red-700 text-sm">
            ⚠️ {error}
          </div>
        )}

        <div className="p-4 text-center text-sm text-gray-500">
          Arahkan kamera ke barcode produk
        </div>
      </div>

      {/* Manual Input */}
      <div className="bg-white rounded-2xl shadow-md p-4">
        <p className="text-sm font-semibold text-gray-700 mb-2">✏️ Atau ketik barcode manual:</p>
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            type="text"
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value)}
            placeholder="Ketik barcode lalu Enter..."
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={!manualBarcode.trim()}
            className="bg-gray-900 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-800 disabled:opacity-40 transition-colors"
          >
            Cari
          </button>
        </form>
      </div>

      {/* Info */}
      <div className="text-center text-xs text-gray-400 py-2">
        Scan barcode EAN-13, Code128, QR, atau ketik manual
      </div>
    </div>
  );
}
