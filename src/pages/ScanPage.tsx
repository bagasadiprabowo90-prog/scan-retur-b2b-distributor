import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Camera,
  ScanBarcode,
  Store,
  ClipboardCheck,
  Settings,
  Search,
  X,
  Check,
  FileText,
} from "lucide-react";
import {
  Html5Qrcode,
  Html5QrcodeScannerState,
  Html5QrcodeSupportedFormats,
} from "html5-qrcode";
import { fetchProducts, type ProductItem } from "../lib/api";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Sheet from "../components/ui/Sheet";
import Button from "../components/ui/Button";
import Toast from "../components/ui/Toast";
import QuickScanSheet from "../components/QuickScanSheet";
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

function playScanBeep() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 200);
  } catch {
    // Abaikan jika browser memblokir Web Audio
  }
}

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

  // Continuous scan sheet state (R10)
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [scannerToast, setScannerToast] = useState("");

  // Product search state
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // Store Session state
  const [session, setSession] = useState<StoreSession | null>(getActiveSession);
  const [showNewStoreModal, setShowNewStoreModal] = useState(false);
  const [confirmSwitchStore, setConfirmSwitchStore] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreNoSJ, setNewStoreNoSJ] = useState("");
  const [newStoreTargetSheet, setNewStoreTargetSheet] = useState<"Bagas" | "Dimas">(() => {
    try {
      const raw = localStorage.getItem("scan-retur-target-sheet");
      if (raw === "Bagas" || raw === "Dimas") return raw;
    } catch {}
    return "Bagas";
  });

  const distriHistory: string[] = useMemo(() => {
    try {
      const raw = localStorage.getItem("scan-retur-distri-history");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, [showNewStoreModal]);

  const handleStartSession = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newStoreName.trim()) return;
    const sess = startStoreSession(
      newStoreName.trim(),
      newStoreNoSJ.trim(),
      newStoreTargetSheet
    );
    setSession(sess);
    setShowNewStoreModal(false);
    setNewStoreName("");
    setNewStoreNoSJ("");
  };

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
    setScannedBarcode(null);
    detectedRef.current = false;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      void stopScanner();
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

  const matchedScannedProduct = useMemo(() => {
    if (!scannedBarcode) return null;
    return products.find((p) => p.barcode === scannedBarcode) ?? null;
  }, [products, scannedBarcode]);

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
    setScannedBarcode(null);
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
          const code = decodedText.trim();

          // Haptic & Sound feedback (R10)
          try {
            if ("vibrate" in navigator) {
              navigator.vibrate(100);
            }
          } catch {}
          playScanBeep();

          setSuccessFlash(true);
          setTimeout(() => {
            setSuccessFlash(false);
            setScannedBarcode(code);
          }, 150);
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
  }, [stopScanner, tuneCamera]);

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

        {/* Scanning guide overlay */}
        <div
          className="scanner-guide"
          style={{ width: `${guideBox.width}px`, height: `${guideBox.height}px` }}
        >
          <div className="scanner-guide-corner tl" />
          <div className="scanner-guide-corner tr" />
          <div className="scanner-guide-corner bl" />
          <div className="scanner-guide-corner br" />
          {scanning && !scannedBarcode && <div className="scanner-scanline" />}
        </div>

        {/* Top hint + Active session badge */}
        <div
          className="absolute top-0 left-0 right-0 flex flex-col items-center gap-1.5 pointer-events-none z-10 px-14"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
        >
          {session && (
            <div className="bg-emerald-600/90 text-white text-xs font-bold px-3 py-1 rounded-full backdrop-blur-sm shadow">
              {session.storeName} · {session.items.reduce((a, b) => a + b.qty, 0)} pcs (
              {session.items.length} scan)
            </div>
          )}
          <div className="bg-black/60 text-white text-xs text-center px-3 py-1.5 rounded-full backdrop-blur-sm">
            {starting
              ? "Memulai kamera..."
              : scannerToast || "Barcode di garis hijau, jarak ±20 cm"}
          </div>
        </div>

        {/* Close button top-right */}
        <button
          type="button"
          onClick={() => void stopScanner()}
          aria-label="Tutup scanner"
          className="absolute z-10 h-11 w-11 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 backdrop-blur-sm"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
            right: "calc(env(safe-area-inset-right, 0px) + 0.75rem)",
          }}
        >
          <X className="w-6 h-6" />
        </button>

        {/* Zoom control */}
        {zoomOptions.length > 1 && !scannedBarcode && (
          <div
            className="absolute left-0 right-0 z-10 flex justify-center"
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}
          >
            <div
              role="group"
              aria-label="Zoom kamera"
              className="flex gap-1 rounded-full bg-black/60 p-1 backdrop-blur-sm"
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
                    className={`h-11 min-w-[2.75rem] px-3 rounded-full text-sm font-bold transition-colors disabled:opacity-60 ${
                      active ? "bg-white text-gray-900" : "text-white hover:bg-white/20"
                    }`}
                  >
                    {formatZoom(z)}×
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 6.5rem)",
            }}
          >
            {error}
          </div>
        )}

        {/* Quick Scan Sheet for Continuous Scanning (R10) */}
        <QuickScanSheet
          barcode={scannedBarcode}
          product={matchedScannedProduct}
          session={session}
          onCloseAndResume={() => {
            setScannedBarcode(null);
            setTimeout(() => {
              detectedRef.current = false;
            }, 250);
          }}
          onSavedAndResume={(updatedSession, msg) => {
            setSession(updatedSession);
            setScannedBarcode(null);
            setScannerToast(msg);
            setTimeout(() => setScannerToast(""), 3000);
            setTimeout(() => {
              detectedRef.current = false;
            }, 300);
          }}
          onOpenFullForm={(code) => {
            void stopScanner().then(() => {
              navigate(`/return-form?barcode=${encodeURIComponent(code)}`);
            });
          }}
        />
      </div>
    );
  }

  const claimCount = session ? Object.keys(session.claims).length : 0;
  const scanCount = session ? session.items.length : 0;
  const totalScanPcs = session ? session.items.reduce((a, b) => a + b.qty, 0) : 0;
  const uniqueScanSku = session
    ? new Set(session.items.map((i) => i.sku || i.barcode)).size
    : 0;

  // ---------- IDLE / NON-SCANNING RENDER ----------
  return (
    <div className="space-y-3 pb-20">
      {successToast && (
        <Toast
          type="success"
          message={successToast}
          onClose={() => setSuccessToast("")}
        />
      )}

      {error && (
        <Toast
          type="error"
          message={error}
          onClose={() => setError("")}
        />
      )}

      {/* Sesi Toko Banner + Stepper Alur Kerja (R9) */}
      <div className="card p-3.5 space-y-3">
        {session ? (
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-gray-100">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                <h2 className="text-sm font-bold truncate text-gray-900">
                  {session.storeName}
                </h2>
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5">
                {session.noSJ ? `SJ: ${session.noSJ} · ` : ""}
                Sheet {session.targetSheet} · {totalScanPcs} pcs ({uniqueScanSku} SKU)
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (session.items.length > 0) {
                  setConfirmSwitchStore(true);
                } else {
                  setShowNewStoreModal(true);
                }
              }}
              className="inline-flex items-center gap-1 min-h-[38px] px-2.5 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-700 transition-colors shrink-0"
              title="Ganti Toko"
            >
              <Settings className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Ganti Toko</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-gray-100">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-gray-900">Alur Retur Toko</h2>
              <p className="text-xs text-gray-500">
                Mulai sesi toko atau foto lembar SJ terlebih dahulu
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewStoreModal(true)}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition-colors shrink-0"
            >
              <Store className="w-3.5 h-3.5" aria-hidden="true" />
              <span>+ Mulai Toko</span>
            </button>
          </div>
        )}

        {/* 3-Step Workflow Stepper (R9): Klaim SJ -> Scan Fisik -> Rekonsiliasi */}
        <div className="grid grid-cols-3 gap-2">
          {/* Step 1: Klaim SJ */}
          <button
            type="button"
            onClick={() => navigate("/verification", { state: { autoOpenScan: true } })}
            className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
              claimCount > 0
                ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
                : "bg-purple-50/70 border-purple-200 text-purple-900 hover:bg-purple-100/70"
            }`}
          >
            <div className="flex items-center justify-between w-full mb-1">
              <span className="text-xs font-bold uppercase tracking-wider opacity-75">
                1. Klaim SJ
              </span>
              {claimCount > 0 ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-purple-600" aria-hidden="true" />
              )}
            </div>
            <span className="text-xs font-bold leading-snug">
              {claimCount > 0 ? `${claimCount} SKU Klaim` : "Baca SJ (AI)"}
            </span>
          </button>

          {/* Step 2: Scan Fisik */}
          <button
            type="button"
            onClick={startScanner}
            className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
              scanCount > 0
                ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
                : "bg-gray-50 border-gray-200 text-gray-900 hover:bg-gray-100"
            }`}
          >
            <div className="flex items-center justify-between w-full mb-1">
              <span className="text-xs font-bold uppercase tracking-wider opacity-75">
                2. Fisik
              </span>
              <Camera className="w-3.5 h-3.5 text-gray-600" aria-hidden="true" />
            </div>
            <span className="text-xs font-bold leading-snug">
              {scanCount > 0 ? `${totalScanPcs} pcs (${scanCount}×)` : "Scan Barang"}
            </span>
          </button>

          {/* Step 3: Rekonsiliasi */}
          <button
            type="button"
            onClick={() => navigate("/verification")}
            className="flex flex-col items-start p-2.5 rounded-xl border bg-gray-50 border-gray-200 text-gray-900 hover:bg-gray-100 text-left transition-all"
          >
            <div className="flex items-center justify-between w-full mb-1">
              <span className="text-xs font-bold uppercase tracking-wider opacity-75">
                3. Rekon
              </span>
              <ClipboardCheck className="w-3.5 h-3.5 text-gray-600" aria-hidden="true" />
            </div>
            <span className="text-xs font-bold leading-snug">
              Cek Selisih
            </span>
          </button>
        </div>
      </div>

      {/* Product Search Card */}
      <div className="card">
        <div className="card-body">
          <label htmlFor="manual-product-search" className="label-field">
            Cari Produk Manual (Tanpa Kamera)
          </label>
          <div className="relative" ref={dropdownRef}>
            <div className="relative">
              <Search
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="manual-product-search"
                type="text"
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setShowProductDropdown(e.target.value.trim().length > 0);
                }}
                placeholder={
                  loadingProducts ? "Memuat produk..." : "Nama produk, barcode, atau SKU..."
                }
                disabled={loadingProducts}
                className="input-field pl-10 pr-10 text-sm"
              />
              {productSearch.trim() && (
                <button
                  type="button"
                  aria-label="Bersihkan pencarian"
                  onClick={() => {
                    setProductSearch("");
                    setShowProductDropdown(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                >
                  <X className="w-4 h-4" />
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
                    <span className="text-sm font-medium text-gray-900 block">
                      {p.product}
                    </span>
                    <span className="text-xs text-gray-500 font-mono">
                      {p.barcode} · {p.sku}
                    </span>
                  </button>
                ))}
                {filteredProducts.length > 50 && (
                  <div className="px-3.5 py-2 text-xs text-gray-500 text-center bg-gray-50">
                    +{filteredProducts.length - 50} produk lagi
                  </div>
                )}
              </div>
            )}
            {showProductDropdown &&
              productSearch.trim() &&
              filteredProducts.length === 0 &&
              !loadingProducts && (
                <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-500 text-center">
                  Produk tidak ditemukan
                </div>
              )}
          </div>
          {!loadingProducts ? (
            <p className="text-xs text-gray-500 mt-2">
              {products.length} produk terdaftar di master data
            </p>
          ) : (
            <div className="h-4 w-40 bg-gray-100 rounded animate-pulse mt-2" />
          )}
        </div>
      </div>

      {/* Satu Aksi Utama Sticky di Bawah (R9) */}
      <div className="sticky bottom-20 z-30 pt-2">
        <Button
          variant="primary"
          size="lg"
          block
          icon={<ScanBarcode className="w-5 h-5" />}
          onClick={startScanner}
          className="shadow-xl"
        >
          Mulai Scan Barcode
        </Button>
      </div>

      <ConfirmDialog
        open={confirmSwitchStore && !!session}
        title="Ganti toko?"
        message={
          <>
            Toko <strong>{session?.storeName}</strong> masih memiliki {session?.items.length} item
            scan yang belum diverifikasi.
          </>
        }
        confirmLabel="Ganti Toko"
        danger
        onCancel={() => setConfirmSwitchStore(false)}
        onConfirm={() => {
          setConfirmSwitchStore(false);
          setShowNewStoreModal(true);
        }}
      />

      {/* Sheet: Mulai / Ganti Sesi Toko */}
      <Sheet
        open={showNewStoreModal}
        onClose={() => setShowNewStoreModal(false)}
        title={session ? "Ganti Sesi Toko" : "Mulai Sesi Toko Retur"}
        footer={
          <>
            <Button
              variant="secondary"
              block
              onClick={() => setShowNewStoreModal(false)}
            >
              Batal
            </Button>
            <Button
              variant="primary"
              block
              disabled={!newStoreName.trim()}
              onClick={() => handleStartSession()}
            >
              Mulai Toko Ini
            </Button>
          </>
        }
      >
        <form onSubmit={handleStartSession} className="space-y-3">
          <div>
            <label className="label-field">Nama Toko / Distributor / Event</label>
            <input
              type="text"
              value={newStoreName}
              onChange={(e) => setNewStoreName(e.target.value)}
              placeholder="Mis: Sociolla PIM, Watsons GI..."
              className="input-field text-sm py-2.5 font-semibold"
              autoFocus
              required
            />
            {distriHistory.length > 0 && !newStoreName && (
              <div className="mt-2">
                <span className="text-xs text-gray-500 block mb-1">Riwayat Toko:</span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {distriHistory.slice(0, 8).map((h, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setNewStoreName(h)}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2.5 py-1 rounded-lg truncate max-w-[160px]"
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="label-field">Nomor SJ Retur (Opsional)</label>
            <input
              type="text"
              value={newStoreNoSJ}
              onChange={(e) => setNewStoreNoSJ(e.target.value)}
              placeholder="Mis: SJ-RET-2026-001"
              className="input-field text-sm py-2.5 font-mono"
            />
          </div>

          <div>
            <label className="label-field">Sheet Tujuan</label>
            <div className="flex bg-gray-100 p-1 rounded-xl">
              {(["Bagas", "Dimas"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setNewStoreTargetSheet(s)}
                  className={`flex-1 min-h-[38px] py-1.5 rounded-lg text-xs font-bold transition-all ${
                    newStoreTargetSheet === s
                      ? "bg-primary text-white shadow-xs"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
