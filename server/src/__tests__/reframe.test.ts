import { describe, expect, it } from "vitest";
import { reframeInstruction, reframeTitle } from "../reframe";

describe("reframeInstruction", () => {
  it("names the target ratio", () => {
    expect(reframeInstruction("9:16")).toContain("9:16 aspect ratio");
  });

  it("asks the model to extend the scene, not to draw a new one", () => {
    // The whole point of a declination: the same photograph in another shape.
    // A fresh render at another ratio would be a different photograph.
    const instruction = reframeInstruction("21:9");
    expect(instruction).toMatch(/Keep the same subject/);
    expect(instruction).toMatch(/Extend the existing scene/);
    expect(instruction).toMatch(/Do not invent a different scene/);
  });
});

describe("reframeTitle", () => {
  it("names the variant after its source", () => {
    expect(reframeTitle("Cariste en entrepôt", "9:16")).toBe("Cariste en entrepôt (9:16)");
  });

  it("replaces a ratio already in the name instead of stacking one", () => {
    expect(reframeTitle("Cariste en entrepôt (4:3)", "9:16")).toBe("Cariste en entrepôt (9:16)");
  });

  it("drops a file extension, since the source may be named as a file", () => {
    expect(reframeTitle("cariste-entrepot.jpg", "1:1")).toBe("cariste-entrepot (1:1)");
  });

  it("still produces a name when the source has none", () => {
    expect(reframeTitle("", "16:9")).toBe("Image (16:9)");
  });
});
