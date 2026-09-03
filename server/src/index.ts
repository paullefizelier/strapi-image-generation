import type { Core } from "@strapi/strapi";
import { assetNameFor, createAsset, deleteAsset, fileNameFor } from "./assets";
import { ensureFolder } from "./folder";
import {
  appendJournal,
  readJournal,
  markDeletedInJournal,
  totalCost,
  type JournalEntry,
} from "./journal";
import {
  ASPECT_RATIOS,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_MODEL,
  DEFAULT_SIZE,
  defaultMimeFor,
  estimateCost,
  MODELS,
  validateRequest,
} from "./models";
import { DEFAULT_REQUEST_TIMEOUT_MS, generateImage } from "./nanobanana";
import { loadReferences } from "./reference";
import { publicSettings, resolveSettings, setSettings, type StoredSettings } from "./settings";
import { DEFAULT_TITLE_MODEL, sanitizeTitle, suggestTitle } from "./title";

/**
 * Host configuration (config/plugins.ts) — all optional:
 *
 * "image-gen": {
 *   enabled: true,
 *   config: {
 *     apiKey: env("GEMINI_API_KEY"),   // or leave it to the env / the admin UI
 *     model: "gemini-3-pro-image",
 *     imageSize: "2K",
 *     aspectRatio: "16:9",
 *     folderName: "Generated images",
 *     stylePrompt: "Photographic, natural light, muted palette.",
 *     titleModel: "gemini-2.0-flash",  // names the asset; never blocks an image
 *     maxPromptLength: 2000,
 *     requestTimeoutMs: 55000,   // fail before the host's proxy does
 *   },
 * }
 *
 * Nothing needs to be configured: the key is also read from IMAGE_GEN_API_KEY,
 * GEMINI_API_KEY or GOOGLE_API_KEY, and every default is sensible.
 */

const ACTIONS = {
  generate: "plugin::image-gen.generate",
  settings: "plugin::image-gen.settings",
};

const DEFAULT_MAX_PROMPT = 2000;

const config = {
  default: {
    apiKey: "",
    model: DEFAULT_MODEL,
    imageSize: DEFAULT_SIZE,
    aspectRatio: DEFAULT_ASPECT_RATIO,
    folderName: "Generated images",
    stylePrompt: "",
    titleModel: DEFAULT_TITLE_MODEL,
    maxPromptLength: DEFAULT_MAX_PROMPT,
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
  },
  validator(cfg: { maxPromptLength?: unknown; folderName?: unknown }) {
    if (
      cfg.maxPromptLength !== undefined &&
      (!Number.isInteger(cfg.maxPromptLength) || (cfg.maxPromptLength as number) < 1)
    ) {
      throw new Error("image-gen: `maxPromptLength` must be a positive integer");
    }
    if (cfg.folderName !== undefined && typeof cfg.folderName !== "string") {
      throw new Error("image-gen: `folderName` must be a string");
    }
  },
};

interface GenerateBody {
  prompt?: string;
  model?: string;
  imageSize?: string;
  aspectRatio?: string;
  referenceFileIds?: number[];
  previousInteractionId?: string;
  /** Defaults to true — the house style applies unless explicitly waived. */
  useStyle?: boolean;
  /** Defaults to the model's own format; the models disagree on what they take. */
  outputMimeType?: string;
  /** Names the asset. Empty asks the model for a short neutral one. */
  title?: string;
}

interface Ctx<B = unknown> {
  request: { body?: B };
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  state: { user?: { id: number | string } };
  body: unknown;
  throw: (status: number, message: string) => never;
}

