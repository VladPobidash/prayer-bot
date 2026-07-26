# BotFather profile — ready-to-paste copy

Every field below is within Telegram's limit (Name ≤ 64, About ≤ 120,
Description ≤ 512 characters). Ukrainian is the primary version because
`DEFAULT_LOCALE=uk`; the English block is a drop-in replacement if you flip the
default.

---

## Name — `/setname`

**Recommended:** `Prayer Room 🙏 — молитва разом` (29)

Alternatives:

| Option | Chars | Why |
|--------|-------|-----|
| `Prayer Room 🙏 — молитва разом` | 29 | Searchable in both languages, says what it is |
| `Prayer Room · Молитовна кімната` | 31 | Cleaner, no emoji, more "product" |
| `Разом у молитві 🙏 Prayer Room` | 29 | Ukrainian-first, warmer |

---

## About — `/setabouttext` (shown on the profile card and in link previews)

**UK (89 chars):**

```
Приватна кімната молитви у Telegram: теми групи, щоденні нагадування і підтримка своїх. 🙏
```

**EN (94 chars):**

```
A private prayer room in Telegram: shared topics, daily reminders, and people who carry you. 🙏
```

---

## Description — `/setdescription` ("What can this bot do?")

**UK (235 chars):**

```
🙏 Тримайте молитву разом.

Приватна кімната для вашої групи, сім'ї чи церкви:
• спільні теми + до 3 особистих прохань
• щодня бот пише, за кого молитись сьогодні
• одне «🙏 Помолився» — і людина це бачить

Без реклами. Тільки ваші люди.
```

**EN (232 chars):**

```
🙏 Keep the prayer habit together.

A private room for your group, family or church:
• shared topics + up to 3 personal requests
• each day the bot tells you who to pray for
• tap «🙏 Prayed» and they see it

No ads. Only your people.
```

---

## Description picture — `/setdescriptionpicture`

`brand/render/description-picture-uk.png` (640×360) — swap for
`description-picture-en.png` if the bot's default locale is English. Sources:
`brand/description-picture-*.svg`.

---

## Botpic — `/setuserpic`

Pick one of `brand/render/botpic-{a-frame,b-week,c-window,d-candle}.png`
(512×512, sources in `brand/logo/`). All four are rectangles only — no radius,
no gradient — per [DESIGN.md](../DESIGN.md).

| Option | Mark | Reads as |
|--------|------|----------|
| **A — Frame** | Open black square, red block inside, on white | The room, and a person held inside it. Most literal to the product name. |
| **B — Week** | Seven bars on off-white, the seventh red | The habit itself — one day at a time. Ties the avatar to the streak. |
| **C — Window** | Red field split by two white gaps | Strongest at 20px; pure shape, zero detail to lose. |
| **D — Candle** | Red square over a straight white stem, on black | Keeps the old flame idea with every curve removed. The only dark option — a hard black circle in a light chat list. |

---

## Commands — `/setcommands`

```
start - Меню та як це працює
help - Довідка
rooms - Мої кімнати
join - Приєднатися за кодом
```

English variant:

```
start - Menu and how it works
help - Help
rooms - My rooms
join - Join with an invite code
```

---

## Privacy Policy — `/setprivacypolicy`

```
https://github.com/VladPobidash/prayer-bot/blob/main/docs/PRIVACY.md
```

Source: [docs/PRIVACY.md](../docs/PRIVACY.md). The link only resolves once this
branch is merged into `main`.

---

## Other BotFather settings worth setting at the same time

- `/setinline` — off (the bot has no inline mode).
- **Menu button** → Web App, pointing at `WEBAPP_URL`, labelled `Prayer App`.
  The welcome message already tells new users to look for it.
- **Group privacy** — keep enabled; the bot is DM-only by design.
