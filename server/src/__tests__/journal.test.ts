import { describe, expect, it } from "vitest";
import { JOURNAL_LIMIT, totalCost, withEntry, markDeleted, type JournalEntry } from "../journal";

const entry = (n: number, cost: number | null = 0.134): JournalEntry => ({
  at: `2026-09-0${(n % 9) + 1}T00:00:00.000Z`,
  fileId: n,
  fileName: `image-${n}.png`,
  model: "gemini-3-pro-image",
  imageSize: "2K",
  aspectRatio: "16:9",
  prompt: `prompt ${n}`,
  referenceFileIds: [],
  estimatedCost: cost,
});

describe("withEntry", () => {
  it("puts the newest first — the studio history reads top-down", () => {
    const result = withEntry([entry(1)], entry(2));
    expect(result.map((e) => e.fileId)).toEqual([2, 1]);
  });

  it("evicts the oldest once the cap is reached", () => {
    const full = Array.from({ length: JOURNAL_LIMIT }, (_, i) => entry(i));
    const result = withEntry(full, entry(999));
    expect(result).toHaveLength(JOURNAL_LIMIT);
    expect(result[0].fileId).toBe(999);
    // The store holds one row that is read whole on every request; unbounded
    // growth there is the failure this cap exists to prevent.
    expect(result.some((e) => e.fileId === JOURNAL_LIMIT - 1)).toBe(false);
  });

  it("honours a smaller cap", () => {
    expect(withEntry([entry(1), entry(2)], entry(3), 2).map((e) => e.fileId)).toEqual([3, 1]);
  });
});

describe("totalCost", () => {
  it("adds up what was spent", () => {
    expect(totalCost([entry(1), entry(2)])).toBeCloseTo(0.268, 5);
  });

  it("treats an unknown price as zero rather than poisoning the sum with NaN", () => {
    expect(totalCost([entry(1), entry(2, null)])).toBeCloseTo(0.134, 5);
  });

  it("is zero for an empty journal", () => {
    expect(totalCost([])).toBe(0);
  });
});

describe("markDeleted", () => {
  it("flags the deleted image and leaves the others untouched", () => {
    const result = markDeleted([entry(1), entry(2), entry(3)], 2, "2026-09-03T10:00:00.000Z");
    expect(result.map((e) => e.deletedAt)).toEqual([
      undefined,
      "2026-09-03T10:00:00.000Z",
      undefined,
    ]);
  });

  it("keeps the entry, so the running total does not drop", () => {
    // The image is gone; the money is not coming back.
    const entries = [entry(1), entry(2)];
    const before = totalCost(entries);
    expect(totalCost(markDeleted(entries, 1))).toBe(before);
  });

  it("keeps the first deletion date when called twice", () => {
    const once = markDeleted([entry(1)], 1, "2026-09-01T00:00:00.000Z");
    const twice = markDeleted(once, 1, "2026-09-03T00:00:00.000Z");
    expect(twice[0].deletedAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("is a no-op for an id that is not there", () => {
    expect(markDeleted([entry(1)], 99)[0].deletedAt).toBeUndefined();
  });
});