const controllers = {
  /** The model catalogue and prices — one authority, so the UI cannot drift. */
  catalogue: () => ({
    async get(ctx: Ctx) {
      ctx.body = {
        models: MODELS,
        aspectRatios: ASPECT_RATIOS,
      };
    },
  }),

  generate: ({ strapi }: { strapi: Core.Strapi }) => ({
    async run(ctx: Ctx<GenerateBody>) {
      const body = ctx.request.body ?? {};
      const settings = await resolveSettings(strapi);
      const maxPrompt = strapi.plugin("image-gen").config("maxPromptLength", DEFAULT_MAX_PROMPT) as number;

      const prompt = String(body.prompt ?? "").trim();
      if (!prompt) ctx.throw(400, "A prompt is required");
      // Measures what the editor typed: the house style is not their budget.
      if (prompt.length > maxPrompt) {
        ctx.throw(400, `The prompt is longer than the ${maxPrompt}-character limit`);
      }

      const model = body.model ?? settings.model;
      const imageSize = body.imageSize ?? settings.imageSize;
      const aspectRatio = body.aspectRatio ?? settings.aspectRatio;
      const referenceFileIds = Array.isArray(body.referenceFileIds) ? body.referenceFileIds : [];
      const style = body.useStyle === false ? "" : settings.stylePrompt;
      // Each model declares what it can emit — Pro rejects PNG outright.
      const outputMimeType = body.outputMimeType ?? defaultMimeFor(model) ?? "image/jpeg";

      // The client is not an authority: a hand-rolled request must not be able
      // to bill a 4K Pro render through a form that offered Lite.
      const errors = validateRequest({
        model,
        imageSize,
        aspectRatio,
        referenceCount: referenceFileIds.length,
        outputMimeType,
      });
      if (errors.length) ctx.throw(400, errors.join("; "));

      let references;
      try {
        references = await loadReferences(strapi, referenceFileIds);
      } catch (err) {
        ctx.throw(400, (err as Error).message);
      }

      let generated;
      try {
        generated = await generateImage(
          settings.apiKey,
          {
            model,
            prompt,
            style,
            aspectRatio,
            imageSize,
            references,
            previousInteractionId: body.previousInteractionId,
            outputMimeType: outputMimeType as "image/png" | "image/jpeg",
          },
          undefined,
          strapi.plugin("image-gen").config("requestTimeoutMs", DEFAULT_REQUEST_TIMEOUT_MS) as number,
        );
      } catch (err) {
        // The provider's own message is the useful one — a wrong key, a refused
        // subject and a rate limit are different problems.
        //
        // 424 rather than 502 ON PURPOSE: a 502 from here is indistinguishable
        // from the platform proxy's own 502, which turns "the model refused the
        // prompt" into an unreadable gateway error page.
        ctx.throw(424, (err as Error).message);
      }

      const user = ctx.state.user;

      /**
       * The file name lands in the asset's PUBLIC url, so the prompt is a poor
       * one: it describes people. A short neutral title is asked of a cheap
       * text model, and any failure falls back to the prompt — an awkward name
       * beats losing an image the editor already paid for. The prompt itself is
       * never lost: it stays in the journal, which is not public.
       */
      const given = sanitizeTitle(String(body.title ?? ""));
      const suggested = given
        ? ""
        : await suggestTitle(settings.apiKey, prompt, {
            model: strapi.plugin("image-gen").config("titleModel", DEFAULT_TITLE_MODEL) as string,
          });
      const name = given || suggested || assetNameFor(prompt);

      const folderId = await ensureFolder(strapi, settings.folderName, user);
      const asset = await createAsset(strapi, {
        buffer: generated.buffer,
        mimeType: generated.mimeType,
        name,
        fileName: fileNameFor(name, generated.mimeType),
        folderId,
        user,
      });

      const entry: JournalEntry = {
        at: new Date().toISOString(),
        fileId: asset.id,
        fileDocumentId: asset.documentId,
        fileName: asset.name,
        fileUrl: asset.url,
        model,
        imageSize,
        aspectRatio,
        prompt,
        ...(style ? { style } : {}),
        referenceFileIds: references.map((r) => r.fileId),
        estimatedCost: estimateCost(model, imageSize),
        userId: user?.id,
      };
      // Losing the log must not lose the image the editor is waiting for.
      await appendJournal(strapi, entry).catch((err) =>
        strapi.log.warn(`image-gen: could not record the journal entry (${(err as Error).message})`),
      );

      ctx.body = { asset, interactionId: generated.interactionId, entry };
    },
  }),

  settings: ({ strapi }: { strapi: Core.Strapi }) => ({
    async get(ctx: Ctx) {
      ctx.body = await publicSettings(strapi);
    },
    async update(ctx: Ctx<Partial<StoredSettings> & { apiKey?: string | null }>) {
      try {
        await setSettings(strapi, ctx.request.body ?? {});
      } catch (err) {
        ctx.throw(400, (err as Error).message);
      }
      // Answer with the redacted view: the plaintext key is written, never echoed.
      ctx.body = await publicSettings(strapi);
    },
    /**
     * Proves the credentials work without spending a full render: the cheapest
     * model at its smallest size, on a trivial prompt.
     */
    async test(ctx: Ctx) {
      const { apiKey } = await resolveSettings(strapi);
      try {
        const generated = await generateImage(apiKey, {
          model: "gemini-3.1-flash-lite-image",
          prompt: "A plain solid light grey square. No text.",
          aspectRatio: "1:1",
          imageSize: "1K",
          outputMimeType: defaultMimeFor("gemini-3.1-flash-lite-image") ?? "image/jpeg",
        });
        ctx.body = { ok: true, bytes: generated.buffer.length, costedAbout: 0.0336 };
      } catch (err) {
        ctx.body = { ok: false, error: (err as Error).message };
      }
    },
  }),

  journal: ({ strapi }: { strapi: Core.Strapi }) => ({
    async list(ctx: Ctx) {
      const entries = await readJournal(strapi);
      ctx.body = { entries, totalCost: totalCost(entries) };
    },

    /**
     * Delete one generated image, asset and journal entry together.
     *
     * Only files THIS plugin recorded can be deleted here. Without that guard
     * the route would be a general "delete any media" endpoint for anyone
     * holding the generate permission — which is not what that permission says.
     */
    async remove(ctx: Ctx) {
      const fileId = Number(ctx.params.fileId);
      if (!Number.isInteger(fileId) || fileId <= 0) ctx.throw(400, "A file id is required");

      const entries = await readJournal(strapi);
      if (!entries.some((entry) => entry.fileId === fileId)) {
        ctx.throw(404, "That image was not generated here, so it is not this plugin's to delete");
      }

      const deleted = await deleteAsset(strapi, fileId);
      await markDeletedInJournal(strapi, fileId);
      ctx.body = { deleted };
    },
  }),
};

