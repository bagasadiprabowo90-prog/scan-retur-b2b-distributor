import { useRef, useState, useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Quagga from "@ericblade/quagga2";
import { fetchProducts, type ProductItem } from "../lib/api";

export default function ScanPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  // Scanner state
  const [scanning, setScanning] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const [successToast, setSuccessToast] = useState("");
  const [zoom, setZoom] = useState(1);
  const [torch, setTorch] = useState(false);
  const [detectedCode, setDetectedCode] = useState("");
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
    return () => { alive = false; };
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
      if (!barcode.trim()) return;

      navigate(`/return-form?barcode=${encodeURIComponent(barcode)}`);
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
    setStarted(true);
    setZoom(1);

    await new Promise((r) => setTimeout(r, 100));

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Browser tidak support camera access");
      }

      // Request camera dengan constraints yang lebih baik
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      } as any);

      streamRef.current = stream;
      trackRef.current = stream.getVideoTracks()[0];

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setScanning(true);

          // Start Quagga untuk barcode detection
          initQuagga();
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Permission")) {
        setError(
          "❌ Izin kamera ditolak. Silakan izinkan akses kamera di pengaturan browser."
        );
      } else if (msg.includes("NotFound")) {
        setError("❌ Tidak ada perangkat kamera yang ditemukan.");
      } else {
        setError("❌ Error membuka kamera: " + msg);
      }
      setStarted(false);
    }
  }, []);

  const initQuagga = () => {
    Quagga.init(
      {
        inputStream: {
          type: "LiveStream",
          constraints: {
            width: { min: 640 },
            height: { min: 480 },
            facingMode: "environment",
            aspectRatio: { min: 4 / 3, max: 16 / 9 },
          },
          target: videoRef.current!,
        },
        locator: {
          patchSize: "medium",
          halfSample: true,
        },
        numOfWorkers: navigator.hardwareConcurrency || 4,
        frequency: 10,
        decoder: {
          readers: [
            "code_128_reader",
            "ean_reader",
            "ean_8_reader",
            "code_39_reader",
            "code_39_vin_reader",
            "codabar_reader",
            "upc_reader",
            "upc_e_reader",
          ],
          debug: {
            drawBoundingBox: false,
            showFrequency: false,
            drawScanline: false,
            showPattern: false,
          },
        },
      } as any,
      (err) => {
        if (err) {
          console.error("Quagga initialization error:", err);
          setError("❌ Error initializing barcode scanner");
          return;
        }

        Quagga.onDetected((data) => {
          if (data.codeResult?.code) {
            const code = data.codeResult.code.trim();
            if (code && code !== detectedCode) {
              setDetectedCode(code);
              handleScanResult(code);
            }
          }
        });

        Quagga.start();
      }
    );
  };

  const stopScanner = useCallback(async () => {
    setScanning(false);
    setStarted(false);
    setZoom(1);
    setDetectedCode("");

    // Stop Quagga
    try {
      Quagga.stop();
    } catch (e) {
      console.error("Error stopping Quagga:", e);
    }

    // Stop MediaStream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    trackRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const toggleTorch = async () => {
    if (!trackRef.current) return;

    try {
      const capabilities = (trackRef.current as any).getCapabilities?.();
      if (!capabilities?.torch) {
        setError("⚠️ Device tidak support torch/flash");
        return;
      }

      await (trackRef.current as any).applyConstraints({
        advanced: [{ torch: !torch }],
      });
      setTorch(!torch);
    } catch (err) {
      console.error("Torch error:", err);
    }
  };

  const handleZoomChange = async (newZoom: number) => {
    setZoom(newZoom);
    if (!trackRef.current) return;

    try {
      await (trackRef.current as any).applyConstraints({
        advanced: [{ zoom: newZoom }],
      });
    } catch (err) {
      console.error("Zoom error:", err);
    }
  };

  return (
    <div className="space-y-4">
      {successToast && (
        <div className="rounded-xl px-4 py-3 text-sm font-medium bg-green-50 text-green-700 border border-green-200">
          ✅ {successToast}
        </div>
      )}

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
          <div className="relative bg-black overflow-hidden" style={{ aspectRatio: "4/3" }}>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              autoPlay
              muted
            />
            <canvas
              ref={canvasRef}
              style={{
                display: "none",
              }}
            />

            {/* Scanning frame overlay */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 border-2 border-green-500 opacity-50" />
              <div className="absolute inset-1/4 border-4 border-green-500"></div>
            </div>

            {/* Detected code display */}
            {detectedCode && (
              <div className="absolute top-4 left-4 right-4 bg-green-500 text-white px-3 py-2 rounded-lg text-sm font-semibold text-center animate-pulse">
                ✅ Barcode terdeteksi: {detectedCode}
              </div>
            )}

            {/* Controls overlay */}
            <div className="absolute bottom-4 left-4 right-4 space-y-3">
              {/* Zoom slider */}
              <div className="bg-black/70 rounded-lg p-3 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-white text-xs">🔍 Zoom</span>
                  <span className="text-white text-xs font-mono">{zoom.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  value={zoom}
                  onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-green-500"
                />
              </div>

              {/* Torch & Manual Input buttons */}
              <div className="flex gap-2">
                <button
                  onClick={toggleTorch}
                  className={`flex-1 px-3 py-2 rounded-lg font-semibold text-sm transition-colors ${
                    torch
                      ? "bg-yellow-500 text-black hover:bg-yellow-400"
                      : "bg-gray-700 text-white hover:bg-gray-600"
                  }`}
                >
                  {torch ? "💡 Flash ON" : "💡 Flash OFF"}
                </button>

                <button
                  onClick={stopScanner}
                  className="flex-1 px-3 py-2 rounded-lg font-semibold text-sm bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Stop
                </button>
              </div>
            </div>
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
            {error}
          </div>
        )}

        {scanning && (
          <div className="p-3 text-center">
            <p className="text-sm text-gray-500">Arahkan kamera ke barcode</p>
          </div>
        )}
      </div>

      {/* Manual Input */}
      {started && (
        <div className="bg-white rounded-2xl shadow-md p-4">
          <label className="text-xs font-semibold text-gray-700 block mb-2">
            📝 Input Manual Barcode (jika scan gagal):
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
      )}

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
                    if (scanning) stopScanner();
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
