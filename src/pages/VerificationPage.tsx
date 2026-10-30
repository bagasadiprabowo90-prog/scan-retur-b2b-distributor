import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Camera,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  FileText,
  History,
  Lock,
  Plus,
  ScanBarcode,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  fetchProducts,
  saveReconciliationToBackend,
  fetchReconciliationHistory,
  type ProductItem,
} from "../lib/api";
import { parseSJWithGemini, type ExtractedSJResult } from "../lib/gemini";
import {
  getActiveSession,
  startStoreSession,
  computeReconciliation,
  setClaimItem,
  applyClaimItems,
  confirmDiscrepancy,
  matchAllClaimsWithPhysical,
  finishAndArchiveSession,
  getReconHistory,
  deleteReconReport,
  removeScannedItemFromSession,
  getSessionStoreConflict,
  getTodayReceiveDate,
  formatWhatsAppSummary,
  type ReconcileItem,
  type SavedReconReport,
  type StoreSession,
} from "../lib/session";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Button from "../components/ui/Button";
import Toast from "../components/ui/Toast";
import ReconcileItemCard from "../components/verification/ReconcileItemCard";
import ReconHistoryTab from "../components/verification/ReconHistoryTab";
import AiPreviewSheet from "../components/verification/AiPreviewSheet";
import {
  AddSkuSheet,
  DiscrepancyNoteSheet,
  GatekeeperSheet,
  MatchAllSheet,
  ScannedItemsSheet,
  StoreConflictSheet,
} from "../components/verification/VerificationSheets";

