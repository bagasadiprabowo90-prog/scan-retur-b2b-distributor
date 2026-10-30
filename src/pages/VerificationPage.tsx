import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import {
  fetchProducts,
  saveReconciliationToBackend,
  fetchReconciliationHistory,
  type ProductItem,
} from "../lib/api";
import {
  parseSJWithGemini,
  type ExtractedSJResult,
} from "../lib/gemini";
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

  // Modals
  const [addSkuModal, setAddSkuModal] = useState(false);
  const [skuSearch, setSkuSearch] = useState("");
  const [selectedProductToAdd, setSelectedProductToAdd] = useState<ProductItem | null>(null);
  const [addClaimQty, setAddClaimQty] = useState("");

  const [discrepancyModalItem, setDiscrepancyModalItem] = useState<ReconcileItem | null>(null);
  const [discrepancyNote, setDiscrepancyNote] = useState("");

  const [gatekeeperOpen, setGatekeeperOpen] = useState(false);
  const [scannedListModalOpen, setScannedListModalOpen] = useState(false);
  const [storeConflictModalOpen, setStoreConflictModalOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgressText, setAiProgressText] = useState("");
  const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
  const [aiExtractedData, setAiExtractedData] = useState<ExtractedSJResult | null>(null);
  const [aiApplyMode, setAiApplyMode] = useState<"replace" | "add">("replace");
  const [mappingItemIndex, setMappingItemIndex] = useState<number | null>(null);
  const [mappingSearch, setMappingSearch] = useState("");
  const [requireMappingConfirm, setRequireMappingConfirm] = useState(false);
  const [matchAllModalOpen, setMatchAllModalOpen] = useState(false);
  const [matchAllReason, setMatchAllReason] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reconHistory, setReconHistory] = useState<SavedReconReport[]>(getReconHistory);
  const [selectedHistoryReport, setSelectedHistoryReport] = useState<SavedReconReport | null>(null);
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
    return () => { alive = false; };
  }, []);

  // Buka dialog file picker secara otomatis bila navigasi dari tombol "Baca SJ (AI)"
  useEffect(() => {
    if (location.state && (location.state as any).autoOpenScan) {
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

  const filteredProductsToAdd = useMemo(() => {
    const q = skuSearch.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.product.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [products, skuSearch]);

  const filteredProductsForMapping = useMemo(() => {
    const q = mappingSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products
      .filter(
        (p) =>
          p.product.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [products, mappingSearch]);

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
    } catch (err: any) {
      console.error("Gagal memproses file SJ:", err);
      showToast("error", err?.message || "Terjadi kesalahan saat memproses file SJ.");
    } finally {
      setAiLoading(false);
      setAiProgressText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSelectProductForMapping = (product: ProductItem) => {
    if (mappingItemIndex === null || !aiExtractedData) return;
    const updated = [...aiExtractedData.items];
    const target = updated[mappingItemIndex];
    if (!target) return;

    updated[mappingItemIndex] = {
      ...target,
      sku: product.sku,
      product: product.product,
      barcode: product.barcode,
      matchScore: 1.0,
      matchConfidence: "exact",
      matchedFromMaster: true,
    };

    setAiExtractedData({ ...aiExtractedData, items: updated });
    setMappingItemIndex(null);
    setMappingSearch("");
    showToast("success", `Dipetakan ke: ${product.product} (${product.sku})`);
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
    try {
      localStorage.setItem("scan-retur-flow-mode", "verify");
    } catch {}

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

  const handleMatchAll = () => {
    setMatchAllReason("");
    setMatchAllModalOpen(true);
  };

  const handleConfirmMatchAll = (e: React.FormEvent) => {
    e.preventDefault();
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

  const handleAddSkuFromSJ = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductToAdd) return;
    const q = Number(addClaimQty);
    if (!Number.isFinite(q) || q <= 0) {
      showToast("error", "Masukkan jumlah klaim yang valid (> 0)");
      return;
    }

    setClaimItem(
      selectedProductToAdd.sku,
      selectedProductToAdd.product,
      selectedProductToAdd.barcode,
      q
    );
    refreshSession();
    setAddSkuModal(false);
    setSelectedProductToAdd(null);
    setSkuSearch("");
    setAddClaimQty("");
    showToast("success", `${selectedProductToAdd.product} (${q} pcs) ditambahkan dari SJ.`);
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
        showToast("success", "📋 Format laporan WhatsApp berhasil disalin!");
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

    // Jika masih ada selisih yang belum terkonfirmasi, buka dialog peringatan
    if (unconfirmedDiffCount > 0) {
      setGatekeeperOpen(true);
      return;
    }

    // Jika semua sudah match atau selisih sudah terkonfirmasi, langsung selesaikan
    finalizeSession();
  };

  const finalizeSession = () => {
    const report = finishAndArchiveSession(user?.displayName || "PIC", reconItems);
    if (report) {
      try {
        localStorage.setItem("scan-retur-flow-mode", "direct");
      } catch {}
      setReconHistory(getReconHistory());
      setGatekeeperOpen(false);

      // Simpan laporan ke Spreadsheet secara asinkron (audit trail permanen)
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
    if (selectedHistoryReport?.id === id) {
      setSelectedHistoryReport(null);
    }
    showToast("success", "Riwayat verifikasi berhasil dihapus.");
  };

  return (
    <div className="space-y-3 pb-12">
      {/* Input File Kamera & Dokumen SJ (Selalu terpasang di DOM agar tombol foto berfungsi baik saat sesi aktif maupun belum ada sesi) */}
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
        <div
          className={`rounded-2xl px-4 py-3 text-xs font-semibold backdrop-blur-xl border shadow-sm ${
            toast.type === "success"
              ? "bg-emerald-50/90 text-emerald-900 border-emerald-200/80"
              : "bg-red-50/90 text-red-900 border-red-200/80"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Tabs Switcher: Sesi Toko Aktif vs Riwayat Verifikasi */}
      <div className="grid grid-cols-2 gap-1.5 bg-white/50 backdrop-blur-md p-1 rounded-full border border-white/80 shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab("current")}
          className={`py-2 px-3 rounded-full text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "current"
              ? "bg-[#1C1917] text-white shadow-sm"
              : "text-stone-600 hover:text-stone-900"
          }`}
        >
          <span>Sesi Toko Aktif</span>
          {session && session.items.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === "current"
                  ? "bg-white/20 text-white"
                  : "bg-stone-200 text-stone-800"
              }`}
            >
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
          className={`py-2 px-3 rounded-full text-xs font-semibold transition-all ${
            activeTab === "history"
              ? "bg-[#1C1917] text-white shadow-sm"
              : "text-stone-600 hover:text-stone-900"
          }`}
        >
          Riwayat Rekon ({reconHistory.length})
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: VERIFIKASI SESI TOKO AKTIF                        */}
      {/* ======================================================== */}
      {activeTab === "current" && (
        <>
          {!session ? (
            <div className="space-y-3.5">
              {/* Frosted Upload SJ Card (Screen 03 Style) */}
              <div className="card p-4 space-y-3.5">
                <div className="text-center space-y-0.5 pt-1">
                  <h2 className="text-base font-extrabold text-stone-900 tracking-tight">
                    Foto atau unggah lembar SJ
                  </h2>
                  <p className="text-[11px] font-medium text-stone-500">
                    Otomatis ekstrak daftar produk, Batch &amp; Qty klaim retur
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleOpenAiScan}
                  disabled={aiLoading}
                  className="w-full border-2 border-dashed border-stone-300/90 hover:border-stone-400 rounded-2xl p-6 bg-white/45 hover:bg-white/70 transition-all flex flex-col items-center justify-center gap-2.5 cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-full bg-white/90 border border-stone-200 shadow-xs flex items-center justify-center text-stone-700 group-hover:scale-105 transition-transform">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </div>
                  <div className="space-y-0.5 text-center">
                    <p className="text-xs font-bold text-stone-800">
                      {aiLoading ? "Membaca Dokumen..." : "Ambil foto lembar SJ di sini"}
                    </p>
                    <p className="text-[11px] font-medium text-stone-400">
                      Atau pilih dari galeri perangkat
                    </p>
                  </div>
                </button>
              </div>

              {/* Modul Verifikasi & Retur (2x3 Frosted Grid) */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-stone-800 px-1 block">
                  Modul Verifikasi &amp; Retur
                </span>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        localStorage.setItem("scan-retur-flow-mode", "verify");
                      } catch {}
                      navigate("/");
                    }}
                    className="card p-3 flex flex-col items-center justify-center gap-2 hover:bg-white/85 active:scale-[0.98] transition-all text-center"
                  >
                    <div className="w-9 h-9 rounded-xl bg-white/90 border border-stone-200/80 flex items-center justify-center text-stone-800 shadow-2xs">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7V5a1 1 0 011-1h2M20 7V5a1 1 0 00-1-1h-2M4 17v2a1 1 0 001 1h2M20 17v2a1 1 0 01-1 1h-2M7 12h10" />
                      </svg>
                    </div>
                    <span className="text-[11px] font-semibold text-stone-800 leading-tight">
                      Scan Barcode
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      try {
                        localStorage.setItem("scan-retur-flow-mode", "verify");
                      } catch {}
                      navigate("/", { state: { openNewStore: true } });
                    }}
                    className="card p-3 flex flex-col items-center justify-center gap-2 hover:bg-white/85 active:scale-[0.98] transition-all text-center"
                  >
                    <div className="w-9 h-9 rounded-xl bg-white/90 border border-stone-200/80 flex items-center justify-center text-stone-800 shadow-2xs">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <span className="text-[11px] font-semibold text-stone-800 leading-tight">
                      + Mulai Toko
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenAiScan}
                    disabled={aiLoading}
                    className="card p-3 flex flex-col items-center justify-center gap-2 hover:bg-white/85 active:scale-[0.98] transition-all text-center"
                  >
                    <div className="w-9 h-9 rounded-xl bg-white/90 border border-stone-200/80 flex items-center justify-center text-stone-800 shadow-2xs">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <span className="text-[11px] font-semibold text-stone-800 leading-tight">
                      Baca Foto SJ
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      try {
                        localStorage.setItem("scan-retur-flow-mode", "direct");
                      } catch {}
                      navigate("/");
                    }}
                    className="card p-3 flex flex-col items-center justify-center gap-2 hover:bg-white/85 active:scale-[0.98] transition-all text-center"
                  >
                    <div className="w-9 h-9 rounded-xl bg-white/90 border border-stone-200/80 flex items-center justify-center text-stone-800 shadow-2xs">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </div>
                    <span className="text-[11px] font-semibold text-stone-800 leading-tight">
                      Input Manual
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("history");
                      setReconHistory(getReconHistory());
                    }}
                    className="card p-3 flex flex-col items-center justify-center gap-2 hover:bg-white/85 active:scale-[0.98] transition-all text-center"
                  >
                    <div className="w-9 h-9 rounded-xl bg-white/90 border border-stone-200/80 flex items-center justify-center text-stone-800 shadow-2xs">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </div>
                    <span className="text-[11px] font-semibold text-stone-800 leading-tight">
                      Riwayat Rekon
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate("/history")}
                    className="card p-3 flex flex-col items-center justify-center gap-2 hover:bg-white/85 active:scale-[0.98] transition-all text-center"
                  >
                    <div className="w-9 h-9 rounded-xl bg-white/90 border border-stone-200/80 flex items-center justify-center text-stone-800 shadow-2xs">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <span className="text-[11px] font-semibold text-stone-800 leading-tight">
                      Riwayat Sheet
                    </span>
                  </button>
                </div>
              </div>

              {/* Primary Bottom Pill Button */}
              <button
                type="button"
                onClick={handleOpenAiScan}
                disabled={aiLoading}
                className="w-full btn-primary py-3.5 text-xs font-bold shadow-md"
              >
                {aiLoading ? "Membaca Lembar SJ..." : "Analisis SJ dengan AI & Verifikasi"}
              </button>
            </div>
          ) : (
            <>
              {/* Store Metadata & Summary Card (Screen 01 Header Card Style) */}
              <div className="card p-3.5 space-y-3">
                <div className="flex items-start gap-3">
                  {/* Black Circle Cube Icon */}
                  <div className="w-10 h-10 rounded-full bg-[#1C1917] text-white flex items-center justify-center shrink-0 shadow-xs">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="text-xs font-extrabold text-stone-900 leading-snug break-words">
                      {session.storeName}
                      {session.noSJ ? ` (SJ #${session.noSJ})` : ""}
                    </h2>
                    <p className="text-[11px] text-stone-500 font-medium mt-0.5 leading-snug">
                      {matchCount} dari {reconItems.length} produk sesuai • Fisik{" "}
                      <strong className="text-stone-800">{totalPhysical} pcs</strong> vs Klaim{" "}
                      <strong className="text-stone-800">{totalClaim} pcs</strong>
                    </p>
                    <p className="text-[10px] text-stone-400 font-medium mt-0.5">
                      {session.receiveDate || "Hari Ini"} • Sheet {session.targetSheet}
                      {diffCount > 0 && unconfirmedDiffCount > 0
                        ? ` • ${unconfirmedDiffCount} selisih belum dikonfirmasi`
                        : ""}
                    </p>
                  </div>
                </div>

                {/* Quick Action Pills Row */}
                <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-stone-200/60">
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        localStorage.setItem("scan-retur-flow-mode", "verify");
                      } catch {}
                      navigate("/");
                    }}
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#1C1917] text-white hover:bg-stone-800 transition-colors"
                  >
                    + Scan Fisik
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenAiScan}
                    disabled={aiLoading}
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/85 text-stone-700 border border-white/90 hover:bg-white transition-colors"
                  >
                    {aiLoading ? "Membaca..." : "Baca Foto SJ"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddSkuModal(true);
                      setSkuSearch("");
                      setSelectedProductToAdd(null);
                    }}
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/85 text-stone-700 border border-white/90 hover:bg-white transition-colors"
                  >
                    + SKU SJ
                  </button>
                  <button
                    type="button"
                    onClick={() => setScannedListModalOpen(true)}
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/85 text-stone-700 border border-white/90 hover:bg-white transition-colors"
                  >
                    Scan ({session.items.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleMatchAll}
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/85 text-stone-700 border border-white/90 hover:bg-white transition-colors"
                  >
                    Samakan
                  </button>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center justify-between pt-1.5 border-t border-stone-200/60 text-xs">
                  <span className="text-[11px] font-semibold text-stone-500">Filter:</span>
                  <div className="flex gap-1">
                    {(["all", "diff", "match"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setFilterStatus(tab)}
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all ${
                          filterStatus === tab
                            ? "bg-[#1C1917] text-white"
                            : "bg-white/70 text-stone-600 border border-white/80 hover:bg-white"
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

              {/* Items List (Screen 01 Frosted Card Rows) */}
              <div className="space-y-2.5">
                {filteredItems.length === 0 ? (
                  <div className="card p-6 text-center text-xs font-medium text-stone-500">
                    Tidak ada item pada filter ini.
                  </div>
                ) : (
                  filteredItems.map((item) => {
                    const isMatch = item.status === "match";
                    const isUnscanned = item.status === "unscanned";
                    const isUnder = item.status === "under";
                    const isOver = item.status === "over";
                    const isNotInSj = item.status === "not_in_sj";

                    const statusText = isMatch
                      ? "Sesuai SJ"
                      : isUnscanned
                      ? `Belum discan (Klaim ${item.claimQty} pcs)`
                      : isUnder
                      ? `Selisih ${item.diff} pcs (Fisik ${item.physicalQty} / Klaim ${item.claimQty})`
                      : isNotInSj
                      ? `Tidak ada di SJ (+${item.physicalQty} pcs)`
                      : isOver
                      ? `Lebih +${item.diff} pcs (Fisik ${item.physicalQty} / Klaim ${item.claimQty})`
                      : "";

                    const batchLabel =
                      item.batches.length > 0
                        ? item.batches
                            .map((b) => `Batch #${b.batch || "-"}${item.batches.length > 1 ? ` (${b.qty})` : ""}`)
                            .join(", ")
                        : `SKU ${item.sku}`;

                    return (
                      <div key={item.key} className="card p-3.5 space-y-2.5 transition-all">
                        <div className="flex items-start justify-between gap-2.5">
                          {/* Left Status Circle Icon + Full Product Info */}
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <div
                              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 border text-xs font-bold ${
                                isMatch
                                  ? "bg-white/90 border-stone-300 text-stone-800"
                                  : isUnscanned || isUnder
                                  ? "bg-amber-50/90 border-amber-300 text-amber-800"
                                  : "bg-teal-50/90 border-teal-300 text-teal-800"
                              }`}
                            >
                              {isMatch ? (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              ) : isUnscanned || isUnder ? (
                                <span>!</span>
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              {/* Full Product Name — NEVER truncated */}
                              <h4 className="text-xs font-bold text-stone-900 leading-snug break-words">
                                {item.product}
                              </h4>
                              <p className="text-[11px] text-stone-500 font-medium mt-0.5 leading-snug break-words">
                                {batchLabel} •{" "}
                                <span
                                  className={
                                    isMatch
                                      ? "text-emerald-700 font-semibold"
                                      : "text-amber-700 font-semibold"
                                  }
                                >
                                  {statusText}
                                </span>
                                {item.confirmedDiscrepancy && !isMatch && (
                                  <span className="ml-1 text-stone-600 font-semibold">
                                    (✓ Dikonfirmasi)
                                  </span>
                                )}
                              </p>
                              {item.notes && (
                                <p className="text-[11px] text-stone-700 bg-white/75 border border-white/90 rounded-lg px-2.5 py-1 mt-1.5 font-medium break-words">
                                  Catatan: {item.notes}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Right Side: Stepper (- [Qty] +) & Physical Badge */}
                          <div className="shrink-0 flex flex-col items-end gap-1.5">
                            {/* Stepper for Klaim SJ */}
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateClaim(item, Math.max(0, item.claimQty - 1))
                                }
                                className="w-6 h-6 rounded-full bg-white/80 hover:bg-white border border-stone-200/90 flex items-center justify-center text-xs font-bold text-stone-700 transition-colors"
                                title="Kurangi Klaim SJ"
                              >
                                -
                              </button>
                              <div className="bg-[#1C1917] text-white px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold flex items-center gap-0.5">
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  value={item.claimQty}
                                  onChange={(e) =>
                                    handleUpdateClaim(item, Number(e.target.value) || 0)
                                  }
                                  className="w-7 bg-transparent text-center text-white font-mono text-[11px] font-bold focus:outline-none tabular-nums"
                                  title="Jumlah Klaim SJ"
                                />
                                <span className="text-[10px] font-normal opacity-80">Pcs</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleUpdateClaim(item, item.claimQty + 1)}
                                className="w-6 h-6 rounded-full bg-white/80 hover:bg-white border border-stone-200/90 flex items-center justify-center text-xs font-bold text-stone-700 transition-colors"
                                title="Tambah Klaim SJ"
                              >
                                +
                              </button>
                            </div>

                            <span className="text-[10px] font-semibold text-stone-500">
                              Fisik: <strong className="text-stone-800">{item.physicalQty} Pcs</strong>
                            </span>
                          </div>
                        </div>

                        {/* Quick Action Row per Item if needed */}
                        {(!isMatch || ((isUnscanned || isUnder) && item.barcode)) && (
                          <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-stone-200/50">
                            {(isUnscanned || isUnder) && item.barcode && (
                              <button
                                type="button"
                                onClick={() => {
                                  try {
                                    localStorage.setItem("scan-retur-flow-mode", "verify");
                                  } catch {}
                                  navigate(
                                    `/return-form?barcode=${encodeURIComponent(item.barcode)}&mode=verify`
                                  );
                                }}
                                className="text-[11px] font-semibold bg-[#1C1917] text-white px-3 py-1 rounded-full hover:bg-stone-800 transition-colors"
                              >
                                Scan Barang
                              </button>
                            )}

                            {!isMatch && (
                              <button
                                type="button"
                                onClick={() => {
                                  setDiscrepancyModalItem(item);
                                  setDiscrepancyNote(item.notes || "");
                                }}
                                className="text-[11px] font-semibold text-stone-700 bg-white/80 hover:bg-white border border-stone-200/90 px-3 py-1 rounded-full transition-colors"
                              >
                                {item.confirmedDiscrepancy ? "Edit Catatan" : "Catat Selisih"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom Sticky Action Bar (Screen 01 Dark Pill Button) */}
              <div className="sticky bottom-16 z-40 pt-1">
                <div className="card p-2.5 flex items-center gap-2 bg-white/80 backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={() => handleCopyWhatsApp()}
                    className="btn-outline py-3 px-4 text-xs font-semibold shrink-0"
                  >
                    Salin WA
                  </button>

                  <button
                    type="button"
                    onClick={handleFinishStoreClick}
                    className="flex-1 btn-primary py-3 px-4 text-xs font-bold shadow-md"
                  >
                    Simpan Verifikasi ke Sheet
                  </button>
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
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-stone-600 uppercase tracking-wider">
              Riwayat Rekon ({reconHistory.length})
            </span>
            <button
              type="button"
              onClick={async () => {
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
              }}
              className="text-[11px] font-semibold text-stone-700 hover:text-stone-900 bg-white/75 border border-white/90 px-3 py-1 rounded-full transition-colors flex items-center gap-1 shadow-2xs"
            >
              <span>Sinkron dari Sheet</span>
            </button>
          </div>

          {reconHistory.length === 0 ? (
            <div className="card p-8 text-center text-xs text-stone-500">
              Belum ada riwayat verifikasi toko yang tersimpan.
            </div>
          ) : (
            reconHistory.map((rep) => {
              const dateStr = new Date(rep.verifiedAt).toLocaleDateString("id-ID", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div key={rep.id} className="card p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-stone-900 leading-snug break-words">{rep.storeName}</h3>
                      <p className="text-[11px] text-stone-500 mt-0.5">
                        {rep.noSJ ? `SJ: ${rep.noSJ} · ` : ""}
                        {dateStr} · PIC: {rep.pic} (Sheet {rep.targetSheet})
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                        !rep.hasDiscrepancy
                          ? "bg-emerald-100/90 text-emerald-800"
                          : "bg-amber-100/90 text-amber-800"
                      }`}
                    >
                      {!rep.hasDiscrepancy ? "✓ Sesuai" : `${rep.discrepancySkuCount} Selisih`}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-white/60 border border-white/80 p-2 rounded-xl text-center text-xs font-semibold text-stone-800">
                    <div>
                      <span className="text-[10px] text-stone-400 block font-medium">Fisik</span>
                      <span>{rep.totalPhysicalQty} pcs</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 block font-medium">Klaim SJ</span>
                      <span>{rep.totalClaimQty} pcs</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 block font-medium">Total SKU</span>
                      <span>{rep.totalSku} SKU</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1.5 border-t border-stone-200/60 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedHistoryReport(
                          selectedHistoryReport?.id === rep.id ? null : rep
                        )
                      }
                      className="font-semibold text-stone-700 hover:text-stone-900"
                    >
                      {selectedHistoryReport?.id === rep.id
                        ? "Tutup Rincian ▲"
                        : "Lihat Rincian ▼"}
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyWhatsApp({
                            storeName: rep.storeName,
                            noSJ: rep.noSJ,
                            receiveDate: rep.receiveDate,
                            pic: rep.pic,
                            targetSheet: rep.targetSheet,
                            totalPhysicalQty: rep.totalPhysicalQty,
                            totalClaimQty: rep.totalClaimQty,
                            items: rep.items,
                          })
                        }
                        className="btn-outline py-1 px-3 text-[11px] font-semibold"
                      >
                        Salin WA
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteHistory(rep.id)}
                        className="text-stone-400 hover:text-red-600 p-1 rounded-md text-xs font-semibold"
                        title="Hapus riwayat ini"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {selectedHistoryReport?.id === rep.id && (
                    <div className="pt-2 border-t border-stone-200/60 space-y-1.5">
                      <h5 className="text-[11px] font-bold text-stone-500 uppercase tracking-wide">
                        Rincian Item:
                      </h5>
                      {rep.items.map((it, idx) => (
                        <div
                          key={idx}
                          className="flex items-start justify-between py-1.5 border-b border-stone-200/50 last:border-0 text-xs gap-2"
                        >
                          <div className="min-w-0 pr-2 flex-1">
                            <span className="font-bold text-stone-800 block leading-snug break-words">
                              {it.product}
                            </span>
                            <span className="text-[10px] text-stone-500 font-mono">
                              {it.sku}
                              {it.notes ? ` · Catatan: ${it.notes}` : ""}
                            </span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-mono font-bold text-stone-800">
                              {it.physicalQty} / {it.claimQty} pcs
                            </span>
                            <span
                              className={`block text-[10px] font-bold ${
                                it.status === "match"
                                  ? "text-emerald-600"
                                  : "text-red-600"
                              }`}
                            >
                              {it.status === "match"
                                ? "Sesuai"
                                : it.diff > 0
                                ? `+${it.diff}`
                                : `${it.diff}`}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: TAMBAH SKU DARI LEMBAR SJ (YANG BELUM DI-SCAN)    */}
      {/* ======================================================== */}
      {addSkuModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="card max-w-sm w-full p-4 space-y-3 bg-white/95 animate-scale-in">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="text-sm font-bold text-stone-900">
                + Tambah SKU dari Lembar SJ
              </h3>
              <button
                type="button"
                onClick={() => setAddSkuModal(false)}
                className="text-stone-400 hover:text-stone-600 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <p className="text-xs text-stone-500">
              Pilih produk yang tertera pada lembar SJ tetapi belum pernah di-scan pada kardus fisik.
            </p>

            <form onSubmit={handleAddSkuFromSJ} className="space-y-3">
              <div>
                <label className="label-field">Cari Produk / SKU</label>
                {selectedProductToAdd ? (
                  <div className="flex items-start justify-between bg-teal-50/80 border border-teal-200 rounded-xl px-3 py-2 text-xs gap-2">
                    <div className="min-w-0 pr-2 flex-1">
                      <span className="font-bold text-stone-900 block leading-snug break-words">
                        {selectedProductToAdd.product}
                      </span>
                      <span className="font-mono text-stone-500 text-[10px]">
                        {selectedProductToAdd.sku} · {selectedProductToAdd.barcode}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedProductToAdd(null)}
                      className="text-teal-700 font-bold hover:underline shrink-0"
                    >
                      Ganti
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <input
                      type="text"
                      value={skuSearch}
                      onChange={(e) => setSkuSearch(e.target.value)}
                      placeholder={loadingProducts ? "Memuat..." : "Ketik nama produk / SKU..."}
                      className="input-field text-xs py-2"
                      autoFocus
                    />
                    {filteredProductsToAdd.length > 0 && (
                      <div className="border border-stone-200 rounded-xl max-h-40 overflow-y-auto divide-y divide-stone-100 bg-white shadow-lg">
                        {filteredProductsToAdd.map((p) => (
                          <button
                            key={p.barcode}
                            type="button"
                            onClick={() => setSelectedProductToAdd(p)}
                            className="w-full text-left px-3 py-2 hover:bg-stone-50 text-xs"
                          >
                            <span className="font-bold text-stone-900 block leading-snug break-words">
                              {p.product}
                            </span>
                            <span className="text-[10px] text-stone-400 font-mono">
                              {p.sku} · {p.barcode}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="label-field">Jumlah Klaim SJ (Qty)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={addClaimQty}
                  onChange={(e) => setAddClaimQty(e.target.value)}
                  placeholder="Mis: 5"
                  className="input-field text-xs py-2 font-bold"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setAddSkuModal(false)}
                  className="flex-1 btn-outline py-2 text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!selectedProductToAdd || !addClaimQty}
                  className="flex-1 btn-primary py-2 text-xs font-bold"
                >
                  Tambahkan ke Rekon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: KONFIRMASI CATATAN SELISIH RIIL                   */}
      {/* ======================================================== */}
      {discrepancyModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="card max-w-sm w-full p-4 space-y-3 bg-white/95 animate-scale-in">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="text-sm font-bold text-stone-900">
                Konfirmasi Selisih Fisik vs Klaim
              </h3>
              <button
                type="button"
                onClick={() => setDiscrepancyModalItem(null)}
                className="text-stone-400 hover:text-stone-600 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-900">
              <p className="font-bold leading-snug break-words">{discrepancyModalItem.product}</p>
              <p className="font-mono text-[11px] text-amber-800 mt-0.5">
                Fisik: {discrepancyModalItem.physicalQty} pcs · Klaim: {discrepancyModalItem.claimQty} pcs (Selisih: {discrepancyModalItem.diff})
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="label-field">Pilih / Ketik Keterangan Selisih:</label>
              {/* Quick note chips */}
              <div className="flex flex-wrap gap-1 mb-2">
                {[
                  "Barang tidak dikirim toko",
                  "Fisik rusak / pecah",
                  "Barang tidak ditemukan di koli",
                  "Klaim toko salah hitung",
                  "Barang tertukar / beda shade",
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setDiscrepancyNote(chip)}
                    className="text-[10px] font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 px-2.5 py-1 rounded-full border border-stone-200"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              <textarea
                value={discrepancyNote}
                onChange={(e) => setDiscrepancyNote(e.target.value)}
                placeholder="Tulis alasan selisih..."
                rows={2}
                className="input-field text-xs py-2 w-full"
              />
            </div>

            <div className="flex gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setDiscrepancyModalItem(null)}
                className="flex-1 btn-outline py-2 text-xs font-bold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveDiscrepancyNote}
                className="flex-1 btn-primary py-2 text-xs font-bold"
              >
                Simpan Konfirmasi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* GATEKEEPER DIALOG: PERINGATAN SELISIH BELUM DIKONFIRMASI  */}
      {/* ======================================================== */}
      {gatekeeperOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm">
          <div className="card max-w-sm w-full p-4 space-y-3 bg-white/95 animate-scale-in text-center">
            <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
              !
            </div>

            <h3 className="text-sm font-bold text-stone-900">
              Masih Ada {unconfirmedDiffCount} SKU Selisih
            </h3>

            <p className="text-xs text-stone-600 text-left bg-stone-50 border border-stone-200 rounded-xl p-3 leading-relaxed">
              Ada produk yang jumlah fisiknya tidak sama dengan klaim SJ dan belum Anda beri catatan konfirmasi.
              <br /><br />
              <strong>Mohon periksa kembali kardus fisik Anda</strong> untuk memastikan tidak ada barang yang tertinggal sebelum menutup toko ini.
            </p>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => setGatekeeperOpen(false)}
                className="w-full btn-primary py-2.5 text-xs font-bold"
              >
                Periksa Kembali Kardus Fisik
              </button>

              <button
                type="button"
                onClick={finalizeSession}
                className="w-full btn-outline py-2 text-xs font-bold text-red-600 border-red-200 hover:bg-red-50"
              >
                Tetap Selesaikan &amp; Tandai Selisih Riil
              </button>
            </div>
          </div>
        </div>
      )}
      {/* AI LOADING OVERLAY */}
      {aiLoading && (
        <div className="fixed inset-0 z-60 flex flex-col items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm text-white text-center space-y-3">
          <div className="w-12 h-12 border-4 border-teal-400 border-t-white rounded-full animate-spin" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold">Membaca Lembar SJ...</h4>
            <p className="text-xs text-stone-200 max-w-xs">
              {aiProgressText || "Mendeteksi nama produk, SKU, dan jumlah klaim dari foto dokumen kertas. Mohon tunggu sebentar..."}
            </p>
          </div>
        </div>
      )}

      {/* MODAL: PREVIEW HASIL EKSTRAKSI AI VISION */}
      {aiPreviewOpen && aiExtractedData && (() => {
        const unmappedCount = aiExtractedData.items.filter(
          (it) => it.matchConfidence === "unmatched" || it.matchConfidence === "low"
        ).length;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm">
            <div className="card max-w-md w-full p-4 space-y-3 bg-white/95 animate-scale-in max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between pb-2 border-b border-stone-100 shrink-0">
                <h3 className="text-sm font-bold text-stone-900">
                  Hasil Baca Lembar SJ
                </h3>
                <button
                  type="button"
                  onClick={() => setAiPreviewOpen(false)}
                  className="text-stone-400 hover:text-stone-600 text-lg leading-none"
                >
                  ×
                </button>
              </div>

              <div className="text-xs text-stone-600 bg-stone-50 border border-stone-200 rounded-xl p-2.5 shrink-0 space-y-1">
                {aiExtractedData.storeName && (
                  <p><strong>Toko terdeteksi:</strong> {aiExtractedData.storeName}</p>
                )}
                {aiExtractedData.noSJ && (
                  <p><strong>No. SJ terdeteksi:</strong> {aiExtractedData.noSJ}</p>
                )}
                <p className="text-stone-900 font-bold">
                  {aiExtractedData.pageCount && aiExtractedData.pageCount > 1
                    ? `${aiExtractedData.pageCount} halaman digabung · `
                    : ""}
                  Ditemukan {aiExtractedData.items.length} produk pada lembar kertas.
                </p>
              </div>

              {/* Warning jika ada produk yang belum cocok / low confidence */}
              {unmappedCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-2.5 text-xs space-y-1 shrink-0">
                  <div className="flex items-center gap-1.5 font-bold">
                    <span>Ada {unmappedCount} produk perlu dicek / dipetakan</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Produk bertanda kuning/merah belum cocok persis dengan Master. Klik <strong>"Petakan"</strong> agar fisik scan nantinya cocok dan tidak muncul selisih dobel.
                  </p>
                </div>
              )}

              {/* List Items Extracted */}
              <div className="overflow-y-auto flex-1 divide-y divide-stone-100 border border-stone-200 rounded-xl p-1 space-y-1">
                {aiExtractedData.items.map((it, idx) => {
                  const isUnmatched = it.matchConfidence === "unmatched";
                  const isLow = it.matchConfidence === "low";
                  const isExact = it.matchConfidence === "exact";

                  return (
                    <div
                      key={idx}
                      className={`p-2 rounded-lg flex items-start justify-between gap-2 text-xs border ${
                        isUnmatched
                          ? "bg-red-50/60 border-red-200"
                          : isLow
                          ? "bg-amber-50/60 border-amber-200"
                          : "bg-white border-stone-100"
                      }`}
                    >
                      <div className="min-w-0 pr-2 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          {isExact && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              ✓ Master Eksak
                            </span>
                          )}
                          {!isExact && !isLow && !isUnmatched && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              ✓ Cocok ({Math.round((it.matchScore || 1) * 100)}%)
                            </span>
                          )}
                          {isLow && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900">
                              Perlu Dicek ({Math.round(it.matchScore * 100)}%)
                            </span>
                          )}
                          {isUnmatched && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                              Tidak di Master
                            </span>
                          )}
                        </div>

                        <span className="font-bold text-stone-900 block leading-snug break-words">
                          {it.product}
                        </span>

                        {it.rawProduct && it.rawProduct.toLowerCase() !== it.product.toLowerCase() && (
                          <span className="text-[10px] text-stone-500 block break-words">
                            Teks SJ: <em>"{it.rawProduct}"</em>
                          </span>
                        )}

                        <div className="flex items-center gap-2 pt-0.5">
                          <span className="text-[10px] text-stone-400 font-mono">
                            SKU: {it.sku || "-"}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setMappingItemIndex(idx);
                              setMappingSearch(it.rawProduct || it.product);
                            }}
                            className="text-[10px] font-bold text-teal-700 hover:text-teal-900 underline"
                          >
                            {isUnmatched || isLow ? "Petakan..." : "Ubah..."}
                          </button>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1 pt-1">
                        <span className="text-[10px] text-stone-400 font-bold uppercase">Klaim:</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          value={it.claimQty}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            const updated = [...aiExtractedData.items];
                            updated[idx].claimQty = val;
                            setAiExtractedData({ ...aiExtractedData, items: updated });
                          }}
                          className="w-14 text-center text-xs font-bold text-stone-900 border border-stone-300 rounded-lg py-1 focus:outline-none"
                        />
                        <span className="text-xs text-stone-500 font-semibold">pcs</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {session && Object.keys(session.claims).length > 0 && (
                <div className="shrink-0 grid grid-cols-2 gap-1.5 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setAiApplyMode("replace")}
                    className={`py-1.5 rounded-full border ${
                      aiApplyMode === "replace"
                        ? "bg-[#1C1917] text-white border-[#1C1917]"
                        : "bg-white text-stone-600 border-stone-300"
                    }`}
                  >
                    Ganti klaim SKU ini
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiApplyMode("add")}
                    className={`py-1.5 rounded-full border ${
                      aiApplyMode === "add"
                        ? "bg-[#1C1917] text-white border-[#1C1917]"
                        : "bg-white text-stone-600 border-stone-300"
                    }`}
                  >
                    Tambah (SJ lanjutan)
                  </button>
                </div>
              )}

              {/* Konfirmasi jika masih ada item low/unmatched */}
              {requireMappingConfirm && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs space-y-1 shrink-0">
                  <p className="font-bold text-red-800">
                    Masih ada {unmappedCount} produk belum dipetakan.
                  </p>
                  <p className="text-[11px] text-red-600 leading-snug">
                    Produk tanpa SKU master berisiko membuat selisih palsu saat barang fisik di-scan.
                  </p>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => handleApplyAiClaims(true)}
                      className="w-full btn-outline py-1.5 text-xs font-bold text-red-700 border-red-300 hover:bg-red-100"
                    >
                      Tetap Terapkan Tanpa Mapping
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-stone-100 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setAiPreviewOpen(false);
                    setRequireMappingConfirm(false);
                  }}
                  className="flex-1 btn-outline py-2 text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyAiClaims(false)}
                  className="flex-1 btn-primary py-2 text-xs font-bold"
                >
                  Terapkan ke Rekonsiliasi
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: MANUAL MAPPING MASTER PRODUCT */}
      {mappingItemIndex !== null && aiExtractedData && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
          <div className="card max-w-sm w-full p-4 space-y-3 bg-white/95 animate-scale-in max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-stone-900">
                  Petakan ke Master Produk
                </h3>
                <p className="text-[11px] text-stone-500">
                  Teks SJ: "<em>{aiExtractedData.items[mappingItemIndex]?.rawProduct || aiExtractedData.items[mappingItemIndex]?.product}</em>"
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMappingItemIndex(null)}
                className="text-stone-400 hover:text-stone-600 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-1 shrink-0">
              <label className="label-field">Cari Produk Resmi BLP:</label>
              <input
                type="text"
                value={mappingSearch}
                onChange={(e) => setMappingSearch(e.target.value)}
                placeholder="Ketik nama shade / produk / SKU..."
                className="input-field text-xs py-2 w-full"
                autoFocus
              />
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-stone-100 border border-stone-200 rounded-xl">
              {filteredProductsForMapping.length === 0 ? (
                <div className="p-4 text-center text-xs text-stone-400">
                  Tidak ditemukan produk yang cocok.
                </div>
              ) : (
                filteredProductsForMapping.map((p) => (
                  <button
                    key={p.barcode || p.sku}
                    type="button"
                    onClick={() => handleSelectProductForMapping(p)}
                    className="w-full text-left p-2.5 hover:bg-stone-50 transition-colors flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 pr-2 flex-1">
                      <span className="font-bold text-xs text-stone-900 block leading-snug break-words">
                        {p.product}
                      </span>
                      <span className="text-[10px] text-stone-400 font-mono">
                        {p.sku} {p.barcode ? `· ${p.barcode}` : ""}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-stone-800 shrink-0">
                      Pilih →
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-stone-100 shrink-0">
              <button
                type="button"
                onClick={() => setMappingItemIndex(null)}
                className="w-full btn-outline py-2 text-xs font-bold"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {matchAllModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm">
          <form
            onSubmit={handleConfirmMatchAll}
            className="card max-w-md w-full p-4 space-y-3 bg-white/95 animate-scale-in"
          >
            <h3 className="text-sm font-bold text-stone-900">Samakan Semua Klaim dengan Fisik</h3>
            <p className="text-xs text-stone-600">
              Jumlah klaim SJ setiap SKU akan diganti dengan hasil scan fisik. Klaim SJ awal dan
              alasan ini dicatat di laporan.
            </p>
            <textarea
              value={matchAllReason}
              onChange={(e) => setMatchAllReason(e.target.value)}
              placeholder="Alasan (wajib), misal: SJ tidak tersedia, dikonfirmasi via telepon dengan toko"
              rows={3}
              autoFocus
              className="input-field text-xs w-full"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMatchAllModalOpen(false)}
                className="flex-1 btn-outline py-2 text-xs font-bold"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={!matchAllReason.trim()}
                className="flex-1 btn-primary py-2 text-xs font-bold disabled:opacity-50"
              >
                Samakan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: RINCIAN BARANG FISIK TER-SCAN & HAPUS SCAN */}
      {scannedListModalOpen && session && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm">
          <div className="card max-w-md w-full p-4 space-y-3 bg-white/95 animate-scale-in max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-stone-900">
                  Rincian Hasil Scan Fisik
                </h3>
                <p className="text-[11px] text-stone-500">
                  {session.storeName} · Total {session.items.reduce((s, i) => s + i.qty, 0)} pcs ({session.items.length} scan)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScannedListModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-stone-100 border border-stone-200 rounded-xl">
              {session.items.length === 0 ? (
                <div className="p-6 text-center text-xs text-stone-400">
                  Belum ada barang fisik yang discan untuk sesi ini.
                </div>
              ) : (
                session.items.map((it, idx) => (
                  <div key={it.id || idx} className="p-2.5 flex items-center justify-between gap-2 text-xs hover:bg-stone-50">
                    <div className="min-w-0 pr-2 flex-1">
                      <span className="font-bold text-stone-900 block leading-snug break-words">
                        {it.product}
                      </span>
                      <p className="text-[10px] text-stone-500 font-mono mt-0.5">
                        Lot: {it.batch || "-"} · Exp: {it.expDate || "-"} · {it.qty} pcs
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {it.barcode} · {it.pic}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Hapus scan ${it.product} (Lot: ${it.batch}, ${it.qty} pcs) dari sesi ini?`)) {
                          removeScannedItemFromSession(it.id);
                          refreshSession();
                          showToast("success", "Scan barang berhasil dihapus dari sesi.");
                        }
                      }}
                      className="text-gray-400 hover:text-red-600 p-1.5 rounded-lg border border-gray-200 hover:border-red-200 shrink-0"
                      title="Hapus scan ini"
                    >
                      🗑️
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-gray-100 shrink-0">
              <button
                type="button"
                onClick={() => setScannedListModalOpen(false)}
                className="w-full btn-outline py-2 text-xs font-bold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PERINGATAN KONFLIK NAMA TOKO */}
      {storeConflictModalOpen && aiExtractedData && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="card max-w-sm w-full p-4 space-y-3 bg-white animate-scale-in text-center">
            <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto text-2xl">
              ⚠️
            </div>
            <h3 className="text-sm font-bold text-gray-900">
              Toko di Lembar SJ Berbeda!
            </h3>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-left text-amber-900 space-y-1">
              <p>📍 <strong>Sesi Aktif:</strong> {session?.storeName}</p>
              <p>📄 <strong>Toko di Surat Jalan:</strong> {aiExtractedData.storeName}</p>
              <p className="text-[11px] text-amber-800 pt-1">
                Surat Jalan yang Anda baca terindikasi milik toko yang berbeda dari sesi scan yang sedang berjalan.
              </p>
            </div>
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => {
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
                className="w-full btn-primary py-2.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white"
              >
                🔄 Buat Sesi Baru untuk Toko di SJ
              </button>
              <button
                type="button"
                onClick={() => {
                  setStoreConflictModalOpen(false);
                  applyClaimItems(aiExtractedData.items, aiApplyMode);
                  refreshSession();
                  setAiPreviewOpen(false);
                  showToast("success", `Klaim diterapkan ke sesi toko "${session?.storeName}".`);
                }}
                className="w-full btn-outline py-2 text-xs font-bold text-gray-700 border-gray-300 hover:bg-gray-50"
              >
                Tetap Gabung ke Sesi Aktif ({session?.storeName})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
