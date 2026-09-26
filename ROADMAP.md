# Roadmap

Things we've agreed to revisit. Newest decisions at the top of each section.

## Next up (after the first live Saturday, Sep 26 2026)

### After-action review
Run `node tools/after-action.mjs 2026-09-26` and go through uptime, response times, errors and
chat engagement before changing anything else.

### Move the Commentator off the PC
Today it runs inside a Claude Code session on Tarun's desktop, so it stops if the app closes.
Plan: run it as a service on Tarun's server (auto-start, restart on crash), keep the monitor log,
heartbeat and watchdog, and have the watchdog restart it automatically.

### Push notifications (opt-in, per device)
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

## Later

- Fill data gaps if files turn up: 2023 week 19 (picks + scores, final result), 2023 week 11/18
  pick sheets, 2023 weekly scores for weeks 4–10 and 12–16, 2023 final bowls, 2023 weekly winners,
  2024 week 19 pick sheet, 2025 week 15 pick sheet, anything from 2022 or earlier.
- This season's week 1–3 pick sheets (only official scores are loaded), for team history and
  scouting.
- Browser-side diagnostics (realtime drops, sync fallbacks) if the family reports chat oddities.
