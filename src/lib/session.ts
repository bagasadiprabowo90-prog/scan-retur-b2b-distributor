export type ScannedSessionItem = {
  id: string;
  receiveDate: string;
  distriEvent: string;
  product: string;
  barcode: string;
  sku: string;
  batch: string;
  expDate: string;
  qty: number;
  keterangan: string;
  pic: string;
  targetSheet: "Bagas" | "Dimas";
  timestamp: number;
};

export type ClaimItem = {
  sku: string;
  product: string;
  barcode?: string;
  claimQty: number;
  confirmedDiscrepancy?: boolean;
  notes?: string;
};

export type StoreSession = {
  id: string;
  storeName: string;
  noSJ: string;
  targetSheet: "Bagas" | "Dimas";
  receiveDate: string;
  startedAt: number;
  items: ScannedSessionItem[];
  claims: Record<string, ClaimItem>; // keyed by SKU (normalized)
  status: "active" | "verified";
};

export type ReconcileItem = {
  key: string;
  sku: string;
  product: string;
  barcode: string;
  physicalQty: number;
  claimQty: number;
  diff: number; // physicalQty - claimQty
  status: "match" | "under" | "unscanned" | "over";
  confirmedDiscrepancy: boolean;
  notes: string;
  batches: { batch: string; expDate: string; qty: number }[];
};

export type SavedReconReport = {
  id: string;
  storeName: string;
  noSJ: string;
  targetSheet: "Bagas" | "Dimas";
  receiveDate: string;
  verifiedAt: number;
  pic: string;
  totalPhysicalQty: number;
  totalClaimQty: number;
  totalSku: number;
  matchSkuCount: number;
  discrepancySkuCount: number;
  hasDiscrepancy: boolean;
  items: ReconcileItem[];
};

const ACTIVE_SESSION_KEY = "scan-retur-active-store-session";
const RECON_HISTORY_KEY = "scan-retur-recon-history";

export function normalizeSkuKey(sku?: string, product?: string, barcode?: string): string {
  if (sku && sku.trim()) return sku.trim().toUpperCase();
  if (barcode && barcode.trim()) return barcode.trim().toUpperCase();
  if (product && product.trim()) return product.trim().toUpperCase();
  return "UNKNOWN";
}

// ----------------------------------------------------
// Active Session Helpers
// ----------------------------------------------------

export function getActiveSession(): StoreSession | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveActiveSession(session: StoreSession | null): void {
  try {
    if (!session) {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    } else {
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
    }
  } catch (e) {
    console.error("Failed to save active session", e);
  }
}

export function startStoreSession(
  storeName: string,
  noSJ: string = "",
  targetSheet: "Bagas" | "Dimas" = "Bagas",
  receiveDate: string = ""
): StoreSession {
  const existing = getActiveSession();
  // Jika sudah ada sesi aktif untuk toko yang sama, perbarui metadata tapi pertahankan item
  if (existing && existing.storeName.trim().toLowerCase() === storeName.trim().toLowerCase()) {
    const updated: StoreSession = {
      ...existing,
      noSJ: noSJ || existing.noSJ,
      targetSheet,
      receiveDate: receiveDate || existing.receiveDate,
    };
    saveActiveSession(updated);
    return updated;
  }

  const session: StoreSession = {
    id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    storeName: storeName.trim(),
    noSJ: noSJ.trim(),
    targetSheet,
    receiveDate: receiveDate.trim(),
    startedAt: Date.now(),
    items: [],
    claims: {},
    status: "active",
  };
  saveActiveSession(session);
  return session;
}

function sameStoreName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Mengembalikan nama toko sesi aktif bila berbeda dengan distriEvent, null bila aman
export function getSessionStoreConflict(distriEvent: string): string | null {
  const session = getActiveSession();
  if (!session || !session.storeName.trim()) return null;
  return sameStoreName(session.storeName, distriEvent) ? null : session.storeName;
}

