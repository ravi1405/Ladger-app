# Ledger — Setup Guide (2 users + admin, Google Sheets backend)

Read this in order — Part 1 is required before the app will work at all.
Part 2 turns it into an installable APK.

---

## Part 1 — Set up your Google Sheet + backend (~10 minutes, one time)

### 1. Create the Sheet
1. Go to **sheets.google.com** → create a new blank spreadsheet.
2. Rename it something like "Ledger Data".
3. Rename the first tab (bottom-left) to exactly **Users**.
4. Add a second tab named exactly **Expenses**.
5. Add a third tab named exactly **Categories**.

### 2. Fill in the three tabs
**Users** tab — row 1 is headers, then one row per person:

| Username | Password    | Role  | DisplayName |
|----------|-------------|-------|-------------|
| admin    | changeme123 | admin | You         |
| partner  | changeme456 | user  | Partner     |

*(Change these two rows to real usernames/passwords/names before you start
using it — you can also edit them later from inside the app's Admin tab.)*

**Expenses** tab — just add the header row, leave the rest empty (the app fills it in):

| ID | Username | Date | Category | Description | Amount | CreatedAt |
|----|----------|------|----------|-------------|--------|-----------|

**Categories** tab — header row, then one category per row:

| Name          |
|---------------|
| Food          |
| Transport     |
| Shopping      |
| Bills         |
| Health        |
| Entertainment |
| Other         |

### 3. Add the backend code
1. In the Sheet, go to **Extensions → Apps Script**.
2. Delete any placeholder code in the editor.
3. Open the `Code.gs` file from this download, copy all of it, and paste
   it into the Apps Script editor.
4. Click the **save icon** (or Ctrl/Cmd+S).

### 4. Deploy it as a Web App
1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" → choose **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**.
5. Google will ask you to authorize it — click through **Authorize access**,
   pick your Google account, and if it shows an "unverified app" warning,
   click **Advanced → Go to (project name) (unsafe)** → **Allow**. This
   warning is normal for personal scripts you wrote/pasted yourself.
6. Copy the **Web app URL** shown (ends in `/exec`). You'll paste this
   into the app in the next part.

> **Security note, honestly stated:** this keeps things simple for a
> private 2-person app — passwords are checked by the script but stored
> as plain text in your Users tab, visible to anyone you share the Sheet
> with. Don't reuse a password you use elsewhere, and keep sharing on
> that Sheet turned off to everyone except your own account.

### 5. Connect the app
1. Open the app (`index.html`, or your installed APK/home-screen icon).
2. On the **Connect your ledger** screen, paste the Web App URL from
   step 4.6.
3. Sign in with one of the username/password rows from your Users tab.
4. Done — entries you add now go straight into your Expenses tab.

---

## Part 2 — Turn this into an installable APK (free, ~2 minutes)

The app is built as a PWA (Progressive Web App). Google's own free
tooling converts that into a real `.apk`:

1. Go to **github.com** → sign in (free account) → **New repository** →
   name it e.g. `ledger-app` → set **Public** → **Create repository**.
2. On the repo page, click **"uploading an existing file"** and drag in
   every file from this folder (`index.html`, `style.css`, `app.js`,
   `manifest.json`, `service-worker.js`, and the whole `icons` folder).
   Do **not** upload `Code.gs` — that one only goes in Apps Script, not
   the website. Do not upload the zip itself.
3. Commit the changes.
4. Go to **Settings → Pages** → Source: **Deploy from a branch** →
   Branch: **main**, folder: **/(root)** → **Save**. Wait ~1 minute,
   then refresh — you'll get a live URL like
   `https://yourusername.github.io/ledger-app/`.
5. Go to **pwabuilder.com** → paste that URL → **Start**.
6. Click the **Android** tab → **Generate Package** → **Download**.
7. You'll get a `.zip` containing an `.apk`. Send it to your Samsung
   S23 FE (email/Drive/USB) → tap it → allow "install from unknown
   sources" if prompted → it installs like any other app.

**Simpler alternative (same result, no APK file):** open the GitHub
Pages URL from step 4 in Chrome on your phone → menu (⋮) →
**"Install app"**. You get a home-screen icon that opens full-screen,
no separate file needed.

---

## Notes
- Every device signs in with its own username/password — you and the
  other person can use the app on your own phones at the same time.
- The **Admin** tab (visible only to the admin account) shows combined
  spend from both accounts, every entry from both people, and lets you
  change either account's display name or password.
- Categories are shared between both accounts and editable by either
  person from the **Account** tab.
- If you're offline, the app still shows your last-synced data and
  queues new entries to send automatically once you're back online.
- To add a third person later: add a row to the Users tab and a
  matching entry appears the moment they log in — no other setup needed.
