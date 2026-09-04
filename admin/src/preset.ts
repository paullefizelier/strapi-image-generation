import type { Preset } from "./components/GenerateDialog";
import type { JournalEntry } from "./types";

/**
 * Turning a history entry back into something you can run again.
 *
 * A declination is the awkward case: its recorded prompt is the English reframe
 * instruction the server composed ("Reframe this exact image to a 9:16…"), not
 * a description of anything. Re-running that would be nonsense, so a
 * declination reuses the description that started its family, kept on the
 * source entry — at the declination's own ratio, model and size, since those
 * are what the editor is looking at when they click.
 *
 * A declination whose source is gone from the journal returns null: the studio
 * offers no button rather than a prompt that means nothing. The journal is
 * capped at 500 entries, so this is reachable, not theoretical.
 */
export function presetFor(entry: JournalEntry, entries: JournalEntry[]): Preset | null {
  const source = entry.derivedFromFileId
    ? entries.find((item) => item.fileId === entry.derivedFromFileId)
    : entry;
  if (!source?.prompt.trim()) return null;

  return {
    prompt: source.prompt,
    model: entry.model,
    imageSize: entry.imageSize,
    aspectRatio: entry.aspectRatio,
    // What the journal recorded is what actually produced the image; today's
    // house style may differ, and re-running uses today's.
    useStyle: Boolean(source.style),
  };
}
