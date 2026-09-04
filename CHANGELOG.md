# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/) — while on `0.x`, a minor bump may
carry breaking changes.

## [Unreleased]

## [0.5.0] — 2026-09-04

### Added

- **The admin is tested now.** Ninety-six tests covered pure server logic, and
  every bug that actually reached an editor was outside them — a button that
  never rendered for three releases, a column that does not exist, a response
  shape the documentation does not publish. A plugin whose whole value is a UI
  cannot claim stability without a single UI test.

  `MediaFieldWithGeneration` now has a regression suite: the button appears on
  an empty field, says *Retouch* when the field already holds an image, stays
  away from a disabled field (which is also the history view), and fills the
  form through `onChange(name, value)` — appending rather than replacing on a
  multiple field. Reintroducing the old `props.onChange` mixup fails three of
  them, which is the point.

  The design system is stubbed rather than loaded: its packages declare
  `"type": "module"` with a CommonJS `main`, so Node resolves the pair and
  throws *"exports is not defined in ES module scope"*. What those components
  look like is checked by `tsc` against the real prop types; what they do is
  checked here.

- **The studio says whether the plugin actually hooked into Strapi.** The
  integration points are internals — `app.library.fields.media`, `useField`, the
  `media-library` component — while `peerDependencies` says `^5.0.0`, a range
  much wider than anything verified. When a hook does not catch, the plugin
  degrades on purpose rather than break a media field; the new panel is what
  makes that degradation visible instead of a `console.warn` nobody reads.

  It reports the in-entry button, the reference picker, and the running Strapi
  against the version the hooks were verified with (`GET /image-gen/health`).
  Patch releases are ignored on purpose: flagging every one of them would train
  people to ignore the warning.


## [0.4.1] — 2026-09-04

### Fixed

- **The in-field generate button never appeared.** Since the first release, the
  media field decorator rendered its button only `if (onChange && !disabled)` —
  and a field in Strapi's registry never receives `onChange` as a prop. The
  Content Manager renders it as `jsx(CustomInput, { ...props, hint, disabled })`
  (`InputRenderer.mjs`, which contains no `onChange` at all) and the field reads
  the form itself through `useField(name)`, exactly as `MediaLibraryInput` does.
  The condition was therefore always false: the wrapper mounted, the media field
  worked, and the button silently did not exist. It now reads `useField(name)`,
  and calls the form's `onChange(name, value)` rather than a DOM-style event.

  The button is also easier to find — a secondary button with the admin's own
  sparkle icon, rather than a faint tertiary link.

  `useField` needs a Form context. Both renderers of a registry media field
  provide one: the edit view, and the history view, which wraps it in its own
  `<Form method="PUT" disabled>` — where `disabled` keeps the button out of a
  read-only past version.


## [0.4.0] — 2026-09-04

### Added

- **One visual, several aspect ratios.** Tick the extra ratios in the dialog and
  the same image comes back as a 16:9 hero, a 4:3 card and a 9:16 mobile.

  The naive version of this feature does not work. The API takes ONE
  `aspect_ratio` per call and returns ONE image, so extra ratios are extra calls
  either way — but re-running the *prompt* at another ratio returns a **different
  photograph**, which is useless when what you wanted was one visual in several
  shapes. So each declination is a retouch of the first image: the model extends
  the scene it already drew. The house style is deliberately not re-sent, since
  it is already in those pixels and repeating it invites a redraw.

  The calls are made from the browser, one per ratio, rather than looped
  server-side: four 55-second renders in a single HTTP request would pass the
  proxy's own timeout long before finishing. It also means a failure on the
  third ratio does not lose the first two — the main image is saved, and the
  ratios that did not come back are named with their reason.

  Each render is billed, so the button says the total up front —
  *Générer 4 images · $0.536* — and the server refuses a reframe to the ratio
  the image already has, which would buy an identical picture for the price of a
  render. Declinations are named after their source (`Cariste en entrepôt
  (9:16)`), so a set reads as one family in the library, and the history shows
  them as declinations rather than as the English reframe instruction.


## [0.3.0] — 2026-09-03

### Added

- **Generated images get a written title, not the prompt.** The file name lands
  in the asset's public URL, so naming a file after the prompt publishes a
  description of the people in it — an editor writing "une femme d'une
  trentaine d'années, en gilet de sécurité" was shipping that phrase into the
  URL. A short, neutral title is now written by a cheap text model instructed to
  name the scene, the trade and the place, and never a person's age, gender,
  body, ethnicity or clothing. The dialog takes a title of your own if you
  prefer. The prompt is not lost: it stays in the journal, which is not public.

  Naming can never cost an image: any failure — no key, a timeout, a refusal —
  falls back to the trimmed prompt, because an awkward name is a smaller problem
  than a generation the editor paid for and did not get.

- **Delete a generated image from the studio.** With a confirmation, since the
  asset goes for good and content still pointing at it loses its image. Deletion
  goes through the upload service, so the provider copy and the responsive
  formats go with the row rather than being orphaned in storage.

  Only files this plugin recorded can be deleted here. Without that guard, the
  route would be a general "delete any media" endpoint for anyone holding the
  generate permission — which is not what that permission says.

  The journal entry stays, flagged as deleted: the image is gone, but the money
  was spent, and dropping the row would quietly lower the running total. The
  studio hides those rows and still counts them.


