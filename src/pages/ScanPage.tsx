import { useRef, useState, useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Quagga from "@ericblade/quagga2";
import { fetchProducts, type ProductItem } from "../lib/api";

export default function ScanPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const selectedDeviceIdRef = useRef<string | null>(null);
  const lastDetectionTimeRef = useRef<number>(0);
  const quaggaStartedRef = useRef<boolean>(false);
  const detectedRef = useRef<boolean>(false);
  const retryCountRef = useRef<number>(0);
  const retryTimerRef = useRef<number | null>(null);

  // Scanner state
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const [successToast, setSuccessToast] = useState("");
  const [torch, setTorch] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
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
      cleanupScanner();
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

  // Pick the best back-facing camera via enumerateDevices fallback
  const pickBackCameraDeviceId = async (): Promise<string | null> => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return null;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      if (videoInputs.length === 0) return null;

      // Prefer labels containing "back" or "rear"
      const backCam = videoInputs.find((d) =>
        /back|rear|environment/i.test(d.label)
      );
      if (backCam) return backCam.deviceId;

      // Fallback: last device tends to be back camera on mobile
      return videoInputs[videoInputs.length - 1].deviceId;
    } catch {
      return null;
    }
  };

  const acquireCameraStream = async (): Promise<MediaStream> => {
    const baseConstraints: MediaStreamConstraints = {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    };

    // Attempt 1: facingMode environment
    try {
      const stream = await navigator.mediaDevices.getUserMedia(baseConstraints);
      return stream;
    } catch (err) {
      // Attempt 2: pick back camera explicitly via deviceId
      const deviceId = await pickBackCameraDeviceId();
      if (deviceId) {
        selectedDeviceIdRef.current = deviceId;
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              deviceId: { exact: deviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          });
          return stream;
        } catch {
          // continue to fallback
        }
      }

      // Attempt 3: any camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        });
        return stream;
      } catch {
        throw err;
      }
    }
  };

  const waitForVideoReady = (video: HTMLVideoElement): Promise<void> => {
    return new Promise((resolve) => {
      if (video.readyState >= 3) {
        resolve();
        return;
      }
      const onReady = () => {
        video.removeEventListener("canplay", onReady);
        video.removeEventListener("loadeddata", onReady);
        resolve();
      };
      video.addEventListener("canplay", onReady, { once: true });
      video.addEventListener("loadeddata", onReady, { once: true });
    });
  };

  const startScanner = useCallback(async () => {
    setError("");
    setStarting(true);
    setStarted(true);
    detectedRef.current = false;
    retryCountRef.current = 0;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Browser tidak support camera access");
      }

      const stream = await acquireCameraStream();
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;

      // Detect torch support early; hide torch UI if unsupported
      try {
        const caps = (track as unknown as { getCapabilities?: () => MediaTrackCapabilities }).getCapabilities?.();
        const supportsTorch = Boolean(
          caps && (caps as unknown as { torch?: boolean }).torch
        );
        setTorchSupported(supportsTorch);
      } catch {
        setTorchSupported(false);
      }

      const video = videoRef.current;
      if (!video) throw new Error("Video element tidak tersedia");

      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.muted = true;

      // iOS: play() returns a Promise that may reject if autoplay is blocked
      try {
        await video.play();
      } catch (e) {
        // Retry play once - user gesture should have been captured on the start button
        await new Promise((r) => setTimeout(r, 100));
        await video.play().catch(() => {
          throw e;
        });
      }

      // Wait until the video element has enough data to feed Quagga
      await waitForVideoReady(video);

      // Kick off Quagga with retry-on-failure
      initQuaggaWithRetry();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/permission|notallowed/i.test(msg)) {
        setError(
          "❌ Izin kamera ditolak. Silakan izinkan akses kamera di pengaturan browser."
        );
      } else if (/notfound|devicesnotfound/i.test(msg)) {
        setError("❌ Tidak ada perangkat kamera yang ditemukan.");
      } else {
        setError("❌ Error membuka kamera: " + msg);
      }
      setStarted(false);
      setStarting(false);
      await cleanupScanner();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initQuaggaWithRetry = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const workers = typeof Worker !== "undefined"
      ? Math.min(navigator.hardwareConcurrency || 2, 4)
      : 0;

    const quaggaConfig = {
      inputStream: {
        type: "LiveStream",
        target: video,
        constraints: {
          width: { min: 1280, ideal: 1920 },
          height: { min: 720, ideal: 1080 },
          facingMode: "environment",
          aspectRatio: { min: 1, max: 2 },
        },
      },
      locator: {
        patchSize: "small",
        halfSample: false,
      },
      numOfWorkers: workers,
      frequency: 20,
      decoder: {
        readers: [
          "ean_reader",
          "ean_8_reader",
          "code_128_reader",
          "code_39_reader",
          "upc_reader",
          "upc_e_reader",
        ],
        multiple: false,
      },
      locate: true,
    };

    Quagga.init(quaggaConfig as unknown as Parameters<typeof Quagga.init>[0], (err) => {
      if (err) {
        console.error("Quagga init error:", err);
        if (retryCountRef.current < 3) {
          const delay = 1000 * Math.pow(2, retryCountRef.current);
          retryCountRef.current += 1;
          if (retryTimerRef.current) {
            window.clearTimeout(retryTimerRef.current);
          }
          retryTimerRef.current = window.setTimeout(() => {
            initQuaggaWithRetry();
          }, delay);
          return;
        }
        setError("❌ Gagal memulai barcode scanner. Coba refresh halaman.");
        setStarting(false);
        return;
      }

      // Set up onDetected handler (bind once per init)
      Quagga.offDetected();
      Quagga.onDetected(handleQuaggaDetection);

      try {
        Quagga.start();
        quaggaStartedRef.current = true;
        setScanning(true);
        setStarting(false);
      } catch (e) {
        console.error("Quagga start error:", e);
        setError("❌ Gagal memulai scanner.");
        setStarting(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleQuaggaDetection = useCallback(
    (data: unknown) => {
      if (detectedRef.current) return;

      const d = data as {
        codeResult?: {
          code?: string;
          decodedCodes?: Array<{ error?: number }>;
        };
      };

      const code = d?.codeResult?.code?.trim();
      if (!code || code.length < 3) return;

      // Filter out low-confidence detections by average error level
      const decodedCodes = d.codeResult?.decodedCodes ?? [];
      const errors = decodedCodes
        .map((c) => (typeof c.error === "number" ? c.error : null))
        .filter((e): e is number => e !== null);
      if (errors.length > 0) {
        const avg = errors.reduce((a, b) => a + b, 0) / errors.length;
        if (avg > 0.15) return;
      }

      const now = Date.now();
      if (now - lastDetectionTimeRef.current < 1500) return;
      lastDetectionTimeRef.current = now;

      detectedRef.current = true;

      // Haptic feedback
      try {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate(100);
        }
      } catch {
        // ignore
      }

      // Success flash
      setSuccessFlash(true);
      window.setTimeout(() => setSuccessFlash(false), 250);

      // Stop camera then navigate (small delay so flash is visible)
      window.setTimeout(() => {
        cleanupScanner().finally(() => {
          handleScanResult(code);
        });
      }, 180);
    },
    [handleScanResult]
  );

  const cleanupScanner = async () => {
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    try {
      Quagga.offDetected();
    } catch {
      // ignore
    }

    if (quaggaStartedRef.current) {
      try {
        Quagga.stop();
      } catch (e) {
        console.error("Error stopping Quagga:", e);
      }
      quaggaStartedRef.current = false;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    trackRef.current = null;

    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {
        // ignore
      }
      videoRef.current.srcObject = null;
    }
  };

  const stopScanner = useCallback(async () => {
    await cleanupScanner();
    setScanning(false);
    setStarted(false);
    setStarting(false);
    setTorch(false);
    setTorchSupported(false);
    detectedRef.current = false;
    retryCountRef.current = 0;
  }, []);

  const toggleTorch = async () => {
    if (!trackRef.current) return;
    try {
      await (
        trackRef.current as unknown as {
          applyConstraints: (c: unknown) => Promise<void>;
        }
      ).applyConstraints({
        advanced: [{ torch: !torch }],
      });
      setTorch((prev) => !prev);
    } catch (err) {
      console.error("Torch error:", err);
      setTorchSupported(false);
    }
  };

  // ---------- FULLSCREEN SCANNER RENDER ----------
  if (started) {
    return (
      <div className="scanner-fullscreen">
        <video
          ref={videoRef}
          className="scanner-video"
          playsInline
          autoPlay
          muted
        />

        {/* Dim overlay */}
        <div className="absolute inset-0 bg-black/30 pointer-events-none" />

        {/* Scanning guide with corner frame and scan line */}
        <div className="scanner-guide">
          <div className="scanner-guide-corner tl" />
          <div className="scanner-guide-corner tr" />
          <div className="scanner-guide-corner bl" />
          <div className="scanner-guide-corner br" />
          <div className="scanner-scanline" />
        </div>

        {/* Top hint */}
        <div className="absolute top-0 left-0 right-0 flex justify-center pt-4 pointer-events-none"
             style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)" }}>
          <div className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm">
            {starting ? "Memulai kamera..." : "Arahkan kamera ke barcode"}
          </div>
        </div>

        {/* Close button top-right */}
        <button
          onClick={stopScanner}
          aria-label="Tutup scanner"
          className="absolute top-0 right-0 m-4 h-11 w-11 flex items-center justify-center rounded-full bg-black/60 text-white text-2xl hover:bg-black/80 backdrop-blur-sm"
          style={{
            top: "calc(env(safe-area-inset-top) + 0.75rem)",
            right: "calc(env(safe-area-inset-right) + 0.75rem)",
          }}
        >
          ×
        </button>

        {/* Torch toggle bottom-right (only when supported) */}
        {torchSupported && (
          <button
            onClick={toggleTorch}
            aria-label="Toggle flash"
            className={`absolute bottom-0 right-0 m-4 h-12 w-12 flex items-center justify-center rounded-full backdrop-blur-sm text-xl ${
              torch ? "bg-yellow-400 text-black" : "bg-black/60 text-white"
            }`}
            style={{
              bottom: "calc(env(safe-area-inset-bottom) + 1rem)",
              right: "calc(env(safe-area-inset-right) + 0.75rem)",
            }}
          >
            💡
          </button>
        )}

        {/* Loading spinner */}
        {starting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <div className="h-10 w-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            <p className="text-white text-sm font-medium drop-shadow">
              Memulai kamera...
            </p>
          </div>
        )}

        {/* Success flash */}
        {successFlash && <div className="scanner-success-flash" />}

        {/* Error overlay */}
        {error && (
          <div className="absolute left-0 right-0 mx-4 bg-red-600 text-white text-sm px-4 py-3 rounded-xl shadow-lg"
               style={{ bottom: "calc(env(safe-area-inset-bottom) + 5rem)" }}>
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
