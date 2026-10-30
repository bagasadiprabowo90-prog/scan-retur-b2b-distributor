import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Html5Qrcode,
  Html5QrcodeScannerState,
  Html5QrcodeSupportedFormats,
} from "html5-qrcode";
import { fetchProducts, type ProductItem } from "../lib/api";
import {
  getActiveSession,
  startStoreSession,
  type StoreSession,
} from "../lib/session";

// ============================================================
// KONFIGURASI SCANNER
// ============================================================

const SCAN_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.QR_CODE,
];

const CAMERA_WIDTH = 1920;
const CAMERA_HEIGHT = 1080;

const SCAN_BOX_WIDTH_RATIO = 0.9;
const SCAN_BOX_HEIGHT_RATIO = 0.4;

const MAX_DECODE_SCALE = 2.5;
const MAX_STAGE_WIDTH = 1280;

const ZOOM_PRESETS = [1, 2, 3, 4, 5];
const DEFAULT_ZOOM = 2;
const ZOOM_STORAGE_KEY = "scan-retur-scan-zoom";

type StageLayout = { width: number; scale: number };
type GuideBox = { width: number; height: number };
type ZoomRange = { min: number; max: number; step: number };
type CameraFeatures = { zoom: ZoomRange | null; continuousFocus: boolean };

type CameraTrackCapabilities = MediaTrackCapabilities & {
  zoom?: { min?: number; max?: number; step?: number };
  focusMode?: string[];
};
type CameraConstraintSet = MediaTrackConstraintSet & {
  zoom?: number;
  focusMode?: string;
};

function computeStageLayout(): StageLayout {
  const width = Math.max(
    1,
    Math.round(document.documentElement.clientWidth || window.innerWidth)
  );
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.max(1, Math.min(dpr, MAX_DECODE_SCALE, MAX_STAGE_WIDTH / width));
  return { width, scale };
}

function scanBoxFor(viewfinderWidth: number, viewfinderHeight: number): GuideBox {
  const width = Math.floor(viewfinderWidth * SCAN_BOX_WIDTH_RATIO);
  const height = Math.min(
    Math.floor(width * SCAN_BOX_HEIGHT_RATIO),
    Math.floor(viewfinderHeight * 0.9)
  );
  return { width: Math.max(50, width), height: Math.max(50, height) };
}

function readCameraFeatures(scanner: Html5Qrcode): CameraFeatures {
  let caps: CameraTrackCapabilities;
  try {
    caps = scanner.getRunningTrackCapabilities() as CameraTrackCapabilities;
  } catch {
    return { zoom: null, continuousFocus: false };
  }

  const z = caps?.zoom;
  const zoom =
    z && typeof z.min === "number" && typeof z.max === "number" && z.max > z.min
      ? {
          min: z.min,
          max: z.max,
          step: typeof z.step === "number" && z.step > 0 ? z.step : 0.1,
        }
      : null;
  const focusModes = caps?.focusMode;
  const continuousFocus = Array.isArray(focusModes) && focusModes.includes("continuous");

  return { zoom, continuousFocus };
}

function snapZoom(value: number, range: ZoomRange): number {
  const clamped = Math.min(range.max, Math.max(range.min, value));
  const stepped = range.min + Math.round((clamped - range.min) / range.step) * range.step;
  return Math.min(range.max, Math.max(range.min, Number(stepped.toFixed(2))));
}

function buildZoomOptions(range: ZoomRange): number[] {
  const options = ZOOM_PRESETS.filter((z) => z >= range.min && z <= range.max);
  if (options.length === 0 || options[0] > range.min) {
    options.unshift(snapZoom(range.min, range));
  }
  if (options.length < 2) {
    options.push(snapZoom(Math.min(range.max, ZOOM_PRESETS[ZOOM_PRESETS.length - 1]), range));
  }
  return Array.from(new Set(options));
}

