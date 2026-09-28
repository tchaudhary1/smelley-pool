# Notifications plan (Android first, then iOS)

Status: proposed Sep 28 2026, not started. Each stage ends in a gate: Tarun signs off before the next
stage begins. The documentation / git / backup item at the top of ROADMAP.md comes first.

## Goal
Opt-in, per-person notifications on phones (and desktop browsers, which come free), with each person
choosing *what* they get and *how often*:

| Category | Choices |
|---|---|
| Chat | Off · @mentions and replies to me · every message |
| The Commentator | Off · questions to me only · big posts (weekend preview, weekly recap) · every post |
| My picks | Finals (covered / missed) · cover flips · late sweats (4th quarter, within a score of the number) |
| Games I follow (🔔 on a game card) | Final only · lead changes · every score |
| Family race | Lead changes this week · my week result |
| How often | Instant · bundled (at most one every 5 / 15 / 30 min) · hourly cap · quiet hours · game days only |
| Lock screen | Full text · "New activity in Smelley Pool" only |

Defaults are conservative: @mentions, Commentator questions to me, and finals on my picks. Everything
else is opt-in. Nothing is sent until the person turns notifications on for that device.

## How it works (one approach for Android, desktop and iOS)
Standard **Web Push**: the site's service worker (`sw.js`) receives pushes; no app store, no Firebase
project, no Apple developer account. Pushes are signed with a VAPID key pair (private key in Bitwarden
and Supabase secrets; public key in `js/config.js`, which is fine to publish).

- **Android:** Chrome, Firefox and Samsung Internet support push from the browser; "Install app"
  (from a web app manifest) gives an icon, full-screen launch and cleaner notifications.
- **iPhone/iPad:** iOS/iPadOS 16.4+, and only after "Add to Home Screen"; permission must be asked
  from a button inside the home-screen app.

### Senders: nothing depends on Tarun's PC except the Commentator itself
1. **Chat and Commentator posts:** a database webhook on each new `messages` row calls a Supabase Edge
   Function (`notify-chat`) that finds who should hear about it and sends the pushes. Works with the PC off.
2. **Game events (scores, covers, finals):** a Supabase scheduled job (pg_cron, every minute during game
   windows, every 15 minutes otherwise) runs `notify-games`: it reads ESPN, compares with the last
   stored state, grades against the pool's spreads and everyone's picks, and sends alerts. It reuses the
   site's own grading code (`js/live.js`) so the numbers match the dashboard. Works with the PC off.
3. **One sender** (`push-send`, shared code) applies every rule: preferences, quiet hours, rate caps,
   de-duplication, lock-screen privacy, dropping dead subscriptions.

Free-tier fit: ~45k scheduled runs a month plus chat traffic is well under Supabase's 500k Edge
Function calls a month.

### Data (one SQL file, run once in Supabase)
- `push_subscriptions`: one row per device (endpoint, keys, platform, label like "Pixel 8 / Chrome",
  created, last success, failure count). Own rows only (RLS).
- `notification_prefs`: one row per person (the choices above, time zone, quiet hours). Own row only.
- `game_follows`: person + game (🔔). Own rows only.
- `notification_log`: what was sent to whom and when (for rate caps, de-duplication and after-action).
  Readable by the admin only.
- `game_alert_state`: last seen score/cover state per game (server only).
- `messages.kind` (new, optional column): lets the Commentator mark preview / recap / question / play-by-play,
  so people can pick which Commentator posts notify them.

### Rules that prevent spam
- One notification per game that **updates in place** (same `tag`), rather than a stack.
- Live alerts expire after 10 minutes (a stale score is worse than none).
- Per-device hourly cap; bundling merges bursts into one summary.
- Never notify someone about their own message.
- Quiet hours hold non-urgent alerts until they end (or drop live-score ones).
- A device that keeps failing is removed automatically.

## Stages and gates

### Stage 0: Decisions and groundwork (about 2 hours)
- Confirm the categories, defaults and frequency options above.
- Generate VAPID keys (into Bitwarden and Supabase secrets).
- Write the SQL (tables, RLS, `messages.kind`), Tarun runs it.
- Add a web app manifest (name, icons 192/512 and a maskable icon, standalone, start URL) so the site
  can be installed.

**Gate 0:** SQL applied; keys stored; on Tarun's Android, Chrome offers "Install app" and it opens full screen.

