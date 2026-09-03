import { describe, expect, it, vi } from "vitest";
import {
  buildRequest,
  composePrompt,
  DEFAULT_REQUEST_TIMEOUT_MS,
  findImage,
  findText,
  generateImage,
  parseResponse,
} from "../nanobanana";

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

describe("reading the answer", () => {
  const b64 = (text: string) => Buffer.from(text).toString("base64");

  /**
   * The real REST shape. `output_image` is an SDK convenience accessor and is
   * NOT in the JSON that comes over HTTP — the bytes are content blocks inside
   * `steps`. Reading only the accessor made every successful generation look
   * like a refusal.
   */
  const steps = (blocks: unknown[]) => ({
    id: "int_9",
    steps: [{ type: "model_output", content: blocks }],
  });

  it("finds the image in steps[].content[] — the shape HTTP actually returns", () => {
    const result = parseResponse(
      steps([{ type: "image", mime_type: "image/jpeg", data: b64("jpeg") }]),
    );
    expect(result.buffer.toString()).toBe("jpeg");
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.interactionId).toBe("int_9");
  });

  it("takes the LAST image when the answer interleaves several", () => {
    const result = parseResponse(
      steps([
        { type: "image", mime_type: "image/jpeg", data: b64("first") },
        { type: "text", text: "and here is a better one" },
        { type: "image", mime_type: "image/jpeg", data: b64("second") },
      ]),
    );
    expect(result.buffer.toString()).toBe("second");
  });

  it("still reads the SDK-style output_image, in case a body carries one", () => {
    const result = parseResponse({
      interaction: { id: "int_1", output_image: { data: b64("x"), mime_type: "image/png" } },
    });
    expect(result.mimeType).toBe("image/png");
  });

  it("tolerates the interaction wrapper being absent — the docs never say", () => {
    expect(findImage(steps([{ type: "image", data: b64("y") }]))?.data).toBe(b64("y"));
    expect(findImage({ interaction: steps([{ type: "image", data: b64("y") }]) })?.data).toBe(b64("y"));
  });

  it("repeats what the model SAID instead of guessing about the prompt", () => {
    // A refusal usually explains itself; echoing it beats "try rewording".
    expect(() =>
      parseResponse(steps([{ type: "text", text: "I can't create images of real people." }])),
    ).toThrow(/I can't create images of real people/);
  });

  it("says so plainly when there is neither image nor explanation", () => {
    expect(() => parseResponse(steps([]))).toThrow(/no image and gave no reason/);
  });

  it("surfaces the provider's error message above everything else", () => {
    expect(() => parseResponse({ error: { message: "API key not valid" } })).toThrow(
      "API key not valid",
    );
  });

  it("collects text across blocks", () => {
    expect(findText(steps([{ type: "text", text: " one " }, { type: "text", text: "two" }]))).toBe(
      "one two",
    );
  });

  it("defaults the mime type when a block omits it", () => {
    expect(parseResponse(steps([{ type: "image", data: b64("z") }])).mimeType).toBe("image/jpeg");
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
