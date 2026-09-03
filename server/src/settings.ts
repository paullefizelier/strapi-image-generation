import type { Core } from "@strapi/strapi";
import {
  DEFAULT_ASPECT_RATIO,
  DEFAULT_MODEL,
  DEFAULT_SIZE,
  type AspectRatio,
  type ImageSize,
  type ModelId,
} from "./models";

/**
 * Settings live in the plugin core store, not a table.
 *
 * The API key is written but never read back out: `PublicSettings` has no
 * `apiKey` field at all, so it cannot leak through a forgotten omission — the
 * type makes the mistake unrepresentable rather than merely unlikely.
 */

export const DEFAULT_FOLDER_NAME = "Generated images";

/** Checked in order. The host already has GEMINI_API_KEY for the nav plugin. */
export const ENV_KEYS = ["IMAGE_GEN_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"];

export interface StoredSettings {
  apiKey?: string;
  model?: ModelId;
  imageSize?: ImageSize;
  aspectRatio?: AspectRatio;
  folderName?: string;
}

export type KeySource = "settings" | "config" | "env" | null;

export interface PublicSettings {
  configured: boolean;
  keySource: KeySource;
  /** Last four characters, so an operator can tell WHICH key is in play. */
  hint: string;
  model: ModelId;
  imageSize: ImageSize;
  aspectRatio: AspectRatio;
  folderName: string;
}

const store = (strapi: Core.Strapi) => strapi.store({ type: "plugin", name: "image-gen" });

export async function getStoredSettings(strapi: Core.Strapi): Promise<StoredSettings> {
  return ((await store(strapi).get({ key: "settings" })) as StoredSettings) ?? {};
}

/**
 * An absent `apiKey` keeps the stored one; an explicit "" or null clears it.
 * Without that distinction a settings form that does not echo the key back
 * would wipe it on every save.
 */
export async function setSettings(
  strapi: Core.Strapi,
  input: Partial<StoredSettings> & { apiKey?: string | null },
): Promise<void> {
  const current = await getStoredSettings(strapi);
  const next: StoredSettings = { ...current };

  if (input.apiKey === null || input.apiKey === "") delete next.apiKey;
  else if (input.apiKey) next.apiKey = input.apiKey.trim();

  if (input.model) next.model = input.model;
  if (input.imageSize) next.imageSize = input.imageSize;
  if (input.aspectRatio) next.aspectRatio = input.aspectRatio;
  if (input.folderName !== undefined) {
    const name = String(input.folderName).trim();
    next.folderName = name || DEFAULT_FOLDER_NAME;
  }

  await store(strapi).set({ key: "settings", value: next });
}

export interface ResolvedSettings {
  apiKey: string;
  keySource: KeySource;
  model: ModelId;
  imageSize: ImageSize;
  aspectRatio: AspectRatio;
  folderName: string;
}

/** Admin-saved value first, then the host's config file, then the environment. */
export async function resolveSettings(strapi: Core.Strapi): Promise<ResolvedSettings> {
  const stored = await getStoredSettings(strapi);
  const config = (key: string, fallback: unknown) => strapi.plugin("image-gen").config(key, fallback);

  let apiKey = "";
  let keySource: KeySource = null;
  if (stored.apiKey) {
    apiKey = stored.apiKey;
    keySource = "settings";
  } else {
    const fromConfig = config("apiKey", "") as string;
    if (fromConfig) {
      apiKey = fromConfig;
      keySource = "config";
    } else {
      for (const name of ENV_KEYS) {
        const value = process.env[name];
        if (value) {
          apiKey = value;
          keySource = "env";
          break;
        }
      }
    }
  }

  return {
    apiKey,
    keySource,
    model: stored.model ?? (config("model", DEFAULT_MODEL) as ModelId),
    imageSize: stored.imageSize ?? (config("imageSize", DEFAULT_SIZE) as ImageSize),
    aspectRatio: stored.aspectRatio ?? (config("aspectRatio", DEFAULT_ASPECT_RATIO) as AspectRatio),
    folderName: stored.folderName ?? (config("folderName", DEFAULT_FOLDER_NAME) as string),
  };
}

export async function publicSettings(strapi: Core.Strapi): Promise<PublicSettings> {
  const { apiKey, keySource, model, imageSize, aspectRatio, folderName } =
    await resolveSettings(strapi);
  return {
    configured: Boolean(apiKey),
    keySource,
    hint: apiKey ? `…${apiKey.slice(-4)}` : "",
    model,
    imageSize,
    aspectRatio,
    folderName,
  };
}
