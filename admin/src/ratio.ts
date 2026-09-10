/**
 * A ratio drawn as a rectangle.
 *
 * Ten checkboxes reading "1:1 3:2 2:3 3:4 4:3 4:5 5:4 9:16 16:9 21:9" ask the
 * reader to do arithmetic in a tool whose whole subject is shape. A rectangle
 * in the right proportion is read, not computed.
 */

export interface Box {
  width: number;
  height: number;
}

/** Fit `ratio` inside a square of `max` px, keeping its proportions. */
export function ratioBox(ratio: string, max = 20): Box {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(String(ratio ?? "").trim());
  if (!match) return { width: max, height: max };

  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!w || !h) return { width: max, height: max };

  // Rounded, and never thinner than 4px: a 21:9 glyph 3px tall reads as a line.
  return w >= h
    ? { width: max, height: Math.max(4, Math.round((max * h) / w)) }
    : { width: Math.max(4, Math.round((max * w) / h)), height: max };
}
