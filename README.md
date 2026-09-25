# Smelley Pool

*Nullum praesidium securum est: no lead is safe.*

The Smelley family football-pool dashboard. It shows live scores graded against the pool's printed spreads, the family scoreboard, league standings, head-to-head records, pick analysis, and a family-only trash-talk feed.

- **Site:** static HTML/JS served by GitHub Pages. There is no build step.
- **Backend:** Supabase handles the logins, the weekly data and the chat. Row-level security keeps every table readable only by signed-in family members (`supabase/schema.sql`).
- **Live scores:** ESPN's public scoreboard feed, fetched in the browser.
- **Private data stays out of the repo.** League standings, picks and full names never enter git. `inputs/`, `local-data/`, `.env` and `*.local.json` are gitignored.

## One-time setup

1. Create a free Supabase project. In **SQL editor**, run `supabase/schema.sql`.
2. **Authentication → Sign In / Providers:** turn **off** "Allow new users to sign up", which makes it invite-only. Leave the Email provider on.
3. **Authentication → URL Configuration:** set Site URL to `https://tchaudhary1.github.io/smelley-pool/`. Add it plus `http://localhost:5173/` to Redirect URLs, so sign-in links, invites and password resets land back on the site.
4. Copy the project URL and the **publishable (anon)** key into `js/config.js`. That key is meant to be public.
5. Put the URL and the **secret (service_role)** key in `.env`. The secret key belongs in Bitwarden, never in git.
6. List everyone in `users.local.json` (format at the top of `tools/setup-users.mjs`), then run `npm run users`. People listed with a starting password can sign in right away. Everyone else gets an invite email.
7. Run `npm run push` to upload `local-data/`.

Signing in uses your email plus either a password or a one-tap **"Email me a sign-in link"**. **"Forgot password?"** emails a reset link, and the account menu (your name, top right) sets or changes a password.

Supabase's built-in email sender allows only a few emails per hour. For more, add custom SMTP (for example Resend's free tier) under Authentication → Emails.

## Every week

```bash
node tools/build-week.mjs --week 5 --odds inputs/week5/Week_5_Odds.doc \
  --picks "inputs/week5/*.xls" --totals inputs/Yearly_totals_through_Week_4.xls \
  --dates 20261001,20261002,20261003,20261004,20261005
echo '{"currentWeek":5}' > local-data/settings.json
npm run push
```

Tarun's login also has an **Upload** tab. Dropping pick sheets or the yearly-totals workbook there updates everyone without the command line.

## Local preview

`npm run serve`, then open http://localhost:5173. With an empty `SUPABASE_URL`, preview mode reads `local-data/` and accepts any family first name. On any other host, it refuses to run unconfigured.
