# Prayer Room — brand kit

Marketing assets and store copy for the Telegram bot profile. Nothing here is
imported by the runtime; this folder is design source + generated PNGs.

| Path | What it is |
|------|------------|
| [botfather.md](botfather.md) | Ready-to-paste Name / About / Description / Commands / Privacy Policy |
| [invite/invite-uk.md](invite/invite-uk.md) | Ukrainian invite message for a real group + the infographics that go with it |
| [../DESIGN.md](../DESIGN.md) | The design system: principles, tokens, components, checklist |
| `logo/*.svg` | Four botpic concepts, 512×512 source |
| `invite/*.svg` | 1280×720 how-it-works infographics |
| `description-picture-{uk,en}.svg` | 640×360 "What can this bot do?" banner source |
| `render/*.png` | Generated, pixel-exact uploads for BotFather |
| `rasterize.html` + `serve.mjs` | The SVG → PNG pipeline |

## Design direction

Paper, ink, and one red. Straight lines only — no radius, no gradient, no
shadow. Red is a budget rather than a decoration: one red element per view, and
it is always the thing that matters right now. The full system, including the
tokens the Mini App uses, lives in [DESIGN.md](../DESIGN.md).

| Token | Light | Dark |
|-------|-------|------|
| Paper | `#FFFFFF` | `#101010` |
| Paper 2 | `#F4F2EF` | `#1A1A1A` |
| Ink | `#101010` | `#FFFFFF` |
| Ink 2 | `#4A4A4A` | `#C9C9C9` |
| Muted | `#6B6B6B` | `#A3A3A3` |
| Rule | `#DADADA` | `#2E2E2E` |
| Red | `#D0021B` | `#FF2B3D` |

Type: system sans; 800 for display and numerals, 700 for uppercase labels with
1.6–2.4px tracking, 400–600 for body.

<details>
<summary>Previous direction (replaced 2026-07-26)</summary>

Night-sky indigo with a warm flame. The dark base reads as the early morning or
late evening when people actually pray; the gold is the one lit thing in it —
the prayer, the person being carried. Violet is the "personal request" accent so
shared and personal topics are distinguishable at a glance, in the app and in
the marketing alike.

### Palette

| Token | Hex | Use |
|-------|-----|-----|
| Night 900 | `#0B0D20` | Deepest background |
| Night 800 | `#141735` | Base background |
| Night 700 | `#1B1F4B` | Background top-left, cards |
| Surface | `#232750` | Cards on dark |
| Violet 500 | `#7C5CFF` | Personal request accent, glow |
| Gold 400 | `#FFD469` | Highlight, CTA start |
| Gold 500 | `#FFC24A` | Primary brand gold, shared-topic accent |
| Ember 500 | `#FF8A3D` | CTA end, flame base |
| Ink | `#20130A` | Text on gold |
| Text | `#EDEBFF` | Primary text on dark |
| Muted | `#8E8CBE` | Secondary text on dark |
| Cream | `#FFF7EA` | Light background (logo option B) |

Type: Segoe UI / system sans, 800 weight for headlines, 600 for chips.

</details>

## Regenerating the PNGs

```bash
node brand/serve.mjs
```

Then open <http://localhost:8100/rasterize.html>. It rewrites every file in
`brand/render/` at exact pixel sizes (512×512 botpics, 640×360 banners).
Edit the SVGs, reload the page, done.
