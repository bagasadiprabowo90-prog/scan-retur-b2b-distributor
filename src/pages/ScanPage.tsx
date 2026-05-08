import { useRef, useState, useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { fetchProducts, type ProductItem } from "../lib/api";

export default function ScanPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const detectedRef = useRef<boolean>(false);

  // Scanner state
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const [successToast, setSuccessToast] = useState("");
  const [successFlash, setSuccessFlash] = useState(false);
  const [manualInput, setManualInput] = useState("");

  // Product search state
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // Load products on mount
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingProducts(true);
      const res = await fetchProducts();
      if (!alive) return;
      setLoadingProducts(false);
      if (res.ok) setProducts(res.products);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const routeState = location.state as { successMessage?: string } | null;
    const message = routeState?.successMessage?.trim();
    if (!message) return;

    setSuccessToast(message);
    navigate(location.pathname, { replace: true, state: null });

    const timer = window.setTimeout(() => {
      setSuccessToast("");
    }, 3500);

    return () => window.clearTimeout(timer);
  }, [location.pathname, location.state, navigate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredProducts = productSearch.trim()
    ? products.filter((p) => {
        const q = productSearch.toLowerCase();
        return (
          p.product.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q)
        );
      })
    : products;

  const handleScanResult = useCallback(
    (barcode: string) => {
      const code = barcode.trim();
      if (!code) return;
      navigate(`/return-form?barcode=${encodeURIComponent(code)}`);
    },
    [navigate]
  );

  const handleManualSubmit = useCallback(() => {
    const barcode = manualInput.trim();
    if (!barcode) return;
    setManualInput("");
    handleScanResult(barcode);
  }, [manualInput, handleScanResult]);

  const startScanner = useCallback(async () => {
    setError("");
    setStarting(true);
    setStarted(true);
    detectedRef.current = false;

    // Wait for the container to render
    await new Promise((r) => setTimeout(r, 100));

    try {
      const scanner = new Html5Qrcode("scanner-container");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: { width: 280, height: 150 },
          aspectRatio: 1.0,
          disableFlip: false,
        },
        // Success callback
        (decodedText) => {
          if (detectedRef.current) return;
          if (!decodedText || decodedText.trim().length < 3) return;

          detectedRef.current = true;

          // Haptic feedback
          try {
            if ("vibrate" in navigator) {
              navigator.vibrate(100);
            }
          } catch {
            // ignore
          }

          // Success flash
          setSuccessFlash(true);

          // Stop scanner and navigate
          setTimeout(async () => {
            setSuccessFlash(false);
            await stopScanner();
            handleScanResult(decodedText.trim());
          }, 200);
        },
        // Error callback (called on every frame without detection - ignore)
        () => {}
      );

      setScanning(true);
      setStarting(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Scanner start error:", msg);

      if (/permission|notallowed/i.test(msg)) {
        setError(
          "❌ Izin kamera ditolak. Silakan izinkan akses kamera di pengaturan browser."
        );
      } else if (/notfound|requested/i.test(msg)) {
        setError("❌ Tidak ada perangkat kamera yang ditemukan.");
      } else {
        setError("❌ Error membuka kamera: " + msg);
      }
      setStarted(false);
      setStarting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleScanResult]);

  const stopScanner = useCallback(async () => {
    try {
      if (scannerRef.current) {
        const state = scannerRef.current.getState();
        // State 2 = scanning, need to stop first
        if (state === 2) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch (e) {
      console.error("Error stopping scanner:", e);
    }

    setScanning(false);
    setStarted(false);
    setStarting(false);
    detectedRef.current = false;
  }, []);

  // ---------- FULLSCREEN SCANNER RENDER ----------
  if (started) {
    return (
      <div className="scanner-fullscreen">
        {/* html5-qrcode renders into this div */}
        <div id="scanner-container" className="absolute inset-0 overflow-hidden" />

        {/* Scanning guide overlay */}
        <div className="scanner-guide">
          <div className="scanner-guide-corner tl" />
          <div className="scanner-guide-corner tr" />
          <div className="scanner-guide-corner bl" />
          <div className="scanner-guide-corner br" />
          {scanning && <div className="scanner-scanline" />}
        </div>

        {/* Top hint */}
        <div
          className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none z-10"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
        >
          <div className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm">
            {starting ? "Memulai kamera..." : "Arahkan kamera ke barcode"}
          </div>
        </div>

        {/* Close button top-right */}
        <button
          onClick={stopScanner}
          aria-label="Tutup scanner"
          className="absolute z-10 h-11 w-11 flex items-center justify-center rounded-full bg-black/60 text-white text-2xl hover:bg-black/80 backdrop-blur-sm"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
            right: "calc(env(safe-area-inset-right, 0px) + 0.75rem)",
          }}
        >
          ×
        </button>

        {/* Loading spinner */}
        {starting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none z-10">
            <div className="h-10 w-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            <p className="text-white text-sm font-medium drop-shadow">
              Memulai kamera...
            </p>
          </div>
        )}

        {/* Success flash */}
        {successFlash && <div className="scanner-success-flash z-10" />}

        {/* Error overlay */}
        {error && (
          <div
            className="absolute left-0 right-0 mx-4 bg-red-600 text-white text-sm px-4 py-3 rounded-xl shadow-lg z-10"
            style={{
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)",
            }}
          >
            {error}
          </div>
        )}
      </div>
    );
  }

  // ---------- IDLE / NON-SCANNING RENDER ----------
  return (
    <div className="space-y-4">
      {successToast && (
        <div className="rounded-xl px-4 py-3 text-sm font-medium bg-green-50 text-green-700 border border-green-200">
          ✅ {successToast}
        </div>
      )}

      {/* Start scan card */}
      <div className="bg-white rounded-2xl shadow-md overflow-hidden">
        <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📷</span>
            <span className="font-semibold">Scan Barcode</span>
          </div>
        </div>

        <div className="bg-gray-100 flex flex-col items-center justify-center py-16 gap-4">
          <span className="text-5xl">📷</span>
          <p className="text-sm text-gray-500">Kamera belum aktif</p>
          <button
            onClick={startScanner}
            className="bg-gray-900 text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors"
          >
            🔍 Mulai Scan
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Manual Input */}
      <div className="bg-white rounded-2xl shadow-md p-4">
        <label className="text-xs font-semibold text-gray-700 block mb-2">
          📝 Input Manual Barcode:
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleManualSubmit();
            }}
            placeholder="Ketik barcode & Enter..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <button
            onClick={handleManualSubmit}
            disabled={!manualInput.trim()}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:bg-gray-300 transition-colors"
          >
            ✓
          </button>
        </div>
      </div>

      {/* Product Search / Picker */}
      <div className="bg-white rounded-2xl shadow-md p-4">
        <p className="text-sm font-semibold text-gray-700 mb-2">
          📦 Cari & pilih produk dari master data:
        </p>
        <div className="relative">
          <input
            type="text"
            value={productSearch}
            onChange={(e) => {
              setProductSearch(e.target.value);
              setShowProductDropdown(true);
            }}
            onFocus={() => setShowProductDropdown(true)}
            placeholder={
              loadingProducts
                ? "Memuat data produk..."
                : "Ketik nama produk / barcode / SKU..."
            }
            disabled={loadingProducts}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-100"
          />
          {showProductDropdown && filteredProducts.length > 0 && (
            <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
              {filteredProducts.slice(0, 50).map((p) => (
                <button
                  key={p.barcode}
                  type="button"
                  onClick={() => {
                    setShowProductDropdown(false);
                    setProductSearch("");
                    navigate(
                      `/return-form?barcode=${encodeURIComponent(p.barcode)}`
                    );
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                >
                  <span className="text-sm font-medium text-gray-900">
                    {p.product}
                  </span>
                  <span className="block text-xs text-gray-400">
                    {p.barcode} · {p.sku}
                  </span>
                </button>
              ))}
              {filteredProducts.length > 50 && (
                <div className="px-4 py-2 text-xs text-gray-400 text-center">
                  + {filteredProducts.length - 50} produk lagi, ketik lebih
                  spesifik...
                </div>
              )}
            </div>
          )}
          {showProductDropdown &&
            productSearch.trim() &&
            filteredProducts.length === 0 &&
            !loadingProducts && (
              <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-500 text-center">
                Produk tidak ditemukan
              </div>
            )}
        </div>
        {!loadingProducts && (
          <p className="text-xs text-gray-400 mt-2">
            Total {products.length} produk di master data
          </p>
        )}
      </div>

      {/* Info */}
      <div className="text-center text-xs text-gray-400 py-2">
        📱 Scanner support: barcode 1D (Code128, EAN, UPC, dll)
      </div>
    </div>
  );
}
