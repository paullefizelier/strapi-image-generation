import { describe, expect, it, vi } from "vitest";
import { sanitizeTitle, suggestTitle } from "../title";

/**
 * The file name lands in the asset's PUBLIC url, so the prompt is a poor name:
 * it describes people. These tests pin the two properties that matter — the
 * title is always one clean line, and asking for it can never break a
 * generation the editor has already paid for.
 */

describe("sanitizeTitle", () => {
  it("keeps a plain title as it is", () => {
    expect(sanitizeTitle("Cariste en entrepôt agroalimentaire")).toBe(
      "Cariste en entrepôt agroalimentaire",
    );
  });

  it("strips quotes the model wraps around its answer", () => {
    expect(sanitizeTitle('"Cariste en entrepôt"')).toBe("Cariste en entrepôt");
    expect(sanitizeTitle("« Cariste en entrepôt »")).toBe("Cariste en entrepôt");
  });

  it("strips a Title: prefix in either language", () => {
    expect(sanitizeTitle("Titre : Cariste en entrepôt")).toBe("Cariste en entrepôt");
    expect(sanitizeTitle("Title - Forklift operator")).toBe("Forklift operator");
  });

  it("takes the first line when the model writes a paragraph", () => {
    expect(sanitizeTitle("\n\nCariste en entrepôt\n\nEt voici pourquoi…")).toBe(
      "Cariste en entrepôt",
    );
  });

  it("drops a trailing period and collapses whitespace", () => {
    expect(sanitizeTitle("Cariste   en    entrepôt.")).toBe("Cariste en entrepôt");
  });

  it("truncates a title too long for a file name", () => {
    const title = sanitizeTitle("x".repeat(200));
    expect(title).toHaveLength(70);
    expect(title.endsWith("…")).toBe(true);
  });

  it("returns nothing for an empty answer, so the caller falls back", () => {
    expect(sanitizeTitle("")).toBe("");
    expect(sanitizeTitle("   \n  ")).toBe("");
  });
});

describe("suggestTitle", () => {
  const answer = (text: string) => ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  });

  it("reads the title out of a generateContent answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer("Cariste en entrepôt"));
    expect(await suggestTitle("k", "Un cariste…", { fetchImpl: fetchMock as never })).toBe(
      "Cariste en entrepôt",
    );
  });

  it("tells the model not to describe the person", async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer("x"));
    await suggestTitle("k", "a woman in her 30s", { fetchImpl: fetchMock as never });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.systemInstruction.parts[0].text).toMatch(/never a person's age, gender/);
  });

  it("uses generateContent, NOT the image endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer("x"));
    await suggestTitle("k", "prompt", { fetchImpl: fetchMock as never });
    expect(String(fetchMock.mock.calls[0][0])).toContain(":generateContent");
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("/interactions");
  });

  it("returns nothing rather than throwing when the call fails", async () => {
    // The image is already generated and paid for by then: a naming failure
    // must never become a failed generation.
    const failing = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(suggestTitle("k", "prompt", { fetchImpl: failing as never })).resolves.toBe("");

    const rejected = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    await expect(suggestTitle("k", "prompt", { fetchImpl: rejected as never })).resolves.toBe("");
  });

  it("does not call anything without a key or a prompt", async () => {
    const fetchMock = vi.fn();
    expect(await suggestTitle("", "prompt", { fetchImpl: fetchMock as never })).toBe("");
    expect(await suggestTitle("k", "  ", { fetchImpl: fetchMock as never })).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