const adminRoute = (method: string, path: string, handler: string, actions: string[]) => ({
  method,
  path,
  handler,
  config: {
    policies: [
      "admin::isAuthenticatedAdmin",
      { name: "admin::hasPermissions", config: { actions } },
    ],
  },
});

const routes = {
  admin: {
    type: "admin",
    routes: [
      adminRoute("GET", "/catalogue", "catalogue.get", [ACTIONS.generate]),
      adminRoute("POST", "/generate", "generate.run", [ACTIONS.generate]),
      adminRoute("GET", "/journal", "journal.list", [ACTIONS.generate]),
      adminRoute("DELETE", "/journal/:fileId", "journal.remove", [ACTIONS.generate]),
      adminRoute("GET", "/settings", "settings.get", [ACTIONS.generate]),
      adminRoute("PUT", "/settings", "settings.update", [ACTIONS.settings]),
      adminRoute("POST", "/settings/test", "settings.test", [ACTIONS.settings]),
    ],
  },
};

export default {
  config,
  controllers,
  routes,

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await strapi.service("admin::permission").actionProvider.registerMany([
      {
        section: "plugins",
        displayName: "Generate and retouch images",
        uid: "generate",
        pluginName: "image-gen",
      },
      {
        section: "plugins",
        displayName: "Manage the API key and defaults",
        uid: "settings",
        pluginName: "image-gen",
      },
    ]);
  },
};
