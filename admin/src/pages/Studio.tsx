import * as React from "react";
import { useIntl } from "react-intl";
import {
  Badge,
  Box,
  Button,
  Dialog,
  Field,
  Flex,
  IconButton,
  Loader,
  Main,
  Modal,
  TextInput,
  Typography,
} from "@strapi/design-system";
import { ExternalLink, Folder, Search, Trash } from "@strapi/icons";
import { Layouts, Page, useNotification, useStrapiApp } from "@strapi/strapi/admin";
import GenerateDialog, { type Preset } from "../components/GenerateDialog";
import RatioGlyph from "../components/RatioGlyph";
import { useImageGenApi } from "../api";
import { groupFamilies, searchFamilies, spentSince, startOfMonth, type Family } from "../history";
import { integration } from "../integration";
import { presetFor } from "../preset";
import { getTranslation } from "../getTranslation";
import type { Health, JournalEntry, PublicSettings } from "../types";

/**
 * The studio: generate or retouch, and see what has already been generated.
 *
 * A grid, not a list. The first version rendered the journal exactly as it is
 * stored — a row per entry, text before image, a 96px thumbnail — which asked
 * people to READ a tool whose whole subject is what things look like. It also
 * showed a hero and its three declinations as four unrelated rows.
 *
 * So: one card per family, images at a size you can recognise, and the whole
 * provenance a click away rather than crammed into the row.
 */
