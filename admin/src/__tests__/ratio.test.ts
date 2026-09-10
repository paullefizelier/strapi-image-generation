import { describe, expect, it } from "vitest";
import { ratioBox } from "../ratio";

describe("ratioBox", () => {
  it("fills the box on a square", () => {
    expect(ratioBox("1:1", 20)).toEqual({ width: 20, height: 20 });
  });

  it("keeps the long side at the maximum for a landscape ratio", () => {
    expect(ratioBox("16:9", 20)).toEqual({ width: 20, height: 11 });
    expect(ratioBox("4:3", 20)).toEqual({ width: 20, height: 15 });
  });

  it("turns the glyph on its side for a portrait ratio", () => {
    expect(ratioBox("9:16", 20)).toEqual({ width: 11, height: 20 });
  });

  it("never draws a glyph so thin it reads as a line", () => {
    expect(ratioBox("21:9", 8).height).toBeGreaterThanOrEqual(4);
  });

  it("falls back to a square for anything it cannot parse", () => {
    expect(ratioBox("", 20)).toEqual({ width: 20, height: 20 });
    expect(ratioBox("16x9", 20)).toEqual({ width: 20, height: 20 });
    expect(ratioBox("0:9", 20)).toEqual({ width: 20, height: 20 });
  });
});
