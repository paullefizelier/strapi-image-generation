# strapi-plugin-image-gen

Generate and retouch Media Library images from inside Strapi, with Google's
Nano Banana models.

A generated file is an **ordinary asset** — thumbnail, responsive formats,
storage provider, folder. Nothing downstream has to know it was drawn by a
model: every front end that already reads a media field keeps working unchanged.

## What you get

### Generation and retouching

Describe an image and get one. Or pick images you already have, describe the
change, and get a new asset — the original is never overwritten.

Retouching is the part that earns its place on a library that is already full:
recolour a background, extend a photo to 21:9 for a hero, drop a subject onto a
plain ground for a card.

### Two places to reach it

**Settings → Image studio** — the full screen: generate, retouch, and the
history of everything generated so far.

**Inside a content entry** — every media field gains a *Generate an image*
button (or *Retouch with AI*, when the field already holds one). It fills the
field directly, which is fewer steps than the picker beside it: no generate,
close, reopen, hunt for the file.

> **Why not a button in the Media Library itself?** Because Strapi does not
> allow it. `@strapi/upload` registers neither `injectionZones` nor `apis`, so
> `app.getPlugin('upload').injectComponent(...)` is a silent no-op, and
> `MediaLibrary`/`AssetDialog` expose no slot. The one supported hook is the
> field registry — which *replaces* the component, so this plugin captures
> Strapi's own media field and renders it inside its own wrapper. If Strapi's
> internals ever move, the wrapper is not registered at all: a media field that
> lost its picker would be far worse than a missing button.

### The cost is on screen, before the call

Image generation is billed per image, and the spread between the cheapest and
the most expensive combination here is a factor of seven. The button says what
the render will cost. The studio says what has been spent.

| Model | Per image |
|---|---|
| `gemini-3-pro-image` — Nano Banana Pro | $0.134 at 1K/2K, $0.24 at 4K |
| `gemini-3.1-flash-image` — Nano Banana 2 | $0.045 (512px) → $0.151 (4K) |
| `gemini-3.1-flash-lite-image` — Nano Banana 2 Lite | $0.0336 at 1K |

There is no free tier. The catalogue and its prices are served by the plugin,
so the figure in the UI cannot drift from the one being charged.

### Provenance, not a lost prompt

Every generation is recorded: prompt, model, size, ratio, reference images,
estimated cost, author, and the file it produced. Kept plugin-side rather than
in the asset's `caption` — that field is editorial and a front end may render
it, which would publish your prompts.

The log is capped at the 500 most recent entries: it lives in one core-store
row that is read whole, and an unbounded array there is a slow leak.

## Install

```bash
npm install strapi-plugin-image-gen
```

**No configuration is required.** The key is read from the admin first, then
`config/plugins.ts`, then `IMAGE_GEN_API_KEY`, `GEMINI_API_KEY` or
`GOOGLE_API_KEY` — so a project that already talks to Gemini works immediately.

Everything is optional:

```ts
// config/plugins.ts
export default ({ env }) => ({
  "image-gen": {
    enabled: true,
    config: {
      apiKey: env("GEMINI_API_KEY"),
      model: "gemini-3-pro-image",   // default
      imageSize: "2K",               // 512px | 1K | 2K | 4K, per model
      aspectRatio: "16:9",
      folderName: "Generated images",
      maxPromptLength: 2000,
    },
  },
});
```

Get a key from [Google AI Studio](https://aistudio.google.com/apikey). Permissions
live under **Settings → Roles**: `Generate and retouch images` and
`Manage the API key and defaults`.

## Things worth knowing

**Output format is the model's, not yours.** The models disagree on what they
can emit and Google publishes no matrix: `gemini-3-pro-image` answers
*"The value 'image/png' is not supported"* and takes **JPEG only**, so images
from it have **no transparency** — for a cut-out subject on a clear background,
use Nano Banana 2, which accepts PNG. The plugin sends each model the format it
declares and rejects a mismatch before spending anything.

**Every image carries a SynthID watermark.** It is invisible, it identifies the
image as AI-generated, and Google provides no way to disable it. The dialog says
so, because an editor publishing a client-facing visual should know.

**Generated images land in one folder** (`Generated images` by default), created
on first use. That is what makes "which of these did a model draw?" answerable
months later — and makes the set auditable, replaceable or purgeable at once.

**A retouch reads the asset back.** Above 4 MB the largest responsive format is
sent instead of the original: base64 of a 4K original is several megabytes per
reference, and a retouch may carry more than one.

**Reference images are capped** at what the model accepts (14). The server
enforces the model, size and ratio against its own catalogue — the browser is
not an authority, so a hand-rolled request cannot bill a 4K Pro render through a
form that offered Lite.

## API

All routes are admin-only, behind `admin::isAuthenticatedAdmin` plus a
permission.

| Route | Permission | |
|---|---|---|
| `GET /image-gen/catalogue` | `generate` | Models, sizes, prices, ratios |
| `POST /image-gen/generate` | `generate` | `{ prompt, model?, imageSize?, aspectRatio?, referenceFileIds?, previousInteractionId? }` |
| `GET /image-gen/journal` | `generate` | The provenance log and the running total |
| `GET /image-gen/settings` | `generate` | Redacted — never returns the key |
| `PUT /image-gen/settings` | `settings` | An absent `apiKey` keeps the stored one; `""` clears it |
| `POST /image-gen/settings/test` | `settings` | One 1K Lite render, ~$0.034, to prove the credentials |

## Under the hood

This calls Google's **Interactions API**
(`POST /v1beta/interactions`, key in the `x-goog-api-key` header), not
`:generateContent`. If you are copying from a text-generation integration, note
that the endpoint, the auth and the body all differ — and that
`gemini-2.5-flash-image`, the original Nano Banana, is deprecated.

Two traps in the response, both learned the hard way. `interaction.output_image`
appears throughout the documentation but is a **convenience accessor on the
client SDK objects** — it is not a field of the JSON that arrives over HTTP,
where the bytes are content blocks inside `steps[].content[]`. And the docs
publish no example of a raw response body at all, so this parser reads both
shapes and tolerates the `interaction` wrapper being absent. When no image comes
back, it repeats what the model *said* rather than guessing: a refusal normally
explains itself.

Assets are created through `strapi.plugin('upload').service('upload')`, which is
what earns the thumbnails and responsive formats. That service requires a file
on disk — `enhanceAndValidateFile` wraps `fs.createReadStream(file.filepath)`
and never looks at a buffer — so bytes are written to a temp file first, exactly
as Strapi's own "add from URL" does, and cleaned up in a `finally`.

## Development

```bash
npm install && npm test && npm run build && npm run verify
```

## Compatibility

Strapi v5 (developed against 5.51). Node ≥ 18.

## License

MIT
