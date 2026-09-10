import { describe, expect, it, vi } from "vitest";
import plugin from "../index";
import type { Core } from "@strapi/strapi";

/**
 * The guards on the routes, which had no tests at all.
 *
 * These are not ordinary validation: `journal.remove` is the one place where a
 * permission called "generate and retouch images" can delete a file, so what
 * it refuses to touch is the whole reason it is not a general "delete any
 * media" endpoint.
 */

const ctx = (over: Record<string, unknown> = {}) => {
  const thrown: { status: number; message: string }[] = [];
  return {
    request: { body: {} },
    params: {},
    query: {},
    state: {},
    body: undefined as unknown,
    thrown,
    throw(status: number, message: string) {
      thrown.push({ status, message });
      // Koa's ctx.throw stops the handler; mimic that so the test sees the
      // guard as a guard rather than as a logged complaint.
      throw new Error(`${status}: ${message}`);
    },
    ...over,
  };
};

const fakeStrapi = (journalEntries: unknown[], remove = vi.fn()) =>
  ({
    store: () => ({
      get: async () => journalEntries,
      set: async () => undefined,
    }),
    db: {
      query: () => ({ findOne: async () => ({ id: 42, name: "cariste" }) }),
    },
    plugin: () => ({ service: () => ({ remove }) }),
  }) as unknown as Core.Strapi;

/**
 * Cast through `unknown`: the plugin's own `Ctx` is not exported, and a fake
 * that satisfied it structurally would be a fake of Koa, not of what these
 * handlers actually touch.
 */
const journalController = (strapi: Core.Strapi) =>
  plugin.controllers.journal({ strapi }) as unknown as {
    remove: (c: ReturnType<typeof ctx>) => Promise<void>;
    list: (c: ReturnType<typeof ctx>) => Promise<void>;
  };

describe("journal.remove", () => {
  const recorded = [{ fileId: 42, estimatedCost: 0.134, at: "2026-09-10T10:00:00.000Z" }];

  it("deletes a file this plugin generated", async () => {
    const remove = vi.fn();
    const controller = journalController(fakeStrapi(recorded, remove));
    const c = ctx({ params: { fileId: "42" } });

    await controller.remove(c);

    expect(remove).toHaveBeenCalledOnce();
    expect(c.body).toEqual({ deleted: true });
  });

  it("refuses a file it did not generate", async () => {
    // Without this the route is "delete any media" for anyone holding the
    // generate permission, which is not what that permission says.
    const remove = vi.fn();
    const controller = journalController(fakeStrapi(recorded, remove));
    const c = ctx({ params: { fileId: "999" } });

    await expect(controller.remove(c)).rejects.toThrow(/404/);
    expect(remove).not.toHaveBeenCalled();
    expect(c.thrown[0].status).toBe(404);
  });

  it("refuses anything that is not a positive whole id", async () => {
    const remove = vi.fn();
    for (const fileId of ["0", "-3", "abc", "", "1.5"]) {
      const controller = journalController(fakeStrapi(recorded, remove));
      const c = ctx({ params: { fileId } });
      await expect(controller.remove(c)).rejects.toThrow(/400/);
    }
    expect(remove).not.toHaveBeenCalled();
  });

  it("stays quiet about cost: the total counts deleted images", async () => {
    // Deleting is not a refund, so the entry survives and list still bills it.
    const controller = journalController(fakeStrapi(recorded));
    const c = ctx();
    await controller.list(c);
    expect((c.body as { totalCost: number }).totalCost).toBeCloseTo(0.134);
  });
});

describe("health.get", () => {
  it("reports the running Strapi against the tested one", async () => {
    const strapi = { config: { get: () => "5.51.0" } } as unknown as Core.Strapi;
    const controller = plugin.controllers.health({ strapi }) as unknown as {
      get: (c: ReturnType<typeof ctx>) => Promise<void>;
    };
    const c = ctx();
    await controller.get(c);
    expect(c.body).toMatchObject({ strapi: { running: "5.51.0", status: "ok" } });
  });
});
