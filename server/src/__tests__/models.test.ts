import { afterEach, describe, expect, it } from "vitest";
import {
  applyModelOverrides,
  defaultMimeFor,
  estimateCost,
  MODELS,
  modelById,
  setCatalogue,
  validateRequest,
} from "../models";

describe("the catalogue", () => {
  it("prices every size each model declares — a gap would show as free", () => {
    for (const model of MODELS) {
      for (const size of model.sizes) {
        expect(model.price[size], `${model.id} @ ${size}`).toBeTypeOf("number");
      }
    }
  });

  it("matches Google's published prices", () => {
    expect(estimateCost("gemini-3-pro-image", "2K")).toBe(0.134);
    expect(estimateCost("gemini-3-pro-image", "4K")).toBe(0.24);
    expect(estimateCost("gemini-3.1-flash-image", "1K")).toBe(0.067);
    expect(estimateCost("gemini-3.1-flash-lite-image", "1K")).toBe(0.0336);
  });

  it("returns null — never NaN or 0 — for what it does not know", () => {
    // "free" and "unknown" must not look the same in the UI.
    expect(estimateCost("gemini-9-imaginary", "1K")).toBeNull();
    expect(estimateCost("gemini-3-pro-image", "8K")).toBeNull();
  });

  it("does not offer the deprecated 2.5 model", () => {
    expect(modelById("gemini-2.5-flash-image")).toBeUndefined();
  });
});

describe("output formats", () => {
  it("every model declares at least one format it can emit", () => {
    for (const model of MODELS) {
      expect(model.outputMimeTypes.length, model.id).toBeGreaterThan(0);
    }
  });

  it("Pro is JPEG only — the API rejects PNG on it outright", () => {
    // "The value 'image/png' is not supported for 'response_format.mime_type'.
    //  Supported values: 'image/jpeg'." — straight from the API.
    expect(modelById("gemini-3-pro-image")!.outputMimeTypes).toEqual(["image/jpeg"]);
    expect(defaultMimeFor("gemini-3-pro-image")).toBe("image/jpeg");
  });

  it("falls back to nothing for an unknown model rather than guessing", () => {
    expect(defaultMimeFor("gemini-9-imaginary")).toBeNull();
  });

  it("rejects a format the model cannot emit", () => {
    const errors = validateRequest({
      model: "gemini-3-pro-image",
      imageSize: "2K",
      aspectRatio: "16:9",
      referenceCount: 0,
      outputMimeType: "image/png",
    });
    expect(errors[0]).toMatch(/does not output "image\/png"/);
  });

  it("accepts PNG on the model that documents it", () => {
    expect(
      validateRequest({
        model: "gemini-3.1-flash-image",
        imageSize: "1K",
        aspectRatio: "1:1",
        referenceCount: 0,
        outputMimeType: "image/png",
      }),
    ).toEqual([]);
  });
});

