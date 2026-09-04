// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The regression suite for the media field decorator.
 *
 * This exists because the generate button shipped in three releases without
 * ever rendering: it was guarded by `props.onChange`, and a field in Strapi's
 * registry never receives one — the Content Manager passes only
 * `{ ...props, hint, disabled }` and the field reads the form through
 * `useField(name)`. Nothing here could catch that, because nothing here
 * existed. Every test below fails against that old component.
 *
 * The design system is stubbed rather than loaded. Its packages declare
 * `"type": "module"` while `main` points at a CommonJS build, so Node resolves
 * the pair and throws "exports is not defined in ES module scope" — and the
 * failure cascades through @strapi/ui-primitives. Nothing here is a test of
 * Strapi's Button anyway: what these components look like is checked by tsc
 * against the real prop types, and what they DO is checked here.
 */

vi.mock("@strapi/design-system", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  Flex: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@strapi/icons", () => ({ Sparkle: () => <span /> }));

const onChange = vi.fn();
let fieldValue: unknown = null;

vi.mock("@strapi/strapi/admin", () => ({
  // The real hook needs Strapi's whole Form machinery; what matters is that
  // the component asks THIS for its value and its onChange, and not its props.
  useField: () => ({ value: fieldValue, onChange }),
}));

const GENERATED = { id: 42, name: "Cariste en entrepôt", url: "/uploads/c.jpg", mime: "image/jpeg" };

vi.mock("../components/GenerateDialog", () => ({
  default: ({ onUse }: { onUse?: (asset: unknown) => void }) => (
    <button type="button" onClick={() => onUse?.(GENERATED)}>
      stub-accept-image
    </button>
  ),
}));

const { withGeneration } = await import("../components/MediaFieldWithGeneration");

/** Stands in for Strapi's own media field, so we can assert it survives. */
const StrapiMediaField = () => <div data-testid="strapi-media-field" />;

const Field = withGeneration(StrapiMediaField);

const renderField = (props: Record<string, unknown> = {}) =>
  render(
    <IntlProvider locale="en" messages={{}}>
      <Field name="cover" {...props} />
    </IntlProvider>,
  );

beforeEach(() => {
  onChange.mockClear();
  fieldValue = null;
});

// Vitest runs without globals here, so RTL's own afterEach hook never installs
// itself and renders would pile up in one document.
afterEach(cleanup);

describe("withGeneration", () => {
  it("renders Strapi's own media field, always", () => {
    // The whole premise of decorating rather than replacing: losing the picker
    // would be far worse than losing the button.
    renderField();
    expect(screen.getByTestId("strapi-media-field")).toBeDefined();
  });

  it("offers to generate on an empty field", () => {
    renderField();
    expect(screen.getByRole("button", { name: /generate an image/i })).toBeDefined();
  });

  it("offers to retouch when the field already holds an image", () => {
    // Read from the form, not from props — props.value is undefined here too.
    fieldValue = { id: 7, name: "photo", url: "/uploads/p.jpg", mime: "image/png" };
    renderField();
    expect(screen.getByRole("button", { name: /retouch with ai/i })).toBeDefined();
  });

  it("ignores a non-image value when deciding the label", () => {
    fieldValue = { id: 8, name: "brochure.pdf", url: "/uploads/b.pdf", mime: "application/pdf" };
    renderField();
    expect(screen.getByRole("button", { name: /generate an image/i })).toBeDefined();
  });

  it("shows no button on a disabled field", () => {
    // This is also the history view, which renders the field read-only.
    renderField({ disabled: true });
    expect(screen.getByTestId("strapi-media-field")).toBeDefined();
    expect(screen.queryByRole("button", { name: /generate an image/i })).toBeNull();
  });

  it("fills the field through the form's onChange(name, value)", () => {
    renderField();
    screen.getByText("stub-accept-image").click();
    // Not a DOM-style event: Strapi's form onChange takes (name, value).
    expect(onChange).toHaveBeenCalledWith("cover", GENERATED);
  });

  it("appends to a multiple field instead of replacing it", () => {
    const existing = { id: 1, name: "one", url: "/uploads/1.jpg", mime: "image/jpeg" };
    fieldValue = [existing];
    renderField({ name: "gallery", attribute: { multiple: true } });
    screen.getByText("stub-accept-image").click();
    expect(onChange).toHaveBeenCalledWith("gallery", [existing, GENERATED]);
  });
});
