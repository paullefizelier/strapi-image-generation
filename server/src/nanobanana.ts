import type { AspectRatio, ImageSize, ModelId } from "./models";

/**
 * Client for Google's Nano Banana image models.
 *
 * This is the *Interactions* API, not `:generateContent` — a different endpoint
 * with a different auth scheme (key in a header, not the query string). The
 * sibling plugin strapi-plugin-mega-nav calls Gemini for text and looks similar;
 * its code is NOT interchangeable with this one.
 *
 * `buildRequest` and `parseResponse` are pure so the request shape can be
 * pinned by tests without a network or an API key.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

export interface ReferenceImage {
  mimeType: string;
  /** base64, without a data: prefix. */
  data: string;
}

export interface GenerateOptions {
  model: ModelId | string;
  prompt: string;
  /** House style, prepended to the prompt. See `composePrompt`. */
  style?: string;
  aspectRatio: AspectRatio | string;
  imageSize: ImageSize | string;
  /** Present for a retouch: the images the model works from. */
  references?: ReferenceImage[];
  /** Continues a previous edit chain. */
  previousInteractionId?: string;
  /**
   * Output format. NOT optional in practice: the models disagree on what they
   * accept, so the caller passes the one its model declares (see models.ts).
   */
  outputMimeType?: "image/png" | "image/jpeg";
}

type InputBlock =
  | { type: "text"; text: string }
  | { type: "image"; mime_type: string; data: string };

export interface InteractionRequest {
  model: string;
  input: InputBlock[];
  response_format: {
    type: "image";
    mime_type: string;
    aspect_ratio: string;
    image_size: string;
  };
  previous_interaction_id?: string;
}

/**
 * Fold the house style into the prompt.
 *
 * The Interactions API has NO system-instruction field — unlike
 * `:generateContent`, an input block carries no role. Style guidance therefore
 * has to travel inside the prompt itself. It leads, and the editor's own words
 * follow on their own line: a model reads the opening as the frame and the rest
 * as the subject, and keeping them on separate lines stops a style sentence
 * from running into the subject and changing its meaning.
 */
export function composePrompt(prompt: string, style?: string): string {
  const trimmedStyle = (style ?? "").trim();
  const trimmedPrompt = prompt.trim();
  if (!trimmedStyle) return trimmedPrompt;
  if (!trimmedPrompt) return trimmedStyle;
  return `${trimmedStyle}\n\n${trimmedPrompt}`;
}

export function buildRequest(options: GenerateOptions): InteractionRequest {
  const {
    model,
    prompt,
    style,
    aspectRatio,
    imageSize,
    references = [],
    previousInteractionId,
    outputMimeType = "image/jpeg",
  } = options;

  // The text block leads: the reference images are what the instruction acts
  // upon, and the API reads the prompt as the instruction for the whole input.
  const input: InputBlock[] = [{ type: "text", text: composePrompt(prompt, style) }];
  for (const reference of references) {
    input.push({ type: "image", mime_type: reference.mimeType, data: reference.data });
  }

  return {
    model,
    input,
    response_format: {
      type: "image",
      mime_type: outputMimeType,
      aspect_ratio: aspectRatio,
      // Uppercase K is required — "2k" is rejected by the API.
      image_size: imageSize,
    },
    ...(previousInteractionId ? { previous_interaction_id: previousInteractionId } : {}),
  };
}

export interface GeneratedImage {
  buffer: Buffer;
  mimeType: string;
  /** Lets a follow-up edit continue this chain. */
  interactionId?: string;
}

/**
 * The response shape.
 *
 * The docs show SDK code (`interaction.output_image`) but publish no example of
 * a raw REST body — and `output_image` is a CONVENIENCE ACCESSOR on the client
 * objects, not a field of the JSON that comes back over HTTP. The bytes live in
 * content blocks inside `steps`. Both are read here, and an `interaction`
 * wrapper is tolerated, because the documentation never says whether the raw
 * body has one.
 */
interface ContentBlock {
  type?: string;
  data?: string;
  text?: string;
  mime_type?: string;
  mimeType?: string;
}

interface InteractionBody {
  id?: string;
  steps?: { type?: string; content?: ContentBlock[] }[];
  output_image?: { data?: string; mime_type?: string; mimeType?: string };
  interaction?: InteractionBody;
  error?: { message?: string };
}

