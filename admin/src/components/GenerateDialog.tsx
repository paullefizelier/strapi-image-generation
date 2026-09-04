import * as React from "react";
import { useIntl } from "react-intl";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Field,
  Flex,
  Loader,
  Modal,
  SingleSelect,
  SingleSelectOption,
  Textarea,
  TextInput,
  Toggle,
  Typography,
} from "@strapi/design-system";
import { useStrapiApp } from "@strapi/strapi/admin";
import { useImageGenApi } from "../api";
import { isCatalogueStale } from "../catalogue";
import { getTranslation } from "../getTranslation";
import type { Asset, Catalogue, ModelSpec, PublicSettings } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called once the editor accepts the result — absent in the studio. */
  onUse?: (asset: Asset) => void;
  /** Pre-loaded references, e.g. the media already in the field being edited. */
  initialReferences?: Asset[];
  /**
   * Settings to open with, from a journal entry being reused. Applied on every
   * open, unlike the defaults, which only fill what the editor has not touched.
   */
  preset?: Preset | null;
}

export interface Preset {
  prompt: string;
  model?: string;
  imageSize?: string;
  aspectRatio?: string;
  /** Whether the house style was in force when this prompt was first run. */
  useStyle?: boolean;
}

interface MediaLibraryAsset {
  id: number;
  documentId?: string;
  name: string;
  url: string;
  mime: string;
}

const money = (value: number | null): string =>
  value === null ? "—" : `$${value.toFixed(value < 0.1 ? 4 : 3)}`;

/**
 * Prompt → image, or reference images + prompt → image.
 *
 * The cost of the current settings is shown BEFORE the call, because it is real
 * money and the difference between the cheapest and the most expensive
 * combination here is a factor of seven.
 */
