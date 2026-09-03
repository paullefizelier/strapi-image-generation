import * as React from "react";
import { useIntl } from "react-intl";
import {
  Badge,
  Box,
  Button,
  Dialog,
  Flex,
  IconButton,
  Loader,
  Main,
  Typography,
} from "@strapi/design-system";
import { Trash } from "@strapi/icons";
import { Layouts, Page, useNotification } from "@strapi/strapi/admin";
import GenerateDialog from "../components/GenerateDialog";
import { useImageGenApi } from "../api";
import { getTranslation } from "../getTranslation";
import type { JournalEntry, PublicSettings } from "../types";

/**
 * The studio: generate or retouch, and see what has already been generated.
 *
 * The history is not decoration — it is the provenance log. It answers "how was
 * this image made", lets a prompt be reused, and shows what the feature has
 * cost so far, which is the number nobody thinks to ask for until the invoice.
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
  const [deleting, setDeleting] = React.useState<number | null>(null);

  // Deleted images leave the list but stay in the count and the total: the
  // asset is gone, the money was still spent.
  const visible = React.useMemo(() => entries.filter((entry) => !entry.deletedAt), [entries]);
  const deletedCount = entries.length - visible.length;

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, journal] = await Promise.all([api.getSettings(), api.getJournal()]);
      setSettings(cfg);
      setEntries(journal.entries);
      setSpent(journal.totalCost);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const remove = async (entry: JournalEntry) => {
    setDeleting(entry.fileId);
    try {
      await api.deleteGenerated(entry.fileId);
      setEntries((current) =>
        current.map((item) =>
          item.fileId === entry.fileId ? { ...item, deletedAt: new Date().toISOString() } : item,
        ),
      );
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

  return (
    <Main>
      <Layouts.Header
        title={t("studio.title", "Image studio")}
        subtitle={t(
          "studio.subtitle",
          "Generate or retouch images. Everything lands in the Media Library as an ordinary asset.",
        )}
        primaryAction={
          <Button onClick={() => setOpen(true)} disabled={!settings?.configured}>
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
              <Badge>{t("studio.spent", "${amount} spent", { amount: spent.toFixed(2) })}</Badge>
              {deletedCount ? (
                <Badge>
                  {t("studio.deleted-count", "{count} deleted", { count: deletedCount })}
                </Badge>
              ) : null}
              {settings ? (
                <Typography variant="pi" textColor="neutral600">
                  {t("studio.folder", "Saved to “{folder}”", { folder: settings.folderName })}
                </Typography>
              ) : null}
            </Flex>

            {visible.length === 0 ? (
              <Page.NoData
                action={
                  <Button onClick={() => setOpen(true)} disabled={!settings?.configured}>
                    {t("studio.new", "New image")}
                  </Button>
                }
              />
            ) : (
              <Flex direction="column" alignItems="stretch" gap={2}>
                {visible.map((entry) => (
                  <Box
                    key={`${entry.fileId}-${entry.at}`}
                    padding={3}
                    background="neutral0"
                    hasRadius
                    shadow="tableShadow"
                  >
                    <Flex gap={4} alignItems="start">
                      {entry.fileUrl ? (
                        <Box
                          hasRadius
                          overflow="hidden"
                          background="neutral100"
                          style={{ width: 96, flexShrink: 0 }}
                        >
                          <img
                            src={entry.fileUrl}
                            alt=""
                            style={{ display: "block", width: "100%", height: "auto" }}
                          />
                        </Box>
                      ) : null}
                      <Flex direction="column" alignItems="start" gap={1} flex="1">
                        <Typography fontWeight="bold">{entry.fileName}</Typography>
                        <Typography variant="pi" textColor="neutral600">
                          {entry.prompt}
                        </Typography>
                        <Typography variant="pi" textColor="neutral500">
                          {entry.model} · {entry.imageSize} · {entry.aspectRatio}
                          {entry.estimatedCost !== null
                            ? ` · $${entry.estimatedCost.toFixed(3)}`
                            : ""}
                          {entry.referenceFileIds.length
                            ? ` · ${t("studio.from-references", "from {count} reference(s)", {
                                count: entry.referenceFileIds.length,
                              })}`
                            : ""}
                        </Typography>
                      </Flex>

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
                          <Dialog.Header>
                            {t("studio.delete-title", "Delete this image?")}
                          </Dialog.Header>
                          <Dialog.Body>
                            {t(
                              "studio.delete-body",
                              "“{name}” will be removed from the Media Library for good. Any content still pointing at it will lose its image.",
                              { name: entry.fileName },
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
                    </Flex>
                  </Box>
                ))}
              </Flex>
            )}
          </Flex>
        )}
      </Layouts.Content>

      <GenerateDialog
        open={open}
        onClose={() => {
          setOpen(false);
          void load();
        }}
      />
    </Main>
  );
};

export default Studio;
