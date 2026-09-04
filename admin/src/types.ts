/** Mirrors the server's model catalogue — fetched, never duplicated by hand. */
export interface ModelSpec {
  id: string;
  label: string;
  sizes: string[];
  price: Record<string, number>;
  maxReferences: number;
  /** Formats this model can emit, first one the default. */
  outputMimeTypes: string[];
  note: string;
}

export interface Catalogue {
  /** ISO date the prices were last checked against Google's published list. */
  verifiedOn: string;
  /** True when `config.models` has patched the built-in catalogue. */
  overridden: boolean;
  models: ModelSpec[];
  aspectRatios: string[];
}

export interface PublicSettings {
  configured: boolean;
  keySource: "settings" | "config" | "env" | null;
  hint: string;
  model: string;
  imageSize: string;
  aspectRatio: string;
  folderName: string;
  /** House style folded into every prompt. Empty = none. */
  stylePrompt: string;
}

/** A Media Library file, as the upload service returns it after creation. */
export interface Asset {
  id: number;
  documentId?: string;
  name: string;
  url: string;
  mime: string;
  width?: number;
  height?: number;
  alternativeText?: string | null;
  caption?: string | null;
  formats?: Record<string, { url: string; width?: number; height?: number }> | null;
}

export interface JournalEntry {
  at: string;
  fileId: number;
  fileDocumentId?: string;
  fileName: string;
  fileUrl?: string;
  model: string;
  imageSize: string;
  aspectRatio: string;
  prompt: string;
  /** The style in force when this image was made — not the current setting. */
  style?: string;
  referenceFileIds: number[];
  estimatedCost: number | null;
  userId?: number | string;
  /** Set when this image is another ratio of an existing one. */
  derivedFromFileId?: number;
  /** Set once the asset has been deleted from the studio. */
  deletedAt?: string;
}

export interface GenerateInput {
  /** Required, unless `reframeOf` supplies the image to work from. */
  prompt?: string;
  model?: string;
  imageSize?: string;
  aspectRatio?: string;
  referenceFileIds?: number[];
  previousInteractionId?: string;
  useStyle?: boolean;
  /** Names the asset. Empty asks the model for a short neutral one. */
  title?: string;
  /** Decline this existing image into `aspectRatio` instead of drawing anew. */
  reframeOf?: number;
}

export interface GenerateResult {
  asset: Asset;
  interactionId?: string;
  entry: JournalEntry;
}

export interface Health {
  strapi: { running: string; tested: string; status: "ok" | "newer" | "older" | "unknown" };
}
