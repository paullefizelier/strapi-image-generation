import { describe, expect, it } from "vitest";
import { groupFamilies, searchFamilies, spentSince, startOfMonth } from "../history";
import type { JournalEntry } from "../types";

const entry = (over: Partial<JournalEntry> & { fileId: number }): JournalEntry => ({
  at: "2026-09-10T10:00:00.000Z",
  fileName: `image-${over.fileId}`,
  model: "gemini-3-pro-image",
  imageSize: "2K",
  aspectRatio: "16:9",
  prompt: "un cariste en entrepôt",
  referenceFileIds: [],
  estimatedCost: 0.134,
  ...over,
});

describe("groupFamilies", () => {
  it("puts declinations under the image they were reframed from", () => {
    const families = groupFamilies([
      entry({ fileId: 3, derivedFromFileId: 1, aspectRatio: "9:16" }),
      entry({ fileId: 2, derivedFromFileId: 1, aspectRatio: "1:1" }),
      entry({ fileId: 1 }),
    ]);

    expect(families).toHaveLength(1);
    expect(families[0].primary.fileId).toBe(1);
    expect(families[0].variants.map((v) => v.aspectRatio)).toEqual(["1:1", "9:16"]);
  });

  it("keeps the journal's newest-first order between families", () => {
    const families = groupFamilies([
      entry({ fileId: 9, at: "2026-09-10T12:00:00.000Z" }),
      entry({ fileId: 4, at: "2026-09-10T08:00:00.000Z" }),
    ]);
    expect(families.map((f) => f.primary.fileId)).toEqual([9, 4]);
  });

  it("hides deleted images", () => {
    const families = groupFamilies([
      entry({ fileId: 1 }),
      entry({ fileId: 2, deletedAt: "2026-09-10T11:00:00.000Z" }),
    ]);
    expect(families.map((f) => f.primary.fileId)).toEqual([1]);
  });

  it("promotes an orphan declination to its own family", () => {
    // The source was deleted or fell out of the capped journal. The asset is
    // still in the library, so hiding it would make the studio lie.
    const families = groupFamilies([
      entry({ fileId: 2, derivedFromFileId: 1, aspectRatio: "9:16" }),
      entry({ fileId: 1, deletedAt: "2026-09-10T11:00:00.000Z" }),
    ]);
    expect(families).toHaveLength(1);
    expect(families[0].primary.fileId).toBe(2);
    expect(families[0].variants).toEqual([]);
  });

  it("returns nothing for an empty journal", () => {
    expect(groupFamilies([])).toEqual([]);
  });
});

describe("searchFamilies", () => {
  const families = groupFamilies([
    entry({ fileId: 2, derivedFromFileId: 1, aspectRatio: "1:1", fileName: "cariste (1:1)" }),
    entry({ fileId: 1, prompt: "un cariste en entrepôt", fileName: "cariste" }),
    entry({ fileId: 5, prompt: "un chantier sous la pluie", fileName: "chantier" }),
  ]);

  it("matches the description", () => {
    expect(searchFamilies(families, "chantier").map((f) => f.primary.fileId)).toEqual([5]);
  });

  it("ignores accents, which nobody types twice the same way", () => {
    expect(searchFamilies(families, "entrepot")).toHaveLength(1);
    expect(searchFamilies(families, "ENTREPÔT")).toHaveLength(1);
  });

  it("matches on a declination's file name and keeps its whole family", () => {
    const found = searchFamilies(families, "(1:1)");
    expect(found).toHaveLength(1);
    expect(found[0].primary.fileId).toBe(1);
    expect(found[0].variants).toHaveLength(1);
  });

  it("returns everything for an empty query", () => {
    expect(searchFamilies(families, "   ")).toHaveLength(families.length);
  });
});

describe("spentSince", () => {
  it("adds up what was charged in the window", () => {
    expect(
      spentSince(
        [
          entry({ fileId: 1, at: "2026-09-02T10:00:00.000Z", estimatedCost: 0.24 }),
          entry({ fileId: 2, at: "2026-08-20T10:00:00.000Z", estimatedCost: 0.134 }),
        ],
        new Date("2026-09-01T00:00:00.000Z"),
      ),
    ).toBeCloseTo(0.24);
  });

  it("counts deleted images: the charge happened anyway", () => {
    expect(
      spentSince(
        [entry({ fileId: 1, at: "2026-09-02T10:00:00.000Z", deletedAt: "2026-09-03T00:00:00.000Z" })],
        new Date("2026-09-01T00:00:00.000Z"),
      ),
    ).toBeCloseTo(0.134);
  });

  it("skips an unpriced entry and an unreadable date, without NaN", () => {
    expect(
      spentSince(
        [
          entry({ fileId: 1, at: "2026-09-02T10:00:00.000Z", estimatedCost: null }),
          entry({ fileId: 2, at: "not a date" }),
        ],
        new Date("2026-09-01T00:00:00.000Z"),
      ),
    ).toBe(0);
  });
});

describe("startOfMonth", () => {
  it("is midnight on the first, locally", () => {
    const start = startOfMonth(new Date(2026, 8, 10, 14, 30));
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(8);
    expect(start.getHours()).toBe(0);
  });
});
