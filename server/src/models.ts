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
  id: ModelId;
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

export const DEFAULT_MODEL: ModelId = "gemini-3-pro-image";
export const DEFAULT_SIZE: ImageSize = "2K";
export const DEFAULT_ASPECT_RATIO: AspectRatio = "16:9";

export const modelById = (id: string): ModelSpec | undefined => MODELS.find((m) => m.id === id);

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
