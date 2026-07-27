# DESIGN.md — Prayer Room

The design system for everything a user sees: the bot profile, the marketing
artwork, and the Telegram Mini App. If a screen contradicts this file, the file
wins. Changing a rule here means changing it in `public/style.css` and in
`brand/` in the same pull request.

---

## 1. Principles

1. **Straight lines.** `border-radius: 0` is the only value in the interface —
   buttons, cards, inputs, badges, toggles, dots, avatars. The logo is the sole
   exception (§6); it depicts a building, and it is not part of the interface.
2. **Three colours.** Paper, ink, one red. Nothing else. No blue links, no green
   success, no amber warning.
3. **Red is a budget.** One red element per view, and it is the thing the user
   should act on or notice right now: the primary button, today's marker, the
   live step. Two reds in one view means one of them is wrong.
4. **Flat.** No gradient, no shadow, no blur, no glow. A surface is one solid
   fill; separation comes from a 1px rule or from space.
5. **Hairlines over boxes.** Prefer a rule and whitespace to a container. When a
   container is needed it is a flat block with a single 1px border.
6. **Type carries hierarchy.** Weight and size do the work that rounding and
   colour used to do.
7. **No cultural or religious insignia.** The palette comes from ink-and-red
   printing. No sun disc, no torii, no brush strokes, no crosses, no doves.

---

## 2. Colour

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--paper` | `#FFFFFF` | `#101010` | Page background |
| `--paper-2` | `#F4F2EF` | `#1A1A1A` | Inset blocks, inputs, disabled fills |
| `--ink` | `#101010` | `#FFFFFF` | Primary text; solid fills that need maximum weight |
| `--ink-2` | `#4A4A4A` | `#C9C9C9` | Secondary body text |
| `--muted` | `#6B6B6B` | `#A3A3A3` | Labels, metadata, captions |
| `--rule` | `#DADADA` | `#2E2E2E` | 1px hairlines and borders |
| `--red` | `#D0021B` | `#FF2B3D` | The accent |
| `--on-red` | `#FFFFFF` | `#101010` | Text and icons on a red fill |

**The red differs per theme deliberately.** `#D0021B` is 5.67:1 on white but
only 3.36:1 on black. Never hardcode a red; always use `var(--red)`.

Measured contrast (WCAG 2.1): ink/paper 19.03 · ink-2/paper 8.86 ·
muted/paper 5.33 · red/paper 5.67 · on-red/red 5.67 · dark muted 7.54 ·
dark red 5.13. `#8A8A8A` on white is 3.45 and must never carry text.

**Meaning never rides on colour alone.** Shared vs personal topic, prayed vs
pending, admin vs member: each needs a word or a structural difference as well.

---

## 3. Type

System stack only — no web fonts, the Mini App must paint instantly:
`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`.

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| Display (marketing only) | 34–58px | 800 | `letter-spacing: -1px` |
| Screen title | 22px | 800 | One per screen |
| Section title | 16px | 700 | |
| Body strong | 15–17px | 600 | The topic text itself |
| Body | 14–15px | 400 | |
| Label / eyebrow | 10–11px | 700 | uppercase, `letter-spacing: 1.6–2.4px` |
| Numeral | 19–34px | 800 | Streak counts, step numbers |

Line height 1.45 body, 1.15 display. Centre only single-line buttons and a nav
bar title — never a paragraph.

---

## 4. Space and structure

- **8px grid.** Every padding, gap and offset is a multiple of 8; 4 is allowed
  only next to a hairline.
- Screen padding 16px · card padding 16px · section gap 24px · list gap 12px.
- **Hairline** 1px `--rule`. **Emphasis rule** 3px `--ink` under a screen title.
- **Accent rail** 4px on a card's left edge marks its kind — `--red` for the
  live/personal one, `--ink` for the rest. This is the primary signal; badges
  are text only.
- Cards: `--paper` fill, 1px `--rule` border. Inset blocks: `--paper-2`, no
  border. Never both.

---

## 5. Components

| Component | Rule |
|-----------|------|
| Primary button | `--red` fill, `--on-red` text, uppercase, `letter-spacing: 0.6px`, min-height 48px. One per screen |
| Secondary button | Transparent, 1px `--ink` border, ink text |
| Tertiary | Text only |
| Destructive | Transparent, 1px `--red` border, red text — never a red fill |
| Input / select | `--paper-2` fill, 1px `--rule`, 48px tall, focus 2px `--ink` outline |
| Toggle | 48×28 square track, 24px square knob, on = `--red` |
| Segmented control | Square cells, 1px outer border, selected cell = `--ink` fill, `--paper` text |
| Badge | Uppercase text, 1px border, no fill; red border+text only for the live one |
| Card | See §4 |
| Modal | Square sheet, 1px border, backdrop `--ink` at 60%, no blur |
| Streak day | 22×22 square: prayed = `--red` fill; pending = 1px `--rule`; today = 2px `--ink` outline |
| Progress | 8px bar, square ends, `--red` fill on `--paper-2` |
| Empty state | 1px dashed `--rule`, muted text, one sentence and one action |

Touch targets ≥44px, ≥48px for primary actions.

---

## 6. The mark

`brand/logo/mark.svg` — a building at night with one window lit. Many rooms;
yours is the one that is on. Variants:

| File | Use |
|------|-----|
| `mark.svg` | 512×512 on white — the Telegram botpic |
| `mark-inverted.svg` | 512×512 on `#101010` — dark surfaces, merch |
| `glyph.svg` | 24×24 for UI at 20–32px: the building is `currentColor`, the windows are cut out so the surface behind shows through, and only the lit window is painted |

Rules: rectangles only, one lit window, nothing thinner than 8px at 512, and all
content inside the 400px circle Telegram crops avatars to. The mark is never
recoloured beyond the two variants above and never sits on a photograph.

The wordmark lockup is the glyph, one glyph-width of space, then `PRAYER ROOM`
in 700 uppercase with 3.4–4.2px tracking.

---

## 7. Motion

150ms `ease-out`, and only opacity or a 1–2px shift. No scale bounce, no sliding
panels, no decorative spinners. Everything collapses to no transition under
`prefers-reduced-motion: reduce`.

---

## 8. Theme

The Mini App ships light and dark. `users.theme` holds `auto | light | dark`;
`auto` follows the Telegram client, then the OS. The choice is a segmented
control in Settings, stored server-side next to the locale and mirrored into
`localStorage` so the pre-paint script in `public/index.html` can apply it
before the first frame. Telegram's `--tg-theme-*` variables are not used — only
the light/dark *mode* is inherited, never the colours.

---

## 9. Checklist before shipping a screen

- [ ] No `border-radius` other than 0
- [ ] No gradient, shadow, or blur
- [ ] Exactly one red element in view, and it is the action
- [ ] Every state readable without colour
- [ ] All spacing on the 8px grid
- [ ] Touch targets ≥44px
- [ ] Text contrast ≥4.5:1 on its actual background, in both themes
- [ ] Correct in light and dark, and with Telegram's font size increased
