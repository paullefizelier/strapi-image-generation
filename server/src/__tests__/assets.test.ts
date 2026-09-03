import { describe, expect, it } from "vitest";
import { assetNameFor, fileNameFor } from "../assets";
import { pickVariantUrl, MAX_REFERENCE_BYTES } from "../reference";

describe("fileNameFor", () => {
  const at = new Date("2026-09-03T10:00:00.000Z");

  it("builds a slug from the prompt, dated, with the right extension", () => {
    expect(fileNameFor("A warehouse at golden hour", "image/png", at)).toBe(
      "a-warehouse-at-golden-hour-2026-09-03.png",
    );
  });

  it("strips accents and punctuation", () => {
    expect(fileNameFor("Intérim à Lyon !", "image/jpeg", at)).toBe("interim-a-lyon-2026-09-03.jpg");
  });

  it("keeps the name short — six words is enough to recognise it in a list", () => {
    const name = fileNameFor("one two three four five six seven eight", "image/png", at);
    expect(name).toBe("one-two-three-four-five-six-2026-09-03.png");
  });

  it("never produces a nameless file", () => {
    expect(fileNameFor("!!! ???", "image/png", at)).toBe("image-2026-09-03.png");
  });

  it("falls back to png for an unexpected mime type", () => {
    expect(fileNameFor("x", "image/avif", at)).toMatch(/\.png$/);
    expect(fileNameFor("x", "image/webp", at)).toMatch(/\.webp$/);
  });
});

describe("assetNameFor", () => {
  it("uses the prompt as the visible name", () => {
    expect(assetNameFor("  A warehouse   at golden hour ")).toBe("A warehouse at golden hour");
  });

  it("truncates a long prompt with an ellipsis", () => {
    const name = assetNameFor("x".repeat(200));
    expect(name).toHaveLength(80);
    expect(name.endsWith("…")).toBe(true);
  });

  it("never returns an empty name", () => {
    expect(assetNameFor("   ")).toBe("Generated image");
  });
});

describe("pickVariantUrl", () => {
  const file = {
    id: 1,
    name: "hero.png",
    url: "/uploads/hero.png",
    mime: "image/png",
  };

  it("uses the original when it fits the budget", () => {
    expect(pickVariantUrl({ ...file, sizeInBytes: 1000 })).toBe("/uploads/hero.png");
  });

  it("uses the widest format that fits when the original is too heavy", () => {
    const url = pickVariantUrl({
      ...file,
      sizeInBytes: MAX_REFERENCE_BYTES + 1,
      formats: {
        // `size` on a format is in KB, unlike sizeInBytes on the row.
        small: { url: "/uploads/small_hero.png", size: 40, width: 500 },
        large: { url: "/uploads/large_hero.png", size: 300, width: 1000 },
      },
    });
    expect(url).toBe("/uploads/large_hero.png");
  });

  it("sends the original rather than nothing when no format fits", () => {
    // Dropping the reference silently would retouch nothing at all.
    const url = pickVariantUrl({
      ...file,
      sizeInBytes: MAX_REFERENCE_BYTES + 1,
      formats: { large: { url: "/uploads/large_hero.png", size: 99_999, width: 1000 } },
    });
    expect(url).toBe("/uploads/hero.png");
  });

  it("copes with a file that has no formats at all", () => {
    expect(pickVariantUrl({ ...file, sizeInBytes: MAX_REFERENCE_BYTES + 1, formats: null })).toBe(
      "/uploads/hero.png",
    );
  });
});
