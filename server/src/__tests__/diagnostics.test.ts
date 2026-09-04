import { describe, expect, it } from "vitest";
import { TESTED_STRAPI, compareToTested, health } from "../diagnostics";

describe("compareToTested", () => {
  it("matches the version it was verified against", () => {
    expect(compareToTested("5.51.0")).toBe("ok");
  });

  it("ignores the patch, which does not move internals", () => {
    // Flagging every patch would teach people to ignore the warning.
    expect(compareToTested("5.51.7")).toBe("ok");
  });

  it("flags a newer minor as untested territory", () => {
    expect(compareToTested("5.52.0")).toBe("newer");
    expect(compareToTested("6.0.0")).toBe("newer");
  });

  it("flags an older one too", () => {
    expect(compareToTested("5.40.0")).toBe("older");
    expect(compareToTested("4.25.0")).toBe("older");
  });

  it("says unknown rather than guessing", () => {
    expect(compareToTested("")).toBe("unknown");
    expect(compareToTested("next")).toBe("unknown");
    expect(compareToTested(undefined as unknown as string)).toBe("unknown");
  });
});

describe("health", () => {
  it("reports both versions, so the UI never has to hardcode one", () => {
    expect(health("5.51.0")).toEqual({
      strapi: { running: "5.51.0", tested: TESTED_STRAPI, status: "ok" },
    });
  });
});