function readSavedZoom(): number | null {
  try {
    const raw = Number(localStorage.getItem(ZOOM_STORAGE_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  } catch {
    return null;
  }
}

function saveZoom(value: number) {
  try {
    localStorage.setItem(ZOOM_STORAGE_KEY, String(value));
  } catch {}
}

function pickInitialZoom(options: number[]): number {
  const target = readSavedZoom() ?? DEFAULT_ZOOM;
  return options.reduce(
    (best, z) => (Math.abs(z - target) < Math.abs(best - target) ? z : best),
    options[0]
  );
}

function readCurrentZoom(scanner: Html5Qrcode): number | null {
  try {
    const settings = scanner.getRunningTrackSettings() as MediaTrackSettings & {
      zoom?: number;
    };
    return typeof settings.zoom === "number" ? settings.zoom : null;
  } catch {
    return null;
  }
}

async function applyCameraTuning(
  scanner: Html5Qrcode,
  features: CameraFeatures,
  zoom: number | null
): Promise<boolean> {
  const tuning: CameraConstraintSet = {};
  if (zoom !== null && features.zoom) tuning.zoom = snapZoom(zoom, features.zoom);
  if (features.continuousFocus) tuning.focusMode = "continuous";
  if (tuning.zoom === undefined && tuning.focusMode === undefined) return false;

  await scanner.applyVideoConstraints({
    width: { ideal: CAMERA_WIDTH },
    height: { ideal: CAMERA_HEIGHT },
    advanced: [tuning],
  });
  return true;
}

function formatZoom(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export default function ScanPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const detectedRef = useRef<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchCardRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const cameraFeaturesRef = useRef<CameraFeatures | null>(null);
  const zoomBusyRef = useRef(false);

  // Scanner state
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const [successToast, setSuccessToast] = useState("");
  const [successFlash, setSuccessFlash] = useState(false);
  const [stage, setStage] = useState<StageLayout>({ width: 360, scale: 1 });
  const [guideBox, setGuideBox] = useState<GuideBox>({ width: 324, height: 130 });
  const [zoomOptions, setZoomOptions] = useState<number[]>([]);
  const [zoomLevel, setZoomLevel] = useState<number | null>(null);
  const [zoomBusy, setZoomBusy] = useState(false);

  // Product search state
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // Store Session state
  const [session, setSession] = useState<StoreSession | null>(getActiveSession);
  const [showNewStoreModal, setShowNewStoreModal] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreNoSJ, setNewStoreNoSJ] = useState("");
  const [newStoreTargetSheet, setNewStoreTargetSheet] = useState<"Bagas" | "Dimas">(() => {
    try {
      const raw = localStorage.getItem("scan-retur-target-sheet");
      if (raw === "Bagas" || raw === "Dimas") return raw;
    } catch {}
    return "Bagas";
  });

  // 2 Flow Mode:
  // - "direct": Input Manual (Sheet)
  // - "verify": Klaim SJ & Verifikasi
  const [flowMode, setFlowMode] = useState<"direct" | "verify">(() => {
    try {
      const saved = localStorage.getItem("scan-retur-flow-mode");
      if (saved === "verify" || saved === "direct") return saved;
    } catch {}
    return "direct";
  });

  const changeFlowMode = useCallback((mode: "direct" | "verify") => {
    setFlowMode(mode);
    try {
      localStorage.setItem("scan-retur-flow-mode", mode);
    } catch {}
  }, []);

  const distriHistory: string[] = useMemo(() => {
    try {
      const raw = localStorage.getItem("scan-retur-distri-history");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, [showNewStoreModal]);

  const handleStartSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreName.trim()) return;
    const sess = startStoreSession(
      newStoreName.trim(),
      newStoreNoSJ.trim(),
      newStoreTargetSheet
    );
    setSession(sess);
    changeFlowMode("verify");
    setShowNewStoreModal(false);
    setNewStoreName("");
    setNewStoreNoSJ("");
  };

  useEffect(() => {
    const onOpenNewStore = () => {
      changeFlowMode("verify");
      setShowNewStoreModal(true);
    };
    window.addEventListener("scan-retur-open-new-store", onOpenNewStore);
    return () => window.removeEventListener("scan-retur-open-new-store", onOpenNewStore);
  }, [changeFlowMode]);

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
    setSession(getActiveSession());
    try {
      const saved = localStorage.getItem("scan-retur-flow-mode");
      if (saved === "verify" || saved === "direct") {
        setFlowMode(saved);
      }
    } catch {}
    const routeState = location.state as {
      successMessage?: string;
      openNewStore?: boolean;
    } | null;

    if (routeState?.openNewStore) {
      changeFlowMode("verify");
      setShowNewStoreModal(true);
      navigate(location.pathname, { replace: true, state: null });
      return;
    }

    const message = routeState?.successMessage?.trim();
    if (!message) return;

    setSuccessToast(message);
    navigate(location.pathname, { replace: true, state: null });

    const timer = window.setTimeout(() => {
      setSuccessToast("");
    }, 3500);

    return () => window.clearTimeout(timer);
  }, [location.pathname, location.state, navigate, changeFlowMode]);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    cameraFeaturesRef.current = null;

    try {
      if (scanner) {
        if (scanner.getState() === Html5QrcodeScannerState.SCANNING) {
          await scanner.stop();
        }
        scanner.clear();
      }
    } catch (e) {
      console.error("Error stopping scanner:", e);
    }

    zoomBusyRef.current = false;
    setZoomBusy(false);
    setZoomOptions([]);
    setZoomLevel(null);
    setScanning(false);
    setStarted(false);
    setStarting(false);
    detectedRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

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
      const effectiveMode = flowMode === "verify" && session ? "verify" : "direct";
      navigate(`/return-form?barcode=${encodeURIComponent(code)}&mode=${effectiveMode}`);
    },
    [navigate, flowMode, session]
  );

  const tuneCamera = useCallback(async (scanner: Html5Qrcode) => {
    const features = readCameraFeatures(scanner);
    cameraFeaturesRef.current = features;

    try {
      if (!features.zoom) {
        await applyCameraTuning(scanner, features, null);
        return;
      }

      const options = buildZoomOptions(features.zoom);
      const initial = pickInitialZoom(options);
      await applyCameraTuning(scanner, features, initial);
      if (scannerRef.current !== scanner) return;

      setZoomOptions(options);
      setZoomLevel(readCurrentZoom(scanner) ?? initial);
    } catch {
      if (scannerRef.current === scanner && features.zoom) {
        setZoomOptions(buildZoomOptions(features.zoom));
        setZoomLevel(readCurrentZoom(scanner));
      }
    }
  }, []);

  const startScanner = useCallback(async () => {
    const layout = computeStageLayout();
    setError("");
    setStarting(true);
    setStage(layout);
    setGuideBox({
      width: layout.width * SCAN_BOX_WIDTH_RATIO,
      height: layout.width * SCAN_BOX_WIDTH_RATIO * SCAN_BOX_HEIGHT_RATIO,
    });
    setZoomOptions([]);
    setZoomLevel(null);
    cameraFeaturesRef.current = null;
    setStarted(true);
    detectedRef.current = false;

    await new Promise((r) => setTimeout(r, 100));

    try {
      const scanner = new Html5Qrcode("scanner-container", {
        verbose: false,
        formatsToSupport: SCAN_FORMATS,
        useBarCodeDetectorIfSupported: true,
      });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const box = scanBoxFor(viewfinderWidth, viewfinderHeight);
            setGuideBox({
              width: box.width / layout.scale,
              height: box.height / layout.scale,
            });
            return box;
          },
          disableFlip: true,
          videoConstraints: {
            facingMode: { ideal: "environment" },
            width: { ideal: CAMERA_WIDTH },
            height: { ideal: CAMERA_HEIGHT },
          },
        },
        (decodedText) => {
          if (detectedRef.current) return;
          if (!decodedText || decodedText.trim().length < 3) return;

          detectedRef.current = true;

          try {
            if ("vibrate" in navigator) {
              navigator.vibrate(100);
            }
          } catch {}

          setSuccessFlash(true);

          setTimeout(async () => {
            setSuccessFlash(false);
            await stopScanner();
            handleScanResult(decodedText.trim());
          }, 200);
        },
        () => {}
      );

      setScanning(true);
      setStarting(false);
      void tuneCamera(scanner);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Scanner start error:", msg);

      if (/permission|notallowed/i.test(msg)) {
        setError(
          "Izin kamera ditolak. Silakan izinkan akses kamera di pengaturan browser."
        );
      } else if (/notfound|requested/i.test(msg)) {
        setError("Tidak ada perangkat kamera yang ditemukan.");
      } else {
        setError("Error membuka kamera: " + msg);
      }
      await stopScanner();
    }
  }, [handleScanResult, stopScanner, tuneCamera]);

  const changeZoom = useCallback(async (value: number) => {
    const scanner = scannerRef.current;
    const features = cameraFeaturesRef.current;
    if (!scanner || !features?.zoom || zoomBusyRef.current) return;

    zoomBusyRef.current = true;
    setZoomBusy(true);
    try {
      await applyCameraTuning(scanner, features, value);
      if (scannerRef.current !== scanner) return;
      setZoomLevel(readCurrentZoom(scanner) ?? value);
      saveZoom(value);
    } catch {
      // Nilai ditolak kamera
    } finally {
      zoomBusyRef.current = false;
      setZoomBusy(false);
    }
  }, []);

  const handlePrimaryScanTrigger = () => {
    if (flowMode === "verify" && !session) {
      setShowNewStoreModal(true);
      return;
    }
    void startScanner();
  };

  // ---------- FULLSCREEN SCANNER RENDER ----------
  if (started) {
    return (
      <div className="scanner-fullscreen">
        <div
          className="scanner-stage"
          style={{
            width: `${stage.width * stage.scale}px`,
            transform: `translate(-50%, -50%) scale(${1 / stage.scale})`,
          }}
        >
          <div id="scanner-container" />
        </div>

        <div
          className="scanner-guide"
          style={{ width: `${guideBox.width}px`, height: `${guideBox.height}px` }}
        >
          <div className="scanner-guide-corner tl" />
          <div className="scanner-guide-corner tr" />
          <div className="scanner-guide-corner bl" />
          <div className="scanner-guide-corner br" />
          {scanning && <div className="scanner-scanline" />}
        </div>

        <div
          className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none z-10 px-14"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
        >
          <div className="bg-black/65 text-white text-xs font-medium text-center px-4 py-1.5 rounded-full backdrop-blur-md">
            {starting ? "Memulai kamera..." : "Arahkan barcode ke garis biru (±20 cm)"}
          </div>
        </div>

        <button
          onClick={stopScanner}
          aria-label="Tutup scanner"
          className="absolute z-10 h-11 w-11 flex items-center justify-center rounded-full bg-black/60 text-white text-2xl hover:bg-black/80 backdrop-blur-md"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
            right: "calc(env(safe-area-inset-right, 0px) + 0.75rem)",
          }}
        >
          ×
        </button>

        {zoomOptions.length > 1 && (
          <div
            className="absolute left-0 right-0 z-10 flex justify-center"
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}
          >
            <div
              role="group"
              aria-label="Zoom kamera"
              className="flex gap-1 rounded-full bg-black/60 p-1 backdrop-blur-md"
            >
              {zoomOptions.map((z) => {
                const active = zoomLevel !== null && Math.abs(z - zoomLevel) < 0.05;
                return (
                  <button
                    key={z}
                    type="button"
                    onClick={() => void changeZoom(z)}
                    disabled={zoomBusy}
                    aria-pressed={active}
                    aria-label={`Zoom ${formatZoom(z)} kali`}
                    className={`h-10 min-w-[2.75rem] px-3 rounded-full text-xs font-bold transition-colors disabled:opacity-60 ${
                      active ? "bg-white text-stone-900" : "text-white hover:bg-white/20"
                    }`}
                  >
                    {formatZoom(z)}×
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {starting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none z-10">
            <div className="h-10 w-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            <p className="text-white text-xs font-medium drop-shadow">
              Memulai kamera...
            </p>
          </div>
        )}

        {successFlash && <div className="scanner-success-flash z-10" />}

        {error && (
          <div
            className="absolute left-0 right-0 mx-4 bg-red-600 text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-lg z-10"
            style={{
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 6.5rem)",
            }}
          >
            {error}
          </div>
        )}
      </div>
    );
  }

  const totalSessionPcs = session
    ? session.items.reduce((acc, item) => acc + item.qty, 0)
    : 0;
  const totalSessionSku = session
    ? new Set(session.items.map((item) => item.sku || item.barcode)).size
    : 0;

  // ---------- IDLE RENDER ----------
  const segBase =
    "py-2 rounded-full text-xs font-bold transition-all active:scale-[0.98]";
  const segActive = "bg-[#1C1917] text-white shadow-sm";
  const segIdle = "text-stone-600 hover:text-stone-900";

  return (
    <div className={`space-y-3.5 ${showProductDropdown ? "pb-64" : ""}`}>
      {successToast && (
        <div className="rounded-2xl px-4 py-3 text-xs font-semibold bg-emerald-50/90 text-emerald-900 border border-emerald-200/80">
          {successToast}
        </div>
      )}

      {error && (
        <div className="rounded-2xl px-4 py-3 text-xs font-semibold bg-red-50/90 text-red-900 border border-red-200/80">
          {error}
        </div>
      )}

      {/* Pilihan alur */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-white/60 border border-white/80">
        <button
          type="button"
          onClick={() => changeFlowMode("verify")}
          className={`${segBase} ${flowMode === "verify" ? segActive : segIdle}`}
        >
          Klaim SJ
        </button>
        <button
          type="button"
          onClick={() => changeFlowMode("direct")}
          className={`${segBase} ${flowMode === "direct" ? segActive : segIdle}`}
        >
          Input Manual
        </button>
      </div>

      {/* Toko aktif (alur Klaim SJ) */}
      {flowMode === "verify" && (
        <div className="card p-3">
          {session ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-stone-900 leading-snug break-words">
                  {session.storeName}
                </p>
                <p className="text-[11px] text-stone-500 mt-0.5 break-words">
                  {session.noSJ ? `SJ ${session.noSJ} · ` : ""}
                  {totalSessionPcs} pcs · {totalSessionSku} SKU
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowNewStoreModal(true)}
                  className="px-3 py-1.5 rounded-full bg-white/90 border border-stone-200 text-[11px] font-bold text-stone-700 hover:bg-white"
                >
                  Ganti
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/verification")}
                  className="px-3 py-1.5 rounded-full bg-[#1C1917] text-white text-[11px] font-bold hover:bg-stone-800"
                >
                  Verifikasi
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => navigate("/verification", { state: { autoOpenScan: true } })}
                className="btn-outline py-2.5"
              >
                Foto SJ
              </button>
              <button
                type="button"
                onClick={() => setShowNewStoreModal(true)}
                className="btn-primary py-2.5"
              >
                Mulai Toko
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tombol scan */}
      <button
        type="button"
        onClick={handlePrimaryScanTrigger}
        className="w-full rounded-2xl scan-card-btn flex flex-col items-center justify-center gap-2.5 py-8 text-white transition-all cursor-pointer"
        aria-label="Scan barcode"
      >
        <svg
          className="w-11 h-11 text-white"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 7V5a1 1 0 011-1h2M20 7V5a1 1 0 00-1-1h-2M4 17v2a1 1 0 001 1h2M20 17v2a1 1 0 01-1 1h-2M8 9v6M12 9v6M16 9v6"
          />
        </svg>
        <span className="text-sm font-extrabold tracking-wider">SCAN BARCODE</span>
      </button>

      {/* Cari produk */}
      <div ref={searchCardRef} className="card p-3 space-y-2">
        <div ref={dropdownRef} className="space-y-2">
          <div className="relative">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={productSearch}
              onFocus={() => {
                if (productSearch.trim().length > 0) {
                  setShowProductDropdown(true);
                }
                setTimeout(() => {
                  searchCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 150);
              }}
              onChange={(e) => {
                const val = e.target.value;
                setProductSearch(val);
                const open = val.trim().length > 0;
                setShowProductDropdown(open);
                if (open) {
                  searchCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
              placeholder={
                loadingProducts ? "Memuat produk..." : `Cari ${products.length} produk (nama, barcode, SKU)`
              }
              disabled={loadingProducts}
              className="w-full pl-10 pr-9 py-2.5 rounded-full bg-white/90 border border-stone-200/80 text-xs font-medium text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
            />
            {productSearch.trim() && (
              <button
                type="button"
                onClick={() => {
                  setProductSearch("");
                  setShowProductDropdown(false);
                  searchInputRef.current?.focus();
                }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 font-bold text-sm"
                aria-label="Hapus pencarian"
              >
                ×
              </button>
            )}
          </div>

          {/* Hasil pencarian (nama produk utuh) */}
          {showProductDropdown && filteredProducts.length > 0 && (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {filteredProducts.slice(0, 50).map((p) => (
                <button
                  key={p.barcode}
                  type="button"
                  onClick={() => {
                    setShowProductDropdown(false);
                    setProductSearch("");
                    const effectiveMode = flowMode === "verify" && session ? "verify" : "direct";
                    navigate(`/return-form?barcode=${encodeURIComponent(p.barcode)}&mode=${effectiveMode}`);
                  }}
                  className="w-full text-left bg-white/85 hover:bg-white border border-stone-200/70 rounded-xl px-3 py-2.5 transition-colors"
                >
                  <span className="text-xs font-bold text-stone-900 block leading-snug break-words">
                    {p.product}
                  </span>
                  <span className="font-mono text-[11px] text-stone-500 block mt-0.5 break-all">
                    {p.sku} · {p.barcode}
                  </span>
                </button>
              ))}
              {filteredProducts.length > 50 && (
                <div className="px-3 py-2 text-[11px] text-stone-500 font-semibold text-center">
                  +{filteredProducts.length - 50} produk lainnya
                </div>
              )}
            </div>
          )}

          {showProductDropdown &&
            productSearch.trim() &&
            filteredProducts.length === 0 &&
            !loadingProducts && (
              <div className="px-4 py-3 text-xs font-medium text-stone-500 text-center">
                Produk tidak ditemukan
              </div>
            )}
        </div>
      </div>

      {/* Modal: Mulai / Pilih Sesi Toko */}
      {showNewStoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs">
          <div className="bg-white/90 backdrop-blur-xl border border-white rounded-3xl shadow-xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-stone-200/70">
              <h3 className="text-sm font-bold text-stone-900">
                {session ? "Ganti Sesi Toko" : "Mulai Sesi Toko Baru"}
              </h3>
              <button
                type="button"
                onClick={() => setShowNewStoreModal(false)}
                className="w-7 h-7 rounded-full bg-stone-100 text-stone-600 hover:bg-stone-200 text-sm font-bold flex items-center justify-center"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleStartSession} className="space-y-3.5">
              <div>
                <label className="label-field">Nama Toko / Distributor / Event</label>
                <input
                  type="text"
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  placeholder="Mis: Sociolla PIM, Watsons GI..."
                  className="input-field text-xs py-2.5 font-semibold"
                  autoFocus
                  required
                />
                {distriHistory.length > 0 && (
                  <div className="mt-2">
                    <span className="text-[11px] font-semibold text-stone-500 block mb-1.5">
                      Riwayat Toko:
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                      {distriHistory.slice(0, 10).map((h, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setNewStoreName(h)}
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                            newStoreName === h
                              ? "bg-[#1C1917] text-white"
                              : "bg-stone-100 hover:bg-stone-200 text-stone-700"
                          }`}
                        >
                          {h}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="label-field">Nomor Surat Jalan (Opsional)</label>
                <input
                  type="text"
                  value={newStoreNoSJ}
                  onChange={(e) => setNewStoreNoSJ(e.target.value)}
                  placeholder="Mis: SJ-RET-2026-001"
                  className="input-field text-xs py-2.5 font-mono"
                />
              </div>

              <div>
                <label className="label-field">Sheet Tujuan</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["Bagas", "Dimas"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setNewStoreTargetSheet(s)}
                      className={`py-2 rounded-full text-xs font-bold transition-all ${
                        newStoreTargetSheet === s
                          ? "bg-[#1C1917] text-white shadow-xs"
                          : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                      }`}
                    >
                      Sheet {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2.5 pt-2 border-t border-stone-200/70">
                <button
                  type="button"
                  onClick={() => setShowNewStoreModal(false)}
                  className="flex-1 btn-outline py-2.5 text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!newStoreName.trim()}
                  className="flex-1 btn-primary py-2.5 text-xs"
                >
                  Mulai Toko
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
