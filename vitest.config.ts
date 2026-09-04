import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Admin tests declare `@vitest-environment jsdom` in their own docblock,
    // so the server suite keeps running on plain node.
    include: ["server/src/**/*.test.ts", "admin/src/**/*.test.{ts,tsx}"],

  },
});
