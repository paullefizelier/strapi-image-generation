import { describe, expect, it } from "vitest";
import { presetFor } from "../preset";
import type { JournalEntry } from "../types";

const entry = (over: Partial<JournalEntry> = {}): JournalEntry => ({
  at: "2026-09-04T10:00:00.000Z",
  fileId: 1,
  fileName: "Cariste en entrepôt",
  model: "gemini-3-pro-image",
  imageSize: "2K",
  aspectRatio: "16:9",
  prompt: "Un cariste dans un entrepôt agroalimentaire",
  referenceFileIds: [],
  estimatedCost: 0.134,
  ...over,
});

describe("presetFor", () => {
  it("reuses the description and the settings it ran with", () => {
    const source = entry();
    expect(presetFor(source, [source])).toEqual({
      prompt: "Un cariste dans un entrepôt agroalimentaire",
      model: "gemini-3-pro-image",
      imageSize: "2K",
      aspectRatio: "16:9",
      useStyle: false,
    });
  });

  it("turns the house style back on when it was in force", () => {
    const source = entry({ style: "photographic, direct flash" });
    expect(presetFor(source, [source])?.useStyle).toBe(true);
  });

  it("takes a declination's description from its source, not its reframe order", () => {
    // The declination's own prompt is "Reframe this exact image to a 9:16…",
    // which is an instruction to the model, not a description of anything.
    const source = entry({ fileId: 1 });
    const variant = entry({
      fileId: 2,
      derivedFromFileId: 1,
      aspectRatio: "9:16",
      prompt: "Reframe this exact image to a 9:16 aspect ratio. Keep the same subject…",
    });
    const preset = presetFor(variant, [source, variant]);
    expect(preset?.prompt).toBe("Un cariste dans un entrepôt agroalimentaire");
    // …but at the ratio the editor is actually looking at.
    expect(preset?.aspectRatio).toBe("9:16");
  });

  it("offers nothing when a declination's source has fallen out of the journal", () => {
    const variant = entry({ fileId: 2, derivedFromFileId: 99, prompt: "Reframe this…" });
    expect(presetFor(variant, [variant])).toBeNull();
  });

  it("offers nothing for an entry with no prompt at all", () => {
    expect(presetFor(entry({ prompt: "   " }), [])).toBeNull();
  });
});
