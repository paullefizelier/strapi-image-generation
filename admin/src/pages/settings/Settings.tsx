import * as React from "react";
import { useIntl } from "react-intl";
import {
  Badge,
  Box,
  Button,
  Field,
  Flex,
  Loader,
  Main,
  Textarea,
  SingleSelect,
  SingleSelectOption,
  TextInput,
  Typography,
} from "@strapi/design-system";
import { Layouts } from "@strapi/strapi/admin";
import { useImageGenApi } from "../../api";
import { getTranslation } from "../../getTranslation";
import type { Catalogue, PublicSettings } from "../../types";

/**
 * The API key and the defaults every editor inherits.
 *
 * The key is written to the plugin store and never read back: this screen only
 * ever learns whether one exists, where it came from, and its last four
 * characters. The model catalogue comes from the server so the prices shown
 * here cannot drift from the ones actually charged.
 */
const SettingsPage = () => {
  const { formatMessage } = useIntl();
  const api = useImageGenApi();

  const t = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatMessage({ id: getTranslation(id), defaultMessage }, values);

  const [settings, setSettings] = React.useState<PublicSettings | null>(null);
  const [catalogue, setCatalogue] = React.useState<Catalogue | null>(null);
  const [apiKey, setApiKey] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ tone: "success" | "danger"; text: string } | null>(
    null,
  );

  const load = React.useCallback(async () => {
    const [cfg, cat] = await Promise.all([api.getSettings(), api.getCatalogue()]);
    setSettings(cfg);
    setCatalogue(cat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const spec = catalogue?.models.find((m) => m.id === settings?.model);

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    setFeedback(null);
    try {
      setSettings(await api.saveSettings(patch));
      setApiKey("");
      setFeedback({ tone: "success", text: t("settings.saved", "Settings saved.") });
    } catch {
      setFeedback({ tone: "danger", text: t("settings.save-error", "Could not save.") });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await api.testSettings();
      setFeedback(
        result.ok
          ? {
              tone: "success",
              text: t(
                "settings.test-ok",
                "The key works — one 1K test image was generated (about $0.034).",
              ),
            }
          : { tone: "danger", text: result.error ?? t("settings.test-failed", "The test failed.") },
      );
    } finally {
      setBusy(false);
    }
  };

  if (!settings || !catalogue) {
    return (
      <Main>
        <Flex justifyContent="center" padding={8}>
          <Loader>{t("settings.loading", "Loading…")}</Loader>
        </Flex>
      </Main>
    );
  }

  return (
    <Main>
      <Layouts.Header
        title={t("settings.title", "Image Gen")}
        subtitle={t("settings.subtitle", "Google API key and the defaults editors inherit.")}
      />

      <Layouts.Content>
        <Flex direction="column" alignItems="stretch" gap={6}>
          <Box padding={6} background="neutral0" hasRadius shadow="tableShadow">
            <Flex direction="column" alignItems="stretch" gap={4}>
              <Flex gap={2} alignItems="center">
                <Typography variant="delta">{t("settings.key", "API key")}</Typography>
                <Badge textColor={settings.configured ? "success600" : "warning600"}>
                  {settings.configured
                    ? t("settings.configured", "configured ({source} {hint})", {
                        source: settings.keySource ?? "",
                        hint: settings.hint,
                      })
                    : t("settings.missing", "not configured")}
                </Badge>
              </Flex>

              <Typography variant="pi" textColor="neutral600">
                {t(
                  "settings.key-hint",
                  "Read from the admin first, then config/plugins.ts, then IMAGE_GEN_API_KEY, GEMINI_API_KEY or GOOGLE_API_KEY. An existing Gemini key is picked up with no configuration at all.",
                )}
              </Typography>

              <Field.Root name="apiKey">
                <Field.Label>{t("settings.new-key", "Replace the key")}</Field.Label>
                <TextInput
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  placeholder="AIza…"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
                />
              </Field.Root>

              <Flex gap={2}>
                <Button onClick={() => void save({ apiKey })} disabled={busy || !apiKey.trim()}>
                  {t("settings.save-key", "Save the key")}
                </Button>
                <Button variant="secondary" onClick={() => void test()} loading={busy} disabled={!settings.configured}>
                  {t("settings.test", "Test")}
                </Button>
                {settings.keySource === "settings" ? (
                  <Button variant="danger-light" onClick={() => void save({ apiKey: "" })} disabled={busy}>
                    {t("settings.remove-key", "Remove")}
                  </Button>
                ) : null}
              </Flex>
            </Flex>
          </Box>

          <Box padding={6} background="neutral0" hasRadius shadow="tableShadow">
            <Flex direction="column" alignItems="stretch" gap={4}>
              <Typography variant="delta">{t("settings.defaults", "Defaults")}</Typography>

              <Flex gap={3} wrap="wrap" alignItems="end">
                <Field.Root name="model" style={{ minWidth: 240 }}>
                  <Field.Label>{t("settings.model", "Model")}</Field.Label>
                  <SingleSelect
                    value={settings.model}
                    onChange={(next: string | number) => void save({ model: String(next) })}
                  >
                    {catalogue.models.map((model) => (
                      <SingleSelectOption key={model.id} value={model.id}>
                        {model.label}
                      </SingleSelectOption>
                    ))}
                  </SingleSelect>
                </Field.Root>

                <Field.Root name="imageSize" style={{ minWidth: 140 }}>
                  <Field.Label>{t("settings.size", "Size")}</Field.Label>
                  <SingleSelect
                    value={settings.imageSize}
                    onChange={(next: string | number) => void save({ imageSize: String(next) })}
                  >
                    {(spec?.sizes ?? []).map((size) => (
                      <SingleSelectOption key={size} value={size}>
                        {size}
                      </SingleSelectOption>
                    ))}
                  </SingleSelect>
                </Field.Root>

                <Field.Root name="aspectRatio" style={{ minWidth: 140 }}>
                  <Field.Label>{t("settings.ratio", "Aspect ratio")}</Field.Label>
                  <SingleSelect
                    value={settings.aspectRatio}
                    onChange={(next: string | number) => void save({ aspectRatio: String(next) })}
                  >
                    {catalogue.aspectRatios.map((ratio) => (
                      <SingleSelectOption key={ratio} value={ratio}>
                        {ratio}
                      </SingleSelectOption>
                    ))}
                  </SingleSelect>
                </Field.Root>
              </Flex>

              {spec ? (
                <Typography variant="pi" textColor="neutral600">
                  {t("settings.price", "{label}: about ${price} per image at {size}.", {
                    label: spec.label,
                    price: (spec.price[settings.imageSize] ?? 0).toFixed(3),
                    size: settings.imageSize,
                  })}
                </Typography>
              ) : null}

              <Field.Root
                name="stylePrompt"
                hint={t(
                  "settings.style-hint",
                  "Prepended to every prompt, so generated images share a look. The Interactions API has no system field, so it travels inside the prompt itself — editors see it and can switch it off per image.",
                )}
              >
                <Field.Label>{t("settings.style", "House style")}</Field.Label>
                <Textarea
                  rows={3}
                  defaultValue={settings.stylePrompt}
                  placeholder={t(
                    "settings.style-placeholder",
                    "Photographic, natural light, muted palette, no text.",
                  )}
                  onBlur={(e: React.FocusEvent<HTMLTextAreaElement>) => {
                    if (e.target.value !== settings.stylePrompt) {
                      void save({ stylePrompt: e.target.value });
                    }
                  }}
                />
                <Field.Hint />
              </Field.Root>

              <Field.Root
                name="folderName"
                hint={t(
                  "settings.folder-hint",
                  "Generated images are grouped here, so they can be found, audited or purged as a set.",
                )}
              >
                <Field.Label>{t("settings.folder", "Media Library folder")}</Field.Label>
                <TextInput
                  defaultValue={settings.folderName}
                  onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                    if (e.target.value !== settings.folderName) {
                      void save({ folderName: e.target.value });
                    }
                  }}
                />
                <Field.Hint />
              </Field.Root>
            </Flex>
          </Box>

          {feedback ? (
            <Box
              padding={3}
              hasRadius
              background={feedback.tone === "success" ? "success100" : "danger100"}
            >
              <Typography textColor={feedback.tone === "success" ? "success700" : "danger700"}>
                {feedback.text}
              </Typography>
            </Box>
          ) : null}
        </Flex>
      </Layouts.Content>
    </Main>
  );
};

export default SettingsPage;