## [0.2.4] — 2026-09-03

### Fixed

- **Retouching failed on every database.** Reading a reference image selected
  `sizeInBytes`, which the upload content-type does not declare — the upload
  service builds it on the in-memory entity, but there is no such column:
  *"column t0.sizeInBytes does not exist"*. It now reads `size`, the declared
  attribute, and measures in the kilobytes that column actually holds. A test
  pins the selected columns to the schema, which is what the mocked tests were
  missing.


## [0.2.3] — 2026-09-03

### Changed

- **A text answer now names the house style as the suspect.** The API has no
  system-instruction field, so the style rides inside the prompt — and one
  phrased as an order ("write prompts for…") is obeyed as an order: the model
  returns a written brief and no image. The error says so, and the settings
  field now teaches the right shape before the mistake happens.


## [0.2.2] — 2026-09-03

### Fixed

- **Successful generations were read as refusals.** The parser looked for
  `interaction.output_image`, which the documentation uses everywhere but which
  is a convenience accessor on the client SDK objects — the raw HTTP body puts
  the bytes in `steps[].content[]`. It now reads the real shape, still accepts
  the SDK one, and tolerates the `interaction` wrapper being absent, since the
  docs publish no example of a raw response body.
- **A refusal now quotes the model.** When no image comes back, the error
  repeats what the model said instead of guessing that the prompt needs
  rewording — a decline normally explains itself.


## [0.2.1] — 2026-09-03

### Fixed

- **The output format is now the model's own.** Every generation asked for PNG,
  which `gemini-3-pro-image` — the default model — rejects outright: *"The value
  'image/png' is not supported for 'response_format.mime_type'. Supported
  values: 'image/jpeg'."* The format now lives in the model catalogue beside the
  sizes and prices, is validated server-side, and the catalogue records only
  what each model is KNOWN to accept rather than what the docs imply. Note that
  JPEG has no transparency: for a cut-out subject, Nano Banana 2 takes PNG.


## [0.2.0] — 2026-09-03

### Added

- **A house style.** A prompt fragment set in the settings and folded into every
  generation, so a whole library shares one look. The Interactions API has no
  system-instruction field, so it travels inside the prompt itself — which is
  why it is SHOWN in the dialog with a per-image toggle rather than applied
  invisibly: an unseen prompt modifier is the surest way to make a result
  inexplicable. The style in force is recorded per journal entry, not looked up,
  so provenance says what actually produced that image.

### Fixed

- **Provider failures no longer answer 502.** A 502 from the plugin is
  indistinguishable from the hosting proxy's own 502, which turned "the model
  refused this prompt" into an unreadable gateway error page. They now answer
  **424**.
- **The provider call has a timeout** (`requestTimeoutMs`, default 55s — under
  the ~60s proxy limit of common hosts). Without it a hung call held the request
  open until the platform killed it, and the caller saw a bare gateway error
  instead of an explanation.


## [0.1.0] — 2026-09-03

First release.

### Added

- **Generation and retouching** with Google's Nano Banana models, through the
  Interactions API (`/v1beta/interactions`, key in `x-goog-api-key`). The
  original `gemini-2.5-flash-image` is deprecated and deliberately not offered.
- **Image studio** page: generate, retouch, and the history of what was made.
- **A generate button inside every media field**, which fills the field directly
  rather than sending the editor back to the picker. Strapi's own media field is
  captured and wrapped, never re-implemented — and when its internals cannot be
  read, the wrapper is not registered at all.
- **Generated files are ordinary assets**, created through the upload service so
  thumbnails, responsive formats and the storage provider all apply. They land
  in one folder, created on first use, so AI images stay findable as a set.
- **Cost on screen before the call**, from a catalogue served by the server so
  the price shown cannot drift from the price charged.
- **A provenance log** (prompt, model, size, ratio, references, cost, author),
  capped at 500 entries. Kept plugin-side rather than in the asset's `caption`,
  which is editorial and may be rendered publicly.
- RBAC actions `generate` and `settings`; the API key is written to the plugin
  store and never read back — `PublicSettings` has no `apiKey` field at all.
- Server-side validation of model, size, ratio and reference count: the browser
  is not an authority on what may be billed.

### Notes

- Every generated image carries a SynthID watermark, which Google provides no
  way to disable. The dialog says so.
- Strapi's Media Library page and asset picker cannot be extended — see the
  README for why, and what is done instead.

[Unreleased]: https://github.com/paullefizelier/strapi-plugin-image-gen/compare/v0.2.4...HEAD
[0.2.4]: https://github.com/paullefizelier/strapi-plugin-image-gen/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/paullefizelier/strapi-plugin-image-gen/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/paullefizelier/strapi-plugin-image-gen/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/paullefizelier/strapi-plugin-image-gen/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/paullefizelier/strapi-plugin-image-gen/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/paullefizelier/strapi-plugin-image-gen/releases/tag/v0.1.0
