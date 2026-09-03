# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/) — while on `0.x`, a minor bump may
carry breaking changes.

## [Unreleased]

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

[Unreleased]: https://github.com/paullefizelier/strapi-plugin-image-gen/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/paullefizelier/strapi-plugin-image-gen/releases/tag/v0.1.0