const GenerateDialog = ({ open, onClose, onUse, initialReferences = [], preset }: Props) => {
  const { formatMessage } = useIntl();
  const api = useImageGenApi();
  // The upload plugin registers its picker in the app's component library.
  const components = useStrapiApp("ImageGenDialog", (state) => state.components);

  const t = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatMessage({ id: getTranslation(id), defaultMessage }, values);

  const [catalogue, setCatalogue] = React.useState<Catalogue | null>(null);
  const [settings, setSettings] = React.useState<PublicSettings | null>(null);
  const [prompt, setPrompt] = React.useState("");
  const [model, setModel] = React.useState("");
  const [imageSize, setImageSize] = React.useState("");
  const [aspectRatio, setAspectRatio] = React.useState("");
  const [references, setReferences] = React.useState<Asset[]>(initialReferences);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [useStyle, setUseStyle] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState<Asset | null>(null);
  /** Extra ratios to decline the result into — one paid render each. */
  const [extraRatios, setExtraRatios] = React.useState<string[]>([]);
  const [variants, setVariants] = React.useState<Asset[]>([]);
  /** Ratios that failed, with the reason — a lost variant must say why. */
  const [failedRatios, setFailedRatios] = React.useState<{ ratio: string; message: string }[]>([]);
  /** The ratio being drawn right now, so a run of several is not a blank wait. */
  const [step, setStep] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setReferences(initialReferences);
    setResult(null);
    setVariants([]);
    setFailedRatios([]);
    setError("");
    // A preset replaces what is there; the defaults only fill the blanks, so
    // reopening the dialog does not undo what the editor was in the middle of.
    if (preset) {
      setPrompt(preset.prompt);
      setTitle("");
      setExtraRatios([]);
      setUseStyle(preset.useStyle ?? true);
    }
    Promise.all([api.getCatalogue(), api.getSettings()])
      .then(([cat, cfg]) => {
        setCatalogue(cat);
        setSettings(cfg);
        // `current` starts as "", which `??` would keep — hence `||`.
        setModel((current) => preset?.model || current || cfg.model);
        setImageSize((current) => preset?.imageSize || current || cfg.imageSize);
        setAspectRatio((current) => preset?.aspectRatio || current || cfg.aspectRatio);
      })
      .catch(() => setError(t("dialog.load-error", "Could not load the image settings.")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const spec: ModelSpec | undefined = catalogue?.models.find((m) => m.id === model);

  // A model change can strand an unsupported size (Lite is 1K only).
  React.useEffect(() => {
    if (spec && !spec.sizes.includes(imageSize)) setImageSize(spec.sizes[spec.sizes.length - 1]);
  }, [spec, imageSize]);

  // Choosing the main ratio must not leave it selected as a declination too.
  React.useEffect(() => {
    setExtraRatios((current) => current.filter((ratio) => ratio !== aspectRatio));
  }, [aspectRatio]);

  const cost = spec ? (spec.price[imageSize] ?? null) : null;
  const imageCount = 1 + extraRatios.length;
  // One ratio per call, so the bill is per image. The button says the total.
  const totalCost = cost === null ? null : cost * imageCount;
  const canGenerate = Boolean(prompt.trim()) && !busy && settings?.configured;

  const messageOf = (err: unknown) =>
    (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
      ?.message ?? (err as Error).message;

  const generate = async () => {
    setBusy(true);
    setError("");
    setVariants([]);
    setFailedRatios([]);
    try {
      setStep(aspectRatio);
      const { asset } = await api.generate({
        prompt: prompt.trim(),
        model,
        imageSize,
        aspectRatio,
        referenceFileIds: references.map((r) => r.id),
        useStyle,
        title: title.trim(),
      });
      setResult(asset);

      /**
       * The declinations are separate calls, made here rather than server-side
       * on purpose: the API draws one ratio per call, and four 55-second
       * renders inside one HTTP request would pass the proxy's own timeout
       * long before finishing. One request per ratio also means a failure on
       * the third does not lose the first two.
       */
      const made: Asset[] = [];
      const missed: { ratio: string; message: string }[] = [];
      for (const ratio of extraRatios) {
        setStep(ratio);
        try {
          const { asset: variant } = await api.generate({
            reframeOf: asset.id,
            aspectRatio: ratio,
            model,
            imageSize,
          });
          made.push(variant);
          setVariants([...made]);
        } catch (err) {
          missed.push({ ratio, message: messageOf(err) });
          setFailedRatios([...missed]);
        }
      }
    } catch (err) {
      setError(messageOf(err) || t("dialog.error", "The image could not be generated."));
    } finally {
      setBusy(false);
      setStep("");
    }
  };

  const MediaLibraryDialog = components?.["media-library"] as
    | React.ComponentType<{
        onClose: () => void;
        onSelectAssets: (assets: MediaLibraryAsset[]) => void;
        allowedTypes?: string[];
        multiple?: boolean;
      }>
    | undefined;

  return (
    <>
      <Modal.Root open={open} onOpenChange={(next: boolean) => !next && onClose()}>
        <Modal.Content>
          <Modal.Header>
            <Typography variant="beta">
              {references.length
                ? t("dialog.title-retouch", "Retouch an image")
                : t("dialog.title", "Generate an image")}
            </Typography>
          </Modal.Header>

          <Modal.Body>
            <Flex direction="column" alignItems="stretch" gap={4}>
              {settings && !settings.configured ? (
                <Box padding={3} background="warning100" hasRadius>
                  <Typography variant="pi">
                    {t(
                      "dialog.not-configured",
                      "No API key yet — add one under Settings → Image Gen.",
                    )}
                  </Typography>
                </Box>
              ) : null}

              {result ? (
                <Flex direction="column" alignItems="stretch" gap={3}>
                  <Box hasRadius overflow="hidden" background="neutral100">
                    <img
                      src={result.url}
                      alt=""
                      style={{ display: "block", width: "100%", height: "auto" }}
                    />
                  </Box>
                  <Typography variant="pi" textColor="neutral600">
                    {t(
                      "dialog.saved",
                      "Saved to the Media Library in “{folder}”. It is a normal asset from here on.",
                      { folder: settings?.folderName ?? "" },
                    )}
                  </Typography>

                  {variants.length ? (
                    <Flex direction="column" alignItems="stretch" gap={2}>
                      <Typography variant="sigma" textColor="neutral600">
                        {t("dialog.variants", "Declinations ({count})", {
                          count: variants.length,
                        })}
                      </Typography>
                      <Flex gap={2} wrap="wrap" alignItems="start">
                        {variants.map((variant) => (
                          <Box
                            key={variant.id}
                            hasRadius
                            overflow="hidden"
                            background="neutral100"
                            style={{ width: 120 }}
                          >
                            <img
                              src={variant.url}
                              alt=""
                              style={{ display: "block", width: "100%", height: "auto" }}
                            />
                          </Box>
                        ))}
                      </Flex>
                    </Flex>
                  ) : null}

                  {failedRatios.length ? (
                    <Box padding={3} background="warning100" hasRadius>
                      <Typography variant="pi" textColor="warning700">
                        {t(
                          "dialog.variants-failed",
                          "The main image is saved. These ratios did not come back: {ratios}",
                          { ratios: failedRatios.map((f) => `${f.ratio} (${f.message})`).join(" · ") },
                        )}
                      </Typography>
                    </Box>
                  ) : null}
                </Flex>
              ) : (
                <>
                  <Field.Root name="prompt">
                    <Field.Label>{t("dialog.prompt", "Describe the image")}</Field.Label>
                    <Textarea
                      value={prompt}
                      rows={4}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        setPrompt(e.target.value)
                      }
                      placeholder={t(
                        "dialog.prompt-placeholder",
                        "A logistics warehouse at golden hour, wide shot, warm light",
                      )}
                    />
                  </Field.Root>

                  <Field.Root
                    name="title"
                    hint={t(
                      "dialog.asset-title-hint",
                      "Left empty, a short neutral one is written for you. The file name ends up in the image's public URL, so the prompt is a poor name for it.",
                    )}
                  >
                    <Field.Label>{t("dialog.asset-title", "Title (optional)")}</Field.Label>
                    <TextInput
                      value={title}
                      placeholder={t("dialog.asset-title-placeholder", "Written automatically")}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
                    />
                    <Field.Hint />
                  </Field.Root>

                  {settings?.stylePrompt ? (
                    <Box padding={3} background="neutral100" hasRadius>
                      <Flex direction="column" alignItems="stretch" gap={2}>
                        <Flex justifyContent="space-between" alignItems="center" gap={3}>
                          <Typography variant="sigma" textColor="neutral600">
                            {t("dialog.style", "House style")}
                          </Typography>
                          <Toggle
                            checked={useStyle}
                            onLabel={t("dialog.style-on", "On")}
                            offLabel={t("dialog.style-off", "Off")}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              setUseStyle(e.target.checked)
                            }
                          />
                        </Flex>
                        {/* Shown, not hidden: an invisible prompt modifier is the
                            surest way to make a result inexplicable. */}
                        <Typography
                          variant="pi"
                          textColor={useStyle ? "neutral700" : "neutral500"}
                          style={{ whiteSpace: "pre-wrap" }}
                        >
                          {settings.stylePrompt}
                        </Typography>
                        {useStyle ? (
                          <Typography variant="pi" textColor="neutral500">
                            {t("dialog.style-hint", "Added before your description.")}
                          </Typography>
                        ) : null}
                      </Flex>
                    </Box>
                  ) : null}

                  <Flex gap={3} wrap="wrap" alignItems="end">
                    <Field.Root name="model" style={{ minWidth: 220 }}>
                      <Field.Label>{t("dialog.model", "Model")}</Field.Label>
                      <SingleSelect
                        value={model}
                        onChange={(next: string | number) => setModel(String(next))}
                      >
                        {(catalogue?.models ?? []).map((m) => (
                          <SingleSelectOption key={m.id} value={m.id}>
                            {m.label}
                          </SingleSelectOption>
                        ))}
                      </SingleSelect>
                    </Field.Root>

                    <Field.Root name="size" style={{ minWidth: 120 }}>
                      <Field.Label>{t("dialog.size", "Size")}</Field.Label>
                      <SingleSelect
                        value={imageSize}
                        onChange={(next: string | number) => setImageSize(String(next))}
                      >
                        {(spec?.sizes ?? []).map((size) => (
                          <SingleSelectOption key={size} value={size}>
                            {size}
                          </SingleSelectOption>
                        ))}
                      </SingleSelect>
                    </Field.Root>

                    <Field.Root name="ratio" style={{ minWidth: 120 }}>
                      <Field.Label>{t("dialog.ratio", "Aspect ratio")}</Field.Label>
                      <SingleSelect
                        value={aspectRatio}
                        onChange={(next: string | number) => setAspectRatio(String(next))}
                      >
                        {(catalogue?.aspectRatios ?? []).map((ratio) => (
                          <SingleSelectOption key={ratio} value={ratio}>
                            {ratio}
                          </SingleSelectOption>
                        ))}
                      </SingleSelect>
                    </Field.Root>
                  </Flex>

                  <Flex direction="column" alignItems="stretch" gap={2}>
                    <Typography variant="sigma" textColor="neutral600">
                      {t("dialog.also-in", "Also decline it into")}
                    </Typography>
                    <Flex gap={3} wrap="wrap">
                      {(catalogue?.aspectRatios ?? [])
                        .filter((ratio) => ratio !== aspectRatio)
                        .map((ratio) => (
                          <Checkbox
                            key={ratio}
                            checked={extraRatios.includes(ratio)}
                            disabled={busy}
                            onCheckedChange={(checked: boolean | "indeterminate") =>
                              setExtraRatios((current) =>
                                checked === true
                                  ? [...current, ratio]
                                  : current.filter((item) => item !== ratio),
                              )
                            }
                          >
                            {ratio}
                          </Checkbox>
                        ))}
                    </Flex>
                    <Typography variant="pi" textColor="neutral500">
                      {t(
                        "dialog.also-in-hint",
                        "Each one is the SAME image extended to that shape — one extra render, billed like any other. Drawn one after another, so a long list takes a while.",
                      )}
                    </Typography>
                  </Flex>

                  {spec ? (
                    <Typography variant="pi" textColor="neutral600">
                      {spec.note} · {t("dialog.cost", "About {cost} per image", { cost: money(cost) })}
                    </Typography>
                  ) : null}

                  {catalogue ? (
                    <Typography
                      variant="pi"
                      textColor={
                        isCatalogueStale(catalogue.verifiedOn) ? "warning700" : "neutral500"
                      }
                    >
                      {isCatalogueStale(catalogue.verifiedOn)
                        ? t(
                            "dialog.prices-stale",
                            "These prices were last checked on {date} and may have moved since. They can be corrected in config.models.",
                            { date: catalogue.verifiedOn },
                          )
                        : t("dialog.prices-checked", "Prices checked on {date}", {
                            date: catalogue.verifiedOn,
                          })}
                      {catalogue.overridden
                        ? ` · ${t("dialog.prices-overridden", "adjusted by this project's configuration")}`
                        : ""}
                    </Typography>
                  ) : null}

                  <Flex direction="column" alignItems="stretch" gap={2}>
                    <Flex justifyContent="space-between" alignItems="center">
                      <Typography variant="sigma" textColor="neutral600">
                        {t("dialog.references", "Reference images ({count})", {
                          count: references.length,
                        })}
                      </Typography>
                      {MediaLibraryDialog ? (
                        <Button
                          variant="tertiary"
                          size="S"
                          onClick={() => setPickerOpen(true)}
                          disabled={busy}
                        >
                          {t("dialog.pick-references", "Choose from the library")}
                        </Button>
                      ) : null}
                    </Flex>
                    {references.length ? (
                      <Flex gap={2} wrap="wrap">
                        {references.map((reference) => (
                          <Badge key={reference.id} onClick={() => undefined}>
                            {reference.name}
                          </Badge>
                        ))}
                      </Flex>
                    ) : (
                      <Typography variant="pi" textColor="neutral500">
                        {t(
                          "dialog.references-hint",
                          "None — the image is drawn from the prompt alone. Add one to retouch it instead.",
                        )}
                      </Typography>
                    )}
                    {references.length && spec && references.length > spec.maxReferences ? (
                      <Typography variant="pi" textColor="danger600">
                        {t("dialog.too-many-references", "{model} accepts at most {max}.", {
                          model: spec.label,
                          max: spec.maxReferences,
                        })}
                      </Typography>
                    ) : null}
                  </Flex>

                  <Typography variant="pi" textColor="neutral500">
                    {t(
                      "dialog.synthid",
                      "Every generated image carries an invisible SynthID watermark. This cannot be turned off.",
                    )}
                  </Typography>
                </>
              )}

              {busy ? (
                <Flex justifyContent="center" padding={4}>
                  <Loader small>
                    {imageCount > 1 && step
                      ? t("dialog.working-ratio", "Drawing {ratio}…", { ratio: step })
                      : t("dialog.working", "Drawing…")}
                  </Loader>
                </Flex>
              ) : null}

              {error ? (
                <Box padding={3} background="danger100" hasRadius>
                  <Typography variant="pi" textColor="danger700">
                    {error}
                  </Typography>
                </Box>
              ) : null}
            </Flex>
          </Modal.Body>

          <Modal.Footer>
            <Button variant="tertiary" onClick={onClose}>
              {result ? t("common.close", "Close") : t("common.cancel", "Cancel")}
            </Button>
            {result ? (
              <Flex gap={2}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    // Chain an edit: the result becomes the reference.
                    setReferences([result]);
                    setResult(null);
                  }}
                >
                  {t("dialog.retouch-this", "Retouch this one")}
                </Button>
                {onUse ? (
                  <Button
                    onClick={() => {
                      onUse(result);
                      onClose();
                    }}
                  >
                    {t("dialog.use", "Use this image")}
                  </Button>
                ) : null}
              </Flex>
            ) : (
              <Button onClick={() => void generate()} disabled={!canGenerate} loading={busy}>
                {imageCount > 1
                  ? t("dialog.generate-many", "Generate {count} images · {cost}", {
                      count: imageCount,
                      cost: money(totalCost),
                    })
                  : t("dialog.generate", "Generate · {cost}", { cost: money(cost) })}
              </Button>
            )}
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>

      {pickerOpen && MediaLibraryDialog ? (
        <MediaLibraryDialog
          allowedTypes={["images"]}
          multiple
          onClose={() => setPickerOpen(false)}
          onSelectAssets={(assets) => {
            setReferences(
              assets.map((asset) => ({
                id: asset.id,
                documentId: asset.documentId,
                name: asset.name,
                url: asset.url,
                mime: asset.mime,
              })),
            );
            setPickerOpen(false);
          }}
        />
      ) : null}
    </>
  );
};

export default GenerateDialog;
