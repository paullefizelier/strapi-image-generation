import * as path from "node:path";
import fse from "fs-extra";
import type { Core } from "@strapi/strapi";
import type { ReferenceImage } from "./nanobanana";

/**
 * Reading an existing asset back out, so a retouch can work from it.
 *
 * Two storage shapes to handle: the local provider stores a site-relative url
 * under the public directory, a remote provider stores an absolute one. Both are
 * read here rather than in the controller, because "where do the bytes live" is
 * exactly the detail the rest of the plugin should not know.
 */

const FILE_UID = "plugin::upload.file";

/**
 * Base64 of a 4K original is several megabytes per reference image, and a
 * retouch may carry more than one. Above this, a smaller responsive format is
 * used instead — the model reads the picture, it does not need every pixel.
 */
export const MAX_REFERENCE_BYTES = 4 * 1024 * 1024;

interface FileRow {
  id: number;
  documentId?: string;
  name: string;
  url: string;
  mime: string;
  /**
   * KILOBYTES. The upload content-type declares `size` (decimal) and nothing
   * else: `sizeInBytes` exists only on the in-memory entity the upload service
   * builds, never as a column — selecting it fails with
   * "column t0.sizeInBytes does not exist".
   */
  size?: number;
  /** Per-format `size` is in kilobytes too. */
  formats?: Record<string, { url?: string; size?: number; width?: number }> | null;
}

/**
 * Columns read from `plugin::upload.file`. Every name here MUST be a declared
 * attribute of the upload content-type: an unknown one reaches the database
 * verbatim and fails there, not in review.
 */
export const REFERENCE_FIELDS = ["id", "documentId", "name", "url", "mime", "size", "formats"];

/** The url to read: the original, or the largest format that fits the budget. */
export function pickVariantUrl(file: FileRow, maxBytes = MAX_REFERENCE_BYTES): string {
  const originalBytes = (file.size ?? 0) * 1024;
  if (!originalBytes || originalBytes <= maxBytes) return file.url;

  const candidates = Object.values(file.formats ?? {})
    .filter((format): format is { url: string; size?: number; width?: number } => Boolean(format?.url))
    // Both the row and the formats measure in KB.
    .map((format) => ({ url: format.url, bytes: (format.size ?? 0) * 1024, width: format.width ?? 0 }))
    .filter((format) => format.bytes > 0 && format.bytes <= maxBytes)
    .sort((a, b) => b.width - a.width);

  // Nothing small enough: send the original and let the API judge. Silently
  // dropping the reference would produce a retouch of nothing.
  return candidates[0]?.url ?? file.url;
}

async function readBytes(strapi: Core.Strapi, url: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(url)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not read the reference image (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  }
  // Local provider: the url is relative to the public directory.
  const absolute = path.join(strapi.dirs.static.public, url);
  return fse.readFile(absolute);
}

export interface LoadedReference extends ReferenceImage {
  fileId: number;
  name: string;
}

/**
 * Load reference images by upload id, in the order given.
 *
 * `folder`/`folderPath` are private on the file schema, so this reads through
 * the db query layer rather than the document service.
 */
export async function loadReferences(
  strapi: Core.Strapi,
  fileIds: number[],
): Promise<LoadedReference[]> {
  const ids = [...new Set(fileIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return [];

  const rows = (await strapi.db.query(FILE_UID).findMany({
    select: REFERENCE_FIELDS,
    where: { id: { $in: ids } },
  })) as FileRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));

  const loaded: LoadedReference[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) throw new Error(`Reference image ${id} no longer exists`);
    if (!row.mime?.startsWith("image/")) {
      throw new Error(`“${row.name}” is not an image and cannot be used as a reference`);
    }
    const buffer = await readBytes(strapi, pickVariantUrl(row));
    loaded.push({
      fileId: row.id,
      name: row.name,
      mimeType: row.mime,
      data: buffer.toString("base64"),
    });
  }
  return loaded;
}
