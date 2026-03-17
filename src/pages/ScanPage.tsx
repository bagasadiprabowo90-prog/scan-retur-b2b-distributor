import { useRef, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { fetchProducts, type ProductItem } from "../lib/api";

export default function ScanPage() {
  const navigate = useNavigate();
  const [manualBarcode, setManualBarcode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);

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
    return () => { alive = false; };
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
    (decodedText: string) => {
      const barcode = decodedText.trim();
      if (!barcode) return;

      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }

      navigate(`/return-form?barcode=${encodeURIComponent(barcode)}`);
    },
    [navigate]
  );

  const startScanner = useCallback(async () => {
    setError("");
    setStarted(true);

    // Wait a tick for the #qr-reader div to render
    await new Promise((r) => setTimeout(r, 100));

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
        () => {}
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
    setStarted(false);
  }, []);

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = manualBarcode.trim();
    if (!code) return;
    if (scanning) stopScanner();
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

        {/* Camera area */}
        {started ? (
          <div className="bg-black">
            <div id="qr-reader" className="w-full" />
          </div>
        ) : (
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
        )}

        {error && (
          <div className="px-4 py-3 bg-red-50 text-red-700 text-sm">
            ⚠️ {error}
          </div>
        )}

        {scanning && (
          <div className="p-3 flex items-center justify-between">
            <span className="text-sm text-gray-500">Arahkan kamera ke barcode</span>
            <button
              onClick={stopScanner}
              className="text-sm text-red-600 font-semibold hover:text-red-800"
            >
              Stop Kamera
            </button>
          </div>
        )}
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

      {/* Product Search / Picker */}
      <div className="bg-white rounded-2xl shadow-md p-4">
        <p className="text-sm font-semibold text-gray-700 mb-2">📦 Atau cari & pilih produk dari master:</p>
        <div className="relative">
          <input
            type="text"
            value={productSearch}
            onChange={(e) => {
              setProductSearch(e.target.value);
              setShowProductDropdown(true);
            }}
            onFocus={() => setShowProductDropdown(true)}
            placeholder={loadingProducts ? "Memuat data produk..." : "Ketik nama produk / barcode / SKU..."}
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
                    if (scanning) stopScanner();
                    navigate(`/return-form?barcode=${encodeURIComponent(p.barcode)}`);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                >
                  <span className="text-sm font-medium text-gray-900">{p.product}</span>
                  <span className="block text-xs text-gray-400">{p.barcode} · {p.sku}</span>
                </button>
              ))}
              {filteredProducts.length > 50 && (
                <div className="px-4 py-2 text-xs text-gray-400 text-center">
                  + {filteredProducts.length - 50} produk lagi, ketik lebih spesifik...
                </div>
              )}
            </div>
          )}
          {showProductDropdown && productSearch.trim() && filteredProducts.length === 0 && !loadingProducts && (
            <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-500 text-center">
              Produk tidak ditemukan
            </div>
          )}
        </div>
        {!loadingProducts && (
          <p className="text-xs text-gray-400 mt-2">Total {products.length} produk di master data</p>
        )}
      </div>

      {/* Info */}
      <div className="text-center text-xs text-gray-400 py-2">
        Scan barcode, ketik manual, atau pilih produk dari daftar
      </div>
    </div>
  );
}