const rootOf = (body: unknown): InteractionBody => {
  const value = (body ?? {}) as InteractionBody;
  return value.interaction ?? value;
};

const blocksOf = (body: InteractionBody): ContentBlock[] =>
  (body.steps ?? []).flatMap((step) => step.content ?? []);

const isImageBlock = (block: ContentBlock): boolean =>
  Boolean(block?.data) && (block.type === "image" || Boolean(block.mime_type ?? block.mimeType));

/** The image the model drew, or null when it drew none. */
export function findImage(body: unknown): { data: string; mimeType: string } | null {
  const root = rootOf(body);

  const convenience = root.output_image;
  if (convenience?.data) {
    return { data: convenience.data, mimeType: convenience.mime_type ?? convenience.mimeType ?? "" };
  }

  // "the LAST generated image block" — an interleaved answer can hold several.
  const images = blocksOf(root).filter(isImageBlock);
  const last = images[images.length - 1];
  return last?.data ? { data: last.data, mimeType: last.mime_type ?? last.mimeType ?? "" } : null;
}

/** Whatever the model said instead of drawing — usually why it declined. */
export function findText(body: unknown): string {
  return blocksOf(rootOf(body))
    .filter((block) => block.type === "text" && block.text?.trim())
    .map((block) => block.text!.trim())
    .join(" ")
    .trim();
}

/**
 * Pull the image out of a response. Throws with the API's own message when
 * there is one — a provider that explains itself should not be flattened into
 * "generation failed".
 */
export function parseResponse(
  body: unknown,
  status?: number,
  { styleApplied = false }: { styleApplied?: boolean } = {},
): GeneratedImage {
  const root = rootOf(body);
  if (root.error?.message) throw new Error(root.error.message);

  const image = findImage(body);
  if (!image) {
    if (status && status >= 400) throw new Error(`Image API returned ${status}`);
    // The model usually SAYS why it declined. Repeating its words beats a
    // guess about rewording the prompt.
    const said = findText(body);
    if (!said) {
      throw new Error("The model returned no image and gave no reason. Try rewording the prompt.");
    }
    // A house style phrased as an instruction ("write prompts for…", "you are
    // an art director") is obeyed as an instruction: the model writes instead
    // of drawing. There is no system field to isolate it into, so the only
    // cure is wording the style as a DESCRIPTION.
    const hint = styleApplied
      ? " The house style may be the cause: written as an instruction it is obeyed as one, and the model writes instead of drawing. Describe the look (\"photographic, direct flash, hard shadows\") rather than asking for prompts, or switch the style off for this image."
      : "";
    throw new Error(`The model answered with text instead of an image: ${said}${hint}`);
  }

  return {
    buffer: Buffer.from(image.data, "base64"),
    mimeType: image.mimeType || "image/jpeg",
    interactionId: root.id,
  };
}

/**
 * Fail before the gateway does.
 *
 * A hung provider call keeps the HTTP request open until the platform's proxy
 * gives up, and the caller then sees a generic 502 from the edge rather than
 * anything explaining itself. Timing out on our side turns that into a real
 * message. Default is deliberately under the ~60s proxy timeouts of common
 * hosts (Strapi Cloud/Koyeb, Heroku, Fly).
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 55_000;

export async function generateImage(
  apiKey: string,
  options: GenerateOptions,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<GeneratedImage> {
  if (!apiKey) {
    throw new Error(
      "Image generation is not configured — add a Google API key under Settings → Image Gen.",
    );
  }

  const controller = new AbortController();
  const abort = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

  let response: Response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // The Interactions API authenticates by header. A key in the query string
        // is the older generateContent style and is rejected here.
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(buildRequest(options)),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(
        `The image API did not answer within ${Math.round(timeoutMs / 1000)}s. A large size on the Pro model is slow — try a smaller size, or raise \`requestTimeoutMs\` if your host allows longer requests.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(abort);
  }

  // Read the body whatever the status: the useful message lives in it.
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = rootOf(body).error?.message;
    throw new Error(message || `Image API returned ${response.status}`);
  }
  return parseResponse(body, response.status, { styleApplied: Boolean(options.style?.trim()) });
}
