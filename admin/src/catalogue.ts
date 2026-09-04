/**
 * How old the price list is.
 *
 * These prices come from Google's published pricing, and they drift — the
 * original Nano Banana was deprecated mid-build. The plugin cannot know when
 * that happens, so it says when the list was last checked and stops being quiet
 * about it once that date is old enough to distrust.
 */

export const STALE_AFTER_DAYS = 180;

export function catalogueAgeInDays(verifiedOn: string, now: Date = new Date()): number | null {
  const verified = Date.parse(verifiedOn);
  if (Number.isNaN(verified)) return null;
  return Math.floor((now.getTime() - verified) / 86_400_000);
}

/** Unparsable or future dates are not stale: only a date we can trust is old. */
export function isCatalogueStale(
  verifiedOn: string,
  now: Date = new Date(),
  maxDays: number = STALE_AFTER_DAYS,
): boolean {
  const days = catalogueAgeInDays(verifiedOn, now);
  return days !== null && days > maxDays;
}
