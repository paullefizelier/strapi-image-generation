import { useFetchClient } from "@strapi/strapi/admin";
import { PLUGIN_ID } from "./pluginId";
import type {
  Catalogue,
  GenerateInput,
  GenerateResult,
  Health,
  JournalEntry,
  PublicSettings,
} from "./types";

/** Thin, typed wrappers over the plugin's admin API. */
export function useImageGenApi() {
  const { get, post, put, del } = useFetchClient();
  const base = `/${PLUGIN_ID}`;

  return {
    async getCatalogue(): Promise<Catalogue> {
      const { data } = await get<Catalogue>(`${base}/catalogue`);
      return data;
    },
    async getSettings(): Promise<PublicSettings> {
      const { data } = await get<PublicSettings>(`${base}/settings`);
      return data;
    },
    async saveSettings(input: Record<string, unknown>): Promise<PublicSettings> {
      const { data } = await put<PublicSettings>(`${base}/settings`, input);
      return data;
    },
    async testSettings(): Promise<{ ok: boolean; error?: string; costedAbout?: number }> {
      const { data } = await post<{ ok: boolean; error?: string; costedAbout?: number }>(
        `${base}/settings/test`,
      );
      return data;
    },
    async generate(input: GenerateInput): Promise<GenerateResult> {
      const { data } = await post<GenerateResult>(`${base}/generate`, input);
      return data;
    },
    async getHealth(): Promise<Health> {
      const { data } = await get<Health>(`${base}/health`);
      return data;
    },
    async getJournal(): Promise<{ entries: JournalEntry[]; totalCost: number }> {
      const { data } = await get<{ entries: JournalEntry[]; totalCost: number }>(`${base}/journal`);
      return data;
    },
    async deleteGenerated(fileId: number): Promise<{ deleted: boolean }> {
      const { data } = await del<{ deleted: boolean }>(`${base}/journal/${fileId}`);
      return data;
    },
  };
}
