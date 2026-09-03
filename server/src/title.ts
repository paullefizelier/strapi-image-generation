/**
 * A short, neutral title for a generated asset.
 *
 * The prompt itself is a poor name. It describes people — age, gender,
 * appearance — and the file name ends up in the PUBLIC URL of the asset, so a
 * raw prompt publishes a description nobody chose to publish. The prompt is not
 * lost: it stays in the provenance journal, which is not public.
 *
 * This asks a cheap text model, over `:generateContent` — a different endpoint
 * from the image API. It must never break a generation: any failure falls back
 * to a trimmed prompt, because an awkward name is a smaller problem than an
 * image the editor paid for and did not get.
 */

export const DEFAULT_TITLE_MODEL = "gemini-2.0-flash";

const INSTRUCTION = [
  "Write a short title for a photograph, from the description that follows.",
  "Three to six words. No quotes, no final period, no prefix like 'Title:'.",
  "Name the scene, the trade and the place — never a person's age, gender,",
  "body, ethnicity or clothing. Write it in the language of the description.",
  "Answer with the title alone.",
].join(" ");

/**
 * Keep it to one plain line. A model that ignores the format must not put
 * quotes, newlines or a whole paragraph into a file name.
 */
export function sanitizeTitle(raw: string, max = 70): string {
  const line = (raw ?? "")
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  if (!line) return "";

  const clean = line
    .replace(/^["'«»“”\s]+|["'«»“”\s.]+$/g, "")
    .replace(/^(title|titre)\s*[:—-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

interface GenerateContentBody {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
}

export async function suggestTitle(
  apiKey: string,
  prompt: string,
  {
    model = DEFAULT_TITLE_MODEL,
    fetchImpl = fetch,
    timeoutMs = 10_000,
  }: { model?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<string> {
  if (!apiKey || !prompt.trim()) return "";

  const controller = new AbortController();
  const abort = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: INSTRUCTION }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 40 },
        }),
        signal: controller.signal,
      },
    );
    const body = (await response.json().catch(() => ({}))) as GenerateContentBody;
    if (!response.ok) return "";
    const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    return sanitizeTitle(text);
  } catch {
    // Deliberately silent: the caller falls back, the image still ships.
    return "";
  } finally {
    clearTimeout(abort);
  }
}
