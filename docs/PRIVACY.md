# Політика конфіденційності / Privacy Policy

**Останнє оновлення / Last updated: 2026-07-26**

---

## Українською

### Хто обробляє дані

Цього бота запускає та адмініструє оператор конкретного розгортання (self-hosted
Telegram-бот на власному сервері оператора). Код відкритий:
<https://github.com/VladPobidash/prayer-bot>.

### Які дані ми зберігаємо

- **Ідентифікатор Telegram** та ім'я, яке ви показуєте у Telegram — щоб
  впізнавати вас і підписувати ваші теми для інших учасників кімнати.
- **Мова інтерфейсу** та **час щоденного нагадування**, які ви обрали.
- **Назви кімнат, коди запрошень** і склад учасників.
- **Тексти молитовних тем**, ваші оновлення до них і нотатки про відповіді на
  молитву — тобто те, що ви самі надіслали боту.
- **Записи про молитву**: дата, кімната й тема, коли ви натиснули
  «🙏 Помолився сьогодні». Ці записи потрібні для щоденних призначень тем і для
  м'якого нагадування, якщо ви давно не молились.

### Чого ми **не** робимо

- Не показуємо рекламу і не продаємо дані.
- Не передаємо дані третім особам і не використовуємо для аналітики чи
  профілювання поза межами роботи бота.
- Не читаємо ваші інші чати — бот бачить лише повідомлення, надіслані йому.
- Не зберігаємо голосові та відео-повідомлення: якщо ви відповідаєте медіа на
  нагадування, Telegram пересилає його автору теми, а бот не тримає копію.

### Хто що бачить

- Ваші **особисті теми** бачите ви, автор теми та учасники, яким на день випало
  молитися за цю тему; іншим показується лише кількість.
- **Спільні теми** бачать усі учасники кімнати.
- Адмін кімнати бачить склад учасників і отримує повідомлення, якщо учасник
  вибув через тривалу перерву.

### Де зберігаються дані

У базі SQLite на сервері оператора (за замовчуванням — Railway volume). Передача
даних відбувається через Telegram Bot API.

### Скільки зберігаються

- Коли ви **покидаєте кімнату**, ваші активні особисті теми в ній видаляються.
- Коли кімнату **закрито**, вона стає неактивною для всіх учасників.
- Ви можете попросити оператора повністю видалити ваші дані — напишіть йому або
  створіть issue в репозиторії.

### Ваші права

Запит на доступ, виправлення або видалення даних: через адміністратора вашої
кімнати або через <https://github.com/VladPobidash/prayer-bot/issues>.

### Зміни

Оновлення політики публікуються в цьому файлі; дата вгорі змінюється.

---

## English

### Who processes the data

This bot is operated by whoever deployed it (a self-hosted Telegram bot running
on the operator's own server). The source code is open:
<https://github.com/VladPobidash/prayer-bot>.

### What we store

- **Your Telegram ID** and the display name Telegram shows, so we can recognise
  you and attribute your topics inside your room.
- **Interface language** and **daily reminder time** you picked.
- **Room names, invite codes** and room membership.
- **Prayer topic texts**, your updates to them and answered-prayer notes — the
  content you send to the bot yourself.
- **Prayer records**: the date, room and topic when you tap "🙏 Prayed today".
  They drive daily topic assignment and the gentle nudge after a long pause.

### What we do **not** do

- No ads, no selling of data.
- No sharing with third parties, no profiling or analytics beyond running the bot.
- We cannot read your other chats — the bot only sees messages sent to it.
- Voice and video replies are not stored: Telegram forwards them to the topic
  owner and the bot keeps no copy.

### Who sees what

- Your **personal topics** are visible to you, and to the members assigned to
  pray for them that day; everyone else only sees a count.
- **Shared topics** are visible to all members of the room.
- The room admin sees the member list and is notified when a member is removed
  after a long inactivity streak.

### Where data lives

In a SQLite database on the operator's server (by default a Railway volume).
Data is transferred through the Telegram Bot API.

### Retention

- **Leaving a room** deletes your active personal topics in that room.
- **Closing a room** makes it inactive for every member.
- You can ask the operator to delete your data entirely — message them or open
  an issue in the repository.

### Your rights

To access, correct or delete your data, contact your room admin or open an issue
at <https://github.com/VladPobidash/prayer-bot/issues>.

### Changes

Updates are published in this file; the date at the top changes accordingly.
