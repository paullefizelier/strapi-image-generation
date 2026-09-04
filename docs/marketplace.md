# Submitting to the Strapi Marketplace

The listing is a manual review, not an automatic npm crawl. What follows is
everything the form asks for, so the submission is one sitting rather than three.

## Before submitting

- [ ] The version being listed is **published on npm** — the market links to it
      and a listing that installs nothing is rejected.
- [ ] `strapi` block in `package.json` carries `kind`, `name`, `displayName` and
      `description`. Reviewers read `displayName`, not the npm name.
- [ ] `repository`, `homepage` and `bugs` resolve. These were wrong until 0.6.0:
      they named `strapi-plugin-image-gen` while the repository is
      `strapi-image-generation`, so every link on the npm page was a 404.
- [ ] `keywords` include `strapi` and `strapi-plugin`.
- [ ] README opens with what the plugin does in two sentences, then screenshots.
- [ ] The four screenshots in `docs/screenshots/` exist and match their brief.
- [ ] A logo, 160×160 PNG on a transparent or white ground.

## The form

<https://market.strapi.io/submit-plugin>

| Field | What to put |
|---|---|
| Plugin name | Image Gen |
| npm package | `strapi-plugin-image-gen` |
| Repository | `https://github.com/paullefizelier/strapi-image-generation` |
| Description | The `strapi.description` line — one sentence, no marketing |
| Categories | Media, AI |
| Screenshots | `docs/screenshots/01…04` |

## What reviewers push back on

- A plugin that needs a key but does not say so before install. The README says
  it in the **Install** section, above the configuration block.
- No stated Strapi compatibility. The **Compatibility** section names 5.51 and
  explains what the plugin does when an internal it depends on moves.
- Screenshots of an empty state. `01-studio.png` must show real history.

## After acceptance

Each new release is picked up from npm automatically; the listing copy and the
screenshots are not. Re-submit the form when either changes materially.
