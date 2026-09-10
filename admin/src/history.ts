import type { JournalEntry } from "./types";

/**
 * Shaping the journal into something you can look at.
 *
 * The studio used to render the journal as it is stored: one flat row per
 * entry, newest first, text before image. That was fine while an entry WAS an
 * image. Since one visual can produce four assets — a hero and its
 * declinations — the same list shows four sibling rows of equal weight and
 * leaves the reader to reassemble the family from a sentence. Grouping belongs
 * here, where it can be tested, not in the render.
 */

export interface Family {
  /** The entry the family is named after: the one drawn from a description. */
  primary: JournalEntry;
  /** Its declinations, oldest first, so ratios read in the order they were made. */
  variants: JournalEntry[];
}

const alive = (entry: JournalEntry) => !entry.deletedAt;

/**
 * Group declinations under the image they were reframed from.
 *
 * A declination whose source is gone — deleted, or evicted from the capped
 * journal — becomes its own family rather than vanishing: the asset still
 * exists, and hiding it would make the studio lie about what is in the library.
 */
export function groupFamilies(entries: JournalEntry[]): Family[] {
  const visible = entries.filter(alive);
  const byFileId = new Map(visible.map((entry) => [entry.fileId, entry]));

  const families = new Map<number, Family>();
  const order: number[] = [];

  const familyOf = (entry: JournalEntry): Family => {
    let found = families.get(entry.fileId);
    if (!found) {
      found = { primary: entry, variants: [] };
      families.set(entry.fileId, found);
      order.push(entry.fileId);
    }
    return found;
  };

  for (const entry of visible) {
    const source = entry.derivedFromFileId ? byFileId.get(entry.derivedFromFileId) : undefined;
    if (source) familyOf(source).variants.push(entry);
    else familyOf(entry);
  }

  return order.map((fileId) => {
    const found = families.get(fileId) as Family;
    // The journal is newest-first; a family's own ratios read better the other way.
    return { primary: found.primary, variants: [...found.variants].reverse() };
  });
}

const fold = (value: string): string =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/**
 * Filter families by free text over everything someone might remember: the
 * description, any file name in the family, the model, the ratio. Accents are
 * folded, because nobody types "entrepôt" the same way twice.
 */
export function searchFamilies(families: Family[], query: string): Family[] {
  const needle = fold(query.trim());
  if (!needle) return families;

  return families.filter((item) =>
    fold(
      [item.primary, ...item.variants]
        .flatMap((entry) => [entry.prompt, entry.fileName, entry.model, entry.aspectRatio])
        .join(" "),
    ).includes(needle),
  );
}

/**
 * What has been spent since a date. Deleted images count: the charge happened
 * whatever became of the file.
 */
export function spentSince(entries: JournalEntry[], since: Date): number {
  const from = since.getTime();
  return entries
    .filter((entry) => {
      const at = Date.parse(entry.at);
      return !Number.isNaN(at) && at >= from;
    })
    .reduce((total, entry) => total + (entry.estimatedCost ?? 0), 0);
}

/** Midnight on the first of the month containing `now`, in local time. */
export const startOfMonth = (now: Date = new Date()): Date =>
  new Date(now.getFullYear(), now.getMonth(), 1);
