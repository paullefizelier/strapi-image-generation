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
}

export interface GenerateInput {
  prompt: string;
  model?: string;
  imageSize?: string;
  aspectRatio?: string;
  referenceFileIds?: number[];
  previousInteractionId?: string;
  useStyle?: boolean;
}

export interface GenerateResult {
  asset: Asset;
  interactionId?: string;
  entry: JournalEntry;
}
