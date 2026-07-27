# DESIGN.md — Prayer Room design system

The visual language for everything the user sees: the bot profile, the invite
artwork, and the Telegram Mini App. If a screen or an asset contradicts this
file, the file wins.

---

## 1. Principles

1. **Straight lines only — in the interface.** No border radius anywhere in the
   app or the layout of an asset: buttons, cards, inputs, avatars, badges, dots.
   `border-radius: 0` is the default and the only value. **The logo is the one
   exception**: a mark has to depict a real object, and objects have curves. See
   §7.
2. **Three colours.** Paper, ink, and one red. No blue, no gold, no green
   "success" tint, no purple. Meaning comes from position, weight and rules —
   not from a fifth hue.
3. **Red is a budget, not a decoration.** At most one red element per screen
   region, reserved for the single thing that matters right now: today's action,
   today's marker in the streak, the live step. If two things are red, one of
   them is wrong.
4. **Hairlines instead of boxes.** Separate content with 1px rules and
   whitespace. Cards are flat blocks with a single hairline border — never
   shadows, never gradients, never elevation.
5. **Flat.** No gradient, no blur, no drop shadow, no glow. A surface is one
   solid fill.
6. **Type carries the hierarchy.** Heavy weights and generous size jumps do the
   work that colour and rounding used to do.
7. **No cultural iconography.** The palette is borrowed from ink-and-vermilion
   printing; the product is not. No torii, no sun disc, no cherry blossom, no
   brush strokes, no religious symbols beyond what the product itself names.

---

## 2. Colour

### Tokens

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--paper` | `#FFFFFF` | `#101010` | Page background |
| `--paper-2` | `#F4F2EF` | `#1A1A1A` | Inset panels, disabled fills, secondary surface |
| `--ink` | `#101010` | `#FFFFFF` | Primary text, borders at full strength |
| `--ink-2` | `#4A4A4A` | `#C9C9C9` | Body text of second rank |
| `--muted` | `#6B6B6B` | `#A3A3A3` | Labels, metadata, captions |
| `--rule` | `#DADADA` | `#2E2E2E` | 1px hairlines and card borders |
| `--red` | `#D0021B` | `#FF2B3D` | The accent. Primary action, today's marker |
| `--on-red` | `#FFFFFF` | `#101010` | Text on a red fill |

The red **changes value between themes on purpose**: `#D0021B` on black is only
3.36:1 and unreadable. Never hardcode a red — always use the token.

### Measured contrast (WCAG 2.1)

| Pair | Ratio | Verdict |
|------|-------|---------|
| `#101010` on `#FFFFFF` | 19.03 | AAA |
| `#4A4A4A` on `#FFFFFF` | 8.86 | AAA |
| `#6B6B6B` on `#FFFFFF` | 5.33 | AA |
| `#D0021B` on `#FFFFFF` | 5.67 | AA |
| `#FFFFFF` on `#D0021B` | 5.67 | AA |
| `#FFFFFF` on `#101010` | 19.03 | AAA |
| `#A3A3A3` on `#101010` | 7.54 | AAA |
| `#FF2B3D` on `#101010` | 5.13 | AA |

`#8A8A8A` on white is 3.45 and **fails** normal text — it may only be used for
non-text marks. That is why `--muted` is `#6B6B6B` in light.

### Never encode meaning in colour alone

Shared vs personal topic, prayed vs pending, admin vs member: each needs a text
label or a structural difference (a rule, a filled vs outlined block) as well.
Red-only differentiation fails for red-blind users and in Telegram's monochrome
notification previews.

---

## 3. Type

System stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial,
sans-serif`. No web fonts — the Mini App must render instantly offline.

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| Display | 34–58px | 800 | Marketing art only, `letter-spacing: -1px` |
| Screen title | 22px | 800 | One per screen |
| Section title | 16px | 700 | |
| Body strong | 15–17px | 600 | Topic text, the thing being prayed for |
| Body | 14–15px | 400 | |
| Label / eyebrow | 10–11px | 700 | `text-transform: uppercase`, `letter-spacing: 1.6–2.4px` |
| Numeral | 19–34px | 800 | Streak counts, step numbers |

Line height 1.45 for body, 1.15 for display. Never centre a paragraph; centre
only single-line buttons and the screen title in a nav bar.

---

## 4. Space & structure

- **8px grid.** Every padding, gap and offset is a multiple of 8 (4 allowed for
  hairline-adjacent nudges).
- Screen padding: 16px. Card padding: 16px. Section gap: 24px. List gap: 12px.
- **Hairline = 1px** `--rule`. **Emphasis rule = 3px** `--ink`, used under a
  screen title or above a footer statement.
- **Accent rail = 4px** `--red` or `--ink` on the left edge of a card to mark its
  kind. This replaces the coloured badges of the old system as the primary
  signal; badges stay as text.
- Cards are `1px solid var(--rule)` on `--paper`. Nested/inset blocks use
  `--paper-2` with no border.

---

## 5. Components

| Component | Rule |
|-----------|------|
| Primary button | Solid `--red`, `--on-red` text, 0 radius, min-height 48px, uppercase label, `letter-spacing: 0.6px`. One per screen |
| Secondary button | Transparent, `1px solid var(--ink)`, ink text |
| Ghost / tertiary | Text only, ink, underline on focus |
| Destructive | Transparent, `1px solid var(--red)`, red text — never a red fill (the fill belongs to the primary action) |
| Input | `--paper-2` fill, `1px solid var(--rule)`, 0 radius, 48px tall, focus = `2px solid var(--ink)` |
| Toggle | Square track 48×28, square 24px knob, on = `--red` fill |
| Segmented control | Square cells, 1px outer border, selected cell = `--ink` fill with `--paper` text |
| Badge | Uppercase label, 1px border, no fill; `--red` border+text for the live one |
| Modal | Square sheet, 1px border, no backdrop blur; backdrop = `--ink` at 60% |
| Streak day | 22×22 square. Prayed = `--red` fill; pending = 1px `--rule` outline; today = 2px `--ink` outline |
| Progress | 8px square-ended bar, `--red` fill on `--paper-2` track |

Touch targets: 44px minimum, 48px for anything primary.

---

## 6. Motion

150ms, `ease-out`, and only for: opacity, and 1–2px position changes. No scale
bounce, no slide-in panels, no spinners that spin decoratively. Everything must
respect `prefers-reduced-motion: reduce` by dropping to no transition.

---

## 7. The marks

Four candidates live in `brand/logo/`. Unlike the interface, a mark **shows a
real thing** — an abstract composition of rectangles is unreadable as an avatar
and says nothing about the product. Curves are allowed here, and only here.

| File | Object |
|------|--------|
| `mark-a-hands.svg` | Praying hands, ink on a red field |
| `mark-b-candle.svg` | A lit candle: black body, red flame, white ground |
| `mark-c-book.svg` | An open book with a red ribbon |
| `mark-d-open-palm.svg` | An open palm carrying a flame, white on black |

Rules for any future mark:

- one recognisable object, no compositions of two ideas;
- ink + one red + the ground colour, flat fills, no gradient or stroke effects;
- silhouette-first: it must survive as a 20px single-colour shape, so no detail
  thinner than ~8px at 512;
- everything inside a 400px circle of the 512px canvas — Telegram crops avatars
  to a circle;
- no religious or cultural insignia beyond what the product itself is about.

---

## 8. Applying it

- Marketing art: `brand/*.svg`, rendered by `brand/rasterize.html`.
- Mini App: `public/style.css` defines the same tokens under `[data-theme]`;
  `auto` follows the Telegram client, `light`/`dark` are the user's choice in
  Settings.
- Bot messages: plain text, no decorative emoji beyond the ones that carry
  meaning in the copy (🙏 ✅). The bot cannot style text, so hierarchy there is
  line breaks and short sentences.

## 9. Checklist before shipping a screen

- [ ] No `border-radius` other than 0
- [ ] No gradient, shadow, or blur
- [ ] Exactly one red element in view, and it is the action
- [ ] Every state distinguishable without colour
- [ ] All spacing on the 8px grid
- [ ] Touch targets ≥44px
- [ ] Text contrast ≥4.5:1 against its actual background, in both themes
- [ ] Renders correctly in light and dark, and when Telegram's font size is bumped
