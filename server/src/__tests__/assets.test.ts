import { describe, expect, it } from "vitest";
import { assetNameFor, fileNameFor } from "../assets";
import { loadReferences, pickVariantUrl, MAX_REFERENCE_BYTES, REFERENCE_FIELDS } from "../reference";

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
    // `size` is in KILOBYTES: the schema has no sizeInBytes column, and asking
    // for one fails with "column t0.sizeInBytes does not exist".
    expect(pickVariantUrl({ ...file, size: 1 })).toBe("/uploads/hero.png");
  });

  it("uses the widest format that fits when the original is too heavy", () => {
    const url = pickVariantUrl({
      ...file,
      size: MAX_REFERENCE_BYTES / 1024 + 1,
      formats: {
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
      size: MAX_REFERENCE_BYTES / 1024 + 1,
      formats: { large: { url: "/uploads/large_hero.png", size: 99_999, width: 1000 } },
    });
    expect(url).toBe("/uploads/hero.png");
  });

  it("copes with a file that has no formats at all", () => {
    expect(pickVariantUrl({ ...file, size: MAX_REFERENCE_BYTES / 1024 + 1, formats: null })).toBe(
      "/uploads/hero.png",
    );
  });
});

describe("the columns read from the upload table", () => {
  /**
   * These are attribute names, and an unknown one is passed to the database
   * verbatim: `sizeInBytes` — which the upload service puts on the in-memory
   * entity but never declares as an attribute — produced
   * "column t0.sizeInBytes does not exist" on every retouch.
   */
  it("asks for no column the file content-type does not declare", () => {
    const declared = [
      "id",
      "documentId",
      "name",
      "alternativeText",
      "caption",
      "width",
      "height",
      "formats",
      "hash",
      "ext",
      "mime",
      "size",
      "url",
      "previewUrl",
      "provider",
      "provider_metadata",
      "folderPath",
    ];
    for (const field of REFERENCE_FIELDS) {
      expect(declared, `"${field}" is not an attribute of plugin::upload.file`).toContain(field);
    }
  });

  it("never asks for sizeInBytes", () => {
    expect(REFERENCE_FIELDS).not.toContain("sizeInBytes");
  });

  it("selects exactly that list when loading references", async () => {
    let selected: unknown;
    const strapi = {
      config: { get: () => "" },
      db: {
        query: () => ({
          findMany: async ({ select }: { select: string[] }) => {
            selected = select;
            return [];
          },
        }),
      },
    } as never;
    await loadReferences(strapi, [1]).catch(() => undefined);
    expect(selected).toEqual(REFERENCE_FIELDS);
  });
});
