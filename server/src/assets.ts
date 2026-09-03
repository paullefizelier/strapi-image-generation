import * as os from "node:os";
import * as path from "node:path";
import fse from "fs-extra";
import type { Core } from "@strapi/strapi";

/**
 * Turning bytes into a real Media Library asset.
 *
 * The upload service in 5.51 requires a file ON DISK: `enhanceAndValidateFile`
 * sets `getStream = () => fs.createReadStream(file.filepath)` and never looks at
 * a `buffer`, so there is no supported way to hand it memory. We therefore do
 * what Strapi's own "add from URL" does (services/file.js → fetchUrlToInputFile):
 * write a temp file, pass a plain object literal, clean up after.
 *
 * Going through the service — rather than inserting a row ourselves — is what
 * earns the thumbnail, the responsive formats and the storage provider. The
 * result is an ordinary asset, indistinguishable downstream from an upload.
 */

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * A filename that survives a filesystem and reads sensibly in a list. Strapi
 * slugifies and adds a hash of its own, so this only has to be sane, not unique.
 */
export function fileNameFor(prompt: string, mimeType: string, now = new Date()): string {
  const extension = EXTENSIONS[mimeType] ?? "png";
  const words = prompt
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 6)
    .join("-");
  const stamp = now.toISOString().slice(0, 10);
  return `${words || "image"}-${stamp}.${extension}`;
}

/** Human-readable asset name — the prompt, trimmed to something listable. */
export function assetNameFor(prompt: string, max = 80): string {
  const clean = prompt.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean || "Generated image";
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export interface CreateAssetInput {
  buffer: Buffer;
  mimeType: string;
  /** Shown in the Media Library. */
  name: string;
  fileName: string;
  folderId: number | null;
  user?: { id: string | number };
}

export interface CreatedAsset {
  id: number;
  documentId?: string;
  name: string;
  url: string;
  mime: string;
  width?: number;
  height?: number;
  formats?: unknown;
}

export async function createAsset(
  strapi: Core.Strapi,
  { buffer, mimeType, name, fileName, folderId, user }: CreateAssetInput,
): Promise<CreatedAsset> {
  const tmpDir = await fse.mkdtemp(path.join(os.tmpdir(), "image-gen-"));
  try {
    const filepath = path.join(tmpDir, fileName);
    await fse.writeFile(filepath, buffer);

    const created = (await strapi.plugin("upload").service("upload").upload(
      {
        data: {
          fileInfo: {
            name,
            // `folder` takes a numeric id; folderPath is derived server-side and
            // is not an input field.
            folder: folderId,
          },
        },
        files: {
          filepath,
          originalFilename: fileName,
          mimetype: mimeType,
          size: buffer.length,
        },
      },
      user ? { user } : undefined,
    )) as CreatedAsset[];

    const asset = Array.isArray(created) ? created[0] : (created as unknown as CreatedAsset);
    if (!asset) throw new Error("The upload service returned no file");
    return asset;
  } finally {
    // Ours to remove — Strapi only cleans the tmp directory it creates itself.
    await fse.remove(tmpDir).catch(() => undefined);
  }
}

/**
 * Delete a generated asset from the Media Library.
 *
 * Goes through the upload service so the provider copy, the responsive formats
 * and the row all go together — deleting the row alone would leave orphans in
 * storage. Returns false when the file is already gone, which is not an error:
 * the studio's job is to end up with it absent.
 */
export async function deleteAsset(strapi: Core.Strapi, fileId: number): Promise<boolean> {
  const file = await strapi.db.query("plugin::upload.file").findOne({ where: { id: fileId } });
  if (!file) return false;
  await strapi.plugin("upload").service("upload").remove(file);
  return true;
}