describe("validateRequest", () => {
  const valid = { model: "gemini-3-pro-image", imageSize: "2K", aspectRatio: "16:9", referenceCount: 0 };

  it("accepts a well-formed request", () => {
    expect(validateRequest(valid)).toEqual([]);
  });

  it("rejects an unknown model and stops there", () => {
    const errors = validateRequest({ ...valid, model: "gpt-image" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Unknown model/);
  });

  it("rejects a size the model does not support", () => {
    // Lite is 1K only — asking for 4K through a hand-rolled request would
    // otherwise bill seven times the price the form advertised.
    expect(validateRequest({ ...valid, model: "gemini-3.1-flash-lite-image", imageSize: "4K" })[0]).toMatch(
      /does not support size/,
    );
    expect(validateRequest({ ...valid, imageSize: "512px" })[0]).toMatch(/does not support size/);
  });

  it("rejects an unsupported aspect ratio", () => {
    expect(validateRequest({ ...valid, aspectRatio: "7:3" })[0]).toMatch(/aspect ratio/);
  });

  it("caps reference images at what the model accepts", () => {
    expect(validateRequest({ ...valid, referenceCount: 14 })).toEqual([]);
    expect(validateRequest({ ...valid, referenceCount: 15 })[0]).toMatch(/at most 14/);
  });
});

describe("applyModelOverrides", () => {
  const builtins = MODELS;

  afterEach(() => setCatalogue(MODELS));

  it("returns the built-in list when nothing is configured", () => {
    expect(applyModelOverrides(builtins)).toBe(builtins);
    expect(applyModelOverrides(builtins, null)).toBe(builtins);
  });

  it("patches a price without restating the whole model", () => {
    // The common case: Google moves a price, nobody should need a release.
    const patched = applyModelOverrides(builtins, {
      "gemini-3-pro-image": { price: { "1K": 0.2, "2K": 0.2, "4K": 0.3 } },
    });
    const pro = patched.find((m) => m.id === "gemini-3-pro-image");
    expect(pro?.price["4K"]).toBe(0.3);
    // Everything else survives the merge.
    expect(pro?.label).toBe("Nano Banana Pro");
    expect(pro?.maxReferences).toBe(14);
  });

  it("removes a deprecated model", () => {
    const patched = applyModelOverrides(builtins, { "gemini-3.1-flash-lite-image": null });
    expect(patched.map((m) => m.id)).not.toContain("gemini-3.1-flash-lite-image");
  });

  it("removing a model that is already gone is a no-op", () => {
    // A config outliving a model's removal must not break the boot.
    expect(() => applyModelOverrides(builtins, { "gemini-2.5-flash-image": null })).not.toThrow();
  });

  it("adds a model Google ships later", () => {
    const patched = applyModelOverrides(builtins, {
      "gemini-4-image": {
        label: "Nano Banana 3",
        sizes: ["1K", "4K"],
        price: { "1K": 0.1, "4K": 0.3 },
        maxReferences: 20,
        outputMimeTypes: ["image/jpeg", "image/png"],
        note: "New.",
      },
    });
    expect(patched.find((m) => m.id === "gemini-4-image")?.label).toBe("Nano Banana 3");
  });

  it("refuses a selectable size with no price", () => {
    // The cost is shown before the call; an unpriced size breaks that promise.
    expect(() =>
      applyModelOverrides(builtins, { "gemini-3-pro-image": { sizes: ["1K", "2K", "4K", "512px"] } }),
    ).toThrow(/price is missing 512px/);
  });

  it("refuses an incomplete new model, and says everything that is wrong", () => {
    expect(() => applyModelOverrides(builtins, { "mystery-model": { label: "Mystery" } })).toThrow(
      /sizes must list at least one size.*maxReferences.*outputMimeTypes/s,
    );
  });

  it("refuses unknown sizes and formats", () => {
    expect(() =>
      applyModelOverrides(builtins, { "gemini-3-pro-image": { outputMimeTypes: ["image/gif" as never] } }),
    ).toThrow(/outputMimeTypes has unknown image\/gif/);
  });

  it("refuses a catalogue with nothing left in it", () => {
    const empty = Object.fromEntries(builtins.map((m) => [m.id, null]));
    expect(() => applyModelOverrides(builtins, empty)).toThrow(/leaves no model at all/);
  });

  it("makes the active catalogue the authority for lookups", () => {
    setCatalogue(applyModelOverrides(builtins, { "gemini-3.1-flash-lite-image": null }));
    expect(modelById("gemini-3.1-flash-lite-image")).toBeUndefined();
    expect(estimateCost("gemini-3.1-flash-lite-image", "1K")).toBeNull();
    expect(validateRequest({
      model: "gemini-3.1-flash-lite-image",
      imageSize: "1K",
      aspectRatio: "1:1",
      referenceCount: 0,
    })).toEqual(['Unknown model "gemini-3.1-flash-lite-image"']);
  });
});
