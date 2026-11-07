import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, Camera, CheckCircle2, ChevronRight, Clock, FileCheck2, PackageCheck, PenTool, Plus, ScanBarcode, Search } from "lucide-react";
import {
  Html5Qrcode,
  Html5QrcodeScannerState,
  Html5QrcodeSupportedFormats,
} from "html5-qrcode";
import {
  fetchProducts,
  fetchReturnHistory,
  type ProductItem,
  type ReturnHistoryItem,
} from "../lib/api";
import {
  getActiveSession,
  startStoreSession,
  type StoreSession,
} from "../lib/session";

// ============================================================
// AUDIO FEEDBACK (WEB AUDIO API BEEP)
// Berfungsi di iOS Safari & Android Chrome tanpa file MP3 eksternal
// ============================================================
let scanAudioCtx: AudioContext | null = null;

function initAudioContext() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!scanAudioCtx || scanAudioCtx.state === "closed") {
      scanAudioCtx = new AudioCtx();
    }
    if (scanAudioCtx.state === "suspended") {
      void scanAudioCtx.resume();
    }
  } catch {}
}

function playScanBeep() {
  try {
    initAudioContext();
    if (!scanAudioCtx) return;

    const osc = scanAudioCtx.createOscillator();
    const gain = scanAudioCtx.createGain();

    const now = scanAudioCtx.currentTime;
    osc.type = "sine";
    // Nada beep 1400Hz standar laser scanner
    osc.frequency.setValueAtTime(1400, now);

    // Envelope cepat (80ms) mencegah bunyi klik/pop
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(scanAudioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  } catch {}
}

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

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function getTodayFormatted(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mon = MONTH_ABBR[d.getMonth()];
  const yyyy = d.getFullYear();
  return `${dd}-${mon}-${yyyy}`;
}

function formatZoom(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getCategoryBadge(productName: string) {
  const p = (productName || "").toUpperCase();
  if (p.includes("CUSHION")) return { label: "CC", bg: "bg-purple-50 text-purple-700 border-purple-200/60" };
  if (p.includes("LIP") || p.includes("COAT")) return { label: "LC", bg: "bg-amber-50 text-amber-700 border-amber-200/60" };
  if (p.includes("BALM")) return { label: "BM", bg: "bg-rose-50 text-rose-700 border-rose-200/60" };
  if (p.includes("POWDER")) return { label: "PW", bg: "bg-blue-50 text-blue-700 border-blue-200/60" };
  if (p.includes("BROW") || p.includes("EYE")) return { label: "EB", bg: "bg-teal-50 text-teal-700 border-teal-200/60" };
  const words = (productName || "").trim().split(/\s+/);
  const label = words.length > 1 && words[0] && words[1]
    ? (words[0][0] + words[1][0]).toUpperCase()
    : (productName || "PR").slice(0, 2).toUpperCase();
  return { label: label || "PR", bg: "bg-slate-100 text-slate-700 border-slate-200/80" };
}

export default function ScanPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const detectedRef = useRef<boolean>(false);
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

  const targetSheetSaved = useMemo<"Bagas" | "Dimas">(() => {
    try {
      const raw = localStorage.getItem("scan-retur-target-sheet");
      if (raw === "Bagas" || raw === "Dimas") return raw;
    } catch {}
    return "Bagas";
  }, []);

  const [historyItems, setHistoryItems] = useState<ReturnHistoryItem[]>(() => {
    try {
      const raw = localStorage.getItem("scan-retur-history-cache");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.history) ? parsed.history : [];
    } catch {
      return [];
    }
  });

  const refreshHistory = useCallback(async () => {
    try {
      const raw = localStorage.getItem("scan-retur-history-cache");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.history)) {
          setHistoryItems(parsed.history);
        }
      }
    } catch {}

    const res = await fetchReturnHistory(25);
    if (res.ok && res.history) {
      setHistoryItems(res.history);
      try {
        localStorage.setItem(
          "scan-retur-history-cache",
          JSON.stringify({ history: res.history, ts: Date.now() })
        );
      } catch {}
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory, location.state]);

  const todayStats = useMemo(() => {
    const todayStr = getTodayFormatted().toLowerCase();
    const now = new Date();
    const isoDate = now.toISOString().split("T")[0];
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = String(now.getFullYear());
    const altSlash = `${dd}/${mm}/${yyyy}`;
    const altDash = `${dd}-${mm}-${yyyy}`;

    const itemsToday = historyItems.filter((item) => {
      if (!item.receiveDate) return false;
      const lower = item.receiveDate.trim().toLowerCase();
      return (
        lower === todayStr ||
        lower.startsWith(isoDate) ||
        lower === altSlash ||
        lower === altDash
      );
    });

    const totalPcs = itemsToday.reduce((acc, item) => acc + (Number(item.qty) || 0), 0);
    return {
      count: itemsToday.length,
      pcs: totalPcs,
    };
  }, [historyItems]);

  const recentList = useMemo(() => {
    if (flowMode === "verify" && session && session.items.length > 0) {
      return [...session.items].reverse().slice(0, 5).map((item) => ({
        id: item.id,
        product: item.product,
        barcode: item.barcode,
        batch: item.batch,
        expDate: item.expDate,
        qty: item.qty,
        distriEvent: item.distriEvent,
        subtext: item.timestamp
          ? new Date(item.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
          : item.receiveDate,
      }));
    }

    return historyItems.slice(0, 5).map((item, idx) => ({
      id: `${item.sheet}-${item.rowNumber}-${idx}`,
      product: item.product,
      barcode: item.barcode,
      batch: item.batch,
      expDate: item.expDate,
      qty: item.qty,
      distriEvent: item.distriEvent,
      subtext: item.receiveDate,
    }));
  }, [flowMode, session, historyItems]);

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
            playScanBeep();
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
    initAudioContext();
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
    "py-2 rounded-xl text-xs font-bold transition-all active:scale-[0.98] cursor-pointer";
  const segActive = "bg-slate-900 text-white shadow-xs";
  const segIdle = "text-slate-600 hover:text-slate-900";

  return (
    <div className="space-y-3.5">
      {successToast && (
        <div className="rounded-2xl px-4 py-3 text-xs font-semibold bg-emerald-50 text-emerald-900 border border-emerald-200">
          {successToast}
        </div>
      )}

      {error && (
        <div className="rounded-2xl px-4 py-3 text-xs font-semibold bg-red-50 text-red-900 border border-red-200">
          {error}
        </div>
      )}

      {/* Pilihan alur Bento Switcher */}
      <div className="bg-white p-1 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="flex p-0.5 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => changeFlowMode("verify")}
            className={`flex-1 py-2 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              flowMode === "verify"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <FileCheck2 className={`w-3.5 h-3.5 ${flowMode === "verify" ? "text-emerald-600" : ""}`} />
            <span>Klaim SJ</span>
          </button>
          <button
            type="button"
            onClick={() => changeFlowMode("direct")}
            className={`flex-1 py-2 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              flowMode === "direct"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>Input Manual</span>
          </button>
        </div>
      </div>

      {/* Toko aktif (alur Klaim SJ) */}
      {flowMode === "verify" && (
        <div className="bg-gradient-to-br from-white to-slate-50 border border-slate-200/90 rounded-3xl p-3.5 shadow-2xs relative overflow-hidden">
          {session ? (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-[10px] uppercase tracking-wide">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Sesi Siap
                  </span>
                  {session.noSJ && (
                    <span className="text-xs font-mono text-slate-500 font-semibold truncate">
                      SJ #{session.noSJ}
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-black text-slate-900 mt-1.5 leading-snug break-words">
                  {session.storeName}
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Target: <strong className="text-slate-700">{session.targetSheet}</strong> · {totalSessionPcs} pcs ({totalSessionSku} SKU)
                </p>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowNewStoreModal(true)}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer transition-colors"
                >
                  Ganti Toko
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/verification")}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer transition-colors flex items-center justify-center gap-1 shadow-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Cek SJ</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900">Belum ada Sesi Toko</p>
                  <p className="text-xs text-slate-500">Mulai sesi atau upload foto Surat Jalan</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/verification", { state: { autoOpenScan: true } })}
                  className="btn-outline py-2.5 text-xs flex items-center justify-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5 text-slate-600" />
                  <span>Foto SJ (AI)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewStoreModal(true)}
                  className="btn-primary py-2.5 text-xs flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Mulai Toko</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hero Scanner Card (Bento Logistics Pattern) */}
      <div
        role="button"
        tabIndex={0}
        onClick={handlePrimaryScanTrigger}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handlePrimaryScanTrigger();
          }
        }}
        className="w-full bg-slate-950 text-white rounded-3xl p-4 shadow-xl relative overflow-hidden border border-slate-800 cursor-pointer active:scale-[0.985] transition-all hero-scanner-btn select-none"
        aria-label="Pindai barcode produk"
      >
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-emerald-500/15 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shadow-inner shrink-0">
              <ScanBarcode className="w-6 h-6 text-emerald-400" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-mono tracking-widest text-emerald-400 font-bold uppercase block">
                Kamera Siap · Barcode & QR
              </span>
              <h2 className="text-base font-black text-white tracking-tight leading-tight mt-0.5">
                PINDAI BARCODE
              </h2>
              <p className="text-xs text-slate-400 font-medium truncate mt-0.5">
                Arahkan lensa ke barcode produk (±20 cm)
              </p>
            </div>
          </div>
          <div className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white shrink-0">
            <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
          </div>
        </div>
      </div>


      {showProductDropdown && (
        <div
          className="fixed inset-0 z-[70] flex flex-col max-w-[430px] mx-auto bg-slate-50"
          role="dialog"
          aria-modal="true"
          aria-label="Cari produk"
        >
          <div
            className="flex items-center gap-2 px-4 pb-3 border-b border-slate-200 bg-white"
            style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" strokeWidth={2} />
              <input
                ref={searchInputRef}
                autoFocus
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setShowProductDropdown(false);
                }}
                placeholder="Nama, barcode, atau SKU"
                className="w-full min-h-[44px] pl-10 pr-10 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
              />
              {productSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setProductSearch("");
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center text-slate-400 hover:text-slate-700 font-bold text-lg cursor-pointer"
                  aria-label="Hapus pencarian"
                >
                  ×
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowProductDropdown(false)}
              className="min-h-[44px] px-2 text-xs font-bold text-slate-700 cursor-pointer"
            >
              Batal
            </button>
          </div>

          <div
            className="flex-1 overflow-y-auto overscroll-contain px-4 pt-3 space-y-1.5"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            {!productSearch.trim() && (
              <p className="py-8 text-xs font-medium text-stone-500 text-center">
                Ketik untuk mencari produk
              </p>
            )}
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
                className="w-full text-left bg-white hover:bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-3 transition-colors"
              >
                <span className="text-xs font-bold text-stone-900 block leading-snug break-words">
                  {p.product}
                </span>
                <span className="font-mono text-xs text-stone-500 block mt-0.5 break-all">
                  {p.sku} · {p.barcode}
                </span>
              </button>
            ))}
            {filteredProducts.length > 50 && (
              <div className="px-3 py-2 text-xs text-stone-500 font-semibold text-center">
                +{filteredProducts.length - 50} produk lainnya, persempit pencarian
              </div>
            )}
            {productSearch.trim() && filteredProducts.length === 0 && (
              <div className="py-8 text-xs font-medium text-stone-500 text-center">
                Produk tidak ditemukan
              </div>
            )}
          </div>
        </div>
      )}

      {/* Asymmetric Bento Metrics Grid */}
      <div className="grid grid-cols-5 gap-2.5">
        {/* Left Big Metric (3 cols) */}
        <div className="col-span-3 bg-white border border-slate-200/90 rounded-2xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
              {flowMode === "verify" ? "Fisik Sesi" : "Total Hari Ini"}
            </span>
            <PackageCheck className="w-4 h-4 text-emerald-600" strokeWidth={2.2} />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-900 tracking-tight font-mono leading-none">
              {flowMode === "verify" ? totalSessionPcs : todayStats.pcs}{" "}
              <span className="text-xs font-semibold text-slate-500 font-sans">pcs</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.max(8, ((flowMode === "verify" ? totalSessionPcs : todayStats.pcs) > 0 ? 75 : 8)))}%`,
                }}
              />
            </div>
            <span className="text-[10px] text-slate-400 font-medium mt-1.5 block truncate">
              {flowMode === "verify" && session ? `${totalSessionSku} SKU tercatat` : `${todayStats.count} kali scan hari ini`}
            </span>
          </div>
        </div>

        {/* Right Stacked Metrics (2 cols) */}
        <div className="col-span-2 space-y-2.5">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-2.5 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              {flowMode === "verify" ? "Total SKU" : "Scan Sukses"}
            </span>
            <div className="text-base font-black text-slate-900 font-mono mt-0.5">
              {flowMode === "verify" ? totalSessionSku : todayStats.count}{" "}
              <span className="text-[10px] text-slate-500 font-sans font-normal">
                {flowMode === "verify" ? "jenis" : "item"}
              </span>
            </div>
          </div>
          <div className="bg-white border border-slate-200/90 rounded-2xl p-2.5 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Target Sheet
            </span>
            <div className="text-xs font-extrabold text-slate-800 truncate mt-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="truncate">
                {flowMode === "verify" ? (session?.targetSheet ?? newStoreTargetSheet) : targetSheetSaved}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Cari produk: micro-trigger */}
      <button
        type="button"
        onClick={() => setShowProductDropdown(true)}
        disabled={loadingProducts}
        className="w-full bg-white hover:bg-slate-50 border border-slate-200/90 rounded-2xl px-3.5 py-3 flex items-center gap-2.5 text-xs text-slate-600 cursor-pointer shadow-2xs transition-colors disabled:opacity-60"
        aria-haspopup="dialog"
      >
        <Search className="w-4 h-4 text-slate-400 shrink-0" strokeWidth={2} />
        <span className="font-medium text-slate-400 flex-1 text-left truncate">
          {loadingProducts ? "Memuat produk..." : `Cari ${products.length} produk (nama, barcode, SKU)`}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[9px] text-slate-500 font-bold shrink-0">
          CARI
        </span>
      </button>

      {/* Daftar Scan Terakhir (Bento Stream) */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-3.5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
          <div>
            <h4 className="text-xs font-extrabold text-slate-900">
              {flowMode === "verify" && session ? "Scan Sesi Ini" : "Scan Terakhir"}
            </h4>
            <p className="text-[10px] text-slate-400 font-medium truncate">
              {flowMode === "verify" && session ? session.storeName : "Aktivitas terbaru hari ini"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(flowMode === "verify" && session ? "/verification" : "/history")}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5 cursor-pointer"
          >
            <span>{flowMode === "verify" && session ? "Buka Rekon" : "Lihat Semua"}</span>
            <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.2} />
          </button>
        </div>

        {recentList.length === 0 ? (
          <div className="py-6 text-center text-slate-400">
            <p className="text-xs font-medium">Belum ada data scan</p>
            <p className="text-xs mt-0.5 text-slate-400">Barcode atau produk yang diinput akan muncul di sini</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentList.map((item) => {
              const badge = getCategoryBadge(item.product);
              return (
                <div
                  key={item.id}
                  className="p-2.5 rounded-2xl bg-slate-50/70 border border-slate-200/70 hover:bg-white transition-all flex items-center justify-between gap-2.5"
                >
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center font-bold text-xs shrink-0 ${badge.bg}`}>
                    {badge.label}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-extrabold text-slate-900 truncate">
                      {item.product}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-mono text-slate-500 flex-wrap">
                      {item.distriEvent && (
                        <span className="text-slate-500 font-sans truncate max-w-[120px]">{item.distriEvent}</span>
                      )}
                      {item.batch && (
                        <span className="bg-slate-200/70 px-1 rounded text-slate-700 font-semibold">
                          Lot {item.batch}
                        </span>
                      )}
                      {item.expDate && (
                        <span className="text-emerald-700 font-bold whitespace-nowrap">
                          Exp {item.expDate}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-block px-2.5 py-1 rounded-xl bg-slate-900 text-white font-mono text-xs font-black shadow-2xs">
                      {item.qty} pcs
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
                    <span className="text-xs font-semibold text-stone-500 block mb-1.5">
                      Riwayat Toko:
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                      {distriHistory.slice(0, 10).map((h, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setNewStoreName(h)}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                            newStoreName === h
                              ? "bg-slate-900 text-white"
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
                          ? "bg-slate-900 text-white shadow-xs"
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
