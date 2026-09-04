/**
 * What this plugin depends on that Strapi does not promise.
 *
 * The integration points are internal: the admin reads `app.library.fields.media`
 * to decorate the media field, calls `useField(name)` because a registry field
 * receives no `onChange` prop, and borrows the `media-library` component to pick
 * reference images. None of that is public API, and `peerDependencies` says
 * `^5.0.0` — a range far wider than anything that has been verified.
 *
 * So the plugin says out loud which Strapi it was checked against, and the
 * studio shows whether each hook actually caught. The failure mode this exists
 * to prevent is the one already lived through: a button that silently did not
 * render, in a release that looked perfectly healthy.
 */

/** The Strapi the integration points were last verified against. */
export const TESTED_STRAPI = "5.51";

export type VersionStatus = "ok" | "newer" | "older" | "unknown";

const parse = (version: string): [number, number] | null => {
  const match = /^(\d+)\.(\d+)/.exec(String(version ?? "").trim());
  return match ? [Number(match[1]), Number(match[2])] : null;
};

/**
 * Compare the running Strapi to the tested one, on major.minor. Patch releases
 * are ignored: they do not move internals, and flagging every one of them would
 * train people to ignore the warning.
 */
export function compareToTested(running: string, tested = TESTED_STRAPI): VersionStatus {
  const left = parse(running);
  const right = parse(tested);
  if (!left || !right) return "unknown";
  if (left[0] !== right[0]) return left[0] > right[0] ? "newer" : "older";
  if (left[1] !== right[1]) return left[1] > right[1] ? "newer" : "older";
  return "ok";
}

export interface Health {
  strapi: { running: string; tested: string; status: VersionStatus };
}

export function health(running: string): Health {
  return {
    strapi: { running, tested: TESTED_STRAPI, status: compareToTested(running) },
  };
}
