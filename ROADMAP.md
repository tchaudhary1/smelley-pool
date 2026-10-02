# Roadmap

Things we've agreed to revisit. Newest decisions at the top of each section.

## First priority: documentation, git and backup (agreed Sep 27 2026)
Do this before any other roadmap item, so a fresh agent (or person) can run, fix and extend everything.

1. **Public docs (this repo, nothing private):** a `CLAUDE.md` for agents (architecture, commands,
   gotchas), `docs/OPERATIONS.md` (weekly data load, game day, monitoring, hibernate, after-action,
   incidents) and a rewritten README. Move the useful helper scripts out of the ignored sandbox into
   `tools/`.
2. **Private repo (`smelley-pool-private`):** raw historic source files, weekly pick sheets and
   matrices, `local-data/`, `inputs/`, and private operating notes (family details, preferences,
   commissioner items, how secrets are fetched). Never any secret values.
3. **Secrets:** move the Commentator's bot login out of a local file into the secrets manager.
4. **Backup:** a script that exports every Supabase dataset and the chat to the private repo, run
   weekly (the free plan has no restore points).

## Second priority: odds sheet upload on the Upload tab (agreed Sep 29 2026)
Today a new week's odds sheet (.doc) is built on the PC (`tools/build-week.mjs`) and pushed by hand.
Add an "Odds sheet (.doc)" drop box to the Upload tab that does it in the browser:
1. Read the .doc with SheetJS's file-container reader (already loaded for .xls pick sheets) and run the
   shared parser (`tools/odds.mjs`, moved to `js/` so the browser and the PC tool use one copy).
2. Match every game to ESPN (college with all FBS games, case-insensitive team aliases) and show a
   preview: game count by day and league, unmatched games, the tiebreaker, odd spreads.
3. "Publish week N": creates the week and switches the current week; never overwrites an existing week.
4. Fallback: paste the sheet's text if a .doc won't read.
Test by rebuilding weeks 1–5 from their original files and checking they match what's loaded. About half a day.
Comes before notifications (after documentation, git and backup).

## Next up (after the first live Saturday, Sep 26 2026)

### After-action review
Run `node tools/after-action.mjs 2026-09-26` and go through uptime, response times, errors and
chat engagement before changing anything else.

### Fixes from the Sep 26 live run (done Sep 27 morning unless noted)
- Done: JS / JP avatars for Jamie and Joe (first + last initial, worked out from the private roster).
- Done: no explaining basics (spread, cover, favorite, underdog); every pick fact says favorite or underdog; percentages keep exact labels.
- Done: in-game what-ifs skip games that are effectively decided (cover chance above 90% or below 10%).
- Done: a "biggest stakes" heads-up before each kickoff wave, not just the first of the day; what-if spacing no longer blocks it.
- Decided against: changing score presentation or adding the sheet convention; cutting post volume (the running commentary is wanted; little family chat is expected).
- Still open: a light "state of the race" nudge in long quiet stretches (low priority).
- Fixed during the run: the question plan was shadowed by the drafting function; reply failures now count as errors.

### Move the Commentator off the PC
Today it runs inside a Claude Code session on Tarun's desktop, so it stops if the app closes.
Plan: run it as a service on Tarun's server (auto-start, restart on crash), keep the monitor log,
heartbeat and watchdog, and have the watchdog restart it automatically.

### Push notifications (opt-in, per device)
**Built for Android/desktop Oct 2 2026; testing on Tarun's (Firefox) and Jamie's (Chrome) phones. iPhone later.** Plan: **[docs/NOTIFICATIONS_PLAN.md](docs/NOTIFICATIONS_PLAN.md)** (Sep 28 2026:
Android first, iOS after; server-side senders so alerts don't depend on the PC). Original notes below.

Web Push through the existing service worker (`sw.js`). Android and desktop browsers work from the
browser; **iPhone/iPad only after "Add to Home Screen" (iOS 16.4+)**, with notifications enabled from
inside the home-screen app.

1. Web app manifest (full-screen when installed; required for iOS push) and an app-icon badge for
   unread chat.
2. Settings under the account menu, per device: master switch (permission prompt), then
   - Chat: every message, or only @mentions / the Commentator's questions to me
   - My picks: cover flips, finals, late sweats
   - Games I'm following: 🔔 on any game card
   - Big Commentator posts: weekend preview, weekly recap
   - Optional quiet hours
3. `push_subscriptions` table (own rows only via RLS); one SQL snippet to run in Supabase.
4. Sender: game events from the Commentator (it already detects them); chat messages from a
   Supabase function on insert, so chat alerts work even when the PC is off.
5. No spam: one notification per game that updates in place, hourly cap per device, never for
   your own messages, everything off until opted in.
6. Test on a real iPhone and Android.

Estimate: about a day. VAPID keys go in Bitwarden. Start with @mentions and "my picks".

### "Last seen" usage record (privacy-light)
Sign-ins only show fresh logins, so on Sep 26 we couldn't tell who just had the dashboard open (Debbie
and Bobby signed in at kickoff but never posted; Joe left no trace). Add `last_seen_at` and a small
`sessions` log to profiles: stamp on open, on return to the page, and every ~5 minutes while visible.
Show it on the Upload tab ("Joe: active 7:10–8:30 PM", tabs opened) and feed the after-action report.
No page contents or clicks tracked; just presence. One SQL snippet to run in Supabase.

## Later

- Fill data gaps if files turn up: 2023 week 19 (picks + scores, final result), 2023 week 11/18
  pick sheets, 2023 weekly scores for weeks 4–10 and 12–16, 2023 final bowls, 2023 weekly winners,
  2024 week 19 pick sheet, 2025 week 15 pick sheet, anything from 2022 or earlier.
- This season's week 1–3 pick sheets (only official scores are loaded), for team history and
  scouting.
- Browser-side diagnostics (realtime drops, sync fallbacks) if the family reports chat oddities.
