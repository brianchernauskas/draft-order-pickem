# The Degenerate Bourbon Fantasy Football League — Draft Order Pick'Em

A static pick'em site for setting the DBFFL draft order off Week 1 college football games
against the spread. Three pages:

| Page | What it does |
|---|---|
| `index.html` | Players pick all 10 games, assign confidence weights 1–10 (each used once), and enter a Wisconsin–Notre Dame total for the tiebreaker |
| `standings.html` | Live draft order, expandable per-player cards, and a results board |
| `admin.html` | Commissioner console: lines, kickoffs, venues, final scores, lock control, entry management |

## Rules as built

- **10 games, weights 1–10, each used exactly once.** Max score is 55. The form will not submit
  with a duplicate or missing weight.
- **Score = sum of the weights on games you got right against the spread.**
- **Tiebreaker:** closest to the actual combined score of Wisconsin–Notre Dame. If that is still
  level, the earlier submission wins.
- **Picks lock at the first kickoff** (Colorado–Georgia Tech). Until then, players can reload the
  page, click "Load my picks to edit," and resubmit. The commissioner can force the board open or
  closed from the admin page.
- **Pushes** (final margin lands exactly on the number) credit everyone the weight by default.
  Switch to "nobody earns the weight" on the admin page.
- **Games are listed away team first.** The divider reads "at" for home games and "vs" for the
  three neutral sites (Atlanta, Nashville, Green Bay). If you ever reorder `teamA`/`teamB` for a
  game, note that it flips the meaning of `A` and `B` in every stored pick and in the saved
  favorite for that game — safe to do before anyone submits, a migration afterwards.

## Passwords

| Gate | Password | Covers |
|---|---|---|
| League | `degenerateffl` | Making or editing picks (`index.html`) |
| Admin | `draftorder2026` | Commissioner console (`admin.html`) |

The standings page is deliberately open — anyone with the link can watch the board without a
password.

Both gates are **obscurity only**. This repo is public, so anyone who views source can read
either password. They stop a forwarded link from being self-serve; they are not security. Once a
player enters the league password it is remembered in their browser, so they only type it once
per device.

### Invite link

Send this instead of the password and nobody has to type anything:

```
https://brianchernauskas.github.io/draft-order-pickem/index.html#key=degenerateffl
```

The admin page has this ready to copy under **Invite link**, so you never have to remember the
format. It opens straight to the board, remembers the unlock on that device, and strips the key
out of the address bar on arrival so it is not left on screen or in browser history.

The key rides in the `#fragment` rather than a `?query` on purpose: fragments are never sent to
the server, so the password stays out of GitHub's request logs and out of the `Referer` header on
any outbound link. `?key=` is accepted too, in case a chat client mangles the fragment.

A wrong key falls through to the normal password prompt. And be clear-eyed about what the link
is: anyone it gets forwarded to is in, exactly as if you had texted them the password.

## Emailing picks (optional)

Players can leave an email address on the pick form. The address is always saved with their entry
and shows under their name on the admin page, so you have a roster of them either way.

**The receipt goes to the player only — nobody is copied.** Sending every board to one inbox would
let that person see the whole field's picks before the lock, which is exactly the edge a
confidence pool is not supposed to hand out. The commissioner still sees everything on the admin
page after the fact.

**Right now, with no setup:** after submitting, the player gets a link that opens their own mail
app with their board already written and addressed to themselves. They tap send. Works today, but
it relies on the player actually sending it.

**To have it send automatically**, connect EmailJS — it delivers straight from the browser, which
is the only way to send mail from a site with no server. Free tier is 200 emails a month.

