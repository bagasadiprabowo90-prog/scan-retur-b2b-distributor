import type { ProductItem } from "./api";
import { parseSJViaBackend } from "./api";
import { normalizeSkuKey } from "./session";

export type MatchConfidence = "exact" | "high" | "low" | "unmatched";

export type ExtractedSJItem = {
  sku: string;
  product: string;
  barcode: string;
  claimQty: number;
  rawProduct: string;
  rawSku: string;
  rawText?: string;
  matchScore: number; // 0.0 - 1.0
  matchConfidence: MatchConfidence;
  matchedFromMaster: boolean;
};

export type ExtractedSJResult = {
  ok: boolean;
  storeName?: string;
  noSJ?: string;
  items: ExtractedSJItem[];
  error?: string;
  pageCount?: number;
};

// ============================================================
// KOMPRESI GAMBAR
// Resize ke sisi terpanjang ~1600px, JPEG kualitas 0.8 via canvas.
// Foto HP 3–8 MB → ~200–400 KB.
// ============================================================

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

export async function compressImage(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context tidak tersedia"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      const base64 = dataUrl.split(",")[1];
      resolve({ base64, mimeType: "image/jpeg" });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gagal memuat gambar untuk kompresi"));
    };

    img.src = url;
  });
}

export async function fileToBase64Raw(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, base64] = result.split(",");
      const mimeType = header.match(/:(.*?);/)?.[1] || file.type || "application/octet-stream";
      resolve({ base64, mimeType });
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

// ============================================================
// ALGORITMA PENCOCOKAN PRODUK & SKOR KEMIRIPAN (WORD-LEVEL)
// Mencegah "Lip Coat" salah cocok ke sembarang shade.
// Menghitung token overlap, precision, recall, dan string distance.
// ============================================================

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(normalizeWord)
    .filter((w) => w.length > 0 && w !== "blp" && w !== "beauty");
}

export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const maxLen = Math.max(m, n);
  return (maxLen - dp[m][n]) / maxLen;
}

export type ProductMatchResult = {
  product: ProductItem | null;
  score: number;
  confidence: MatchConfidence;
};

export function findBestMatchProductWithScore(
  name: string,
  sku: string,
  master: ProductItem[]
): ProductMatchResult {
  if (!master || master.length === 0) {
    return { product: null, score: 0, confidence: "unmatched" };
  }

  const cleanSku = (sku || "").trim().toLowerCase();
  const cleanName = (name || "").trim().toLowerCase();

  // 1. Cek kecocokan SKU eksak dari master
  if (cleanSku) {
    const bySku = master.find((m) => m.sku.toLowerCase() === cleanSku);
    if (bySku) {
      return { product: bySku, score: 1.0, confidence: "exact" };
    }
  }

  // 2. Cek kecocokan nama produk eksak
  if (cleanName) {
    const exactName = master.find((m) => m.product.toLowerCase() === cleanName);
    if (exactName) {
      return { product: exactName, score: 1.0, confidence: "exact" };
    }
  }

  const inputTokens = tokenize(name);
  if (inputTokens.length === 0) {
    return { product: null, score: 0, confidence: "unmatched" };
  }

  let bestMatch: ProductItem | null = null;
  let highestScore = 0;

  for (const item of master) {
    const masterTokens = tokenize(item.product);
    if (masterTokens.length === 0) continue;

    // Hitung berapa token input yang cocok dengan token master
    let matchedInputCount = 0;
    const usedMasterIndices = new Set<number>();

    for (const inToken of inputTokens) {
      let bestTokenSim = 0;
      let bestIndex = -1;

      for (let j = 0; j < masterTokens.length; j++) {
        if (usedMasterIndices.has(j)) continue;
        const sim = levenshteinSimilarity(inToken, masterTokens[j]);
        if (sim > bestTokenSim) {
          bestTokenSim = sim;
          bestIndex = j;
        }
      }

      // Toleransi typo ringan per kata (>= 0.82)
      if (bestTokenSim >= 0.82 && bestIndex !== -1) {
        matchedInputCount += bestTokenSim;
        usedMasterIndices.add(bestIndex);
      }
    }

    const precision = matchedInputCount / masterTokens.length;
    const recall = matchedInputCount / inputTokens.length;

    let f1 = 0;
    if (precision + recall > 0) {
      f1 = (2 * precision * recall) / (precision + recall);
    }

    // Skor string global untuk tie-breaker
    const globalDist = levenshteinSimilarity(
      inputTokens.join(" "),
      masterTokens.join(" ")
    );
    const combinedScore = f1 * 0.75 + globalDist * 0.25;

    if (combinedScore > highestScore) {
      highestScore = combinedScore;
      bestMatch = item;
    }
  }

  const roundedScore = Math.round(highestScore * 100) / 100;

  let confidence: MatchConfidence = "unmatched";
  if (roundedScore >= 0.82) {
    confidence = "high";
  } else if (roundedScore >= 0.50) {
    confidence = "low";
  } else {
    confidence = "unmatched";
    bestMatch = null;
  }

  return {
    product: bestMatch,
    score: roundedScore,
    confidence,
  };
}