const Studio = () => {
  const { formatMessage } = useIntl();
  const api = useImageGenApi();
  const { toggleNotification } = useNotification();

  const t = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatMessage({ id: getTranslation(id), defaultMessage }, values);

  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [settings, setSettings] = React.useState<PublicSettings | null>(null);
  const [entries, setEntries] = React.useState<JournalEntry[]>([]);
  const [spent, setSpent] = React.useState(0);
  const [health, setHealth] = React.useState<Health | null>(null);
  const [deleting, setDeleting] = React.useState<number | null>(null);
  const [preset, setPreset] = React.useState<Preset | null>(null);
  const [query, setQuery] = React.useState("");
  /** The entry shown large, with its full prompt and its links. */
  const [viewing, setViewing] = React.useState<JournalEntry | null>(null);

  /**
   * The plugin hooks into Strapi internals that no version promises. When one
   * moves, the plugin degrades quietly by design — it would rather show no
   * button than break a media field. Quietly is the problem: this panel is
   * where a silent degradation becomes something someone can see.
   */
  const components = useStrapiApp("ImageGenStudio", (state) => state.components);
  const hasPicker = Boolean(components?.["media-library"]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, journal, status] = await Promise.all([
        api.getSettings(),
        api.getJournal(),
        // A failing health check must not hide the studio itself.
        api.getHealth().catch(() => null),
      ]);
      setSettings(cfg);
      setEntries(journal.entries);
      setSpent(journal.totalCost);
      setHealth(status);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const families = React.useMemo(() => groupFamilies(entries), [entries]);
  const shown = React.useMemo(() => searchFamilies(families, query), [families, query]);
  const thisMonth = React.useMemo(() => spentSince(entries, startOfMonth()), [entries]);
  const deletedCount = entries.filter((entry) => entry.deletedAt).length;

  const integrationIssues = React.useMemo(() => {
    const issues: string[] = [];
    if (!integration.mediaField) {
      issues.push(
        t(
          "studio.hook-media-field",
          "The generate button inside content entries is not installed — Strapi's media field registry could not be read.",
        ),
      );
    }
    if (!hasPicker) {
      issues.push(
        t(
          "studio.hook-picker",
          "Reference images cannot be chosen from the library — the media picker component is missing.",
        ),
      );
    }
    if (health?.strapi.status === "newer") {
      issues.push(
        t(
          "studio.hook-version",
          "Strapi {running} is newer than {tested}, the version these hooks were verified against.",
          { running: health.strapi.running, tested: health.strapi.tested },
        ),
      );
    }
    return issues;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPicker, health]);

  const remove = async (entry: JournalEntry) => {
    setDeleting(entry.fileId);
    try {
      await api.deleteGenerated(entry.fileId);
      setEntries((current) =>
        current.map((item) =>
          item.fileId === entry.fileId ? { ...item, deletedAt: new Date().toISOString() } : item,
        ),
      );
      setViewing(null);
      toggleNotification({
        type: "success",
        message: t("studio.deleted", "“{name}” has been deleted", { name: entry.fileName }),
      });
    } catch (err) {
      toggleNotification({
        type: "danger",
        message:
          (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error
            ?.message ?? t("studio.delete-failed", "The image could not be deleted"),
      });
    } finally {
      setDeleting(null);
    }
  };

  const reuse = (entry: JournalEntry) => {
    setPreset(presetFor(entry, entries));
    setViewing(null);
    setOpen(true);
  };

  const folderUrl = settings?.folderId ? `/admin/plugins/upload?folder=${settings.folderId}` : null;

  const deleteButton = (entry: JournalEntry, label: string) => (
    <Dialog.Root>
      <Dialog.Trigger>
        <IconButton
          label={t("studio.delete", "Delete this image")}
          variant="ghost"
          disabled={deleting === entry.fileId}
        >
          <Trash />
        </IconButton>
      </Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Header>{t("studio.delete-title", "Delete this image?")}</Dialog.Header>
        <Dialog.Body>
          {t(
            "studio.delete-body",
            "“{name}” will be removed from the Media Library for good. Any content still pointing at it will lose its image.",
            { name: label },
          )}
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Cancel>
            <Button variant="tertiary" fullWidth>
              {t("studio.cancel", "Cancel")}
            </Button>
          </Dialog.Cancel>
          <Dialog.Action>
            <Button
              variant="danger-light"
              fullWidth
              startIcon={<Trash />}
              onClick={() => void remove(entry)}
            >
              {t("studio.confirm-delete", "Delete")}
            </Button>
          </Dialog.Action>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );

  const card = (family: Family) => {
    const { primary, variants } = family;
    return (
      <Box
        key={primary.fileId}
        background="neutral0"
        hasRadius
        shadow="tableShadow"
        overflow="hidden"
      >
        <Flex direction="column" alignItems="stretch" gap={0}>
          {/* The image is the affordance: click it to see everything about it. */}
          <Box
            tag="button"
            onClick={() => setViewing(primary)}
            background="neutral100"
            style={{
              border: 0,
              padding: 0,
              cursor: "pointer",
              display: "block",
              width: "100%",
              aspectRatio: primary.aspectRatio.replace(":", " / "),
            }}
            aria-label={t("studio.view", "See “{name}” in full", { name: primary.fileName })}
          >
            {primary.fileUrl ? (
              <img
                src={primary.fileUrl}
                alt=""
                style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : null}
          </Box>

          <Flex direction="column" alignItems="stretch" gap={2} padding={3}>
            <Typography fontWeight="bold" ellipsis>
              {primary.fileName}
            </Typography>
            <Typography variant="pi" textColor="neutral500">
              {primary.imageSize} · {primary.aspectRatio}
              {primary.estimatedCost !== null ? ` · $${primary.estimatedCost.toFixed(3)}` : ""}
            </Typography>

            {variants.length ? (
              <Flex gap={1} wrap="wrap" alignItems="center">
                <Typography variant="pi" textColor="neutral500">
                  {t("studio.also-in", "Also")}
                </Typography>
                {variants.map((variant) => (
                  <IconButton
                    key={variant.fileId}
                    label={t("studio.view-variant", "See the {ratio} version", {
                      ratio: variant.aspectRatio,
                    })}
                    variant="ghost"
                    onClick={() => setViewing(variant)}
                  >
                    <RatioGlyph ratio={variant.aspectRatio} />
                  </IconButton>
                ))}
              </Flex>
            ) : null}

            <Flex justifyContent="space-between" alignItems="center">
              {presetFor(primary, entries) ? (
                <Button
                  variant="tertiary"
                  size="S"
                  disabled={!settings?.configured}
                  onClick={() => reuse(primary)}
                >
                  {t("studio.reuse", "Reuse")}
                </Button>
              ) : (
                <span />
              )}
              {deleteButton(primary, primary.fileName)}
            </Flex>
          </Flex>
        </Flex>
      </Box>
    );
  };

  return (
    <Main>
      <Layouts.Header
        title={t("studio.title", "Image studio")}
        subtitle={t(
          "studio.subtitle",
          "Generate or retouch images. Everything lands in the Media Library as an ordinary asset.",
        )}
        primaryAction={
          <Button
            onClick={() => {
              setPreset(null);
              setOpen(true);
            }}
            disabled={!settings?.configured}
          >
            {t("studio.new", "New image")}
          </Button>
        }
      />

      <Layouts.Content>
        {loading ? (
          <Flex justifyContent="center" padding={8}>
            <Loader>{t("studio.loading", "Loading…")}</Loader>
          </Flex>
        ) : (
          <Flex direction="column" alignItems="stretch" gap={4}>
            {settings && !settings.configured ? (
              <Box padding={4} background="warning100" hasRadius>
                <Typography>
                  {t(
                    "studio.not-configured",
                    "No API key yet. Add one under Settings → Image Gen to start generating.",
                  )}
                </Typography>
              </Box>
            ) : null}

            <Flex gap={3} alignItems="center" wrap="wrap">
              <Badge>{t("studio.count", "{count} generated", { count: entries.length })}</Badge>
              <Badge>
                {t("studio.spent-month", "${amount} this month", { amount: thisMonth.toFixed(2) })}
              </Badge>
              <Badge>{t("studio.spent", "${amount} spent", { amount: spent.toFixed(2) })}</Badge>
              {deletedCount ? (
                <Badge>
                  {t("studio.deleted-count", "{count} deleted", { count: deletedCount })}
                </Badge>
              ) : null}
              {settings ? (
                folderUrl ? (
                  <Button
                    variant="tertiary"
                    size="S"
                    startIcon={<Folder />}
                    tag="a"
                    href={folderUrl}
                  >
                    {settings.folderName}
                  </Button>
                ) : (
                  <Typography variant="pi" textColor="neutral600">
                    {t("studio.folder", "Saved to “{folder}”", { folder: settings.folderName })}
                  </Typography>
                )
              ) : null}
            </Flex>

            {integrationIssues.length ? (
              <Box padding={3} background="warning100" hasRadius>
                <Flex direction="column" alignItems="start" gap={1}>
                  <Typography variant="pi" fontWeight="bold" textColor="warning700">
                    {t("studio.integration-degraded", "Some hooks into Strapi did not catch")}
                  </Typography>
                  {integrationIssues.map((issue) => (
                    <Typography key={issue} variant="pi" textColor="warning700">
                      · {issue}
                    </Typography>
                  ))}
                </Flex>
              </Box>
            ) : (
              <Typography variant="pi" textColor="neutral500">
                {t("studio.integration-ok", "In-entry button and library picker installed · {strapi}", {
                  strapi: health
                    ? t("studio.strapi-version", "Strapi {running}, verified against {tested}", {
                        running: health.strapi.running,
                        tested: health.strapi.tested,
                      })
                    : "",
                })}
              </Typography>
            )}

            {families.length ? (
              <Field.Root name="search">
                <TextInput
                  value={query}
                  placeholder={t("studio.search", "Search a description, a name, a ratio…")}
                  startAction={<Search />}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                />
              </Field.Root>
            ) : null}

            {families.length === 0 ? (
              <Page.NoData
                action={
                  <Button
                    onClick={() => {
                      setPreset(null);
                      setOpen(true);
                    }}
                    disabled={!settings?.configured}
                  >
                    {t("studio.new", "New image")}
                  </Button>
                }
              />
            ) : shown.length === 0 ? (
              <Box padding={6} background="neutral100" hasRadius>
                <Typography textColor="neutral600">
                  {t("studio.no-match", "Nothing matches “{query}”.", { query })}
                </Typography>
              </Box>
            ) : (
              <Box
                style={{
                  display: "grid",
                  gap: 16,
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                }}
              >
                {shown.map(card)}
              </Box>
            )}
          </Flex>
        )}
      </Layouts.Content>

      {/* One image, everything known about it. */}
      <Modal.Root open={Boolean(viewing)} onOpenChange={(next: boolean) => !next && setViewing(null)}>
        <Modal.Content>
          <Modal.Header>
            <Typography variant="beta">{viewing?.fileName}</Typography>
          </Modal.Header>
          <Modal.Body>
            {viewing ? (
              <Flex direction="column" alignItems="stretch" gap={3}>
                <Box hasRadius overflow="hidden" background="neutral100">
                  {viewing.fileUrl ? (
                    <img
                      src={viewing.fileUrl}
                      alt=""
                      style={{ display: "block", width: "100%", height: "auto" }}
                    />
                  ) : null}
                </Box>
                <Typography variant="sigma" textColor="neutral600">
                  {viewing.derivedFromFileId
                    ? t("studio.derived-title", "A {ratio} declination", {
                        ratio: viewing.aspectRatio,
                      })
                    : t("studio.prompt-title", "Description")}
                </Typography>
                <Typography>{viewing.prompt}</Typography>
                <Typography variant="pi" textColor="neutral500">
                  {viewing.model} · {viewing.imageSize} · {viewing.aspectRatio}
                  {viewing.estimatedCost !== null
                    ? ` · $${viewing.estimatedCost.toFixed(3)}`
                    : ""}
                  {` · ${new Date(viewing.at).toLocaleString()}`}
                </Typography>
                {viewing.style ? (
                  <Typography variant="pi" textColor="neutral500">
                    {t("studio.with-style", "Generated with the house style in force at the time.")}
                  </Typography>
                ) : null}
              </Flex>
            ) : null}
          </Modal.Body>
          <Modal.Footer>
            <Flex gap={2} wrap="wrap">
              {viewing?.fileUrl ? (
                <Button
                  variant="tertiary"
                  startIcon={<ExternalLink />}
                  tag="a"
                  href={viewing.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("studio.open-image", "Open the image")}
                </Button>
              ) : null}
              {folderUrl ? (
                <Button variant="tertiary" startIcon={<Folder />} tag="a" href={folderUrl}>
                  {t("studio.open-folder", "Open the folder")}
                </Button>
              ) : null}
            </Flex>
            {viewing ? (
              <Flex gap={2}>
                {deleteButton(viewing, viewing.fileName)}
                {presetFor(viewing, entries) ? (
                  <Button disabled={!settings?.configured} onClick={() => reuse(viewing)}>
                    {t("studio.reuse", "Reuse")}
                  </Button>
                ) : null}
              </Flex>
            ) : null}
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>

      <GenerateDialog
        open={open}
        preset={preset}
        onClose={() => {
          setOpen(false);
          void load();
        }}
      />
    </Main>
  );
};

export default Studio;
