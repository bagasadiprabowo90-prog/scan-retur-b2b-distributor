import { useMemo, useState } from "react";
import { AlertTriangle, Trash2, Search, RefreshCw, MapPin, FileText } from "lucide-react";
import type { ProductItem } from "../../lib/api";
import type { ReconcileItem, StoreSession } from "../../lib/session";
import type { ExtractedSJResult } from "../../lib/gemini";
import Sheet from "../ui/Sheet";
import Button from "../ui/Button";

// 1. Add SKU from SJ Sheet
export function AddSkuSheet({
  open,
  onClose,
  products,
  loadingProducts,
  onAddSku,
}: {
  open: boolean;
  onClose: () => void;
  products: ProductItem[];
  loadingProducts: boolean;
  onAddSku: (product: ProductItem, claimQty: number) => void;
}) {
  const [skuSearch, setSkuSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [claimQty, setClaimQty] = useState("");

  const filteredProducts = useMemo(() => {
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

  const handleClose = () => {
    setSkuSearch("");
    setSelectedProduct(null);
    setClaimQty("");
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    const q = Number(claimQty);
    if (!Number.isFinite(q) || q <= 0) return;
    onAddSku(selectedProduct, q);
    handleClose();
  };

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="Tambah SKU dari Lembar SJ"
      footer={
        <>
          <Button variant="secondary" block onClick={handleClose}>
            Batal
          </Button>
          <Button
            variant="primary"
            block
            disabled={!selectedProduct || !(Number(claimQty) > 0)}
            onClick={() => {
              if (selectedProduct && Number(claimQty) > 0) {
                onAddSku(selectedProduct, Number(claimQty));
                handleClose();
              }
            }}
          >
            Tambahkan ke Rekon
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-xs text-gray-500">
          Pilih produk yang tertera pada lembar SJ tetapi belum pernah di-scan pada kardus fisik.
        </p>

        <div>
          <label className="label-field">Cari Produk / SKU</label>
          {selectedProduct ? (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs">
              <div className="min-w-0 pr-2">
                <span className="font-bold text-gray-900 block truncate">
                  {selectedProduct.product}
                </span>
                <span className="font-mono text-gray-500 text-xs">
                  {selectedProduct.sku} · {selectedProduct.barcode}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
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
                className="input-field text-sm py-2.5"
                autoFocus
              />
              {filteredProducts.length > 0 && (
                <div className="border border-gray-200 rounded-xl max-h-44 overflow-y-auto divide-y divide-gray-100 bg-white shadow-lg">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.barcode}
                      type="button"
                      onClick={() => setSelectedProduct(p)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs"
                    >
                      <span className="font-bold text-gray-900 block truncate">{p.product}</span>
                      <span className="text-xs text-gray-500 font-mono">
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
            value={claimQty}
            onChange={(e) => setClaimQty(e.target.value)}
            placeholder="Mis: 5"
            className="input-field text-sm py-2.5 font-bold"
          />
        </div>
      </form>
    </Sheet>
  );
}

// 2. Discrepancy Note Sheet
const QUICK_NOTE_CHIPS = [
  "Barang tidak dikirim toko",
  "Fisik rusak / pecah",
  "Barang tidak ditemukan di koli",
  "Klaim toko salah hitung",
  "Barang tertukar / beda shade",
];

export function DiscrepancyNoteSheet({
  item,
  note,
  onChangeNote,
  onClose,
  onSave,
}: {
  item: ReconcileItem | null;
  note: string;
  onChangeNote: (val: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title="Konfirmasi Selisih Fisik vs Klaim"
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" block onClick={onSave}>
            Simpan Konfirmasi
          </Button>
        </>
      }
    >
      {item && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
            <p className="font-bold text-sm">{item.product}</p>
            <p className="font-mono text-xs text-amber-800 mt-0.5">
              Fisik: {item.physicalQty} pcs · Klaim: {item.claimQty} pcs (Selisih:{" "}
              {item.diff > 0 ? `+${item.diff}` : item.diff})
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="label-field">Pilih / Ketik Keterangan Selisih:</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {QUICK_NOTE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => onChangeNote(chip)}
                  className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
                    note === chip
                      ? "bg-primary text-white border-primary"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-200"
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>

            <textarea
              value={note}
              onChange={(e) => onChangeNote(e.target.value)}
              placeholder="Tulis alasan selisih..."
              rows={2}
              className="input-field text-sm py-2 w-full"
            />
          </div>
        </div>
      )}
    </Sheet>
  );
}

// 3. Gatekeeper Sheet
export function GatekeeperSheet({
  open,
  unconfirmedDiffCount,
  onClose,
  onFinalize,
}: {
  open: boolean;
  unconfirmedDiffCount: number;
  onClose: () => void;
  onFinalize: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Masih Ada ${unconfirmedDiffCount} SKU Selisih`}
      footer={
        <div className="w-full space-y-2">
          <Button
            variant="primary"
            block
            icon={<Search className="w-4 h-4" />}
            onClick={onClose}
          >
            Periksa Kembali Kardus Fisik
          </Button>
          <Button variant="danger" block onClick={onFinalize}>
            Tetap Selesaikan & Tandai Selisih Riil
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-900 leading-relaxed">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p>
              Ada produk yang jumlah fisiknya tidak sama dengan klaim SJ dan belum Anda beri
              catatan konfirmasi.
            </p>
            <p className="mt-1.5 font-semibold">
              Mohon periksa kembali kardus fisik Anda untuk memastikan tidak ada barang yang
              tertinggal sebelum menutup toko ini.
            </p>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

// 4. Match All Sheet
export function MatchAllSheet({
  open,
  reason,
  onChangeReason,
  onClose,
  onConfirm,
}: {
  open: boolean;
  reason: string;
  onChangeReason: (val: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Samakan Semua Klaim dengan Fisik"
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="primary"
            block
            disabled={!reason.trim()}
            onClick={onConfirm}
          >
            Samakan
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-600 leading-relaxed">
          Jumlah klaim SJ setiap SKU akan diganti dengan hasil scan fisik. Klaim SJ awal dan alasan
          ini dicatat di laporan.
        </p>
        <textarea
          value={reason}
          onChange={(e) => onChangeReason(e.target.value)}
          placeholder="Alasan (wajib), misal: SJ tidak tersedia, dikonfirmasi via telepon dengan toko"
          rows={3}
          autoFocus
          className="input-field text-sm w-full"
        />
      </div>
    </Sheet>
  );
}

// 5. Scanned Items Sheet
export function ScannedItemsSheet({
  open,
  session,
  onClose,
  onSelectToDelete,
}: {
  open: boolean;
  session: StoreSession | null;
  onClose: () => void;
  onSelectToDelete: (item: StoreSession["items"][number]) => void;
}) {
  if (!session) return null;
  const totalPcs = session.items.reduce((s, i) => s + i.qty, 0);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Rincian Hasil Scan Fisik"
      footer={
        <Button variant="secondary" block onClick={onClose}>
          Tutup
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          <strong>{session.storeName}</strong> · Total {totalPcs} pcs ({session.items.length} scan)
        </p>

        <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-xl">
          {session.items.length === 0 ? (
            <div className="p-6 text-center text-xs text-gray-500">
              Belum ada barang fisik yang discan untuk sesi ini.
            </div>
          ) : (
            session.items.map((it, idx) => (
              <div
                key={it.id || idx}
                className="p-2.5 flex items-center justify-between gap-2 text-xs hover:bg-gray-50"
              >
                <div className="min-w-0 pr-2">
                  <span className="font-bold text-gray-900 block truncate">{it.product}</span>
                  <p className="text-xs text-gray-500 font-mono">
                    Lot: {it.batch || "-"} · Exp: {it.expDate || "-"} · {it.qty} pcs
                  </p>
                  <p className="text-xs text-gray-500">
                    {it.barcode} · {it.pic}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectToDelete(it)}
                  className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-red-600 rounded-xl border border-gray-200 hover:border-red-200 hover:bg-red-50 shrink-0 transition-colors"
                  title="Hapus scan ini"
                  aria-label={`Hapus scan ${it.product}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </Sheet>
  );
}

// 6. Store Conflict Sheet
export function StoreConflictSheet({
  open,
  activeStoreName,
  extractedData,
  onClose,
  onSwitchToNewStore,
  onMergeIntoActiveStore,
}: {
  open: boolean;
  activeStoreName?: string;
  extractedData: ExtractedSJResult | null;
  onClose: () => void;
  onSwitchToNewStore: () => void;
  onMergeIntoActiveStore: () => void;
}) {
  if (!extractedData) return null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Toko di Lembar SJ Berbeda"
      footer={
        <div className="w-full space-y-2">
          <Button
            variant="primary"
            block
            icon={<RefreshCw className="w-4 h-4" />}
            onClick={onSwitchToNewStore}
          >
            Buat Sesi Baru untuk Toko di SJ
          </Button>
          <Button variant="secondary" block onClick={onMergeIntoActiveStore}>
            Tetap Gabung ke Sesi Aktif ({activeStoreName})
          </Button>
        </div>
      }
    >
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1.5">
        <p className="flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
          <span>
            <strong>Sesi Aktif:</strong> {activeStoreName}
          </span>
        </p>
        <p className="flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
          <span>
            <strong>Toko di Surat Jalan:</strong> {extractedData.storeName}
          </span>
        </p>
        <p className="text-xs text-amber-800 pt-1 leading-relaxed">
          Surat Jalan yang Anda baca terindikasi milik toko yang berbeda dari sesi scan yang sedang
          berjalan.
        </p>
      </div>
    </Sheet>
  );
}