### Stage 1: Android plumbing, test notifications only (about half a day)
- `sw.js`: handle `push` (show the notification), `notificationclick` (open or focus the dashboard at
  the right place: chat, a game card via `?game=`, a profile), `pushsubscriptionchange` (re-subscribe).
- Account menu → **Notifications**: "Turn on for this device" (asks permission from the button),
  device list with remove, and **Send me a test**.
- `push-send` Edge Function and a test endpoint (admin only).

**Gate 1 (Tarun's Android):** a test notification arrives with the browser closed, the screen locked,
after a phone restart, and with battery saver on; tapping it opens the right screen; turning it off
stops them; the device list is right. Time from send to arrival under 10 seconds.

### Stage 2: Chat and Commentator notifications (about a day)
- `notify-chat` Edge Function plus the database webhook on `messages`.
- Preferences UI for Chat and Commentator, lock-screen privacy, quiet hours, hourly cap, bundling.
- The Commentator tags its posts (`kind`) and marks whom a question is addressed to.
- Notification log view on the Upload tab (admin): sent, bundled, dropped, failed.

**Gate 2:** a real game day on Tarun's phone (plus a second test login, which can be the same phone in
another browser): @mentions arrive; "every message" works; own messages never notify; caps and quiet
hours hold; after-action shows no duplicates and no missed mentions.

### Stage 3: Game notifications (about 1 to 1½ days)
- `notify-games` scheduled function (ESPN read, compare with stored state, grade against spreads and
  picks) with finals, cover flips and late sweats for "my picks".
- 🔔 on game cards for following any game: final only, lead changes, or every score.
- Family race alerts (lead changes this week, my week result).
- Per-game notifications update in place; live alerts expire after 10 minutes.

**Gate 3:** a full Saturday on Tarun's phone: every alert checked against ESPN and the dashboard (right
score, right cover call), alert count per hour within the cap, nothing sent for games already decided,
no alerts after the last game. After-action report extended with notification stats.

### Stage 4: Family rollout on Android and desktop (about half a day)
- Help page section (what each option does, how to install, how to turn off).
- Smack Talk announcement from the Commentator, and a short email.
- Sensible defaults applied for anyone who turns it on.

**Gate 4:** two weekends with the family using it; no complaints about volume; opt-in and delivery
numbers reviewed; adjust defaults if needed.

### Stage 5: iOS (about a day, plus a family tester with an iPhone)
- **Sign-in inside the home-screen app.** An iPhone home-screen app keeps its own sign-in, separate
  from Safari, and email sign-in links open in Safari, not the app. Add "email me a 6-digit code" as a
  sign-in option (Supabase supports it) so people can sign in inside the app; passwords keep working.
- An "Add to Home Screen" guide page (with screenshots) shown to iPhone visitors, and the
  Notifications panel explains the step when it's missing.
- iOS rules: permission only from a button; every push must show a notification (iOS revokes
  permission from apps that push silently); app icon badge for unread chat where supported.
- Test by remote walkthrough with a family member on iOS 16.4 or newer (ideally iOS 17 or 18):
  install, sign in with a code, turn on, test notification, a mention, a game alert, tap-through.

**Gate 5:** at least one iPhone passes the full checklist; then announce to iPhone users.

### Stage 6: Later polish (optional, pick and choose)
- Daily or weekend digest instead of live alerts.
- Follow a person ("tell me when Bobby's picks cover").
- Action buttons on Android notifications ("Open chat", "Mute this game").
- Weekly recap and weekend preview as rich notifications.

## Testing without an iPhone
Android and desktop cover Stages 0 to 4. For iOS, ask a family member with a recent iPhone to do a
10-minute guided test (a checklist in the Help page, or a call). Until then, iPhone users see "coming
soon" instead of a switch that won't work.

## Risks and limits
- **iOS depends on the home-screen app.** People who only use Safari can't get notifications; the guide
  and the code sign-in are there to make the switch painless.
- **Android battery savers** can delay notifications on some phones; Gate 1 checks this.
- **Commentator posts still need Tarun's PC.** Chat and game alerts don't. Moving the Commentator to
  the server (roadmap) removes the last dependency.
- **Too many notifications** is the most likely failure. Conservative defaults, bundling, caps and
  updating in place are the guardrails, and Gate 2 and Gate 3 measure it.

## Rough total
About 4 to 5 working days across Stages 0 to 5, spread over two or three weekends because Gates 2 to 4
need real game days.
