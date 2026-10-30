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
  // - "direct": [1] KE SHEET (Input Manual tanpa verifikasi)
  // - "verify": [2] KLAIM SJ (Mulai Toko & Rekonsiliasi Klaim SJ)
  const [flowMode, setFlowMode] = useState<"direct" | "verify">(() => {
    try {
      const saved = localStorage.getItem("scan-retur-flow-mode");
      if (saved === "verify" || saved === "direct") return saved;
    } catch {}
    return "verify";
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

  // Listen to "+ TOKO BARU" header button
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

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
          "❌ Izin kamera ditolak. Silakan izinkan akses kamera di pengaturan browser."
        );
      } else if (/notfound|requested/i.test(msg)) {
        setError("❌ Tidak ada perangkat kamera yang ditemukan.");
      } else {
        setError("❌ Error membuka kamera: " + msg);
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
          <div className="bg-[#0B0E14] text-[#16C784] border-2 border-[#16C784] font-mono text-xs font-bold text-center px-3.5 py-1.5 rounded-xl">
            {starting ? "MEMULAI KAMERA..." : "ARAHKAN BARCODE KE GARIS HIJAU (±20 CM)"}
          </div>
        </div>

        <button
          onClick={stopScanner}
          aria-label="Tutup scanner"
          className="absolute z-10 h-11 w-11 flex items-center justify-center rounded-xl bg-[#0B0E14] text-white border-2 border-white font-mono text-xl font-bold"
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
              className="flex gap-1.5 rounded-xl bg-[#0B0E14] border-2 border-white/40 p-1"
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
                    className={`h-10 min-w-[2.75rem] px-3 rounded-lg font-mono text-xs font-bold transition-colors disabled:opacity-60 ${
                      active ? "bg-[#16C784] text-[#0B0E14]" : "text-white hover:bg-white/20"
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
            <div className="h-10 w-10 border-4 border-white/30 border-t-[#16C784] rounded-full animate-spin" />
            <p className="text-white font-mono text-xs font-bold uppercase drop-shadow">
              MEMULAI KAMERA...
            </p>
          </div>
        )}

        {successFlash && <div className="scanner-success-flash z-10" />}

        {error && (
          <div
            className="absolute left-0 right-0 mx-4 bg-red-600 text-white border-2 border-[#0B0E14] font-mono text-xs font-bold px-4 py-3 rounded-xl z-10"
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

  // ---------- IDLE / INDUSTRIAL HIGH-CONTRAST TACTILE RENDER ----------
  return (
    <div className={`space-y-3 ${showProductDropdown ? "pb-64" : ""}`}>
      {successToast && (
        <div className="rounded-2xl px-3.5 py-2.5 font-mono text-xs font-bold bg-[#16C784] text-[#0B0E14] border-2 border-[#0B0E14] shadow-[0_3px_0_#0B0E14]">
          ✓ {successToast}
        </div>
      )}

      {error && (
        <div className="rounded-2xl px-3.5 py-2.5 font-mono text-xs font-bold bg-red-100 text-red-900 border-2 border-[#0B0E14] shadow-[0_3px_0_#0B0E14]">
          {error}
        </div>
      )}

      {/* 1. 2-FLOW SWITCHER: [1] KE SHEET vs [2] KLAIM SJ */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => changeFlowMode("direct")}
          className={`py-2.5 px-3 rounded-xl font-mono text-xs font-bold uppercase tracking-wider border-2 border-[#0B0E14] shadow-[0_3px_0_#0B0E14] active:translate-y-[2px] active:shadow-none transition-all ${
            flowMode === "direct"
              ? "bg-[#0B0E14] text-white"
              : "bg-white text-[#0B0E14] hover:bg-gray-100"
          }`}
        >
          {flowMode === "direct" ? "[1] KE SHEET ✓" : "[1] KE SHEET"}
        </button>

        <button
          type="button"
          onClick={() => changeFlowMode("verify")}
          className={`py-2.5 px-3 rounded-xl font-mono text-xs font-bold uppercase tracking-wider border-2 border-[#0B0E14] shadow-[0_3px_0_#0B0E14] active:translate-y-[2px] active:shadow-none transition-all ${
            flowMode === "verify"
              ? "bg-[#0B0E14] text-white"
              : "bg-white text-[#0B0E14] hover:bg-gray-100"
          }`}
        >
          {flowMode === "verify" ? "[2] KLAIM SJ ✓" : "[2] KLAIM SJ"}
        </button>
      </div>

      {/* 2. CONTEXT BANNER & STORE TOOLS */}
      {flowMode === "verify" ? (
        <>
          {/* Info Banner or Active Store Session Banner */}
          {session ? (
            <div className="bg-[#FEF0C7] border-2 border-[#0B0E14] shadow-[0_3px_0_#0B0E14] rounded-2xl p-3 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="bg-[#0B0E14] text-[#16C784] font-mono text-[10px] font-bold px-2 py-0.5 rounded shrink-0">
                    AKTIF
                  </span>
                  <h2 className="text-xs font-black text-[#0B0E14] uppercase truncate">
                    {session.storeName}
                  </h2>
                </div>
                <p className="font-mono text-[11px] text-gray-700 font-semibold truncate mt-1">
                  {session.noSJ ? `SJ: ${session.noSJ} • ` : ""}
                  SHEET {session.targetSheet.toUpperCase()} •{" "}
                  {session.items.reduce((a, b) => a + b.qty, 0)} PCS (
                  {new Set(session.items.map((i) => i.sku || i.barcode)).size} SKU)
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate("/verification")}
                className="bg-[#0B0E14] text-white font-mono text-[11px] font-bold px-3 py-1.5 rounded-xl shrink-0 hover:bg-gray-800 active:translate-y-[1px]"
              >
                CEK SJ →
              </button>
            </div>
          ) : (
            <div className="bg-[#FEF0C7] border-2 border-[#0B0E14] rounded-2xl p-3 flex items-start gap-2.5">
              <span className="bg-[#0B0E14] text-[#FDE047] font-mono text-[10px] font-bold px-2 py-0.5 rounded shrink-0 mt-0.5">
                INFO
              </span>
              <p className="text-xs font-medium text-[#0B0E14] leading-snug">
                Wajib mulai sesi toko atau foto Surat Jalan (SJ) sebelum scan barang retur.
              </p>
            </div>
          )}

          {/* 2-Column Tactile Action Cards: BACA SJ (OCR) & PILIH TOKO */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                changeFlowMode("verify");
                navigate("/verification", { state: { autoOpenScan: true } });
              }}
              className="bg-white border-2 border-[#0B0E14] shadow-[0_3px_0_#0B0E14] rounded-2xl p-3.5 text-left hover:bg-gray-50 active:translate-y-[2px] active:shadow-none transition-all"
            >
              <div className="w-9 h-9 rounded-xl bg-[#0B0E14] text-white flex items-center justify-center mb-3">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="font-black text-xs text-[#0B0E14] uppercase tracking-tight block">
                BACA SJ (OCR)
              </span>
              <span className="font-mono text-[11px] text-gray-500 block mt-0.5">
                Scan Lembar Fisik
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowNewStoreModal(true)}
              className="bg-[#38BDF8] border-2 border-[#0B0E14] shadow-[0_3px_0_#0B0E14] rounded-2xl p-3.5 text-left hover:bg-[#0EA5E9] active:translate-y-[2px] active:shadow-none transition-all"
            >
              <div className="w-9 h-9 rounded-xl bg-[#0B0E14] text-white flex items-center justify-center mb-3">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <span className="font-black text-xs text-[#0B0E14] uppercase tracking-tight block">
                {session ? "GANTI TOKO" : "PILIH TOKO"}
              </span>
              <span className="font-mono text-[11px] text-[#0B0E14]/80 font-semibold truncate block mt-0.5">
                {session
                  ? session.storeName
                  : distriHistory.length > 0
                  ? `${distriHistory.length} Toko Aktif`
                  : "Mulai Sesi Toko"}
              </span>
            </button>
          </div>
        </>
      ) : (
        <div className="bg-[#FEF0C7] border-2 border-[#0B0E14] rounded-2xl p-3 flex items-start gap-2.5">
          <span className="bg-[#0B0E14] text-[#FDE047] font-mono text-[10px] font-bold px-2 py-0.5 rounded shrink-0 mt-0.5">
            INFO
          </span>
          <p className="text-xs font-medium text-[#0B0E14] leading-snug">
            Input manual langsung ke Google Sheet (Bagas / Dimas) tanpa masuk sesi verifikasi Surat Jalan.
          </p>
        </div>
      )}

      {/* 3. EXTRA-LARGE GREEN BARCODE TRIGGER BUTTON (ZEBRA / WAREHOUSE STYLE) */}
      <button
        type="button"
        onClick={() => {
          if (flowMode === "verify" && !session) {
            setShowNewStoreModal(true);
            return;
          }
          void startScanner();
        }}
        className="w-full bg-[#16C784] hover:bg-[#10B981] text-[#0B0E14] border-2 border-[#0B0E14] shadow-[0_4px_0_#0B0E14] active:translate-y-[2px] active:shadow-[0_1px_0_#0B0E14] rounded-2xl p-4 flex items-center justify-between gap-3 transition-all text-left"
      >
        <div className="w-12 h-12 rounded-2xl bg-[#0B0E14] text-[#16C784] flex items-center justify-center shrink-0">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7V5a1 1 0 011-1h2M20 7V5a1 1 0 00-1-1h-2M4 17v2a1 1 0 001 1h2M20 17v2a1 1 0 01-1 1h-2M7 12h10" />
          </svg>
        </div>

        <div className="min-w-0 flex-1">
          <span className="text-base font-black text-[#0B0E14] uppercase tracking-tight block leading-tight">
            {flowMode === "verify"
              ? session
                ? "TEMBAK BARCODE"
                : "MULAI TOKO & SCAN"
              : "TEMBAK BARCODE"}
          </span>
          <span className="font-mono text-xs text-[#0B0E14]/80 font-semibold block mt-0.5 truncate">
            {flowMode === "verify" && session
              ? `Toko: ${session.storeName}`
              : "Tekan untuk tembak barcode"}
          </span>
        </div>

        <span className="bg-[#0B0E14] text-white font-mono text-xs font-bold px-3 py-1.5 rounded-lg shrink-0">
          GO →
        </span>
      </button>

      {/* 4. CARI PRODUK MANUAL CARD */}
      <div
        ref={searchCardRef}
        className="bg-white border-2 border-[#0B0E14] shadow-[0_3px_0_#0B0E14] rounded-2xl p-3.5"
      >
        <div className="flex items-center justify-between mb-2.5">
          <span className="font-mono text-xs font-bold text-[#0B0E14] uppercase tracking-wider">
            CARI PRODUK MANUAL
          </span>
          <span className="bg-[#E2E8F0] border-2 border-[#0B0E14] text-[#0B0E14] font-mono text-[11px] font-bold px-2 py-0.5 rounded-md">
            {loadingProducts ? "..." : `${products.length} SKU`}
          </span>
        </div>

        <div className="relative" ref={dropdownRef}>
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
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
                  loadingProducts ? "Memuat produk..." : "Ketik SKU / Batch / Nama..."
                }
                disabled={loadingProducts}
                className="w-full bg-[#F4F3EE] border-2 border-[#0B0E14] rounded-xl px-3 py-2.5 pr-8 font-mono text-xs text-[#0B0E14] placeholder:text-gray-500 focus:bg-white focus:outline-none"
              />
              {productSearch.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setProductSearch("");
                    setShowProductDropdown(false);
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-[#0B0E14] font-mono font-bold text-sm"
                  aria-label="Hapus pencarian"
                >
                  ×
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                if (!productSearch.trim()) {
                  searchInputRef.current?.focus();
                  return;
                }
                setShowProductDropdown(true);
                searchCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="bg-[#0B0E14] text-white border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] active:translate-y-[1px] active:shadow-none rounded-xl px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider shrink-0"
            >
              CARI
            </button>
          </div>

          {showProductDropdown && filteredProducts.length > 0 && (
            <div className="absolute z-30 left-0 right-0 mt-2 bg-white border-2 border-[#0B0E14] rounded-xl shadow-[0_4px_0_#0B0E14] max-h-64 overflow-y-auto divide-y-2 divide-gray-200">
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
                  className="w-full text-left px-3.5 py-2.5 hover:bg-[#FEF0C7] transition-colors"
                >
                  <span className="text-xs font-black text-[#0B0E14] block leading-snug">
                    {p.product}
                  </span>
                  <span className="font-mono text-[11px] text-gray-600 font-semibold block mt-0.5">
                    {p.sku} • {p.barcode}
                  </span>
                </button>
              ))}
              {filteredProducts.length > 50 && (
                <div className="px-3.5 py-2 font-mono text-[11px] text-gray-600 font-bold text-center bg-[#F4F3EE]">
                  +{filteredProducts.length - 50} PRODUK LAINNYA
                </div>
              )}
            </div>
          )}

          {showProductDropdown &&
            productSearch.trim() &&
            filteredProducts.length === 0 &&
            !loadingProducts && (
              <div className="absolute z-30 left-0 right-0 mt-2 bg-white border-2 border-[#0B0E14] rounded-xl shadow-[0_4px_0_#0B0E14] px-4 py-3 font-mono text-xs font-bold text-gray-600 text-center">
                PRODUK TIDAK DITEMUKAN
              </div>
            )}
        </div>
      </div>

      {/* Modal: Mulai / Pilih Sesi Toko */}
      {showNewStoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="card max-w-sm w-full p-4 space-y-3 bg-white">
            <div className="flex items-center justify-between pb-2.5 border-b-2 border-[#0B0E14]">
              <h3 className="text-sm font-black text-[#0B0E14] uppercase tracking-tight">
                {session ? "GANTI SESI TOKO" : "MULAI SESI TOKO BARU"}
              </h3>
              <button
                type="button"
                onClick={() => setShowNewStoreModal(false)}
                className="w-7 h-7 rounded-lg bg-[#F4F3EE] border-2 border-[#0B0E14] font-mono text-sm font-bold flex items-center justify-center"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleStartSession} className="space-y-3">
              <div>
                <label className="label-field">NAMA TOKO / DISTRIBUTOR / EVENT</label>
                <input
                  type="text"
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  placeholder="Mis: Sociolla PIM, Watsons GI..."
                  className="input-field text-xs py-2.5 font-bold"
                  autoFocus
                  required
                />
                {distriHistory.length > 0 && (
                  <div className="mt-2">
                    <span className="font-mono text-[10px] font-bold text-gray-500 uppercase block mb-1">
                      PILIH CEPAT TOKO AKTIF:
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                      {distriHistory.slice(0, 10).map((h, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setNewStoreName(h)}
                          className={`font-mono text-[11px] font-bold px-2.5 py-1 rounded-lg border-2 border-[#0B0E14] truncate max-w-[160px] transition-colors ${
                            newStoreName === h
                              ? "bg-[#0B0E14] text-[#FDE047]"
                              : "bg-[#F4F3EE] hover:bg-[#FEF0C7] text-[#0B0E14]"
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
                <label className="label-field">NOMOR SURAT JALAN (OPSIONAL)</label>
                <input
                  type="text"
                  value={newStoreNoSJ}
                  onChange={(e) => setNewStoreNoSJ(e.target.value)}
                  placeholder="Mis: SJ-RET-2026-001"
                  className="input-field text-xs py-2.5 font-mono"
                />
              </div>

              <div>
                <label className="label-field">SHEET TUJUAN</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["Bagas", "Dimas"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setNewStoreTargetSheet(s)}
                      className={`py-2 rounded-xl font-mono text-xs font-bold uppercase border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] transition-all ${
                        newStoreTargetSheet === s
                          ? "bg-[#0B0E14] text-white"
                          : "bg-white text-[#0B0E14] hover:bg-gray-100"
                      }`}
                    >
                      SHEET {s.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t-2 border-[#0B0E14]">
                <button
                  type="button"
                  onClick={() => setShowNewStoreModal(false)}
                  className="flex-1 btn-outline py-2.5 text-xs"
                >
                  BATAL
                </button>
                <button
                  type="submit"
                  disabled={!newStoreName.trim()}
                  className="flex-1 bg-[#16C784] hover:bg-[#10B981] text-[#0B0E14] border-2 border-[#0B0E14] shadow-[0_3px_0_#0B0E14] active:translate-y-[2px] active:shadow-none py-2.5 rounded-xl font-mono text-xs font-bold uppercase disabled:opacity-40 transition-all"
                >
                  MULAI TOKO →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
