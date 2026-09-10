# Screenshots

Four images, in this order — they are what the README and the Strapi Marketplace
listing show, so they are the first thing anyone sees of this plugin.

Shoot them in a **throwaway Strapi project** at 1440×900, light theme, browser
chrome cropped out. Not in a working install — that was tried, and all three
reasons it failed are worth writing down:

- **The prompts are the screenshot.** A real studio history is a list of real
  prompts. The one we looked at described people by age and nationality and
  asked to remove a third party's brand from a jacket. Shot 01 *is* that list;
  there is no framing that removes it.
- **A customised admin carries its owner's brand.** The logo sits in the sidebar
  and crops away, but the accent colour is on the buttons, the badges and the
  active icon, all inside the frame. Strapi's default violet says "Strapi
  plugin"; anything else says "someone's install".
- **A deployed install lags the release.** The one we looked at ran 0.5.0 while
  the README documented 0.6.0, so the shots would have been missing features the
  page describes.

So: a fresh project, default theme, and three neutral prompts generated for the
purpose — a warehouse, a workshop, a building site. About $0.40 of renders.

| File | Screen | What must be visible |
|---|---|---|
| `01-studio.png` | Settings → Image studio | The history with two or three generated images, the *N generated* and *$X spent* badges, and the integration line at the top |
| `02-dialog.png` | The generate dialog, filled in | The prompt, the model/size/ratio row, the **declination checkboxes**, and the button reading *Generate 3 images · $0.402* — the cost before the call is the point |
| `03-in-entry.png` | A content entry with a media field | The *Generate an image* button under Strapi's own media field, so it is obvious this works where editors already are |
| `04-settings.png` | Settings → Image Gen → Configuration | The key badge showing *configured*, the source, and the house style field |

Keep the file names: the README links to them by name.
