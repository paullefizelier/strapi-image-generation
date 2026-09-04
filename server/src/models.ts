/**
 * The model catalogue — one authority for what may be asked of the API, what it
 * costs, and what the admin is allowed to offer.
 *
 * Prices are per output image, in USD, from Google's published pricing. They
 * exist here because a generated image costs real money and an editor iterating
 * on a 4K Pro render can spend a few dollars without noticing: the number is
 * shown before the call, and recorded after it.
 */

export type ModelId = "gemini-3-pro-image" | "gemini-3.1-flash-image" | "gemini-3.1-flash-lite-image";

/** Uppercase K is required by the API — "1k" is rejected. */
export type ImageSize = "512px" | "1K" | "2K" | "4K";

export type AspectRatio =
  | "1:1"
  | "3:2"
  | "2:3"
  | "3:4"
  | "4:3"
  | "4:5"
  | "5:4"
  | "9:16"
  | "16:9"
  | "21:9";

export const ASPECT_RATIOS: AspectRatio[] = [
  "1:1",
  "3:2",
  "2:3",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
];

/** Output formats. The first is the default for that model. */
export type OutputMimeType = "image/jpeg" | "image/png";

export interface ModelSpec {
  /**
   * A string, not the `ModelId` union: once `config.models` can add a model,
   * the id space is open. `ModelId` stays as the names shipped in the box.
   */
  id: string;
  label: string;
  /** Sizes this model accepts. Asking for another is rejected by the API. */
  sizes: ImageSize[];
  /** USD per output image, by size. */
  price: Partial<Record<ImageSize, number>>;
  /** How many reference images the model accepts for a retouch. */
  maxReferences: number;
  /**
   * Output formats this model accepts, first one the default.
   *
   * The documentation shows both jpeg and png examples but publishes no
   * per-model matrix, so this list is what each model is KNOWN to accept:
   * gemini-3-pro-image answers "The value 'image/png' is not supported for
   * 'response_format.mime_type'. Supported values: 'image/jpeg'." Anything not
   * proven stays off the list rather than being assumed.
   */
  outputMimeTypes: OutputMimeType[];
  note: string;
}

export const MODELS: ModelSpec[] = [
  {
    id: "gemini-3-pro-image",
    label: "Nano Banana Pro",
    sizes: ["1K", "2K", "4K"],
    price: { "1K": 0.134, "2K": 0.134, "4K": 0.24 },
    // Pro counts references as up to 10 objects plus 4 characters; 14 is the
    // ceiling either way, and the API is the real authority.
    maxReferences: 14,
    outputMimeTypes: ["image/jpeg"],
    note: "Best text rendering inside the image. JPEG only, so no transparency.",
  },
  {
    id: "gemini-3.1-flash-image",
    label: "Nano Banana 2",
    sizes: ["512px", "1K", "2K", "4K"],
    price: { "512px": 0.045, "1K": 0.067, "2K": 0.101, "4K": 0.151 },
    maxReferences: 14,
    outputMimeTypes: ["image/jpeg", "image/png"],
    note: "Fast, cheaper, up to 14 reference images. PNG available.",
  },
  {
    id: "gemini-3.1-flash-lite-image",
    label: "Nano Banana 2 Lite",
    sizes: ["1K"],
    price: { "1K": 0.0336 },
    maxReferences: 14,
    outputMimeTypes: ["image/jpeg"],
    note: "Cheapest. 1K only.",
  },
];

/**
 * When this catalogue was last checked against Google's published models and
 * prices. It is shown in the UI because these numbers drift under you —
 * `gemini-2.5-flash-image`, the original Nano Banana, was deprecated mid-build.
 * A price nobody has verified in a year should look like one.
 */
export const CATALOGUE_VERIFIED = "2026-09-04";

export const DEFAULT_MODEL: ModelId = "gemini-3-pro-image";
export const DEFAULT_SIZE: ImageSize = "2K";
export const DEFAULT_ASPECT_RATIO: AspectRatio = "16:9";

/**
 * The catalogue in force. Starts as the built-in list and is replaced once at
 * boot when `config.models` carries overrides — so a price change or a model
 * Google ships next month does not require a release of this plugin.
 */
let active: ModelSpec[] = MODELS;

export const catalogue = (): ModelSpec[] => active;

/** Called once from `register`. Exported for tests, which must restore MODELS. */
export const setCatalogue = (models: ModelSpec[]): void => {
  active = models;
};

export const modelById = (id: string): ModelSpec | undefined => active.find((m) => m.id === id);

export type ModelOverrides = Record<string, Partial<ModelSpec> | null>;

const SIZES: ImageSize[] = ["512px", "1K", "2K", "4K"];
const MIMES: OutputMimeType[] = ["image/jpeg", "image/png"];