1. Sign up at [emailjs.com](https://www.emailjs.com) and go to **Email Services → Add New
   Service**. Pick Gmail and connect whichever account the mail should come *from*. Copy the
   **Service ID**.
2. Go to **Email Templates → Create New Template** and set it up with these fields:
   - **To Email:** `{{to_email}}`
   - **Subject:** `{{subject}}`
   - **Content:** switch the editor to plain text and put `{{picks_text}}` in the body on its own.
     Plain text matters — the picks are formatted with line breaks that a rich-text body eats.

   Copy the **Template ID**.
3. Go to **Account → General** and copy your **Public Key**.
4. Paste all three into `EMAIL_CONFIG` in `assets/js/config.js`, then commit and push:

   ```js
   export const EMAIL_CONFIG = {
     publicKey: 'your_public_key',
     serviceId: 'your_service_id',
     templateId: 'your_template_id',
   };
   ```
5. Recommended: **Account → Security → Allowed Domains**, add `brianchernauskas.github.io`. The
   public key is visible in source, and this stops anyone else from sending on your quota.
6. Verify it: open the admin page, find **Email receipts**, put your own address in and hit
   **Send test email**. It pushes a sample board through the real template, so a test that lands
   means player receipts will land too. Any error comes back inline with EmailJS's own message.

The **Email receipts** panel also tells you at a glance whether the keys are live, so you never
have to guess whether sending is on.

Sending is best-effort and runs *after* the picks are already saved to Firestore. If the email
fails, the player sees a note saying their picks are safe and gets the mail-app link as a
fallback. A broken email setup can never cost someone their entry.

## Firebase

Already connected to the **`bourbonffldraft`** project — the config is in `assets/js/config.js`
and Firestore reads and writes are live. If a yellow "demo mode" banner ever appears, the config
has been cleared or the project is unreachable, and everything falls back to browser-local
storage.

For reference, the Firestore rules this expects:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /entries/{entry} {
      allow read: if true;
      allow write: if true;
    }
    match /config/settings {
      allow read: if true;
      allow write: if true;
    }
  }
}
```

### A word on those rules

They let anyone who finds your URL read and write. For a ten-person fantasy league that is
usually the right trade — no logins, no friction. Be aware of what it means:

- Anyone with the link could overwrite someone else's picks or change the lines.
- The admin passphrase in `config.js` is visible to anyone who views source. It keeps honest
  people out of the admin page; it is not security.
- Every save is timestamped, and **Download all data as JSON** on the admin page gives you a
  backup. If someone tampers, you can prove it and restore.

If you want it genuinely locked down, the path is Firebase Authentication plus rules that check
`request.auth.uid` against an allowlist. Say the word and I'll wire it up.

## Deploying to GitHub Pages

Live at **https://brianchernauskas.github.io/draft-order-pickem/**, served from the `main`
branch root. Pushing to `main` redeploys automatically; give it a minute.

```bash
git add -A
git commit -m "your message"
git push
```

## Before you commit a JS or CSS change

```bash
python tools/bump.py
```

GitHub Pages serves assets with `cache-control: max-age=600`. Without a version stamp a returning
visitor can pick up a fresh copy of one module and a ten-minute-old copy of another, and if an
export moved between them the page renders nothing at all. `bump.py` stamps `?v=<timestamp>` on
every local script, stylesheet, and relative import so the whole set moves together. External
imports (Firebase, EmailJS, fonts) are left alone. Content-only edits to the README do not need it.

## Running it locally

```bash
npx serve draft-order-pickem --listen 3007
```

The pages use ES modules, so opening `index.html` straight off the filesystem will not work —
it needs to be served over http.

## Commissioner workflow

1. **Now:** open `admin.html`, enter the passphrase, and fill in real kickoff times and venues as
   they get announced. Several venues are marked "Venue TBD" — I did not want to guess at home
   sites and put wrong information in front of your league.
2. **As lines firm up:** set the favorite and the number for each game. The number is always
   positive — a 13.5-point favorite is `13.5`. Leave the favorite blank for a true pick'em.
   Players see the current line on their card, so post them before you send the link around.
3. **Send the link.** Players go to `index.html`, fill out the board, submit.
4. **During the games:** enter finals on the admin page and hit **Save settings**. The ATS result
   and everyone's score update immediately, and the standings page refreshes live for anyone
   watching.
5. **After Washington–Washington State:** the standings page is your draft order.

## Editing the schedule or teams

Everything lives in `assets/js/config.js`:

- `GAMES` — the ten matchups, in board order, with default kickoffs and venues. Admin edits
  override these without touching the code.
- `TEAMS` — name, mascot, ESPN team id (drives the logo), and school colors. Logos come from
  `a.espncdn.com`; if one ever fails to load, the card falls back to a color circle with the
  team abbreviation. Every logo sits on a light disc: school marks are drawn for white
  backgrounds, and California, Cincinnati and Baylor measured at 1.0–1.5:1 contrast against the
  dark card, which is invisible. The disc goes on all of them rather than just the dark ones so
  it reads as a deliberate treatment.
- `HONORS` — the honor roll strip across the top of the picks and standings pages. Currently
  reigning champs (Lance & Phil) and the dress winner (Erik). Edit the names each season; add or
  remove entries and the strip re-flows on its own. `tone` is `champ` (gold) or `dress` (pink).
- `LEAGUE_NAME` / `LEAGUE_SHORT` — the full name shows in the header on desktop, `LEAGUE_SHORT`
  ("DBFFL") swaps in on phones so it stays one line.
- `PICKS_PASSWORD` / `ADMIN_PASSPHRASE`, `SEASON_LABEL`, `TIEBREAKER_GAME_ID`.

## Phones

Built and checked at 390px (iPhone 14/15/16) and 375px (SE/mini):

- Matchup cards stack to one column with a `vs` divider; tap targets are at least 44px tall.
- Every input and select is 16px, which is what stops iOS Safari from zooming the page when a
  field takes focus.
- The header collapses to `DBFFL` with the three nav links as equal-width pills.
- Standings drop the Max-left / tiebreaker / submitted columns and fold those numbers into a
  small second line under each player's name, so the table fits without sideways scrolling.
- `viewport-fit=cover` plus safe-area padding keeps the sticky weight tracker clear of the
  home indicator.

## File map

```
index.html            player pick form
standings.html        leaderboard + results board
admin.html            commissioner console
assets/css/style.css  all styling
assets/js/config.js   teams, games, keys  <- edit this
assets/js/store.js    Firestore / localStorage adapter
assets/js/scoring.js  ATS + confidence scoring (no DOM, no network)
assets/js/mailer.js   picks receipt: EmailJS send + mailto fallback
tools/bump.py         cache-busting version stamp, run before each deploy
assets/js/ui.js       shared view helpers
assets/js/picks.js    pick form logic
assets/js/standings.js
assets/js/admin.js
```
