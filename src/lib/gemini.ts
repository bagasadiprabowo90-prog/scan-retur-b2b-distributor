import type { ProductItem } from "./api";
import { normalizeSkuKey } from "./session";

const LOCAL_KEY_STORAGE = "scan-retur-user-gemini-key";

export function getGeminiApiKey(): string {
  // 1. Prioritaskan dari environment variable .env (VITE_GEMINI_API_KEY)
  const envKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (envKey && envKey.trim()) return envKey.trim();

  // 2. Fallback ke localStorage privat di browser pengguna
  try {
    const local = localStorage.getItem(LOCAL_KEY_STORAGE);
    if (local && local.trim()) return local.trim();
  } catch {}

  return "";
}

export function saveUserGeminiApiKey(key: string): void {
  try {
    if (!key.trim()) {
      localStorage.removeItem(LOCAL_KEY_STORAGE);
    } else {
      localStorage.setItem(LOCAL_KEY_STORAGE, key.trim());
    }
  } catch (e) {
    console.error("Gagal menyimpan API key lokal", e);
  }
}

export type ExtractedSJResult = {
  ok: boolean;
  storeName?: string;
  noSJ?: string;
  items: {
    sku: string;
    product: string;
    barcode: string;
    claimQty: number;
    rawText?: string;
  }[];
  error?: string;
};

// Mengubah File (Gambar) ke Base64 & kompresi bila resolusi terlalu raksasa
async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, base64] = result.split(",");
      const mimeType = header.match(/:(.*?);/)?.[1] || file.type || "image/jpeg";
      resolve({ base64, mimeType });
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

export async function parseSJWithGemini(
  file: File,
  masterProducts: ProductItem[]
): Promise<ExtractedSJResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return {
      ok: false,
      items: [],
      error: "API Key Gemini belum diatur. Masukkan API key di pengaturan atau file .env.",
    };
  }

  try {
    const { base64, mimeType } = await fileToBase64(file);

    const prompt = `Anda adalah sistem pembaca dokumen gudang untuk brand kosmetik BLP Beauty (By Lizzie Parra).
Tugas Anda adalah mengekstrak data dari foto/scan lembar "Surat Jalan (SJ) Retur" / "Form Retur Toko / Distributor":

Harap cari dan ekstrak:
1. "storeName": Nama toko, distributor, atau event (misal: "Watsons Grand Indonesia", "Sociolla PIM", "Guardian", dll). Jika tidak ditemukan, isi string kosong "".
2. "noSJ": Nomor surat jalan atau nomor dokumen retur jika ada. Jika tidak ada, isi "".
3. "items": Daftar barang retur yang diklaim. Setiap item harus memiliki:
   - "product": Nama produk (misal: "Lip Coat Butter Fudge", "Face Powder Light", "Cover Cushion N20").
   - "sku": Kode SKU jika tertulis di kertas, atau kosongkan "".
   - "claimQty": Jumlah fisik barang yang diklaim retur (angka bulat positif).

Keluarkan HANYA format JSON murni tanpa markdown triple backticks (atau di dalam blok json), dengan format:
{
  "storeName": "...",
  "noSJ": "...",
  "items": [
    { "product": "...", "sku": "...", "claimQty": 10 }
  ]
}`;

    // Coba gemini-2.5-flash terlebih dahulu, fallback ke gemini-3.8-flash
    const models = ["gemini-2.5-flash", "gemini-3.8-flash"];
    let lastError = "";
    let data: any = null;

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
          apiKey
        )}`;

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: mimeType.startsWith("image/") ? mimeType : "image/jpeg",
                      data: base64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Gemini API Error (${response.status}): ${errText}`);
        }

        data = await response.json();
        if (data) break;
      } catch (err: any) {
        lastError = err?.message || String(err);
      }
    }

    if (!data) {
      return {
        ok: false,
        items: [],
        error: `Gagal membaca gambar: ${lastError}`,
      };
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    if (!rawText) {
      return {
        ok: false,
        items: [],
        error: "AI tidak menghasilkan teks dari gambar ini.",
      };
    }

    // Bersihkan kemungkinan markdown code block ```json ... ```
    const cleanJson = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleanJson);

    const extractedItems: ExtractedSJResult["items"] = [];

    if (Array.isArray(parsed.items)) {
      for (const it of parsed.items) {
        const claimQty = Number(it.claimQty) || 0;
        if (claimQty <= 0) continue;

        const rawProduct = String(it.product || "").trim();
        const rawSku = String(it.sku || "").trim();

        // Cocokkan dengan master data produk BLP Beauty
        const matched = findBestMatchProduct(rawProduct, rawSku, masterProducts);

        extractedItems.push({
          sku: matched?.sku || rawSku || normalizeSkuKey(rawSku, rawProduct),
          product: matched?.product || rawProduct || "Produk Retur",
          barcode: matched?.barcode || "",
          claimQty,
          rawText: `${rawProduct} (${claimQty}x)`,
        });
      }
    }

    return {
      ok: true,
      storeName: parsed.storeName || "",
      noSJ: parsed.noSJ || "",
      items: extractedItems,
    };
  } catch (err: any) {
    return {
      ok: false,
      items: [],
      error: `Terjadi kesalahan saat memproses gambar: ${err?.message || String(err)}`,
    };
  }
}

// Helper untuk mencocokkan nama produk dari kertas SJ ke master produk BLP
function findBestMatchProduct(
  name: string,
  sku: string,
  master: ProductItem[]
): ProductItem | null {
  if (master.length === 0) return null;

  const nLower = name.toLowerCase().trim();
  const skuLower = sku.toLowerCase().trim();

  // 1. Cek kecocokan SKU eksak
  if (skuLower) {
    const bySku = master.find((m) => m.sku.toLowerCase() === skuLower);
    if (bySku) return bySku;
  }

  // 2. Cek kecocokan nama produk eksak
  const exact = master.find((m) => m.product.toLowerCase() === nLower);
  if (exact) return exact;

  // 3. Cek apakah nama master terkandung dalam teks atau sebaliknya
  const partial = master.find(
    (m) =>
      nLower.includes(m.product.toLowerCase()) ||
      m.product.toLowerCase().includes(nLower)
  );
  if (partial) return partial;

  return null;
}
