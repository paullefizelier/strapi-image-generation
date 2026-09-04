import { PLUGIN_ID } from "./pluginId";
import { prefixPluginTranslations } from "./getTranslation";
import { withGeneration } from "./components/MediaFieldWithGeneration";
import { integration } from "./integration";

/**
 * Registration.
 *
 * NOTE: lazy entries must be async functions returning the module. `React.lazy`
 * here crashes the admin silently — empty #strapi, nothing in the console.
 */

interface FieldComponent {
  (props: Record<string, unknown>): unknown;
}

interface App {
  addMenuLink: (link: {
    to: string;
    icon: unknown;
    intlLabel: { id: string; defaultMessage: string };
    Component: () => Promise<{ default: unknown }>;
    permissions: { action: string; subject: null }[];
  }) => void;
  createSettingSection: (
    section: { id: string; intlLabel: { id: string; defaultMessage: string } },
    links: unknown[],
  ) => void;
  addFields: (field: { type: string; Component: unknown }) => void;
  registerPlugin: (plugin: { id: string; name: string }) => void;
  /** Internal registry. Read defensively — see below. */
  library?: { fields?: Record<string, FieldComponent> };
}

export default {
  register(app: App) {
    app.addMenuLink({
      to: `/plugins/${PLUGIN_ID}`,
      // Sparkle: the admin's own marker for AI-assisted actions.
      icon: () => "✨",
      intlLabel: { id: `${PLUGIN_ID}.menu.label`, defaultMessage: "Image studio" },
      Component: async () => (await import("./pages/Studio")) as { default: unknown },
      permissions: [{ action: `plugin::${PLUGIN_ID}.generate`, subject: null }],
    });

    app.createSettingSection(
      {
        id: PLUGIN_ID,
        intlLabel: { id: `${PLUGIN_ID}.settings.section`, defaultMessage: "Image Gen" },
      },
      [
        {
          intlLabel: { id: `${PLUGIN_ID}.settings.link`, defaultMessage: "Configuration" },
          id: `${PLUGIN_ID}-settings`,
          to: `/settings/${PLUGIN_ID}`,
          permissions: [{ action: `plugin::${PLUGIN_ID}.settings`, subject: null }],
          Component: async () => (await import("./pages/settings/Settings")).default,
        },
      ],
    );

    /**
     * Decorate the media field instead of replacing it.
     *
     * `addFields` overwrites the registry entry, so the only way to ADD to
     * Strapi's media field is to capture the current component and render it
     * inside ours. `library` is an internal property: if Strapi's internals
     * move, we register NOTHING. A media field that lost its picker is far
     * worse than a missing button.
     */
    const original = app.library?.fields?.media;
    if (original) {
      app.addFields({ type: "media", Component: withGeneration(original as never) });
      // Recorded, not just logged: the studio reports it where someone looks.
      integration.mediaField = true;
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        "[image-gen] Could not read the media field component — the in-field generate button is disabled. The Image studio page still works.",
      );
    }

    app.registerPlugin({ id: PLUGIN_ID, name: PLUGIN_ID });
  },

  async registerTrads({ locales }: { locales: string[] }) {
    return Promise.all(
      locales.map(async (locale) => {
        try {
          const { default: data } = await import(`./translations/${locale}.json`);
          return { data: prefixPluginTranslations(data), locale };
        } catch {
          return { data: {}, locale };
        }
      }),
    );
  },
};
