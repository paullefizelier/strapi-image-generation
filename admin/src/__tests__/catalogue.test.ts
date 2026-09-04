import { describe, expect, it } from "vitest";
import { catalogueAgeInDays, isCatalogueStale, STALE_AFTER_DAYS } from "../catalogue";

const now = new Date("2026-09-04T12:00:00.000Z");

describe("catalogueAgeInDays", () => {
  it("counts the days since the list was checked", () => {
    expect(catalogueAgeInDays("2026-09-04", now)).toBe(0);
    expect(catalogueAgeInDays("2026-08-05", now)).toBe(30);
  });

  it("returns null rather than NaN for a date it cannot read", () => {
    expect(catalogueAgeInDays("", now)).toBeNull();
    expect(catalogueAgeInDays("soon", now)).toBeNull();
  });
});

describe("isCatalogueStale", () => {
  it("stays quiet while the list is recent", () => {
    expect(isCatalogueStale("2026-09-04", now)).toBe(false);
    expect(isCatalogueStale("2026-05-01", now)).toBe(false);
  });

  it("speaks up once the prices are old enough to distrust", () => {
    expect(isCatalogueStale("2025-09-04", now)).toBe(true);
    expect(catalogueAgeInDays("2025-09-04", now)).toBeGreaterThan(STALE_AFTER_DAYS);
  });

  it("treats a date it cannot read as not stale, rather than crying wolf", () => {
    expect(isCatalogueStale("", now)).toBe(false);
  });

  it("does not call a future date stale", () => {
    expect(isCatalogueStale("2027-01-01", now)).toBe(false);
  });
});