function problemsWith(spec: Partial<ModelSpec>, id: string): string[] {
  const problems: string[] = [];
  const at = `models["${id}"]`;
  if (!spec.label || typeof spec.label !== "string") problems.push(`${at}.label is required`);
  if (!Array.isArray(spec.sizes) || !spec.sizes.length) {
    problems.push(`${at}.sizes must list at least one size`);
  } else {
    const unknown = spec.sizes.filter((size) => !SIZES.includes(size));
    if (unknown.length) problems.push(`${at}.sizes has unknown ${unknown.join(", ")}`);
    // A selectable size with no price breaks the promise this plugin makes
    // loudest: that the cost is on screen before the call.
    const unpriced = spec.sizes.filter((size) => typeof spec.price?.[size] !== "number");
    if (unpriced.length) problems.push(`${at}.price is missing ${unpriced.join(", ")}`);
  }
  if (!Number.isInteger(spec.maxReferences) || (spec.maxReferences as number) < 0) {
    problems.push(`${at}.maxReferences must be a whole number`);
  }
  if (!Array.isArray(spec.outputMimeTypes) || !spec.outputMimeTypes.length) {
    problems.push(`${at}.outputMimeTypes must list at least one format`);
  } else {
    const unknown = spec.outputMimeTypes.filter((mime) => !MIMES.includes(mime));
    if (unknown.length) problems.push(`${at}.outputMimeTypes has unknown ${unknown.join(", ")}`);
  }
  return problems;
}

/**
 * Merge `config.models` over the built-in catalogue.
 *
 * A key naming a known model patches it — the common case is a price that
 * changed. `null` removes one. A key naming an unknown model adds it, and must
 * then carry a complete, valid spec.
 *
 * Throws, so a malformed catalogue stops the boot with an explanation rather
 * than reaching an editor as a broken dropdown or an unpriced render.
 */
export function applyModelOverrides(
  builtins: ModelSpec[],
  overrides?: ModelOverrides | null,
): ModelSpec[] {
  if (!overrides || typeof overrides !== "object") return builtins;

  const byId = new Map(builtins.map((spec) => [spec.id, spec]));
  const problems: string[] = [];

  for (const [id, patch] of Object.entries(overrides)) {
    if (patch === null) {
      // Removing something already gone is a no-op: a config that outlives a
      // model's removal from this list must not break the boot.
      byId.delete(id);
      continue;
    }
    if (!patch || typeof patch !== "object") {
      problems.push(`models["${id}"] must be an object or null`);
      continue;
    }
    const merged = { ...(byId.get(id) ?? {}), ...patch, id } as ModelSpec;
    problems.push(...problemsWith(merged, id));
    byId.set(id, merged);
  }

  if (!byId.size) problems.push("models leaves no model at all");
  if (problems.length) {
    throw new Error(`image-gen: invalid catalogue configuration — ${problems.join("; ")}`);
  }
  return [...byId.values()];
}

/**
 * USD for one image, or null when the pair is not one this catalogue knows.
 * Null rather than 0: "free" and "unknown" must not look the same in the UI.
 */
export function estimateCost(model: string, size: string): number | null {
  const spec = modelById(model);
  if (!spec) return null;
  return spec.price[size as ImageSize] ?? null;
}

/** The model's default output format, or null when the model is unknown. */
export const defaultMimeFor = (model: string): OutputMimeType | null =>
  modelById(model)?.outputMimeTypes[0] ?? null;

export interface RequestShape {
  model: string;
  imageSize: string;
  aspectRatio: string;
  referenceCount: number;
  outputMimeType?: string;
}

/**
 * Server-side validation. The admin UI already constrains these, but the client
 * is not an authority: a hand-rolled request must not be able to bill a 4K Pro
 * render through a form that offered Lite.
 */
export function validateRequest({
  model,
  imageSize,
  aspectRatio,
  referenceCount,
  outputMimeType,
}: RequestShape): string[] {
  const errors: string[] = [];
  const spec = modelById(model);
  if (!spec) {
    errors.push(`Unknown model "${model}"`);
    return errors; // everything else is meaningless without a model
  }
  if (!spec.sizes.includes(imageSize as ImageSize)) {
    errors.push(`Model ${spec.label} does not support size "${imageSize}" (${spec.sizes.join(", ")})`);
  }
  if (!ASPECT_RATIOS.includes(aspectRatio as AspectRatio)) {
    errors.push(`Unsupported aspect ratio "${aspectRatio}"`);
  }
  if (referenceCount > spec.maxReferences) {
    errors.push(`${spec.label} accepts at most ${spec.maxReferences} reference images (got ${referenceCount})`);
  }
  if (outputMimeType && !spec.outputMimeTypes.includes(outputMimeType as OutputMimeType)) {
    errors.push(
      `${spec.label} does not output "${outputMimeType}" (${spec.outputMimeTypes.join(", ")})`,
    );
  }
  return errors;
}
