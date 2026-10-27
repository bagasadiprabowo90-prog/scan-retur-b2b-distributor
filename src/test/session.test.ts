import { describe, it, expect, beforeEach } from "vitest";
import {
  startStoreSession,
  getActiveSession,
  saveActiveSession,
  addScannedItemToSession,
  setClaimItem,
  matchAllClaimsWithPhysical,
  confirmDiscrepancy,
  computeReconciliation,
  finishAndArchiveSession,
  getReconHistory,
  formatWhatsAppSummary,
} from "../lib/session";

describe("Store Session & Reconciliation Tests", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should start a new store session", () => {
    const session = startStoreSession("Sociolla PIM", "SJ-001", "Bagas", "27-Okt-2026");
    expect(session.storeName).toBe("Sociolla PIM");
    expect(session.noSJ).toBe("SJ-001");
    expect(session.targetSheet).toBe("Bagas");
    expect(session.items).toEqual([]);

    const active = getActiveSession();
    expect(active?.storeName).toBe("Sociolla PIM");
  });

  it("should add scanned items to the active session", () => {
    startStoreSession("Watsons GI", "SJ-WAT-10", "Bagas", "27-Okt-2026");

    addScannedItemToSession({
      receiveDate: "27-Okt-2026",
      distriEvent: "Watsons GI",
      product: "BLP Lip Coat Butter Fudge",
      barcode: "8991234567890",
      sku: "BLP-LC-BF",
      batch: "LOT01",
      expDate: "Sep 2027",
      qty: 5,
      keterangan: "Ok",
      pic: "Bagas",
      targetSheet: "Bagas",
    });

    addScannedItemToSession({
      receiveDate: "27-Okt-2026",
      distriEvent: "Watsons GI",
      product: "BLP Lip Coat Butter Fudge",
      barcode: "8991234567890",
      sku: "BLP-LC-BF",
      batch: "LOT02",
      expDate: "Oct 2027",
      qty: 5,
      keterangan: "Ok",
      pic: "Bagas",
      targetSheet: "Bagas",
    });

    const active = getActiveSession();
    expect(active?.items.length).toBe(2);

    const recons = computeReconciliation(active!);
    expect(recons.length).toBe(1);
    expect(recons[0].physicalQty).toBe(10);
    expect(recons[0].batches.length).toBe(2);
  });

  it("should detect match, under, unscanned, and over discrepancies", () => {
    startStoreSession("Toko Cantik", "SJ-999", "Bagas", "27-Okt-2026");

    // Scan Item 1: 5 pcs
    addScannedItemToSession({
      receiveDate: "27-Okt-2026",
      distriEvent: "Toko Cantik",
      product: "BLP Lip Coat Butter Fudge",
      barcode: "111",
      sku: "SKU-LC",
      batch: "B1",
      expDate: "2027",
      qty: 5,
      keterangan: "Ok",
      pic: "Bagas",
      targetSheet: "Bagas",
    });

    // Scan Item 2: 3 pcs
    addScannedItemToSession({
      receiveDate: "27-Okt-2026",
      distriEvent: "Toko Cantik",
      product: "BLP Face Powder",
      barcode: "222",
      sku: "SKU-FP",
      batch: "B2",
      expDate: "2027",
      qty: 3,
      keterangan: "Ok",
      pic: "Bagas",
      targetSheet: "Bagas",
    });

    // Set Claim for Item 1 (Match: Klaim = 5)
    setClaimItem("SKU-LC", "BLP Lip Coat Butter Fudge", "111", 5);

    // Set Claim for Item 2 (Under: Klaim = 5, Fisik = 3)
    setClaimItem("SKU-FP", "BLP Face Powder", "222", 5);

    // Set Claim for Item 3 (Unscanned: Klaim = 2, Fisik = 0)
    setClaimItem("SKU-EYE", "BLP Eyeliner", "333", 2);

    const active = getActiveSession();
    const recons = computeReconciliation(active!);

    const itemLC = recons.find((i) => i.sku === "SKU-LC");
    const itemFP = recons.find((i) => i.sku === "SKU-FP");
    const itemEYE = recons.find((i) => i.sku === "SKU-EYE");

    expect(itemLC?.status).toBe("match");
    expect(itemLC?.diff).toBe(0);

    expect(itemFP?.status).toBe("under");
    expect(itemFP?.diff).toBe(-2);

    expect(itemEYE?.status).toBe("unscanned");
    expect(itemEYE?.physicalQty).toBe(0);
    expect(itemEYE?.claimQty).toBe(2);
    expect(itemEYE?.diff).toBe(-2);
  });

  it("should match all claims with physical when matchAllClaimsWithPhysical is called", () => {
    startStoreSession("Sociolla", "SJ-01", "Bagas", "27-Okt-2026");
    addScannedItemToSession({
      receiveDate: "27-Okt-2026",
      distriEvent: "Sociolla",
      product: "Lip Coat",
      barcode: "123",
      sku: "SKU-1",
      batch: "B1",
      expDate: "2027",
      qty: 8,
      keterangan: "Ok",
      pic: "Bagas",
      targetSheet: "Bagas",
    });

    matchAllClaimsWithPhysical();

    const active = getActiveSession();
    const recons = computeReconciliation(active!);
    expect(recons[0].status).toBe("match");
    expect(recons[0].claimQty).toBe(8);
  });

  it("should confirm discrepancy with notes", () => {
    startStoreSession("Guardian", "SJ-02", "Bagas", "27-Okt-2026");
    setClaimItem("SKU-X", "Product X", "999", 5);

    confirmDiscrepancy("SKU-X", "Barang tidak dikirim toko");

    const active = getActiveSession();
    expect(active?.claims["SKU-X"].confirmedDiscrepancy).toBe(true);
    expect(active?.claims["SKU-X"].notes).toBe("Barang tidak dikirim toko");
  });

  it("should archive session and clear active session", () => {
    startStoreSession("Sephora", "SJ-03", "Dimas", "27-Okt-2026");
    addScannedItemToSession({
      receiveDate: "27-Okt-2026",
      distriEvent: "Sephora",
      product: "Lip Coat",
      barcode: "123",
      sku: "SKU-1",
      batch: "B1",
      expDate: "2027",
      qty: 10,
      keterangan: "Ok",
      pic: "Dimas",
      targetSheet: "Dimas",
    });
    setClaimItem("SKU-1", "Lip Coat", "123", 10);

    const active = getActiveSession();
    const recons = computeReconciliation(active!);

    const report = finishAndArchiveSession("Dimas", recons);
    expect(report).not.toBeNull();
    expect(report?.storeName).toBe("Sephora");
    expect(report?.hasDiscrepancy).toBe(false);

    // Active session should now be null
    expect(getActiveSession()).toBeNull();

    // Recon history should have 1 item
    const history = getReconHistory();
    expect(history.length).toBe(1);
    expect(history[0].storeName).toBe("Sephora");
  });

  it("should format WhatsApp report correctly", () => {
    const text = formatWhatsAppSummary({
      storeName: "Watsons GI",
      noSJ: "SJ-100",
      receiveDate: "27-Okt-2026",
      pic: "Bagas",
      targetSheet: "Bagas",
      totalPhysicalQty: 10,
      totalClaimQty: 12,
      items: [
        {
          key: "SKU-1",
          sku: "SKU-1",
          product: "Lip Coat",
          barcode: "123",
          physicalQty: 10,
          claimQty: 12,
          diff: -2,
          status: "under",
          confirmedDiscrepancy: true,
          notes: "Fisik kurang 2 dari toko",
          batches: [],
        },
      ],
    });

    expect(text).toContain("REKONSILIASI SCAN RETUR");
    expect(text).toContain("Watsons GI");
    expect(text).toContain("SJ-100");
    expect(text).toContain("Fisik kurang 2 dari toko");
  });
});
