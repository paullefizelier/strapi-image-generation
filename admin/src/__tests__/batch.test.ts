import { describe, expect, it, vi } from "vitest";
import { runBatch, runReframes } from "../batch";
import type { Asset } from "../types";

const asset = (id: number): Asset => ({
  id,
  name: `image-${id}`,
  url: `/uploads/${id}.jpg`,
  mime: "image/jpeg",
});

/** A generate() that hands back a new asset each call and records its input. */
const spyGenerate = () => {
  let next = 100;
  return vi.fn().mockImplementation(async () => ({ asset: asset(++next) }));
};

describe("runBatch", () => {
  it("renders the description, then one reframe per extra ratio", async () => {
    const generate = spyGenerate();
    const outcome = await runBatch(
      { prompt: "un cariste", model: "gemini-3-pro-image", imageSize: "2K", aspectRatio: "16:9" },
      ["1:1", "9:16"],
      { generate },
    );

    expect(generate).toHaveBeenCalledTimes(3);
    expect(outcome.variants).toHaveLength(2);
    expect(outcome.failed).toEqual([]);
    expect(outcome.skipped).toEqual([]);

    // Every declination reframes the PRIMARY, carrying its model and size — a
    // variant drawn from the prompt again would be a different photograph.
    const [, second, third] = generate.mock.calls.map((call) => call[0]);
    expect(second).toEqual({
      reframeOf: outcome.primary.id,
      aspectRatio: "1:1",
      model: "gemini-3-pro-image",
      imageSize: "2K",
    });
    expect(third.reframeOf).toBe(outcome.primary.id);
    expect(third.aspectRatio).toBe("9:16");
    // …and carries no prompt: the server composes the reframe instruction.
    expect(second.prompt).toBeUndefined();
  });

  it("throws when the description itself fails, having spent nothing further", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("refused"));
    await expect(
      runBatch({ prompt: "x", aspectRatio: "16:9" }, ["1:1", "9:16"], { generate }),
    ).rejects.toThrow("refused");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("keeps going after one ratio fails, and says which and why", async () => {
    let call = 0;
    const generate = vi.fn().mockImplementation(async () => {
      call += 1;
      if (call === 3) throw new Error("the model returned no image");
      return { asset: asset(call) };
    });

    const outcome = await runBatch({ prompt: "x", aspectRatio: "16:9" }, ["1:1", "9:16", "21:9"], {
      generate,
    });

    expect(outcome.variants).toHaveLength(2);
    expect(outcome.failed).toEqual([{ ratio: "9:16", message: "the model returned no image" }]);
    expect(outcome.skipped).toEqual([]);
  });

  it("reads the provider's message out of an axios-shaped error", async () => {
    let call = 0;
    const generate = vi.fn().mockImplementation(async () => {
      call += 1;
      if (call === 2) {
        throw { response: { data: { error: { message: "That image is already 1:1" } } } };
      }
      return { asset: asset(call) };
    });
    const outcome = await runBatch({ prompt: "x", aspectRatio: "16:9" }, ["1:1"], { generate });
    expect(outcome.failed[0].message).toBe("That image is already 1:1");
  });
});

describe("cancelling", () => {
  it("starts no further render once the editor has stopped", async () => {
    // The bug this pins: the loop used to run on after the dialog closed,
    // charging for renders the editor believed they had cancelled.
    let stopped = false;
    const generate = spyGenerate();

    const outcome = await runBatch({ prompt: "x", aspectRatio: "16:9" }, ["1:1", "9:16", "21:9"], {
      generate,
      cancelled: () => stopped,
      onVariant: () => {
        stopped = true; // the editor hits Stop while the first declination lands
      },
    });

    // primary + one declination, then nothing.
    expect(generate).toHaveBeenCalledTimes(2);
    expect(outcome.variants).toHaveLength(1);
    expect(outcome.skipped).toEqual(["9:16", "21:9"]);
  });

  it("lets the render already in flight finish, since it is paid for either way", async () => {
    const generate = spyGenerate();
    const outcome = await runBatch({ prompt: "x", aspectRatio: "16:9" }, ["1:1"], {
      generate,
      // Stopped from the very first check, but the primary has already been
      // requested by then — throwing its result away would waste the charge.
      cancelled: () => true,
      onVariant: () => undefined,
    });
    expect(outcome.primary).toBeDefined();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(outcome.skipped).toEqual(["1:1"]);
  });

  it("reports every ratio as skipped when stopped before any declination", async () => {
    const generate = spyGenerate();
    const outcome = await runReframes(7, ["1:1", "4:3"], {}, {
      generate,
      cancelled: () => true,
    });
    expect(generate).not.toHaveBeenCalled();
    expect(outcome.skipped).toEqual(["1:1", "4:3"]);
    expect(outcome.failed).toEqual([]);
  });
});

describe("runReframes", () => {
  it("retries just the ratios given, against an asset that already exists", async () => {
    // What the "generate the missing formats" button does: the primary is
    // already made and paid for, so only the gaps are re-run.
    const generate = spyGenerate();
    const outcome = await runReframes(42, ["9:16", "21:9"], { imageSize: "4K" }, { generate });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls.every((call) => call[0].reframeOf === 42)).toBe(true);
    expect(generate.mock.calls[0][0].imageSize).toBe("4K");
    expect(outcome.variants).toHaveLength(2);
  });
});
