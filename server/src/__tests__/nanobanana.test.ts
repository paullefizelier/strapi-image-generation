import { describe, expect, it, vi } from "vitest";
import { buildRequest, composePrompt, DEFAULT_REQUEST_TIMEOUT_MS, generateImage, parseResponse } from "../nanobanana";

/**
 * These tests pin the wire contract of the Interactions API. It is deliberately
 * NOT the `:generateContent` shape used elsewhere for text — the endpoint, the
 * auth header and the body all differ, and confusing the two is the most
 * likely way this file breaks.
 */

const base = {
  model: "gemini-3-pro-image",
  prompt: "A warehouse at golden hour",
  aspectRatio: "16:9",
  imageSize: "2K",
};

describe("buildRequest", () => {
  it("builds a text-to-image body", () => {
    expect(buildRequest(base)).toEqual({
      model: "gemini-3-pro-image",
      input: [{ type: "text", text: "A warehouse at golden hour" }],
      response_format: {
        type: "image",
        mime_type: "image/jpeg",
        aspect_ratio: "16:9",
        image_size: "2K",
      },
    });
  });

  it("keeps the size uppercase — the API rejects \"2k\"", () => {
    expect(buildRequest({ ...base, imageSize: "4K" }).response_format.image_size).toBe("4K");
  });

  it("puts the prompt first, then every reference image", () => {
    const request = buildRequest({
      ...base,
      references: [
        { mimeType: "image/png", data: "AAA" },
        { mimeType: "image/jpeg", data: "BBB" },
      ],
    });
    expect(request.input).toEqual([
      { type: "text", text: "A warehouse at golden hour" },
      { type: "image", mime_type: "image/png", data: "AAA" },
      { type: "image", mime_type: "image/jpeg", data: "BBB" },
    ]);
  });

  it("carries previous_interaction_id only when continuing an edit", () => {
    expect(buildRequest(base).previous_interaction_id).toBeUndefined();
    expect(buildRequest({ ...base, previousInteractionId: "int_1" }).previous_interaction_id).toBe(
      "int_1",
    );
  });
});

describe("composePrompt", () => {
  it("puts the house style first and the subject on its own line", () => {
    // The Interactions API has no system field, so the style has to ride inside
    // the prompt. Separate lines stop a style sentence running into the subject.
    expect(composePrompt("A warehouse", "Photographic, muted palette.")).toBe(
      "Photographic, muted palette.\n\nA warehouse",
    );
  });

  it("leaves the prompt untouched when no style is set", () => {
    expect(composePrompt("A warehouse")).toBe("A warehouse");
    expect(composePrompt("A warehouse", "   ")).toBe("A warehouse");
  });

  it("trims both sides so a stray newline in the setting does not shift the prompt", () => {
    expect(composePrompt("  A warehouse \n", "  Muted palette.  ")).toBe(
      "Muted palette.\n\nA warehouse",
    );
  });

  it("survives an empty prompt without emitting a dangling separator", () => {
    expect(composePrompt("", "Muted palette.")).toBe("Muted palette.");
  });
});

describe("the style inside a request", () => {
  it("reaches the API in the single text block", () => {
    const request = buildRequest({ ...base, style: "Muted palette." });
    expect(request.input).toEqual([
      { type: "text", text: "Muted palette.\n\nA warehouse at golden hour" },
    ]);
  });

  it("still leads the reference images on a retouch", () => {
    const request = buildRequest({
      ...base,
      style: "Muted palette.",
      references: [{ mimeType: "image/png", data: "AAA" }],
    });
    expect(request.input[0]).toEqual({
      type: "text",
      text: "Muted palette.\n\nA warehouse at golden hour",
    });
    expect(request.input[1]).toEqual({ type: "image", mime_type: "image/png", data: "AAA" });
  });
});

describe("parseResponse", () => {
  it("decodes the image from interaction.output_image", () => {
    const data = Buffer.from("hello").toString("base64");
    const result = parseResponse({
      interaction: { id: "int_9", output_image: { data, mime_type: "image/webp" } },
    });
    expect(result.buffer.toString()).toBe("hello");
    expect(result.mimeType).toBe("image/webp");
    expect(result.interactionId).toBe("int_9");
  });

  it("defaults the mime type when the API omits it", () => {
    const data = Buffer.from("x").toString("base64");
    expect(parseResponse({ interaction: { output_image: { data } } }).mimeType).toBe("image/png");
  });

  it("surfaces the provider's own error message", () => {
    expect(() => parseResponse({ error: { message: "API key not valid" } })).toThrow(
      "API key not valid",
    );
  });

  it("explains an empty answer rather than throwing something opaque", () => {
    // A prompt the model declines comes back 200 with no image.
    expect(() => parseResponse({ interaction: {} })).toThrow(/no image/i);
  });
});

describe("generateImage", () => {
  const okResponse = {
    ok: true,
    status: 200,
    json: async () => ({
      interaction: { id: "int_1", output_image: { data: Buffer.from("png").toString("base64") } },
    }),
  };

  it("refuses before the network when no key is configured", async () => {
    const fetchMock = vi.fn();
    await expect(generateImage("", base, fetchMock as never)).rejects.toThrow(/not configured/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("authenticates by header, not by query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse);
    await generateImage("secret-key", base, fetchMock as never);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(init.headers["x-goog-api-key"]).toBe("secret-key");
    expect(String(url)).not.toContain("secret-key");
  });

  it("reports the provider's message on a non-2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "Quota exceeded" } }),
    });
    await expect(generateImage("k", base, fetchMock as never)).rejects.toThrow("Quota exceeded");
  });

  it("fails on its own clock rather than hanging until a proxy gives up", async () => {
    // A request that never returns keeps the HTTP connection open until the
    // host's proxy kills it, and the caller then sees a bare gateway 502.
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const promise = generateImage("k", base, fetchMock as never, 1_000);
    const assertion = expect(promise).rejects.toThrow(/did not answer within 1s/);
    await vi.advanceTimersByTimeAsync(1_100);
    await assertion;
    vi.useRealTimers();
  });

  it("defaults to a timeout below the usual 60s proxy limit", () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBeLessThan(60_000);
  });

  it("still reports the status when the error body is unreadable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    });
    await expect(generateImage("k", base, fetchMock as never)).rejects.toThrow("500");
  });
});
