import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { fetchProducts, type ProductItem } from "../lib/api";
import {
  parseSJWithGemini,
  getGeminiApiKey,
  saveUserGeminiApiKey,
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
  formatWhatsAppSummary,
  type ReconcileItem,
  type SavedReconReport,
  type StoreSession,
} from "../lib/session";

export default function VerificationPage() {
  const navigate = useNavigate();
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
  const [geminiKeyModalOpen, setGeminiKeyModalOpen] = useState(false);
  const [geminiKeyInput, setGeminiKeyInput] = useState(() => getGeminiApiKey());
  const [showKeyPassword, setShowKeyPassword] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
  const [aiExtractedData, setAiExtractedData] = useState<ExtractedSJResult | null>(null);
  const [aiApplyMode, setAiApplyMode] = useState<"replace" | "add">("replace");
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

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const handleOpenAiScan = () => {
    const key = getGeminiApiKey();
    if (!key) {
      setGeminiKeyModalOpen(true);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleSaveGeminiKey = (e: React.FormEvent) => {
    e.preventDefault();
    saveUserGeminiApiKey(geminiKeyInput);
    setGeminiKeyModalOpen(false);
    showToast("success", "API Key Gemini berhasil disimpan secara privat di perangkat Anda.");
    if (geminiKeyInput.trim()) {
      setTimeout(() => fileInputRef.current?.click(), 300);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAiLoading(true);
    const result = await parseSJWithGemini(file, products);
    setAiLoading(false);

    if (fileInputRef.current) fileInputRef.current.value = "";

    if (!result.ok) {
      showToast("error", result.error || "Gagal membaca lembar SJ.");
      return;
    }

    if (result.items.length === 0) {
      showToast("error", "AI tidak menemukan baris produk pada gambar ini. Pastikan foto tegak lurus dan pencahayaan cukup.");
      return;
    }

    setAiExtractedData(result);
    setAiApplyMode("replace");
    setAiPreviewOpen(true);
  };

  const handleApplyAiClaims = () => {
    if (!aiExtractedData) return;

    let currentSession = session || getActiveSession();
    if (!currentSession) {
      const storeName = aiExtractedData.storeName || "Toko Retur (dari SJ)";
      const noSJ = aiExtractedData.noSJ || "";
      currentSession = startStoreSession(storeName, noSJ, "Bagas");
      setSession(currentSession);
    }

    applyClaimItems(aiExtractedData.items, aiApplyMode);

    refreshSession();
    setAiPreviewOpen(false);
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
      setReconHistory(getReconHistory());
      setGatekeeperOpen(false);
      navigate("/", {
        replace: true,
        state: {
          successMessage: `Selesai verifikasi toko "${report.storeName}". Siap input toko berikutnya.`,
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
      {/* Toast Notification */}
      {toast && (
        <div
          className={`rounded-xl px-3.5 py-2.5 text-xs font-semibold border ${
            toast.type === "success"
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-600 border-red-200"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Tabs Switcher: Sesi Toko Aktif vs Riwayat Verifikasi */}
      <div className="flex bg-gray-200/80 p-1 rounded-xl">
        <button
          type="button"
          onClick={() => setActiveTab("current")}
          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === "current"
              ? "bg-white text-gray-900 shadow-xs"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          🔍 Verifikasi Toko Aktif
          {session && session.items.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800">
              {session.items.length} scan
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("history");
            setReconHistory(getReconHistory());
          }}
          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === "history"
              ? "bg-white text-gray-900 shadow-xs"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          📜 Riwayat Rekon Toko ({reconHistory.length})
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: VERIFIKASI SESI TOKO AKTIF                        */}
      {/* ======================================================== */}
      {activeTab === "current" && (
        <>
          {!session ? (
            <div className="card p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-purple-100 text-purple-700 rounded-2xl flex items-center justify-center mx-auto text-3xl shadow-xs">
                📄
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-gray-900">Mulai Verifikasi & Rekonsiliasi Toko</h3>
                <p className="text-xs text-gray-500 max-w-xs mx-auto">
                  Belum ada sesi toko aktif. Anda bisa langsung <strong>foto lembar kertas SJ</strong> agar AI membaca data otomatis, atau mulai scan fisik terlebih dahulu.
                </p>
              </div>

              <div className="flex flex-col gap-2 max-w-xs mx-auto pt-1">
                <button
                  type="button"
                  onClick={handleOpenAiScan}
                  disabled={aiLoading}
                  className="w-full btn-primary py-3 px-4 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98]"
                >
                  <span className="text-base">📷</span>
                  <span>{aiLoading ? "Membaca Dokumen..." : "Foto / Upload Lembar SJ (AI)"}</span>
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => navigate("/")}
                    className="flex-1 btn-outline py-2.5 text-xs font-bold"
                  >
                    Mulai Scan Fisik
                  </button>
                  <button
                    type="button"
                    onClick={() => setGeminiKeyModalOpen(true)}
                    className="btn-outline py-2.5 px-3 text-xs font-bold text-purple-700 border-purple-200 hover:bg-purple-50"
                    title="Pengaturan API Key"
                  >
                    ⚙️ Key AI
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Store Metadata & Summary Card */}
              <div className="card p-3.5 space-y-3">
                <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-2.5">
                  <div className="min-w-0">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 uppercase tracking-wider mb-1">
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
                  <button
                    type="button"
                    onClick={() => navigate("/")}
                    className="shrink-0 text-xs font-semibold text-gray-500 hover:text-gray-800 bg-gray-100 px-2.5 py-1.5 rounded-lg"
                  >
                    + Scan Tambahan
                  </button>
                </div>

                {/* Scorecards */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-blue-50 border border-blue-100 p-2 rounded-xl">
                    <span className="text-[10px] font-bold text-blue-600 block uppercase">
                      Total Fisik
                    </span>
                    <span className="text-lg font-black text-blue-900">
                      {totalPhysical} <span className="text-[10px] font-normal">pcs</span>
                    </span>
                  </div>

                  <div className="bg-purple-50 border border-purple-100 p-2 rounded-xl">
                    <span className="text-[10px] font-bold text-purple-600 block uppercase">
                      Klaim SJ
                    </span>
                    <span className="text-lg font-black text-purple-900">
                      {totalClaim} <span className="text-[10px] font-normal">pcs</span>
                    </span>
                  </div>

                  <div
                    className={`p-2 rounded-xl border ${
                      totalPhysical === totalClaim && diffCount === 0
                        ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                        : "bg-amber-50 border-amber-200 text-amber-900"
                    }`}
                  >
                    <span className="text-[10px] font-bold block uppercase">
                      Selisih Total
                    </span>
                    <span className="text-lg font-black">
                      {totalPhysical - totalClaim === 0
                        ? "0"
                        : totalPhysical - totalClaim > 0
                        ? `+${totalPhysical - totalClaim}`
                        : `${totalPhysical - totalClaim}`}
                      <span className="text-[10px] font-normal"> pcs</span>
                    </span>
                  </div>
                </div>

                {/* Status Bar */}
                <div
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold border ${
                    diffCount === 0 && reconItems.length > 0
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : "bg-red-50 border-red-200 text-red-800"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{diffCount === 0 && reconItems.length > 0 ? "✅" : "⚠️"}</span>
                    <span>
                      {diffCount === 0 && reconItems.length > 0
                        ? "Semua SKU Sesuai dengan Lembar SJ"
                        : `${diffCount} dari ${reconItems.length} SKU Mengalami Selisih`}
                    </span>
                  </div>
                  {diffCount > 0 && (
                    <span className="text-[11px] font-medium text-red-600">
                      ({unconfirmedDiffCount} belum konfirmasi)
                    </span>
                  )}
                </div>
              </div>

              {/* Action Tools & Filters Bar */}
              <div className="card p-2.5 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={handleMatchAll}
                    className="flex-1 min-w-[130px] btn-outline py-2 text-xs font-bold text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                  >
                    ✓ Samakan Semua Klaim
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddSkuModal(true);
                      setSkuSearch("");
                      setSelectedProductToAdd(null);
                    }}
                    className="flex-1 min-w-[110px] btn-outline py-2 text-xs font-bold text-blue-700 border-blue-300 hover:bg-blue-50"
                  >
                    + Tambah SKU
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenAiScan}
                    disabled={aiLoading}
                    className="flex-1 min-w-[120px] btn-outline py-2 text-xs font-bold text-purple-700 border-purple-300 hover:bg-purple-50 flex items-center justify-center gap-1"
                  >
                    <span>{aiLoading ? "⏳" : "📷"}</span>
                    <span>{aiLoading ? "Membaca..." : "Baca SJ (AI)"}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileSelected}
                  />
                </div>

                {/* Filter Pills */}
                <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-xs">
                  <span className="text-[11px] font-bold text-gray-400 uppercase">Tampilkan:</span>
                  <div className="flex gap-1">
                    {(["all", "diff", "match"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setFilterStatus(tab)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          filterStatus === tab
                            ? "bg-gray-900 text-white"
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

              {/* Items List */}
              <div className="space-y-2">
                {filteredItems.length === 0 ? (
                  <div className="card p-6 text-center text-xs text-gray-400">
                    Tidak ada item pada filter ini.
                  </div>
                ) : (
                  filteredItems.map((item) => {
                    const isMatch = item.status === "match";
                    const isUnscanned = item.status === "unscanned";
                    const isUnder = item.status === "under";
                    const isOver = item.status === "over";

                    return (
                      <div
                        key={item.key}
                        className={`card p-3 transition-all border ${
                          isMatch
                            ? "border-emerald-200 bg-white"
                            : isUnscanned
                            ? "border-red-300 bg-red-50/40"
                            : isUnder
                            ? "border-amber-300 bg-amber-50/30"
                            : "border-purple-200 bg-purple-50/20"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {/* Status Pill */}
                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                              {isMatch && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  ✓ MATCH (Sesuai)
                                </span>
                              )}
                              {isUnscanned && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white animate-pulse">
                                  🚫 BELUM TER-SCAN
                                </span>
                              )}
                              {isUnder && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-600 text-white">
                                  🔴 KURANG {Math.abs(item.diff)} pcs
                                </span>
                              )}
                              {isOver && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-600 text-white">
                                  🟡 LEBIH +{item.diff} pcs
                                </span>
                              )}

                              {item.confirmedDiscrepancy && !isMatch && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-200 text-gray-700">
                                  ✓ Discrepancy Terkonfirmasi
                                </span>
                              )}
                            </div>

                            <h4 className="text-xs font-bold text-gray-900 leading-snug">
                              {item.product}
                            </h4>
                            <p className="text-[11px] text-gray-500 font-mono mt-0.5">
                              SKU: {item.sku}
                              {item.barcode ? ` · ${item.barcode}` : ""}
                            </p>

                            {/* Batches Breakdown */}
                            {item.batches.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {item.batches.map((b, bIdx) => (
                                  <span
                                    key={bIdx}
                                    className="text-[10px] font-mono bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded border border-gray-200"
                                  >
                                    Lot: {b.batch || "-"} ({b.qty}x)
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Catatan Selisih */}
                            {item.notes && (
                              <p className="text-[11px] text-gray-700 bg-amber-100/70 border border-amber-200 rounded-md px-2 py-1 mt-1.5 font-medium">
                                💬 <em>{item.notes}</em>
                              </p>
                            )}
                          </div>

                          {/* Qty Comparators */}
                          <div className="shrink-0 flex flex-col items-end gap-1.5">
                            <div className="flex items-center gap-2">
                              {/* Fisik */}
                              <div className="text-right">
                                <span className="text-[10px] text-gray-400 font-bold block uppercase">
                                  Fisik
                                </span>
                                <span className="text-sm font-black text-gray-900">
                                  {item.physicalQty}
                                </span>
                              </div>

                              <span className="text-gray-300 font-bold">vs</span>

                              {/* Klaim SJ Input */}
                              <div className="text-right">
                                <span className="text-[10px] text-purple-700 font-bold block uppercase">
                                  Klaim SJ
                                </span>
                                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden bg-white shadow-2xs">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateClaim(item, Math.max(0, item.claimQty - 1))
                                    }
                                    className="px-1.5 py-0.5 text-xs font-bold text-gray-500 hover:bg-gray-100"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    value={item.claimQty}
                                    onChange={(e) =>
                                      handleUpdateClaim(item, Number(e.target.value) || 0)
                                    }
                                    className="w-10 text-center text-xs font-black text-purple-900 py-1 focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateClaim(item, item.claimQty + 1)}
                                    className="px-1.5 py-0.5 text-xs font-bold text-gray-500 hover:bg-gray-100"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Tombol Aksi Cepat per Item */}
                            <div className="flex items-center gap-1 mt-1">
                              {/* Scan ulang bila kurang / belum scan */}
                              {(isUnscanned || isUnder) && item.barcode && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate(
                                      `/return-form?barcode=${encodeURIComponent(item.barcode)}`
                                    )
                                  }
                                  className="text-[11px] font-bold bg-blue-600 text-white px-2 py-1 rounded-lg hover:bg-blue-700 shadow-2xs"
                                >
                                  📷 Scan Barang Ini
                                </button>
                              )}

                              {/* Konfirmasi Selisih */}
                              {!isMatch && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDiscrepancyModalItem(item);
                                    setDiscrepancyNote(item.notes || "");
                                  }}
                                  className="text-[11px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 px-2 py-1 rounded-lg"
                                >
                                  {item.confirmedDiscrepancy ? "Edit Catatan" : "Catat Selisih"}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom Sticky Action Bar */}
              <div className="sticky bottom-3 z-40 bg-white/95 backdrop-blur-md p-3 rounded-2xl border border-gray-200 shadow-xl space-y-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyWhatsApp()}
                    className="flex-1 btn-outline py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                  >
                    <span>📋</span>
                    <span>Salin WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleFinishStoreClick}
                    className="flex-1 btn-primary py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 bg-gray-900 hover:bg-black text-white"
                  >
                    <span>🔒</span>
                    <span>Selesai & Lanjut Toko</span>
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
          {reconHistory.length === 0 ? (
            <div className="card p-8 text-center text-xs text-gray-400">
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
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">{rep.storeName}</h3>
                      <p className="text-[11px] text-gray-500">
                        {rep.noSJ ? `SJ: ${rep.noSJ} · ` : ""}
                        {dateStr} · PIC: {rep.pic} (Sheet {rep.targetSheet})
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        !rep.hasDiscrepancy
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {!rep.hasDiscrepancy ? "✓ PAS (Match)" : `⚠️ ${rep.discrepancySkuCount} Selisih`}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-gray-50 p-2 rounded-xl text-center text-xs font-semibold">
                    <div>
                      <span className="text-[10px] text-gray-400 block font-normal">Fisik</span>
                      <span>{rep.totalPhysicalQty} pcs</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 block font-normal">Klaim SJ</span>
                      <span>{rep.totalClaimQty} pcs</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 block font-normal">Total SKU</span>
                      <span>{rep.totalSku} SKU</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedHistoryReport(
                          selectedHistoryReport?.id === rep.id ? null : rep
                        )
                      }
                      className="font-bold text-blue-600 hover:text-blue-800"
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
                        className="btn-outline py-1 px-2.5 text-[11px] font-bold text-emerald-700 border-emerald-300"
                      >
                        📋 Salin WA
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteHistory(rep.id)}
                        className="text-gray-400 hover:text-red-600 p-1 rounded-md"
                        title="Hapus riwayat ini"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {selectedHistoryReport?.id === rep.id && (
                    <div className="pt-2 border-t border-gray-100 space-y-1.5">
                      <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                        Rincian Item:
                      </h5>
                      {rep.items.map((it, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0 text-xs"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="font-bold text-gray-800 block truncate">
                              {it.product}
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono">
                              {it.sku}
                              {it.notes ? ` · Catatan: ${it.notes}` : ""}
                            </span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-mono font-bold text-gray-800">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="card max-w-sm w-full p-4 space-y-3 bg-white animate-scale-in">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">
                + Tambah SKU dari Lembar SJ
              </h3>
              <button
                type="button"
                onClick={() => setAddSkuModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Pilih produk yang tertera pada lembar SJ tetapi belum pernah di-scan pada kardus fisik.
            </p>

            <form onSubmit={handleAddSkuFromSJ} className="space-y-3">
              <div>
                <label className="label-field">Cari Produk / SKU</label>
                {selectedProductToAdd ? (
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs">
                    <div className="min-w-0 pr-2">
                      <span className="font-bold text-gray-900 block truncate">
                        {selectedProductToAdd.product}
                      </span>
                      <span className="font-mono text-gray-500 text-[10px]">
                        {selectedProductToAdd.sku} · {selectedProductToAdd.barcode}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedProductToAdd(null)}
                      className="text-blue-700 font-bold hover:underline shrink-0"
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
                      <div className="border border-gray-200 rounded-xl max-h-40 overflow-y-auto divide-y divide-gray-100 bg-white shadow-lg">
                        {filteredProductsToAdd.map((p) => (
                          <button
                            key={p.barcode}
                            type="button"
                            onClick={() => setSelectedProductToAdd(p)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs"
                          >
                            <span className="font-bold text-gray-900 block truncate">
                              {p.product}
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono">
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

              <div className="flex gap-2 pt-2 border-t border-gray-100">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="card max-w-sm w-full p-4 space-y-3 bg-white animate-scale-in">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">
                Konfirmasi Selisih Fisik vs Klaim
              </h3>
              <button
                type="button"
                onClick={() => setDiscrepancyModalItem(null)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-900">
              <p className="font-bold">{discrepancyModalItem.product}</p>
              <p className="font-mono text-[11px] text-amber-800">
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
                    className="text-[10px] font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded-md border border-gray-200"
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

            <div className="flex gap-2 pt-2 border-t border-gray-100">
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
                className="flex-1 btn-primary py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="card max-w-sm w-full p-4 space-y-3 bg-white animate-scale-in text-center">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-2xl">
              ⚠️
            </div>

            <h3 className="text-sm font-bold text-gray-900">
              Peringatan: Masih Ada {unconfirmedDiffCount} SKU Selisih!
            </h3>

            <p className="text-xs text-gray-600 text-left bg-red-50 border border-red-100 rounded-xl p-3">
              Ada produk yang jumlah fisiknya tidak sama dengan klaim SJ dan belum Anda beri catatan konfirmasi.
              <br /><br />
              <strong>Mohon periksa kembali kardus fisik Anda</strong> untuk memastikan tidak ada barang yang tertinggal sebelum menutup toko ini.
            </p>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => setGatekeeperOpen(false)}
                className="w-full btn-primary py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
              >
                🔍 Periksa Kembali Kardus Fisik
              </button>

              <button
                type="button"
                onClick={finalizeSession}
                className="w-full btn-outline py-2 text-xs font-bold text-red-600 border-red-200 hover:bg-red-50"
              >
                Tetap Selesaikan & Tandai Selisih Riil
              </button>
            </div>
          </div>
        </div>
      )}
          {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* AI LOADING OVERLAY */}
      {aiLoading && (
        <div className="fixed inset-0 z-60 flex flex-col items-center justify-center p-4 bg-black/60 backdrop-blur-xs text-white text-center space-y-3">
          <div className="w-14 h-14 border-4 border-purple-400 border-t-white rounded-full animate-spin" />
          <div className="space-y-1">
            <h4 className="text-base font-bold">🤖 Gemini AI Membaca Lembar SJ...</h4>
            <p className="text-xs text-purple-200 max-w-xs">
              Mendeteksi nama produk, SKU, dan jumlah klaim dari foto dokumen kertas. Mohon tunggu sebentar...
            </p>
          </div>
        </div>
      )}

      {/* MODAL: INPUT GEMINI API KEY PRIVAT */}
      {geminiKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="card max-w-sm w-full p-4 space-y-3 bg-white animate-scale-in">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div className="flex items-center gap-1.5">
                <span className="text-lg">🔒</span>
                <h3 className="text-sm font-bold text-gray-900">
                  Pengaturan Gemini API Key
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setGeminiKeyModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="text-xs text-gray-600 space-y-2 bg-purple-50 border border-purple-100 rounded-xl p-3">
              <p className="font-semibold text-purple-900">
                🛡️ Privasi & Keamanan Terjamin:
              </p>
              <p>
                API Key ini <strong>TIDAK PERNAH dikirim ke publik/repository</strong> dan hanya tersimpan aman di browser perangkat Anda atau file <code>.env</code> lokal.
              </p>
              <p className="text-[11px] text-gray-500">
                Dapatkan gratis di <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="text-purple-700 underline font-bold">aistudio.google.com</a> (login dengan akun Google Anda → Create API Key).
              </p>
            </div>

            <form onSubmit={handleSaveGeminiKey} className="space-y-3">
              <div>
                <label className="label-field">Masukkan Gemini API Key</label>
                <div className="relative">
                  <input
                    type={showKeyPassword ? "text" : "password"}
                    value={geminiKeyInput}
                    onChange={(e) => setGeminiKeyInput(e.target.value)}
                    placeholder="AIzaSy..."
                    className="input-field text-xs py-2 pr-10 font-mono"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeyPassword(!showKeyPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    {showKeyPassword ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setGeminiKeyModalOpen(false)}
                  className="flex-1 btn-outline py-2 text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 btn-primary py-2 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white"
                >
                  Simpan & Lanjut
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PREVIEW HASIL EKSTRAKSI AI VISION */}
      {aiPreviewOpen && aiExtractedData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="card max-w-md w-full p-4 space-y-3 bg-white animate-scale-in max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-lg">✨</span>
                <h3 className="text-sm font-bold text-gray-900">
                  Hasil Baca Lembar SJ (AI Vision)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAiPreviewOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-xl p-2.5 shrink-0 space-y-1">
              {aiExtractedData.storeName && (
                <p>📍 <strong>Toko terdeteksi:</strong> {aiExtractedData.storeName}</p>
              )}
              {aiExtractedData.noSJ && (
                <p>📄 <strong>No. SJ terdeteksi:</strong> {aiExtractedData.noSJ}</p>
              )}
              <p className="text-purple-700 font-bold">
                Ditemukan {aiExtractedData.items.length} produk pada lembar kertas.
              </p>
            </div>

            {/* List Items Extracted */}
            <div className="overflow-y-auto flex-1 divide-y divide-gray-100 border border-gray-200 rounded-xl">
              {aiExtractedData.items.map((it, idx) => (
                <div key={idx} className="p-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 pr-2">
                    <span className="font-bold text-gray-900 block truncate">
                      {it.product}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      SKU: {it.sku}
                    </span>
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Klaim:</span>
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
                      className="w-14 text-center text-xs font-bold text-purple-900 border border-gray-300 rounded-lg py-1 focus:outline-none"
                    />
                    <span className="text-xs text-gray-500 font-semibold">pcs</span>
                  </div>
                </div>
              ))}
            </div>

            {session && Object.keys(session.claims).length > 0 && (
              <div className="shrink-0 grid grid-cols-2 gap-1.5 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setAiApplyMode("replace")}
                  className={`py-1.5 rounded-lg border ${
                    aiApplyMode === "replace"
                      ? "bg-purple-600 text-white border-purple-600"
                      : "bg-white text-gray-600 border-gray-300"
                  }`}
                >
                  Ganti klaim SKU ini
                </button>
                <button
                  type="button"
                  onClick={() => setAiApplyMode("add")}
                  className={`py-1.5 rounded-lg border ${
                    aiApplyMode === "add"
                      ? "bg-purple-600 text-white border-purple-600"
                      : "bg-white text-gray-600 border-gray-300"
                  }`}
                >
                  Tambah (SJ halaman lanjutan)
                </button>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-gray-100 shrink-0">
              <button
                type="button"
                onClick={() => setAiPreviewOpen(false)}
                className="flex-1 btn-outline py-2 text-xs font-bold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleApplyAiClaims}
                className="flex-1 btn-primary py-2 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white"
              >
                ✓ Terapkan ke Rekonsiliasi
              </button>
            </div>
          </div>
        </div>
      )}

      {matchAllModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <form
            onSubmit={handleConfirmMatchAll}
            className="card max-w-md w-full p-4 space-y-3 bg-white animate-scale-in"
          >
            <h3 className="text-sm font-bold text-gray-900">Samakan Semua Klaim dengan Fisik</h3>
            <p className="text-xs text-gray-600">
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
    </div>
  );
}