export function addScannedItemToSession(
  item: Omit<ScannedSessionItem, "id" | "timestamp">
): StoreSession {
  let session = getActiveSession();
  if (session && session.storeName.trim() && !sameStoreName(session.storeName, item.distriEvent)) {
    throw new Error(
      `Sesi aktif milik toko "${session.storeName}", bukan "${item.distriEvent}". Selesaikan sesi toko tersebut dulu.`
    );
  }
  if (!session) {
    // Buat sesi otomatis jika belum ada
    session = startStoreSession(item.distriEvent, "", item.targetSheet, item.receiveDate);
  }

  const newItem: ScannedSessionItem = {
    ...item,
    id: `scan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  };

  const updatedItems = [...session.items, newItem];
  const updated: StoreSession = {
    ...session,
    items: updatedItems,
  };

  saveActiveSession(updated);
  return updated;
}

export function removeScannedItemFromSession(itemId: string): StoreSession | null {
  const session = getActiveSession();
  if (!session) return null;
  const updated: StoreSession = {
    ...session,
    items: session.items.filter((i) => i.id !== itemId),
  };
  saveActiveSession(updated);
  return updated;
}

export function setClaimItem(
  sku: string,
  product: string,
  barcode: string,
  claimQty: number,
  notes?: string
): StoreSession | null {
  const session = getActiveSession();
  if (!session) return null;

  const key = normalizeSkuKey(sku, product, barcode);
  const existing = session.claims[key] || {
    sku,
    product,
    barcode,
    claimQty: 0,
    confirmedDiscrepancy: false,
    notes: "",
  };

  const updatedClaims = {
    ...session.claims,
    [key]: {
      ...existing,
      sku: sku || existing.sku,
      product: product || existing.product,
      barcode: barcode || existing.barcode,
      claimQty: Math.max(0, claimQty),
      notes: notes !== undefined ? notes : existing.notes,
    },
  };

  const updated: StoreSession = {
    ...session,
    claims: updatedClaims,
  };
  saveActiveSession(updated);
  return updated;
}

// Terapkan klaim hasil baca SJ sekaligus. Baris dengan SKU sama dijumlahkan.
// mode "replace": klaim SKU tersebut diganti; mode "add": ditambahkan ke klaim yang ada (SJ halaman lanjutan).
export function applyClaimItems(
  items: { sku: string; product: string; barcode: string; claimQty: number }[],
  mode: "replace" | "add" = "replace"
): StoreSession | null {
  const session = getActiveSession();
  if (!session) return null;

  const aggregated = new Map<string, { sku: string; product: string; barcode: string; claimQty: number }>();
  for (const it of items) {
    const qty = Math.max(0, Number(it.claimQty) || 0);
    if (qty <= 0) continue;
    const key = normalizeSkuKey(it.sku, it.product, it.barcode);
    const existing = aggregated.get(key);
    if (existing) {
      existing.claimQty += qty;
    } else {
      aggregated.set(key, { ...it, claimQty: qty });
    }
  }

  const updatedClaims = { ...session.claims };
  for (const [key, it] of aggregated) {
    const prev = updatedClaims[key];
    const baseQty = mode === "add" && prev ? prev.claimQty : 0;
    updatedClaims[key] = {
      sku: it.sku || prev?.sku || "",
      product: it.product || prev?.product || "",
      barcode: it.barcode || prev?.barcode || "",
      claimQty: baseQty + it.claimQty,
      confirmedDiscrepancy: false,
      notes: prev?.notes || "",
    };
  }

  const updated: StoreSession = { ...session, claims: updatedClaims };
  saveActiveSession(updated);
  return updated;
}

export function confirmDiscrepancy(skuKey: string, notes: string): StoreSession | null {
  const session = getActiveSession();
  if (!session) return null;

  const existing = session.claims[skuKey];
  if (!existing) return session;

  const updatedClaims = {
    ...session.claims,
    [skuKey]: {
      ...existing,
      confirmedDiscrepancy: true,
      notes: notes.trim(),
    },
  };

  const updated: StoreSession = {
    ...session,
    claims: updatedClaims,
  };
  saveActiveSession(updated);
  return updated;
}

// Menyamakan klaim dengan fisik wajib disertai alasan. Klaim SJ awal dicatat di notes
// agar selisih asli tetap terlihat di laporan.
export function matchAllClaimsWithPhysical(reason: string): StoreSession | null {
  const session = getActiveSession();
  if (!session) return null;
  const trimmedReason = reason.trim();
  if (!trimmedReason) return null;

  // Hitung total fisik per SKU
  const physicalTotals: Record<string, { qty: number; product: string; sku: string; barcode: string }> = {};
  for (const item of session.items) {
    const key = normalizeSkuKey(item.sku, item.product, item.barcode);
    if (!physicalTotals[key]) {
      physicalTotals[key] = {
        qty: 0,
        product: item.product,
        sku: item.sku || item.barcode,
        barcode: item.barcode,
      };
    }
    physicalTotals[key].qty += item.qty;
  }

  const updatedClaims: Record<string, ClaimItem> = { ...session.claims };
  for (const [key, val] of Object.entries(physicalTotals)) {
    const prev = updatedClaims[key];
    if (prev && prev.claimQty === val.qty) continue;

    const originalClaim = prev ? `${prev.claimQty}` : "tidak ada di SJ";
    const autoNote = `Disamakan manual (klaim SJ awal: ${originalClaim}). Alasan: ${trimmedReason}`;
    updatedClaims[key] = {
      sku: val.sku,
      product: val.product,
      barcode: val.barcode,
      claimQty: val.qty,
      confirmedDiscrepancy: true,
      notes: prev?.notes ? `${prev.notes} | ${autoNote}` : autoNote,
    };
  }

  const updated: StoreSession = {
    ...session,
    claims: updatedClaims,
  };
  saveActiveSession(updated);
  return updated;
}

// ----------------------------------------------------
// Reconciliation Calculation
// ----------------------------------------------------

export function computeReconciliation(session: StoreSession): ReconcileItem[] {
  // 1. Group physical items by normalized SKU key
  const physicalMap = new Map<
    string,
    {
      sku: string;
      product: string;
      barcode: string;
      qty: number;
      batches: { batch: string; expDate: string; qty: number }[];
    }
  >();

  for (const item of session.items) {
    const key = normalizeSkuKey(item.sku, item.product, item.barcode);
    const existing = physicalMap.get(key);
    if (!existing) {
      physicalMap.set(key, {
        sku: item.sku || item.barcode || item.product,
        product: item.product,
        barcode: item.barcode,
        qty: item.qty,
        batches: [{ batch: item.batch, expDate: item.expDate, qty: item.qty }],
      });
    } else {
      existing.qty += item.qty;
      existing.batches.push({ batch: item.batch, expDate: item.expDate, qty: item.qty });
    }
  }

  // 2. Gabungkan dengan Klaim
  const allKeys = new Set<string>([...physicalMap.keys(), ...Object.keys(session.claims)]);
  const results: ReconcileItem[] = [];

  for (const key of allKeys) {
    const phys = physicalMap.get(key);
    const claim = session.claims[key];

    const physicalQty = phys?.qty || 0;
    // Jika belum diinput di claims tapi ada fisik, default claimQty = 0 (belum diverifikasi)
    // Kecuali user sudah set claimQty
    const claimQty = claim !== undefined ? claim.claimQty : 0;
    const isClaimSpecified = claim !== undefined;

    const diff = physicalQty - claimQty;
    let status: "match" | "under" | "unscanned" | "over" = "match";

    if (!isClaimSpecified) {
      // Belum dicek dengan SJ
      status = "over"; // dianggap fisik lebih / belum ada klaim SJ
    } else if (physicalQty === claimQty) {
      status = "match";
    } else if (physicalQty === 0 && claimQty > 0) {
      status = "unscanned";
    } else if (physicalQty < claimQty) {
      status = "under";
    } else if (physicalQty > claimQty) {
      status = "over";
    }

    results.push({
      key,
      sku: phys?.sku || claim?.sku || key,
      product: phys?.product || claim?.product || "Produk Tanpa Nama",
      barcode: phys?.barcode || claim?.barcode || "",
      physicalQty,
      claimQty,
      diff,
      status,
      confirmedDiscrepancy: claim?.confirmedDiscrepancy || false,
      notes: claim?.notes || "",
      batches: phys?.batches || [],
    });
  }

  // Urutkan: yang belum scan (unscanned) dan under paling atas, lalu over, lalu match
  const statusPriority: Record<string, number> = {
    unscanned: 1,
    under: 2,
    over: 3,
    match: 4,
  };

  return results.sort((a, b) => {
    const prioDiff = (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99);
    if (prioDiff !== 0) return prioDiff;
    return a.product.localeCompare(b.product);
  });
}

// ----------------------------------------------------
// Complete & Archive Session
// ----------------------------------------------------

export function finishAndArchiveSession(
  pic: string,
  reconcileItems: ReconcileItem[]
): SavedReconReport | null {
  const session = getActiveSession();
  if (!session) return null;

  const totalPhysicalQty = reconcileItems.reduce((acc, i) => acc + i.physicalQty, 0);
  const totalClaimQty = reconcileItems.reduce((acc, i) => acc + i.claimQty, 0);
  const matchCount = reconcileItems.filter((i) => i.status === "match").length;
  const discCount = reconcileItems.length - matchCount;

  const report: SavedReconReport = {
    id: `recon_${Date.now()}`,
    storeName: session.storeName,
    noSJ: session.noSJ,
    targetSheet: session.targetSheet,
    receiveDate: session.receiveDate,
    verifiedAt: Date.now(),
    pic,
    totalPhysicalQty,
    totalClaimQty,
    totalSku: reconcileItems.length,
    matchSkuCount: matchCount,
    discrepancySkuCount: discCount,
    hasDiscrepancy: discCount > 0,
    items: reconcileItems,
  };

  saveReconReport(report);
  saveActiveSession(null); // Hapus sesi aktif agar siap untuk toko baru
  return report;
}

export function getReconHistory(): SavedReconReport[] {
  try {
    const raw = localStorage.getItem(RECON_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveReconReport(report: SavedReconReport): void {
  try {
    const list = getReconHistory();
    list.unshift(report);
    // Simpan maksimal 50 riwayat rekon toko terakhir
    localStorage.setItem(RECON_HISTORY_KEY, JSON.stringify(list.slice(0, 50)));
  } catch (e) {
    console.error("Failed to save recon history", e);
  }
}

export function deleteReconReport(id: string): void {
  try {
    const list = getReconHistory().filter((r) => r.id !== id);
    localStorage.setItem(RECON_HISTORY_KEY, JSON.stringify(list));
  } catch {}
}

export function formatWhatsAppSummary(report: {
  storeName: string;
  noSJ?: string;
  receiveDate: string;
  pic: string;
  targetSheet: string;
  totalPhysicalQty: number;
  totalClaimQty: number;
  items: ReconcileItem[];
}): string {
  const totalDiff = report.totalPhysicalQty - report.totalClaimQty;
  const matchItems = report.items.filter((i) => i.status === "match");
  const discItems = report.items.filter((i) => i.status !== "match");

  let text = `📦 *REKONSILIASI SCAN RETUR*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📍 *Toko / Distri:* ${report.storeName}\n`;
  if (report.noSJ) text += `📄 *No. SJ Retur:* ${report.noSJ}\n`;
  text += `📅 *Tanggal:* ${report.receiveDate}\n`;
  text += `👤 *PIC:* ${report.pic} (Sheet: ${report.targetSheet})\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📊 *RINGKASAN TOTAL:*\n`;
  text += `• Total Fisik Scan : *${report.totalPhysicalQty} pcs*\n`;
  text += `• Total Klaim SJ   : *${report.totalClaimQty} pcs*\n`;
  text += `• Status Selisih   : *${totalDiff === 0 ? "✅ PAS (0)" : (totalDiff > 0 ? `+${totalDiff} (Lebih)` : `${totalDiff} (Kurang)`)}*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;

  if (discItems.length > 0) {
    text += `⚠️ *DAFTAR ITEM SELISIH (${discItems.length} SKU):*\n`;
    discItems.forEach((item, idx) => {
      const diffStr = item.diff > 0 ? `+${item.diff}` : `${item.diff}`;
      const statusLabel =
        item.status === "unscanned"
          ? "🚫 Belum Ter-scan"
          : item.status === "under"
          ? "🔴 Fisik Kurang"
          : "🟡 Fisik Lebih";

      text += `${idx + 1}. *${item.product}*\n`;
      text += `   SKU: \`${item.sku}\`\n`;
      text += `   Fisik: ${item.physicalQty} | Klaim SJ: ${item.claimQty} (Diff: *${diffStr}*)\n`;
      text += `   Status: ${statusLabel}\n`;
      if (item.notes) {
        text += `   Catatan: _${item.notes}_\n`;
      }
      text += `\n`;
    });
  }

  if (matchItems.length > 0) {
    text += `✅ *ITEM SESUAI / MATCH (${matchItems.length} SKU):*\n`;
    matchItems.forEach((item, idx) => {
      text += `${idx + 1}. ${item.product} - *${item.physicalQty} pcs*\n`;
      if (item.notes) {
        text += `   Catatan: _${item.notes}_\n`;
      }
    });
  }

  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `_Dibuat otomatis oleh Scan Retur BLP Beauty_`;
  return text;
}
