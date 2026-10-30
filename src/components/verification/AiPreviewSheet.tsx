import { useMemo, useState } from "react";
import {
  Sparkles,
  AlertTriangle,
  Check,
  MapPin,
  FileText,
  ArrowRight,
} from "lucide-react";
import type { ExtractedSJResult } from "../../lib/gemini";
import type { ProductItem } from "../../lib/api";
import Sheet from "../ui/Sheet";
import Button from "../ui/Button";

type Props = {
  open: boolean;
  onClose: () => void;
  aiExtractedData: ExtractedSJResult | null;
  onUpdateExtractedData: (data: ExtractedSJResult) => void;
  aiApplyMode: "replace" | "add";
  onChangeApplyMode: (mode: "replace" | "add") => void;
  hasExistingClaims: boolean;
  requireMappingConfirm: boolean;
  onApplyClaims: (force: boolean) => void;
  products: ProductItem[];
  onShowToast: (type: "success" | "error", msg: string) => void;
};

export default function AiPreviewSheet({
  open,
  onClose,
  aiExtractedData,
  onUpdateExtractedData,
  aiApplyMode,
  onChangeApplyMode,
  hasExistingClaims,
  requireMappingConfirm,
  onApplyClaims,
  products,
  onShowToast,
}: Props) {
  const [mappingItemIndex, setMappingItemIndex] = useState<number | null>(null);
  const [mappingSearch, setMappingSearch] = useState("");

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

  if (!aiExtractedData) return null;

  const unmappedCount = aiExtractedData.items.filter(
    (it) => it.matchConfidence === "unmatched" || it.matchConfidence === "low"
  ).length;

  const handleSelectProductForMapping = (product: ProductItem) => {
    if (mappingItemIndex === null) return;
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

    onUpdateExtractedData({ ...aiExtractedData, items: updated });
    setMappingItemIndex(null);
    setMappingSearch("");
    onShowToast("success", `Dipetakan ke: ${product.product} (${product.sku})`);
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-purple-600" aria-hidden="true" />
            <span>Hasil Baca Lembar SJ (AI)</span>
          </span>
        }
        footer={
          <>
            <Button variant="secondary" block onClick={onClose}>
              Batal
            </Button>
            <Button
              variant="primary"
              block
              icon={<Check className="w-4 h-4" />}
              onClick={() => onApplyClaims(false)}
            >
              Terapkan ke Rekon
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-xl p-2.5 space-y-1">
            {aiExtractedData.storeName && (
              <p className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden="true" />
                <span>
                  <strong>Toko terdeteksi:</strong> {aiExtractedData.storeName}
                </span>
              </p>
            )}
            {aiExtractedData.noSJ && (
              <p className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden="true" />
                <span>
                  <strong>No. SJ terdeteksi:</strong> {aiExtractedData.noSJ}
                </span>
              </p>
            )}
            <p className="text-purple-700 font-bold">
              {aiExtractedData.pageCount && aiExtractedData.pageCount > 1
                ? `${aiExtractedData.pageCount} halaman digabung · `
                : ""}
              Ditemukan {aiExtractedData.items.length} produk pada lembar kertas.
            </p>
          </div>

          {unmappedCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-2.5 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                <span>Ada {unmappedCount} produk perlu dicek / dipetakan</span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                Produk bertanda kuning/merah belum cocok persis dengan Master. Klik{" "}
                <strong>"Petakan"</strong> agar fisik scan nantinya cocok dan tidak muncul selisih
                dobel.
              </p>
            </div>
          )}

          {/* List Items Extracted */}
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl p-1 space-y-1 max-h-[42vh] overflow-y-auto">
            {aiExtractedData.items.map((it, idx) => {
              const isUnmatched = it.matchConfidence === "unmatched";
              const isLow = it.matchConfidence === "low";
              const isExact = it.matchConfidence === "exact";

              return (
                <div
                  key={idx}
                  className={`p-2.5 rounded-lg flex items-start justify-between gap-2 text-xs border ${
                    isUnmatched
                      ? "bg-red-50/60 border-red-200"
                      : isLow
                      ? "bg-amber-50/60 border-amber-200"
                      : "bg-white border-gray-100"
                  }`}
                >
                  <div className="min-w-0 pr-2 flex-1 space-y-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      {isExact && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-status-match-bg text-status-match">
                          ✓ Master Eksak
                        </span>
                      )}
                      {!isExact && !isLow && !isUnmatched && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-status-match-bg text-status-match">
                          ✓ Cocok ({Math.round((it.matchScore || 1) * 100)}%)
                        </span>
                      )}
                      {isLow && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-status-over-bg text-status-over">
                          ! Perlu Dicek ({Math.round(it.matchScore * 100)}%)
                        </span>
                      )}
                      {isUnmatched && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-status-short-bg text-status-short">
                          ! Tidak di Master
                        </span>
                      )}
                    </div>

                    <span className="font-bold text-gray-900 block truncate leading-snug">
                      {it.product}
                    </span>

                    {it.rawProduct &&
                      it.rawProduct.toLowerCase() !== it.product.toLowerCase() && (
                        <span className="text-xs text-gray-500 block">
                          Teks SJ: <em>"{it.rawProduct}"</em>
                        </span>
                      )}

                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="text-xs text-gray-500 font-mono">
                        SKU: {it.sku || "-"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setMappingItemIndex(idx);
                          setMappingSearch(it.rawProduct || it.product);
                        }}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 underline"
                      >
                        {isUnmatched || isLow ? "Petakan..." : "Ubah..."}
                      </button>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-1 pt-1">
                    <span className="text-xs text-gray-500 font-bold uppercase">Klaim:</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      aria-label={`Klaim untuk ${it.product}`}
                      value={it.claimQty}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value) || 0);
                        const updated = [...aiExtractedData.items];
                        updated[idx].claimQty = val;
                        onUpdateExtractedData({ ...aiExtractedData, items: updated });
                      }}
                      className="w-14 text-center text-sm font-bold text-purple-900 border border-gray-300 rounded-lg py-1.5 tabular-nums focus:outline-none"
                    />
                    <span className="text-xs text-gray-500 font-semibold">pcs</span>
                  </div>
                </div>
              );
            })}
          </div>

          {hasExistingClaims && (
            <div className="grid grid-cols-2 gap-1.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => onChangeApplyMode("replace")}
                className={`min-h-[40px] px-2.5 py-1.5 rounded-xl border transition-colors ${
                  aiApplyMode === "replace"
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-gray-600 border-gray-300"
                }`}
              >
                Ganti klaim SKU ini
              </button>
              <button
                type="button"
                onClick={() => onChangeApplyMode("add")}
                className={`min-h-[40px] px-2.5 py-1.5 rounded-xl border transition-colors ${
                  aiApplyMode === "add"
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-gray-600 border-gray-300"
                }`}
              >
                Tambah (SJ lanjutan)
              </button>
            </div>
          )}

          {requireMappingConfirm && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs space-y-2">
              <p className="font-bold text-red-800">
                Masih ada {unmappedCount} produk belum dipetakan.
              </p>
              <p className="text-xs text-red-600 leading-snug">
                Produk tanpa SKU master berisiko membuat selisih palsu saat barang fisik di-scan.
              </p>
              <Button
                variant="danger"
                block
                onClick={() => onApplyClaims(true)}
              >
                Tetap Terapkan Tanpa Mapping
              </Button>
            </div>
          )}
        </div>
      </Sheet>

      {/* Sheet: Manual Mapping Master Product */}
      <Sheet
        open={mappingItemIndex !== null}
        onClose={() => setMappingItemIndex(null)}
        title="Petakan ke Master Produk"
        footer={
          <Button variant="secondary" block onClick={() => setMappingItemIndex(null)}>
            Batal
          </Button>
        }
      >
        {mappingItemIndex !== null && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Teks SJ:{" "}
              <strong>
                "
                {aiExtractedData.items[mappingItemIndex]?.rawProduct ||
                  aiExtractedData.items[mappingItemIndex]?.product}
                "
              </strong>
            </p>

            <div>
              <label className="label-field">Cari Produk Resmi BLP:</label>
              <input
                type="text"
                value={mappingSearch}
                onChange={(e) => setMappingSearch(e.target.value)}
                placeholder="Ketik nama shade / produk / SKU..."
                className="input-field text-sm py-2.5 w-full"
                autoFocus
              />
            </div>

            <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-xl">
              {filteredProductsForMapping.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-500">
                  Tidak ditemukan produk yang cocok.
                </div>
              ) : (
                filteredProductsForMapping.map((p) => (
                  <button
                    key={p.barcode || p.sku}
                    type="button"
                    onClick={() => handleSelectProductForMapping(p)}
                    className="w-full text-left p-2.5 hover:bg-blue-50/70 transition-colors flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="font-bold text-xs text-gray-900 block truncate">
                        {p.product}
                      </span>
                      <span className="text-xs text-gray-500 font-mono">
                        {p.sku} {p.barcode ? `· ${p.barcode}` : ""}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 shrink-0">
                      <span>Pilih</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}
