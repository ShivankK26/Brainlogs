---
layout: ../../layouts/Docs.astro
title: Brand
description: "The Brainlogs mark, colours, wordmark and how to use them."
---


Brainlogs is quiet software that remembers. The brand follows: plain, confident, sentence case, no exclamation marks, and never louder than the work on screen.

## The mark

The mark is a **B** drawn as two open loops on a stem, the top loop faded, with a dot where the log continues. It stands for a log that keeps adding lines: the faded loop is what you saw earlier, the solid loop is now, the dot is what comes next.

Source of truth: `packages/ui/brand/mark.svg` in the repository (ink is `currentColor`, the dot is brand purple). Everything else is derived from it.

| File | Use |
|---|---|
| `mark.svg` | Inline in UI, inherits text colour |
| `mark-white.svg`, `mark-black.svg` | Fixed-ink versions for places that cannot inherit colour |
| `tile-dark.svg` → `icon-1024.png` | App icon, favicon (`favicon.svg`) |
| `tile-light.svg` | Light-surface tile (documents, print) |
| `tile-brand.svg` → `icon-brand-1024.png` | Marketing only: social images, store-style listings, stickers |
| `tray-template.svg`, `tray-template.png`, `tray-template@2x.png` | macOS menu bar (template image: alpha only) |
| `lockup-dark.svg`, `lockup-light.svg` | Mark plus wordmark for README, decks, partner pages |

## Colour

- **Primary presentation is monochrome.** White mark on dark (`#EDEEF2` on `#08090A`) or black mark on light (`#08090A` on `#EDEEF2`). The dot is always brand purple `#5E6AD2`, the only colour in the mark.
- **The purple tile is a marketing variant.** Use it where the mark must carry the brand alone at a glance: the Open Graph image, launch posts, a store or directory listing. Inside the product and on the site chrome, use the mono mark.
- Never recolour the mark, add gradients to the ink, or set the dot to any colour other than purple (or white on the purple tile).

## Wordmark

Inter, weight 600, letter-spacing −0.02em, set as `Brainlogs` in sentence case. In the lockup the mark's height equals the cap height plus descender of the wordmark, with a gap of 0.35× the mark's width. The tagline *It's your second brain.* sits under the lockup in regular weight at 45–60% of the wordmark size, in secondary text colour.

## Sizes and clear space

- Minimum size: 16 px for the mark, 24 px for the lockup. Below 20 px the faded loop merges; that is fine, the silhouette still reads as a B.
- Clear space around the mark equals the stem's width (12% of the mark's height).
- Tray and status-bar glyph: use the template versions so macOS tints them; do not use the filled tile in the menu bar.

## Don'ts

- Don't place the mark inside another shape except the three tiles above.
- Don't rotate, skew or outline it.
- Don't pair it with the old "SB" tile or the teardrop from the first release.
- Don't use the purple tile as the in-app or site favicon.

## Voice, for anything with words next to the mark

Short sentences. Sentence case everywhere. Say what it does, not what it is ("Search what you saw last week", not "AI-powered memory platform"). Privacy claims must be verifiable and match `docs/privacy.md`.
