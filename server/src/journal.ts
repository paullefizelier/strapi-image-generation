import type { Core } from "@strapi/strapi";

/**
 * Provenance log: how each generated image came to exist.
 *
 * It lives in the plugin store rather than on the asset, deliberately. The
 * obvious place would be the file's `caption`, but that field is editorial and
 * a front end may render it — a prompt would then leak onto the public site.
 *
 * Kept to a bounded number of entries: an unbounded array in the core store is
 * a single row that grows forever and is read whole on every request.
 */

export const JOURNAL_LIMIT = 500;

export interface JournalEntry {
  at: string;
  /** Numeric upload id, and the documentId for a v5 consumer. */
  fileId: number;
  fileDocumentId?: string;
  fileName: string;
  fileUrl?: string;
  model: string;
  imageSize: string;
  aspectRatio: string;
  prompt: string;
  /**
   * The house style in force at the time. Stored per entry, not looked up:
   * the setting changes, and provenance must say what actually produced THIS
   * image, not what the style happens to be today.
   */
  style?: string;
  /** Upload ids the retouch worked from; empty for a text-to-image. */
  referenceFileIds: number[];
  /** USD, or null when the model/size pair carries no known price. */
  estimatedCost: number | null;
  userId?: number | string;
  /**
   * When the asset was deleted from the studio. The entry STAYS: the image is
   * gone but the money was spent, and dropping the row would quietly lower the
   * running total. The studio hides these from the list and still counts them.
   */
  deletedAt?: string;
}

const store = (strapi: Core.Strapi) => strapi.store({ type: "plugin", name: "image-gen" });

export async function readJournal(strapi: Core.Strapi): Promise<JournalEntry[]> {
  return ((await store(strapi).get({ key: "journal" })) as JournalEntry[]) ?? [];
}

/** Pure, so the eviction rule is testable without a store. */
export function withEntry(
  entries: JournalEntry[],
  entry: JournalEntry,
  limit = JOURNAL_LIMIT,
): JournalEntry[] {
  // Newest first: the studio's history reads top-down, and the slice then drops
  // the oldest without another reversal.
  return [entry, ...entries].slice(0, limit);
}

export async function appendJournal(strapi: Core.Strapi, entry: JournalEntry): Promise<void> {
  const entries = await readJournal(strapi);
  await store(strapi).set({ key: "journal", value: withEntry(entries, entry) });
}

/**
 * Flag one entry as deleted, rather than removing it. Pure, so the rule is
 * testable without a store. Unknown ids are left alone: the caller has already
 * decided whether "not there" is an error.
 */
export function markDeleted(
  entries: JournalEntry[],
  fileId: number,
  at = new Date().toISOString(),
): JournalEntry[] {
  return entries.map((entry) =>
    entry.fileId === fileId && !entry.deletedAt ? { ...entry, deletedAt: at } : entry,
  );
}

export async function markDeletedInJournal(strapi: Core.Strapi, fileId: number): Promise<void> {
  const entries = await readJournal(strapi);
  await store(strapi).set({ key: "journal", value: markDeleted(entries, fileId) });
}

/**
 * Total spent across the retained window — what the studio shows as a running
 * cost. Deleted images are included: deleting one is not a refund.
 */
export function totalCost(entries: JournalEntry[]): number {
  return entries.reduce((sum, entry) => sum + (entry.estimatedCost ?? 0), 0);
}
