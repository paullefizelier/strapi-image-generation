import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicSettings, resolveSettings, setSettings } from "../settings";

/**
 * The key must be writable and never readable back. These tests exist mostly to
 * keep that true: a redaction that regresses is silent until it is a leak.
 */

const makeStrapi = (stored: Record<string, unknown> = {}, config: Record<string, unknown> = {}) => {
  const state: Record<string, unknown> = { settings: stored };
  return {
    _state: state,
    store: () => ({
      get: async ({ key }: { key: string }) => state[key],
      set: async ({ key, value }: { key: string; value: unknown }) => {
        state[key] = value;
      },
    }),
    plugin: () => ({
      config: (key: string, fallback: unknown) => (key in config ? config[key] : fallback),
    }),
  } as never;
};

const ENV = { ...process.env };
beforeEach(() => {
  delete process.env.IMAGE_GEN_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
});
afterEach(() => {
  process.env = { ...ENV };
  vi.restoreAllMocks();
});

describe("key resolution", () => {
  it("prefers the admin-saved key", async () => {
    process.env.GEMINI_API_KEY = "from-env";
    const strapi = makeStrapi({ apiKey: "from-store" }, { apiKey: "from-config" });
    expect(await resolveSettings(strapi)).toMatchObject({ apiKey: "from-store", keySource: "settings" });
  });

  it("falls back to the host config, then to the environment", async () => {
    process.env.GEMINI_API_KEY = "from-env";
    expect(await resolveSettings(makeStrapi({}, { apiKey: "from-config" }))).toMatchObject({
      apiKey: "from-config",
      keySource: "config",
    });
    expect(await resolveSettings(makeStrapi({}, {}))).toMatchObject({
      apiKey: "from-env",
      keySource: "env",
    });
  });

  it("reads the env names in order, so the host's existing GEMINI_API_KEY just works", async () => {
    process.env.GEMINI_API_KEY = "gemini";
    process.env.GOOGLE_API_KEY = "google";
    expect((await resolveSettings(makeStrapi())).apiKey).toBe("gemini");

    process.env.IMAGE_GEN_API_KEY = "dedicated";
    expect((await resolveSettings(makeStrapi())).apiKey).toBe("dedicated");
  });

  it("reports no key rather than an empty-string one", async () => {
    expect(await resolveSettings(makeStrapi())).toMatchObject({ apiKey: "", keySource: null });
  });
});

describe("publicSettings", () => {
  it("NEVER carries the key — only whether there is one, and its last four", async () => {
    const settings = await publicSettings(makeStrapi({ apiKey: "abcd1234efgh5678" }));
    expect(settings).not.toHaveProperty("apiKey");
    expect(JSON.stringify(settings)).not.toContain("abcd1234efgh5678");
    expect(settings).toMatchObject({ configured: true, keySource: "settings", hint: "…5678" });
  });

  it("has an empty hint when nothing is configured", async () => {
    expect(await publicSettings(makeStrapi())).toMatchObject({ configured: false, hint: "" });
  });

  it("exposes the defaults the editor will get", async () => {
    expect(await publicSettings(makeStrapi())).toMatchObject({
      model: "gemini-3-pro-image",
      imageSize: "2K",
      aspectRatio: "16:9",
      folderName: "Generated images",
    });
  });
});

describe("write semantics", () => {
  it("keeps the stored key when the field is absent", async () => {
    // A settings form that does not echo the key back would otherwise wipe it
    // on every save.
    const strapi = makeStrapi({ apiKey: "keep-me" });
    await setSettings(strapi, { imageSize: "1K" });
    expect((strapi as never as { _state: Record<string, { apiKey?: string }> })._state.settings.apiKey).toBe("keep-me");
  });

  it("clears the key on an explicit empty string or null", async () => {
    const strapi = makeStrapi({ apiKey: "drop-me" });
    await setSettings(strapi, { apiKey: "" });
    expect((strapi as never as { _state: Record<string, { apiKey?: string }> })._state.settings.apiKey).toBeUndefined();
  });

  it("trims a pasted key", async () => {
    const strapi = makeStrapi();
    await setSettings(strapi, { apiKey: "  spaced-key \n" });
    expect((strapi as never as { _state: Record<string, { apiKey?: string }> })._state.settings.apiKey).toBe("spaced-key");
  });

  it("stores the house style, and lets it be cleared", async () => {
    const strapi = makeStrapi();
    await setSettings(strapi, { stylePrompt: "  Photographic, muted palette.  " });
    expect((await publicSettings(strapi)).stylePrompt).toBe("Photographic, muted palette.");
    // Unlike the folder name, an empty style is a legitimate choice: no style.
    await setSettings(strapi, { stylePrompt: "" });
    expect((await publicSettings(strapi)).stylePrompt).toBe("");
  });

  it("falls back to the default folder name when blanked", async () => {
    const strapi = makeStrapi();
    await setSettings(strapi, { folderName: "   " });
    expect((await publicSettings(strapi)).folderName).toBe("Generated images");
  });
});
