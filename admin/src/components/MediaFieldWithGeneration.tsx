import * as React from "react";
import { useIntl } from "react-intl";
import { Button, Flex } from "@strapi/design-system";
import GenerateDialog from "./GenerateDialog";
import { getTranslation } from "../getTranslation";
import type { Asset } from "../types";

/**
 * Adds a "Generate an image" affordance to Strapi's own media field.
 *
 * Strapi's Media Library exposes no injection zone — `@strapi/upload` registers
 * neither `injectionZones` nor `apis`, so `injectComponent` on it is a silent
 * no-op. The one supported hook is the field registry, which REPLACES the
 * component. Replacing it outright would mean re-implementing the whole media
 * field, so instead we wrap the original: the editor keeps the field they know,
 * with one button added.
 *
 * Generating from here also fills the field directly, which is fewer steps than
 * the picker it sits next to — generate, close, reopen, hunt for the file.
 */

interface MediaFieldProps {
  name: string;
  value?: unknown;
  onChange?: (event: { target: { name: string; value: unknown; type: string } }) => void;
  attribute?: { multiple?: boolean };
  disabled?: boolean;
  [key: string]: unknown;
}

export function withGeneration(
  Original: React.ComponentType<MediaFieldProps>,
): React.ComponentType<MediaFieldProps> {
  const MediaFieldWithGeneration = (props: MediaFieldProps) => {
    const { formatMessage } = useIntl();
    const [open, setOpen] = React.useState(false);
    const { name, value, onChange, attribute, disabled } = props;

    const t = (id: string, defaultMessage: string) =>
      formatMessage({ id: getTranslation(id), defaultMessage });

    /** Whatever is already in the field is the obvious thing to retouch. */
    const current = React.useMemo<Asset[]>(() => {
      const list = Array.isArray(value) ? value : value ? [value] : [];
      return list.filter(
        (item): item is Asset =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as Asset).id === "number" &&
          String((item as Asset).mime ?? "").startsWith("image/"),
      );
    }, [value]);

    const use = (asset: Asset) => {
      if (!onChange) return;
      const next = attribute?.multiple
        ? [...(Array.isArray(value) ? value : []), asset]
        : asset;
      onChange({ target: { name, value: next, type: "media" } });
    };

    return (
      <Flex direction="column" alignItems="stretch" gap={2}>
        <Original {...props} />
        {onChange && !disabled ? (
          <Flex justifyContent="flex-end">
            <Button variant="tertiary" size="S" onClick={() => setOpen(true)}>
              {current.length
                ? t("field.retouch", "Retouch with AI")
                : t("field.generate", "Generate an image")}
            </Button>
          </Flex>
        ) : null}
        <GenerateDialog
          open={open}
          onClose={() => setOpen(false)}
          onUse={use}
          initialReferences={current}
        />
      </Flex>
    );
  };

  MediaFieldWithGeneration.displayName = "MediaFieldWithGeneration";
  return MediaFieldWithGeneration;
}
