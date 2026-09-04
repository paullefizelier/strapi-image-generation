/**
 * Declining one image into other aspect ratios.
 *
 * The API takes ONE `aspect_ratio` per call and returns ONE image, so several
 * ratios means several calls — and several charges. Running the same prompt
 * again at another ratio would return a *different photograph*, which is
 * useless for the actual need: the same visual as a 16:9 hero, a 4:3 card and a
 * 9:16 mobile. So every extra ratio is a retouch OF THE FIRST IMAGE — the model
 * extends the scene it already drew instead of inventing a new one.
 *
 * That is why the instruction below is an order rather than a description: this
 * is the editing path, where the model is told what to change. (The house style
 * is the opposite case — it describes a look and must never read as an order.)
 */

/** Ratios are validated against the catalogue before this is ever composed. */
export function reframeInstruction(aspectRatio: string): string {
  return [
    `Reframe this exact image to a ${aspectRatio} aspect ratio.`,
    "Keep the same subject, composition intent, colours, lighting and style.",
    "Extend the existing scene to fill the new area, and crop only where necessary.",
    "Do not invent a different scene, do not add or remove people or objects,",
    "and do not add any text.",
  ].join(" ");
}

/**
 * Name a variant after its source, so the set reads as one family in the Media
 * Library. A ratio already in the name is replaced rather than stacked: a
 * reframe of a reframe must not end up "Cariste (4:3) (9:16)".
 */
export function reframeTitle(sourceName: string, aspectRatio: string): string {
  const base = sourceName
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/\s*\(\d{1,2}:\d{1,2}\)\s*$/, "")
    .trim();
  return `${base || "Image"} (${aspectRatio})`;
}
