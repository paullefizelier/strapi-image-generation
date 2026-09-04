/**
 * What the plugin managed to hook into, recorded at register time.
 *
 * The media field decorator depends on `app.library.fields.media`, an internal
 * registry. When it is absent the plugin registers nothing — a media field that
 * lost its picker would be far worse than a missing button — but that decision
 * used to be invisible, a `console.warn` nobody reads. The studio reads this
 * instead and says so on screen.
 */
export const integration: { mediaField: boolean } = { mediaField: false };
