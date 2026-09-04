import * as React from "react";
import { useIntl } from "react-intl";
import { Button, Flex } from "@strapi/design-system";
import { Sparkle } from "@strapi/icons";
import { useField } from "@strapi/strapi/admin";
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
 *
 * IMPORTANT — where the value comes from. A field in the registry does NOT
 * receive `value`/`onChange` as props: the Content Manager renders it with
 * `jsx(CustomInput, { ...props, hint, disabled })` and the field reads the form
 * itself through `useField(name)`, exactly as `MediaLibraryInput` does. Reading
 * `props.onChange` here finds `undefined`, which is how this button spent three
 * releases never rendering at all.
 *
 * `useField` needs a Form context. Both places that render a registry media
 * field provide one: the edit view, and the history view — which wraps it in
 * its own `<Form method="PUT" disabled>` (VersionInputRenderer), where
 * `disabled` also keeps this button out of a read-only past version.
 */

interface MediaFieldProps {
  name: string;
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
    const { name, attribute, disabled } = props;
    const { value, onChange } = useField(name);

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
      // The form's onChange takes (name, value) — not a DOM-style event.
      const next = attribute?.multiple
        ? [...(Array.isArray(value) ? value : []), asset]
        : asset;
      onChange(name, next);
    };

    return (
      <Flex direction="column" alignItems="stretch" gap={2}>
        <Original {...props} />
        {disabled ? null : (
          <Flex justifyContent="flex-end">
            <Button
              variant="secondary"
              size="S"
              startIcon={<Sparkle />}
              onClick={() => setOpen(true)}
            >
              {current.length
                ? t("field.retouch", "Retouch with AI")
                : t("field.generate", "Generate an image")}
            </Button>
          </Flex>
        )}
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
