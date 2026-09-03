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
  aspectRatio: AspectRatio | string;
  imageSize: ImageSize | string;
  /** Present for a retouch: the images the model works from. */
  references?: ReferenceImage[];
  /** Continues a previous edit chain. */
  previousInteractionId?: string;
  /** Output format. PNG keeps text crisp, which is what Pro is chosen for. */
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

export function buildRequest(options: GenerateOptions): InteractionRequest {
  const {
    model,
    prompt,
    aspectRatio,
    imageSize,
    references = [],
    previousInteractionId,
    outputMimeType = "image/png",
  } = options;

  // The text block leads: the reference images are what the instruction acts
  // upon, and the API reads the prompt as the instruction for the whole input.
  const input: InputBlock[] = [{ type: "text", text: prompt }];
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

interface InteractionResponse {
  interaction?: {
    id?: string;
    output_image?: { data?: string; mime_type?: string };
  };
  error?: { message?: string };
}

/**
 * Pull the image out of a response. Throws with the API's own message when
 * there is one — a provider that explains itself should not be flattened into
 * "generation failed".
 */
export function parseResponse(body: unknown, status?: number): GeneratedImage {
  const response = (body ?? {}) as InteractionResponse;
  if (response.error?.message) throw new Error(response.error.message);

  const image = response.interaction?.output_image;
  if (!image?.data) {
    throw new Error(
      status && status >= 400
        ? `Image API returned ${status}`
        : "The model returned no image. Try rewording the prompt — a request it declines to draw comes back empty.",
    );
  }

  return {
    buffer: Buffer.from(image.data, "base64"),
    mimeType: image.mime_type || "image/png",
    interactionId: response.interaction?.id,
  };
}

export async function generateImage(
  apiKey: string,
  options: GenerateOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<GeneratedImage> {
  if (!apiKey) {
    throw new Error(
      "Image generation is not configured — add a Google API key under Settings → Image Gen.",
    );
  }

  const response = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // The Interactions API authenticates by header. A key in the query string
      // is the older generateContent style and is rejected here.
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(buildRequest(options)),
  });

  // Read the body whatever the status: the useful message lives in it.
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (body as InteractionResponse).error?.message;
    throw new Error(message || `Image API returned ${response.status}`);
  }
  return parseResponse(body, response.status);
}