// Backward-compatible wrapper
export function findBestMatchProduct(
  name: string,
  sku: string,
  master: ProductItem[]
): ProductItem | null {
  const result = findBestMatchProductWithScore(name, sku, master);
  return result.product;
}

// ============================================================
// PARSE SATU FILE LEMBAR SJ
// ============================================================

async function parseSingleFile(
  file: File,
  masterProducts: ProductItem[]
): Promise<{
  storeName: string;
  noSJ: string;
  items: ExtractedSJItem[];
}> {
  let base64: string;
  let mimeType: string;

  const isPDF = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (isPDF) {
    const raw = await fileToBase64Raw(file);
    base64 = raw.base64;
    mimeType = "application/pdf";
  } else {
    try {
      const compressed = await compressImage(file);
      base64 = compressed.base64;
      mimeType = compressed.mimeType;
    } catch (e) {
      console.warn("Kompresi canvas gagal, fallback ke raw base64:", e);
      const raw = await fileToBase64Raw(file);
      base64 = raw.base64;
      mimeType = raw.mimeType || "image/jpeg";
    }
  }

  // Kirim daftar SKU & nama produk ke backend agar AI mencocokkan langsung
  const masterList = masterProducts.slice(0, 250).map((p) => ({
    sku: p.sku,
    product: p.product,
  }));

  const result = await parseSJViaBackend(mimeType, base64, masterList);

  if (!result.ok) {
    throw new Error(result.error || `Gagal membaca file ${file.name}`);
  }

  const items: ExtractedSJItem[] = [];

  if (Array.isArray(result.items)) {
    for (const it of result.items) {
      const claimQty = Number(it.claimQty) || 0;
      if (claimQty <= 0) continue;

      const rawProduct = String(it.product || "").trim();
      const rawSku = String(it.sku || "").trim();

      const match = findBestMatchProductWithScore(rawProduct, rawSku, masterProducts);
      const matched = match.product;

      items.push({
        sku: matched?.sku || rawSku || normalizeSkuKey(rawSku, rawProduct),
        product: matched?.product || rawProduct || "Produk Retur",
        barcode: matched?.barcode || "",
        claimQty,
        rawProduct,
        rawSku,
        rawText: `${rawProduct} (${claimQty}x)`,
        matchScore: match.score,
        matchConfidence: match.confidence,
        matchedFromMaster: !!matched,
      });
    }
  }

  return {
    storeName: result.storeName || "",
    noSJ: result.noSJ || "",
    items,
  };
}

// ============================================================
// PARSE SJ DENGAN DUKUNGAN MULTI-GAMBAR / MULTI-HALAMAN
// Menggabungkan beberapa foto SJ dan menjumlahkan klaimnya.
// ============================================================

export async function parseSJWithGemini(
  input: File | File[],
  masterProducts: ProductItem[],
  onProgress?: (current: number, total: number, message: string) => void
): Promise<ExtractedSJResult> {
  const files = Array.isArray(input) ? input : [input];
  if (files.length === 0) {
    return { ok: false, items: [], error: "Tidak ada file yang dipilih." };
  }

  try {
    let finalStoreName = "";
    let finalNoSJ = "";
    const combinedMap = new Map<string, ExtractedSJItem>();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (onProgress) {
        onProgress(
          i + 1,
          files.length,
          files.length > 1
            ? `Membaca halaman ${i + 1} dari ${files.length} (${file.name})...`
            : `Menganalisis dokumen (${file.name})...`
        );
      }

      const pageResult = await parseSingleFile(file, masterProducts);

      if (!finalStoreName && pageResult.storeName) {
        finalStoreName = pageResult.storeName;
      }
      if (!finalNoSJ && pageResult.noSJ) {
        finalNoSJ = pageResult.noSJ;
      }

      // Gabungkan dan jumlahkan item berdasarkan SKU / key unik
      for (const item of pageResult.items) {
        const itemKey = item.sku || normalizeSkuKey(item.sku, item.product);
        const existing = combinedMap.get(itemKey);

        if (existing) {
          existing.claimQty += item.claimQty;
          // Perbarui score jika halaman berikutnya memiliki kecocokan yang lebih tinggi
          if (item.matchScore > existing.matchScore) {
            existing.product = item.product;
            existing.barcode = item.barcode;
            existing.matchScore = item.matchScore;
            existing.matchConfidence = item.matchConfidence;
            existing.matchedFromMaster = item.matchedFromMaster;
          }
        } else {
          combinedMap.set(itemKey, { ...item });
        }
      }
    }

    const items = Array.from(combinedMap.values());

    return {
      ok: true,
      storeName: finalStoreName,
      noSJ: finalNoSJ,
      items,
      pageCount: files.length,
    };
  } catch (err: any) {
    return {
      ok: false,
      items: [],
      error: `Terjadi kesalahan saat memproses dokumen: ${err?.message || String(err)}`,
    };
  }
}
