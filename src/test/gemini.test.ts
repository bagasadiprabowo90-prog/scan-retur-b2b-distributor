import { describe, it, expect } from "vitest";
import {
  findBestMatchProductWithScore,
  findBestMatchProduct,
  levenshteinSimilarity,
} from "../lib/gemini";
import type { ProductItem } from "../lib/api";

const mockMasterProducts: ProductItem[] = [
  {
    sku: "BLP-LC-BF",
    product: "Lip Coat Butter Fudge",
    barcode: "899123456001",
  },
  {
    sku: "BLP-LC-PP",
    product: "Lip Coat Peppermint Pink",
    barcode: "899123456002",
  },
  {
    sku: "BLP-LC-CR",
    product: "Lip Coat Caramel",
    barcode: "899123456003",
  },
  {
    sku: "BLP-FP-LT",
    product: "Face Powder Light",
    barcode: "899123456004",
  },
  {
    sku: "BLP-FP-MD",
    product: "Face Powder Medium",
    barcode: "899123456005",
  },
  {
    sku: "BLP-CC-N20",
    product: "Cover Cushion N20",
    barcode: "899123456006",
  },
];

describe("Gemini Product Matching & Similarity Tests", () => {
  it("should calculate correct levenshtein similarity", () => {
    expect(levenshteinSimilarity("butter", "butter")).toBe(1.0);
    expect(levenshteinSimilarity("", "butter")).toBe(0.0);
    expect(levenshteinSimilarity("butter", "buter")).toBeGreaterThan(0.8);
  });

  it("should match exact SKU immediately with score 1.0", () => {
    const res = findBestMatchProductWithScore("", "BLP-LC-PP", mockMasterProducts);
    expect(res.confidence).toBe("exact");
    expect(res.score).toBe(1.0);
    expect(res.product?.product).toBe("Lip Coat Peppermint Pink");
  });

  it("should match exact product name immediately with score 1.0", () => {
    const res = findBestMatchProductWithScore(
      "Lip Coat Caramel",
      "",
      mockMasterProducts
    );
    expect(res.confidence).toBe("exact");
    expect(res.score).toBe(1.0);
    expect(res.product?.sku).toBe("BLP-LC-CR");
  });

  it("should distinguish shades and NOT match generic 'Lip Coat' to the wrong shade with high confidence", () => {
    // If only 'Lip Coat' without shade is given, it should NOT have high confidence
    const res = findBestMatchProductWithScore("Lip Coat", "", mockMasterProducts);
    expect(res.confidence).toBe("low");
    expect(res.score).toBeLessThan(0.82);
  });

  it("should correctly match distinct shades without colliding", () => {
    const matchBF = findBestMatchProductWithScore(
      "BLP Lip Coat - Butter Fudge",
      "",
      mockMasterProducts
    );
    expect(matchBF.product?.sku).toBe("BLP-LC-BF");
    expect(matchBF.confidence).toBe("high");

    const matchPP = findBestMatchProductWithScore(
      "Lip Coat Peppermint Pink (Retur)",
      "",
      mockMasterProducts
    );
    expect(matchPP.product?.sku).toBe("BLP-LC-PP");
    expect(matchPP.confidence).toBe("high");

    const matchCR = findBestMatchProductWithScore(
      "Lip Coat Caramel",
      "",
      mockMasterProducts
    );
    expect(matchCR.product?.sku).toBe("BLP-LC-CR");
    expect(matchCR.score).toBe(1.0);
  });

  it("should handle slight typos in shade names with high confidence", () => {
    const typo = findBestMatchProductWithScore(
      "Lip Coat Buter Fudge",
      "",
      mockMasterProducts
    );
    expect(typo.product?.sku).toBe("BLP-LC-BF");
    expect(typo.score).toBeGreaterThan(0.8);
  });

  it("should mark completely unknown products as unmatched", () => {
    const unknown = findBestMatchProductWithScore(
      "Shampoo Anti Dandruff Extra",
      "",
      mockMasterProducts
    );
    expect(unknown.confidence).toBe("unmatched");
    expect(unknown.product).toBeNull();
  });

  it("backward-compatible findBestMatchProduct should return correct product or null", () => {
    const found = findBestMatchProduct("Cover Cushion N20", "", mockMasterProducts);
    expect(found?.sku).toBe("BLP-CC-N20");

    const notFound = findBestMatchProduct("Minyak Goreng Sawit", "", mockMasterProducts);
    expect(notFound).toBeNull();
  });
});
