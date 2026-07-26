# Prayer Room — brand kit

Marketing assets and store copy for the Telegram bot profile. Nothing here is
imported by the runtime; this folder is design source plus generated PNGs. The
rules behind it all live in [DESIGN.md](../DESIGN.md).

| Path | What it is |
|------|------------|
| [../DESIGN.md](../DESIGN.md) | The design system: principles, tokens, components, checklist |
| [botfather.md](botfather.md) | Ready-to-paste Name / About / Description / Commands / Privacy Policy |
| [invite/invite-uk.md](invite/invite-uk.md) | Ukrainian invite message for a real group, plus the infographics that go with it |
| `logo/mark.svg` | The mark, 512×512 on white — the botpic |
| `logo/mark-inverted.svg` | The mark on `#101010` |
| `logo/glyph.svg` | 24×24 UI version; building takes `currentColor`, windows are cut out |
| `description-picture-{uk,en}.svg` | 640×360 "What can this bot do?" banner |
| `invite/*.svg` | 1280×720 how-it-works infographics |
| `render/*.png` | Generated, pixel-exact uploads |
| `rasterize.html` + `serve.mjs` | The SVG → PNG pipeline |

## The mark

A building at night with one window lit: many rooms, and yours is the one that
is on. It carries the plural in the product's name without drawing a single
person, and it survives Telegram's circular avatar crop and a 20px chat list.

The Mini App carries the same tokens in `public/style.css` (`--gold`, `--violet`,
`--grad-cta`, …) with a light and a dark set behind `[data-theme]`. Change a
brand colour here and there.

## Regenerating the PNGs

```bash
node brand/serve.mjs
```

Then open <http://localhost:8100/rasterize.html>. It rewrites every file in
`brand/render/` at exact pixel sizes (512×512 botpic, 640×360 banners,
1280×720 infographics). Edit an SVG, reload the page, done.