export default function VerificationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<"current" | "history">("current");
  const [session, setSession] = useState<StoreSession | null>(getActiveSession);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Filter
  const [filterStatus, setFilterStatus] = useState<"all" | "diff" | "match">("all");

  // Sheets & Modals
  const [addSkuModal, setAddSkuModal] = useState(false);
  const [discrepancyModalItem, setDiscrepancyModalItem] = useState<ReconcileItem | null>(null);
  const [discrepancyNote, setDiscrepancyNote] = useState("");
  const [gatekeeperOpen, setGatekeeperOpen] = useState(false);
  const [scannedListModalOpen, setScannedListModalOpen] = useState(false);
  const [scanToDelete, setScanToDelete] = useState<StoreSession["items"][number] | null>(null);
  const [storeConflictModalOpen, setStoreConflictModalOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgressText, setAiProgressText] = useState("");
  const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
  const [aiExtractedData, setAiExtractedData] = useState<ExtractedSJResult | null>(null);
  const [aiApplyMode, setAiApplyMode] = useState<"replace" | "add">("replace");
  const [requireMappingConfirm, setRequireMappingConfirm] = useState(false);
  const [matchAllModalOpen, setMatchAllModalOpen] = useState(false);
  const [matchAllReason, setMatchAllReason] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reconHistory, setReconHistory] = useState<SavedReconReport[]>(getReconHistory);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Load products
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

  // Buka dialog file picker secara otomatis bila navigasi dari tombol "Baca SJ (AI)"
  useEffect(() => {
    if (location.state && (location.state as { autoOpenScan?: boolean }).autoOpenScan) {
      navigate(location.pathname, { replace: true, state: {} });
      const timer = setTimeout(() => {
        fileInputRef.current?.click();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [location.state, navigate, location.pathname]);

  const refreshSession = () => {
    setSession(getActiveSession());
  };

  const reconItems = useMemo(() => {
    if (!session) return [];
    return computeReconciliation(session);
  }, [session]);

  const filteredItems = useMemo(() => {
    if (filterStatus === "diff") {
      return reconItems.filter((i) => i.status !== "match");
    }
    if (filterStatus === "match") {
      return reconItems.filter((i) => i.status === "match");
    }
    return reconItems;
  }, [reconItems, filterStatus]);

  // Statistics
  const totalPhysical = useMemo(
    () => reconItems.reduce((acc, i) => acc + i.physicalQty, 0),
    [reconItems]
  );
  const totalClaim = useMemo(
    () => reconItems.reduce((acc, i) => acc + i.claimQty, 0),
    [reconItems]
  );
  const matchCount = useMemo(
    () => reconItems.filter((i) => i.status === "match").length,
    [reconItems]
  );
  const diffCount = useMemo(
    () => reconItems.length - matchCount,
    [reconItems, matchCount]
  );
  const unconfirmedDiffCount = useMemo(
    () => reconItems.filter((i) => i.status !== "match" && !i.confirmedDiscrepancy).length,
    [reconItems]
  );

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const handleOpenAiScan = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    setAiLoading(true);
    setAiProgressText(
      files.length > 1
        ? `Mempersiapkan ${files.length} halaman dokumen...`
        : "Membaca lembar SJ..."
    );

    try {
      const result = await parseSJWithGemini(files, products, (_cur, _total, msg) => {
        setAiProgressText(msg);
      });

      if (!result.ok) {
        if (
          result.error &&
          (result.error.includes("Aksi tidak didukung") ||
            result.error.includes("parsesj") ||
            result.error.includes("Script Properties"))
        ) {
          showToast(
            "error",
            "Aksi 'parsesj' belum aktif di Apps Script. Buka Google Apps Script, perbarui Code.js, lalu klik 'Deploy' -> 'New deployment'."
          );
        } else if (
          result.error &&
          (result.error.includes("503") ||
            result.error.includes("high demand") ||
            result.error.includes("UNAVAILABLE"))
        ) {
          showToast(
            "error",
            "Server AI Google sedang mengalami lonjakan beban (503). Silakan coba klik tombol lagi dalam beberapa detik."
          );
        } else {
          showToast("error", result.error || "Gagal membaca lembar SJ.");
        }
        return;
      }

      if (result.items.length === 0) {
        showToast(
          "error",
          "AI tidak menemukan baris produk pada dokumen ini. Pastikan foto tegak lurus dan pencahayaan cukup."
        );
        return;
      }

      setAiExtractedData(result);
      setAiApplyMode("replace");
      setRequireMappingConfirm(false);
      setAiPreviewOpen(true);
    } catch (err: unknown) {
      console.error("Gagal memproses file SJ:", err);
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memproses file SJ.";
      showToast("error", msg);
    } finally {
      setAiLoading(false);
      setAiProgressText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleApplyAiClaims = (force = false) => {
    if (!aiExtractedData) return;

    const unmappedCount = aiExtractedData.items.filter(
      (it) => it.matchConfidence === "unmatched" || it.matchConfidence === "low"
    ).length;

    if (unmappedCount > 0 && !force) {
      setRequireMappingConfirm(true);
      showToast(
        "error",
        `Ada ${unmappedCount} produk belum dipetakan ke Master Data. Petakan atau klik Konfirmasi untuk melanjutkan.`
      );
      return;
    }

    let currentSession = session || getActiveSession();
    if (!currentSession) {
      const storeName = aiExtractedData.storeName || "Toko Retur (dari SJ)";
      const noSJ = aiExtractedData.noSJ || "";
      const defaultSheet = user?.displayName === "Dimas" ? "Dimas" : "Bagas";
      currentSession = startStoreSession(
        storeName,
        noSJ,
        defaultSheet,
        getTodayReceiveDate()
      );
      setSession(currentSession);
    } else if (
      aiExtractedData.storeName &&
      getSessionStoreConflict(aiExtractedData.storeName)
    ) {
      setStoreConflictModalOpen(true);
      return;
    }

    applyClaimItems(aiExtractedData.items, aiApplyMode);

    refreshSession();
    setAiPreviewOpen(false);
    setRequireMappingConfirm(false);
    showToast(
      "success",
      aiApplyMode === "add"
        ? `${aiExtractedData.items.length} baris SJ ditambahkan ke klaim yang ada.`
        : `Berhasil mengisi ${aiExtractedData.items.length} item klaim dari foto SJ!`
    );
  };

  const handleConfirmMatchAll = () => {
    if (!matchAllReason.trim()) {
      showToast("error", "Alasan wajib diisi.");
      return;
    }
    matchAllClaimsWithPhysical(matchAllReason);
    refreshSession();
    setMatchAllModalOpen(false);
    setMatchAllReason("");
    showToast("success", "Klaim disamakan dengan fisik. Klaim SJ awal tercatat di catatan item.");
  };

  const handleUpdateClaim = (item: ReconcileItem, newQty: number) => {
    setClaimItem(item.sku, item.product, item.barcode, newQty);
    refreshSession();
  };

  const handleAddSkuFromSJ = (product: ProductItem, q: number) => {
    setClaimItem(product.sku, product.product, product.barcode, q);
    refreshSession();
    showToast("success", `${product.product} (${q} pcs) ditambahkan dari SJ.`);
  };

  const handleSaveDiscrepancyNote = () => {
    if (!discrepancyModalItem) return;
    confirmDiscrepancy(discrepancyModalItem.key, discrepancyNote);
    refreshSession();
    setDiscrepancyModalItem(null);
    setDiscrepancyNote("");
    showToast("success", "Catatan selisih berhasil dikonfirmasi.");
  };

  const handleCopyWhatsApp = (reportData?: {
    storeName: string;
    noSJ?: string;
    receiveDate: string;
    pic: string;
    targetSheet: string;
    totalPhysicalQty: number;
    totalClaimQty: number;
    items: ReconcileItem[];
  }) => {
    const data =
      reportData ||
      (session
        ? {
            storeName: session.storeName,
            noSJ: session.noSJ,
            receiveDate: session.receiveDate,
            pic: user?.displayName || "PIC",
            targetSheet: session.targetSheet,
            totalPhysicalQty: totalPhysical,
            totalClaimQty: totalClaim,
            items: reconItems,
          }
        : null);

    if (!data) return;

    const text = formatWhatsAppSummary(data);
    navigator.clipboard
      .writeText(text)
      .then(() => {
        showToast("success", "Format laporan WhatsApp berhasil disalin!");
      })
      .catch(() => {
        showToast("error", "Gagal menyalin ke clipboard.");
      });
  };

  const handleFinishStoreClick = () => {
    if (reconItems.length === 0) {
      showToast("error", "Belum ada produk yang di-scan untuk toko ini.");
      return;
    }

    if (unconfirmedDiffCount > 0) {
      setGatekeeperOpen(true);
      return;
    }

    finalizeSession();
  };

  const finalizeSession = () => {
    const report = finishAndArchiveSession(user?.displayName || "PIC", reconItems);
    if (report) {
      setReconHistory(getReconHistory());
      setGatekeeperOpen(false);

      saveReconciliationToBackend(report)
        .then((res) => {
          if (!res.ok) {
            console.warn("Gagal menyimpan rekon ke Cloud Sheet:", res.error);
          }
        })
        .catch((err) => console.error("Error saveReconciliationToBackend:", err));

      navigate("/", {
        replace: true,
        state: {
          successMessage: `Selesai verifikasi toko "${report.storeName}". Laporan tersimpan ke Spreadsheet & Riwayat.`,
        },
      });
    }
  };

  const handleDeleteHistory = (id: string) => {
    deleteReconReport(id);
    setReconHistory(getReconHistory());
    showToast("success", "Riwayat verifikasi berhasil dihapus.");
  };

  const handleSyncFromCloud = async () => {
    showToast("success", "Menyinkronkan riwayat dari Cloud Spreadsheet...");
    const res = await fetchReconciliationHistory();
    if (res.ok && res.reports) {
      const local = getReconHistory();
      const existingIds = new Set(local.map((r) => r.id));
      const newFromRemote = res.reports.filter((r) => !existingIds.has(r.id));
      const merged = [...local, ...newFromRemote];
      localStorage.setItem("scan-retur-recon-history", JSON.stringify(merged.slice(0, 50)));
      setReconHistory(merged);
      showToast("success", `Sinkron selesai (${res.reports.length} laporan di Sheet).`);
    } else {
      showToast("error", res.error || "Gagal mengambil data dari Google Sheets.");
    }
  };

  return (
    <div className="space-y-3 pb-12">
      {/* Input File Kamera & Dokumen SJ */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Toast Notification */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.msg}
          onClose={() => setToast(null)}
        />
      )}

      {/* Tabs Switcher: Sesi Toko Aktif vs Riwayat Verifikasi */}
      <div className="flex bg-gray-200/80 p-1 rounded-xl">
        <button
          type="button"
          onClick={() => setActiveTab("current")}
          className={`flex-1 min-h-[40px] py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center justify-center gap-1.5 ${
            activeTab === "current"
              ? "bg-white text-gray-900 shadow-xs"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <ClipboardList className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Verifikasi Aktif</span>
          {session && session.items.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800">
              {session.items.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("history");
            setReconHistory(getReconHistory());
          }}
          className={`flex-1 min-h-[40px] py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center justify-center gap-1.5 ${
            activeTab === "history"
              ? "bg-white text-gray-900 shadow-xs"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <History className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Riwayat Rekon ({reconHistory.length})</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: VERIFIKASI SESI TOKO AKTIF                        */}
      {/* ======================================================== */}
      {activeTab === "current" && (
        <>
          {!session ? (
            <div className="card p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-purple-100 text-purple-700 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                <FileText className="w-8 h-8" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-gray-900">
                  Mulai Verifikasi & Rekonsiliasi Toko
                </h3>
                <p className="text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">
                  Belum ada sesi toko aktif. Anda bisa langsung{" "}
                  <strong>foto lembar kertas SJ</strong> agar AI membaca data otomatis, atau mulai
                  scan fisik terlebih dahulu.
                </p>
              </div>

              <div className="flex flex-col gap-2 max-w-xs mx-auto pt-1">
                <Button
                  variant="primary"
                  size="lg"
                  block
                  disabled={aiLoading}
                  icon={<Camera className="w-5 h-5" />}
                  onClick={handleOpenAiScan}
                >
                  {aiLoading ? "Membaca Dokumen..." : "Foto / Upload Lembar SJ (AI)"}
                </Button>

                <Button
                  variant="secondary"
                  block
                  icon={<ScanBarcode className="w-4 h-4" />}
                  onClick={() => navigate("/")}
                >
                  Mulai Scan Fisik
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Store Metadata Header Card */}
              <div className="card p-3.5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800 uppercase tracking-wider mb-1">
                      Sesi Toko Berjalan
                    </span>
                    <h2 className="text-base font-bold text-gray-900 truncate">
                      {session.storeName}
                    </h2>
                    <p className="text-xs text-gray-500">
                      {session.noSJ ? `No. SJ: ${session.noSJ} · ` : ""}
                      {session.receiveDate || "Hari Ini"} · Sheet {session.targetSheet}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setScannedListModalOpen(true)}
                      className="inline-flex items-center gap-1 min-h-[38px] text-xs font-semibold text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-xl border border-gray-200 transition-colors"
                      title="Lihat & hapus item fisik yang sudah discan"
                    >
                      <ClipboardList className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Scan ({session.items.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/")}
                      className="inline-flex items-center gap-1 min-h-[38px] text-xs font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-xl border border-blue-200 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Scan</span>
                    </button>
                  </div>
                </div>

                {/* Status Bar */}
                <div
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold border ${
                    diffCount === 0 && reconItems.length > 0
                      ? "bg-status-match-bg border-emerald-200 text-status-match"
                      : "bg-status-short-bg border-red-200 text-status-short"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {diffCount === 0 && reconItems.length > 0 ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    )}
                    <span>
                      {diffCount === 0 && reconItems.length > 0
                        ? "Semua SKU Sesuai dengan Lembar SJ"
                        : `${diffCount} dari ${reconItems.length} SKU Mengalami Selisih`}
                    </span>
                  </div>
                  {diffCount > 0 && (
                    <span className="text-xs font-medium text-red-600">
                      ({unconfirmedDiffCount} belum konfirmasi)
                    </span>
                  )}
                </div>

                {/* Action Tools */}
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => {
                      setMatchAllReason("");
                      setMatchAllModalOpen(true);
                    }}
                    className="flex-1 min-w-[130px] min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold text-emerald-700 border border-emerald-300 bg-white hover:bg-emerald-50 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Samakan Klaim</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddSkuModal(true)}
                    className="flex-1 min-w-[110px] min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold text-blue-700 border border-blue-300 bg-white hover:bg-blue-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Tambah SKU</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenAiScan}
                    disabled={aiLoading}
                    className="flex-1 min-w-[120px] min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold text-purple-700 border border-purple-300 bg-white hover:bg-purple-50 transition-colors disabled:opacity-50"
                  >
                    <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{aiLoading ? "Membaca..." : "Baca SJ (AI)"}</span>
                  </button>
                </div>
              </div>

              {/* Sticky Summary Scorecards & Filter Pills */}
              <div className="sticky top-14 z-30 bg-gray-50/95 backdrop-blur-xs py-1.5 -mx-1 px-1 space-y-2">
                <div className="card p-2.5 space-y-2 shadow-sm">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-blue-50 border border-blue-100 p-2 rounded-xl">
                      <span className="text-xs font-bold text-blue-600 block uppercase">
                        Total Fisik
                      </span>
                      <span className="text-lg font-black text-blue-900 tabular-nums">
                        {totalPhysical} <span className="text-xs font-normal">pcs</span>
                      </span>
                    </div>

                    <div className="bg-purple-50 border border-purple-100 p-2 rounded-xl">
                      <span className="text-xs font-bold text-purple-600 block uppercase">
                        Klaim SJ
                      </span>
                      <span className="text-lg font-black text-purple-900 tabular-nums">
                        {totalClaim} <span className="text-xs font-normal">pcs</span>
                      </span>
                    </div>

                    <div
                      className={`p-2 rounded-xl border ${
                        totalPhysical === totalClaim && diffCount === 0
                          ? "bg-status-match-bg border-emerald-200 text-status-match"
                          : "bg-status-over-bg border-amber-200 text-status-over"
                      }`}
                    >
                      <span className="text-xs font-bold block uppercase">Selisih Total</span>
                      <span className="text-lg font-black tabular-nums">
                        {totalPhysical - totalClaim === 0
                          ? "0"
                          : totalPhysical - totalClaim > 0
                          ? `+${totalPhysical - totalClaim}`
                          : `${totalPhysical - totalClaim}`}
                        <span className="text-xs font-normal"> pcs</span>
                      </span>
                    </div>
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-xs">
                    <span className="text-xs font-bold text-gray-500 uppercase">Tampilkan:</span>
                    <div className="flex gap-1">
                      {(["all", "diff", "match"] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setFilterStatus(tab)}
                          className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                            filterStatus === tab
                              ? "bg-primary text-white"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          {tab === "all"
                            ? `Semua (${reconItems.length})`
                            : tab === "diff"
                            ? `Selisih (${diffCount})`
                            : `Sesuai (${matchCount})`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                {filteredItems.length === 0 ? (
                  <div className="card p-6 text-center text-xs text-gray-500">
                    Tidak ada item pada filter ini.
                  </div>
                ) : (
                  filteredItems.map((item) => (
                    <ReconcileItemCard
                      key={item.key}
                      item={item}
                      onUpdateClaim={handleUpdateClaim}
                      onScanBarcode={(barcode) =>
                        navigate(`/return-form?barcode=${encodeURIComponent(barcode)}`)
                      }
                      onOpenDiscrepancyNote={(it) => {
                        setDiscrepancyModalItem(it);
                        setDiscrepancyNote(it.notes || "");
                      }}
                    />
                  ))
                )}
              </div>

              {/* Bottom Sticky Action Bar */}
              <div className="sticky bottom-20 z-30 bg-white/95 backdrop-blur-md p-2.5 rounded-2xl border border-gray-200 shadow-lg">
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    block
                    icon={<Copy className="w-4 h-4 text-emerald-700" />}
                    onClick={() => handleCopyWhatsApp()}
                  >
                    Salin WhatsApp
                  </Button>

                  <Button
                    variant="primary"
                    block
                    icon={<Lock className="w-4 h-4" />}
                    onClick={handleFinishStoreClick}
                  >
                    Selesai & Lanjut
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ======================================================== */}
      {/* TAB 2: RIWAYAT REKONSILIASI TOKO LALU                    */}
      {/* ======================================================== */}
      {activeTab === "history" && (
        <ReconHistoryTab
          reconHistory={reconHistory}
          onSyncFromCloud={handleSyncFromCloud}
          onCopyWhatsApp={handleCopyWhatsApp}
          onDeleteHistory={handleDeleteHistory}
        />
      )}

      {/* AI LOADING OVERLAY */}
      {aiLoading && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center p-4 bg-black/60 backdrop-blur-xs text-white text-center space-y-3">
          <div className="w-14 h-14 border-4 border-purple-400 border-t-white rounded-full animate-spin" />
          <div className="space-y-1">
            <h4 className="text-base font-bold inline-flex items-center gap-1.5">
              <Sparkles className="w-5 h-5 text-purple-300" aria-hidden="true" />
              <span>Gemini AI Membaca Lembar SJ...</span>
            </h4>
            <p className="text-xs text-purple-200 max-w-xs">
              {aiProgressText ||
                "Mendeteksi nama produk, SKU, dan jumlah klaim dari foto dokumen kertas. Mohon tunggu sebentar..."}
            </p>
          </div>
        </div>
      )}

      {/* SHEETS */}
      <AddSkuSheet
        open={addSkuModal}
        onClose={() => setAddSkuModal(false)}
        products={products}
        loadingProducts={loadingProducts}
        onAddSku={handleAddSkuFromSJ}
      />

      <DiscrepancyNoteSheet
        item={discrepancyModalItem}
        note={discrepancyNote}
        onChangeNote={setDiscrepancyNote}
        onClose={() => setDiscrepancyModalItem(null)}
        onSave={handleSaveDiscrepancyNote}
      />

      <GatekeeperSheet
        open={gatekeeperOpen}
        unconfirmedDiffCount={unconfirmedDiffCount}
        onClose={() => setGatekeeperOpen(false)}
        onFinalize={finalizeSession}
      />

      <AiPreviewSheet
        open={aiPreviewOpen}
        onClose={() => {
          setAiPreviewOpen(false);
          setRequireMappingConfirm(false);
        }}
        aiExtractedData={aiExtractedData}
        onUpdateExtractedData={setAiExtractedData}
        aiApplyMode={aiApplyMode}
        onChangeApplyMode={setAiApplyMode}
        hasExistingClaims={!!(session && Object.keys(session.claims).length > 0)}
        requireMappingConfirm={requireMappingConfirm}
        onApplyClaims={handleApplyAiClaims}
        products={products}
        onShowToast={showToast}
      />

      <MatchAllSheet
        open={matchAllModalOpen}
        reason={matchAllReason}
        onChangeReason={setMatchAllReason}
        onClose={() => setMatchAllModalOpen(false)}
        onConfirm={handleConfirmMatchAll}
      />

      <ScannedItemsSheet
        open={scannedListModalOpen}
        session={session}
        onClose={() => setScannedListModalOpen(false)}
        onSelectToDelete={setScanToDelete}
      />

      <StoreConflictSheet
        open={storeConflictModalOpen}
        activeStoreName={session?.storeName}
        extractedData={aiExtractedData}
        onClose={() => setStoreConflictModalOpen(false)}
        onSwitchToNewStore={() => {
          if (!aiExtractedData) return;
          const defaultSheet = user?.displayName === "Dimas" ? "Dimas" : "Bagas";
          const newSession = startStoreSession(
            aiExtractedData.storeName || "Toko Retur",
            aiExtractedData.noSJ || "",
            defaultSheet,
            getTodayReceiveDate()
          );
          setSession(newSession);
          applyClaimItems(aiExtractedData.items, "replace");
          refreshSession();
          setStoreConflictModalOpen(false);
          setAiPreviewOpen(false);
          showToast("success", `Sesi dialihkan ke toko "${newSession.storeName}".`);
        }}
        onMergeIntoActiveStore={() => {
          if (!aiExtractedData) return;
          setStoreConflictModalOpen(false);
          applyClaimItems(aiExtractedData.items, aiApplyMode);
          refreshSession();
          setAiPreviewOpen(false);
          showToast("success", `Klaim diterapkan ke sesi toko "${session?.storeName}".`);
        }}
      />

      <ConfirmDialog
        open={!!scanToDelete}
        title="Hapus scan?"
        message={
          scanToDelete && (
            <>
              <strong>{scanToDelete.product}</strong>
              <br />
              Lot {scanToDelete.batch || "-"} · {scanToDelete.qty} pcs akan dihapus dari sesi ini.
            </>
          )
        }
        confirmLabel="Hapus"
        danger
        onCancel={() => setScanToDelete(null)}
        onConfirm={() => {
          if (scanToDelete) removeScannedItemFromSession(scanToDelete.id);
          setScanToDelete(null);
          refreshSession();
          showToast("success", "Scan barang berhasil dihapus dari sesi.");
        }}
      />
    </div>
  );
}
