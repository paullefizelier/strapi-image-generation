# Marketplace copy

Text only, ready to paste into the submission form. Written in English because
the marketplace is — a French version is easy to add if you want one for
elsewhere.

---

## Tagline — one line

> Describe the image you need. Get an ordinary Media Library asset.

## Short description — one sentence

> Generate and retouch Media Library images inside Strapi with Google's Nano
> Banana models, with the cost of every render on screen before it is spent.

---

## Introduction

Producing one visual for one page means leaving Strapi: write a brief, open
another tool, export, come back, upload, hunt for the file. Image Gen closes
that loop where your editors already are.

Describe an image and it appears in the Media Library. Or start from a photo you
already have, describe the change, and get a new asset — the original is never
overwritten.

What makes this usable rather than a demo is one decision: **a generated file is
an ordinary asset.** Thumbnail, responsive formats, storage provider, folder.
Nothing downstream needs to know a model drew it, so every front end that
already reads a media field keeps working, unchanged.

### Retouching is what earns its place on a library that is already full

Recolour a background. Extend a photo to 21:9 for a hero. Put a subject on a
plain ground for a card. And one visual can come back in several shapes at once
— a 16:9 hero, a 4:3 card, a 9:16 mobile — each the *same* image extended to fit,
not a different photograph of the same idea.

### It says what a render costs before spending it

Image generation is billed per image, and between the cheapest and the most
expensive combination there is a factor of seven. The button states the price.
The studio states the running total, and keeps a log of every generation —
prompt, model, size, cost, author, and the asset it produced.

That log lives inside the plugin rather than in the asset's caption. Caption is
an editorial field your front end may well render, and prompts are not written
to be published.

### The details that surface once real people use it

- **Titles that are safe to publish.** A file name ends up in the asset's public
  URL, which makes the prompt a poor one — prompts describe people. A short,
  neutral title is written for the asset instead, and the prompt stays in the
  log, which is not public.
- **A house style,** applied to every generation, so what comes out looks like
  your brand rather than like stock AI.
- **The watermark is disclosed.** Every generated image carries an invisible
  SynthID mark that cannot be turned off. The dialog says so, because an editor
  publishing a client-facing visual should know.
- **Generated images land in their own folder,** which is what makes "which of
  these did a model draw?" answerable months later.
- **Permissions, and a key that never comes back out.** Two dedicated
  permissions; the API returns the key's last four characters and nothing more;
  the model, size and format are validated server-side, so a hand-rolled request
  cannot bill a 4K render through a form that offered the cheap one.

### Where you find it

**Settings → Image studio** for the full screen: generate, retouch, and the
history of everything produced so far. And inside a content entry, every media
field gains a *Generate an image* button that fills the field directly.

### Getting started

Bring a Google API key — [AI Studio](https://aistudio.google.com/apikey) issues
one in a minute. There is nothing to configure: if your project already talks to
Gemini, the plugin picks the key up on install.
