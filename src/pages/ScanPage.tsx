import { useRef, useState, useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { fetchProducts, type ProductItem } from "../lib/api";

export default function ScanPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const detectedRef = useRef<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Scanner state
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const [successToast, setSuccessToast] = useState("");
  const [successFlash, setSuccessFlash] = useState(false);

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

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
    : [];

  const handleScanResult = useCallback(
    (barcode: string) => {
      const code = barcode.trim();
      if (!code) return;
      navigate(`/return-form?barcode=${encodeURIComponent(code)}`);
    },
    [navigate]
  );

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
    <div className="space-y-3">
      {successToast && (
        <div className="rounded-xl px-3.5 py-2.5 text-sm bg-green-50 text-green-700 border border-green-100">
          {successToast}
        </div>
      )}

      {/* Scan Card */}
      <div className="card">
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
            <span className="text-2xl">📷</span>
          </div>
          <p className="text-xs text-gray-400">Scan barcode produk</p>
          <button
            onClick={startScanner}
            className="btn-primary px-8 mt-1"
          >
            Mulai Scan
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-50 text-red-600 text-sm border-t border-red-100">
            {error}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-[11px] text-gray-300 font-medium uppercase tracking-wider">atau</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* Product Search */}
      <div className="card">
        <div className="card-body">
          <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">Cari Produk</p>
          <div className="relative" ref={dropdownRef}>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setShowProductDropdown(e.target.value.trim().length > 0);
                }}
                placeholder={loadingProducts ? "Memuat produk..." : "Nama produk, barcode, atau SKU..."}
                disabled={loadingProducts}
                className="input-field pl-9 pr-9"
              />
              {productSearch.trim() && (
                <button
                  type="button"
                  onClick={() => { setProductSearch(""); setShowProductDropdown(false); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {showProductDropdown && filteredProducts.length > 0 && (
              <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-gray-100 rounded-xl shadow-lg max-h-80 overflow-y-auto">
                {filteredProducts.slice(0, 50).map((p) => (
                  <button
                    key={p.barcode}
                    type="button"
                    onClick={() => {
                      setShowProductDropdown(false);
                      setProductSearch("");
                      navigate(`/return-form?barcode=${encodeURIComponent(p.barcode)}`);
                    }}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-900 block">{p.product}</span>
                    <span className="text-[11px] text-gray-400">{p.barcode} · {p.sku}</span>
                  </button>
                ))}
                {filteredProducts.length > 50 && (
                  <div className="px-3.5 py-2 text-[11px] text-gray-400 text-center bg-gray-50">
                    +{filteredProducts.length - 50} produk lagi
                  </div>
                )}
              </div>
            )}
            {showProductDropdown &&
              productSearch.trim() &&
              filteredProducts.length === 0 &&
              !loadingProducts && (
                <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-400 text-center">
                  Produk tidak ditemukan
                </div>
              )}
          </div>
          {!loadingProducts && (
            <p className="text-[11px] text-gray-300 mt-2">
              {products.length} produk tersedia
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
