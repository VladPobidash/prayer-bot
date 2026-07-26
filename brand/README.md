# Prayer Room — brand kit

Marketing assets and store copy for the Telegram bot profile. Nothing here is
imported by the runtime; this folder is design source + generated PNGs.

| Path | What it is |
|------|------------|
| [botfather.md](botfather.md) | Ready-to-paste Name / About / Description / Commands / Privacy Policy |
| `logo/*.svg` | Four botpic concepts, 512×512 source |
| `description-picture-{uk,en}.svg` | 640×360 "What can this bot do?" banner source |
| `render/*.png` | Generated, pixel-exact uploads for BotFather |
| `rasterize.html` + `serve.mjs` | The SVG → PNG pipeline |

## Design direction

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

The Mini App carries the same tokens in `public/style.css` (`--gold`, `--violet`,
`--grad-cta`, …) with a light and a dark set behind `[data-theme]`. Change a
brand colour here and there.

## Regenerating the PNGs

```bash
node brand/serve.mjs
```

Then open <http://localhost:8100/rasterize.html>. It rewrites every file in
`brand/render/` at exact pixel sizes (512×512 botpics, 640×360 banners).
Edit the SVGs, reload the page, done.
