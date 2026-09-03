import type { Core } from "@strapi/strapi";

/**
 * The destination folder for generated images.
 *
 * A dedicated folder is the whole point: months later, "which of these images
 * did a model draw?" has an answer, and they can be audited, replaced or purged
 * as a set. Created on first use rather than at bootstrap, so a plugin that is
 * installed and never used leaves no trace in the Media Library.
 */

const FOLDER_UID = "plugin::upload.folder";

/** Numeric id of the folder with this name at the root, or null when absent. */
export async function findFolderId(strapi: Core.Strapi, name: string): Promise<number | null> {
  const existing = (await strapi.db.query(FOLDER_UID).findOne({
    select: ["id"],
    // Root-level only: a same-named folder nested elsewhere is somebody else's.
    where: { name, parent: null },
  })) as { id?: number } | null;
  return existing?.id ?? null;
}

export async function ensureFolder(
  strapi: Core.Strapi,
  name: string,
  user?: { id: string | number },
): Promise<number | null> {
  const trimmed = name.trim();
  // No name configured means "wherever the Media Library puts things" — root.
  if (!trimmed) return null;

  const existing = await findFolderId(strapi, trimmed);
  if (existing) return existing;

  try {
    const created = (await strapi
      .plugin("upload")
      .service("folder")
      .create({ name: trimmed, parent: null }, user ? { user } : undefined)) as { id?: number };
    return created?.id ?? null;
  } catch (err) {
    // A folder we cannot create must not cost the editor their image: fall back
    // to the root and let the asset through.
    strapi.log.warn(
      `image-gen: could not create the folder "${trimmed}" (${(err as Error).message}) — saving to the Media Library root`,
    );
    return null;
  }
}
