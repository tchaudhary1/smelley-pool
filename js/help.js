// Help content. Plain data so it's easy to edit: each topic has a title, keywords for search,
// and HTML body (trusted, written here, never user input).
export const HELP = [
  { group: 'Getting started', topics: [
    { id: 'what', title: 'What is this?', keys: 'about overview pool dashboard', body: `
      <p>This is the Smelley family's private dashboard for the A80 football pool. It shows everyone's picks, live scores and who's covering, the league standings, head-to-head records and a family chat. The whole idea fits the family motto, <i>Nullum praesidium securum est</i>: no lead is safe.</p>
      <p>Only family members can sign in, and everything behind the login (picks, standings, chat) is private to the family.</p>` },
    { id: 'signin', title: 'Signing in', keys: 'login log in sign in email password forgot link magic', body: `
      <p>Use the email address Tarun added for you. There are two ways in:</p>
      <ul><li><b>Email + password</b>, if you've set a password.</li>
      <li><b>Email me a sign-in link</b>: type your email, tap the link under the button, then open the email on the same device and tap the link. It signs you straight in. No password needed.</li></ul>
      <p>You stay signed in on that device until you sign out.</p>` },
    { id: 'password', title: 'Setting or changing your password', keys: 'password change set new reset forgot forgotten account menu', body: `
      <p>Once signed in, tap your name in the top-right corner and choose <b>Set or change password</b>. Use at least 8 characters.</p>
      <p>A password is optional: you can always use the emailed sign-in link instead.</p>` },
    { id: 'phone', title: 'Put it on your phone’s home screen', keys: 'iphone android app icon home screen install', body: `
      <p><b>iPhone (Safari):</b> open the site, tap the Share button (square with an arrow), then <b>Add to Home Screen</b>.</p>
      <p><b>Android (Chrome):</b> open the site, tap the ⋮ menu, then <b>Add to Home screen</b>.</p>
      <p>It then opens like an app, with the crest as its icon.</p>` },
  ]},
  { group: 'Sign-in trouble', topics: [
    { id: 'noemail', title: 'The sign-in or reset email never arrived', keys: 'email not received spam junk missing link', body: `
      <ul><li>Check your spam or junk folder, and the Promotions tab in Gmail. It comes from Supabase, the service that runs the logins.</li>
      <li>Wait a few minutes. The free email service sends only a handful of emails per hour for the whole family, so a busy moment can delay it.</li>
      <li>Make sure you typed the same email Tarun added for you.</li>
      <li>Still nothing? Ask Tarun. He can set a starting password for you so no email is needed.</li></ul>` },
    { id: 'expired', title: '"Link expired" or the link opens a blank page', keys: 'expired invalid link blank otp token', body: `
      <p>Sign-in and reset links work once, for a limited time. If you tap an old link, or tap it twice, it won't work. Go back to the sign-in page and request a fresh one.</p>
      <p>Open the link on the <b>same device and browser</b> where you want to be signed in.</p>` },
    { id: 'notlist', title: '"That email isn’t on the family list"', keys: 'not on family list not allowed signup invite', body: `
      <p>The dashboard is invite-only, and that email hasn't been added. Maybe you have a second address? Ask Tarun to add the email you want to use.</p>` },
    { id: 'wrongpw', title: '"Wrong email or password"', keys: 'wrong password invalid credentials', body: `
      <p>Double-check the email for typos. If you've forgotten your password, tap <b>Forgot password?</b> to get a reset link, or tap <b>Email me a sign-in link</b> to skip the password entirely.</p>` },
    { id: 'toomany', title: '"Too many emails just now"', keys: 'rate limit too many emails', body: `
      <p>The free email service has an hourly limit. Wait a little while and try again, or sign in with your password if you have one.</p>` },
    { id: 'stuck', title: 'The page looks stuck, blank or out of date', keys: 'blank stuck loading refresh cache old', body: `
      <ul><li>Pull down to refresh (phone), or press <b>Ctrl+F5</b> or <b>Cmd+Shift+R</b> (computer).</li>
      <li>Still stuck? Sign out from the menu under your name and sign back in.</li>
      <li>"Couldn't load pool data" usually means a weak connection; try again in a minute.</li></ul>` },
  ]},
  { group: 'The tabs', topics: [
    { id: 'gameday', title: 'Game Day', keys: 'game day scoreboard pips banked live max expected slate', body: `
      <p><b>Family scoreboard:</b> one card per person for this week. Tap a card for that person's full week.</p>
      <ul><li><b>pts banked</b>: points already won from finished games.</li>
      <li><b>Live +N</b>: points currently covering in games being played right now. Not locked in yet!</li>
      <li><b>Max</b>: the most you can still finish with (banked plus every pick not yet lost).</li>
      <li><b>Exp</b>: expected points, a best guess that blends each pick's chance of covering.</li>
      <li>The <b>row of numbered boxes</b> is your picks by confidence, 10 down to 1: <span class="upill new">green</span> won, <span class="upill changed">orange</span> losing right now, green outline winning right now, crossed-out lost, grey not started.</li></ul>
      <p><b>Lead Watch</b> shows games in progress where a family pick is on the line, and whether each person is covering and by how much. "Not safe" means the cushion is less than a touchdown.</p>
      <p><b>The slate</b> lists every game on this week's sheet. Use the filters (Family picks, All, Live, NFL, College, Final). Tap any game for its card.</p>` },
    { id: 'reading-games', title: 'Reading a game row', keys: 'spread home number pool # chips hook cover bar', body: `
      <ul><li>The <b>favorite</b> is on the left with the minus spread; the <b>underdog</b> is on the right with the plus spread.</li>
      <li><b>HOME</b> marks the home team (the sheet prints home teams in CAPITALS).</li>
      <li><b>#</b> is the pool number you write on your pick sheet.</li>
      <li>The <b>little colored chips</b> under a team show who in the family picked that side and with how many confidence points.</li>
      <li>The <b>thin bar</b> under a live score is the favorite's chance to cover right now.</li>
      <li>A team name turns <b>green</b> when that side is covering.</li>
      <li><b>DECIDED BY THE HOOK</b> means the game finished exactly half a point from the spread.</li></ul>` },
    { id: 'standings', title: 'Standings', keys: 'standings league rank tie T- back pctl percentile charts race', body: `
      <p>The whole league's season totals, straight from the commissioner's weekly workbook. Switch between <b>Family only</b> and <b>Whole league</b>, or search a name. Tap a row for that person's card.</p>
      <ul><li><b>T-9</b> means tied for 9th.</li>
      <li>The current week's column shows <b>live</b> points (marked *) for anyone whose picks are loaded. Official scores replace them when the commissioner posts totals.</li>
      <li><b>Back</b>: points behind the league leader. <b>Pctl</b>: percentile (90 = better than 90% of the league).</li>
      <li>The <b>shadow card</b> row (striped) is Tarun's unofficial experiment. It isn't ranked.</li></ul>
      <p>The charts: every weekly score in the league (tap it for week-by-week details), the season race against the league median and 10th place, where season totals fall, and the <b>Family Cup</b>.</p>` },
    { id: 'h2h', title: 'Head to Head', keys: 'head to head matrix record swing', body: `
      <p>The grid shows each pair's week-by-week record: read across a row, so "3–0" means that row's person outscored that column's person in 3 weeks. Green means the row leads, red means they trail. Tap a square for details, including this week's shared picks and direct clashes.</p>
      <p><b>Swing games</b> are this week's games where the family is on opposite sides, the ones that decide bragging rights.</p>` },
    { id: 'lab', title: 'Pick Lab', keys: 'pick lab insights style consensus model race simulation what-if what if win odds chance', body: `
      <p>The week's storylines (boldest pick, loneliest pick, biggest underdog bet), each person's pick style (favorites vs underdogs, home vs road, NFL vs college), and a consensus board of every game with a family pick.</p>
      <p><b>This week's race</b> plays the rest of the week out 5,000 times, using every game's chance to cover (live during games). It shows each person's chance to win the family this week, expected score, and likely range. With only one family card loaded, it's head to head against Tarun's shadow card.</p>
      <p><b>Versus the league</b> ranks each of us among all 113 entries: likely rank this week, chance of a top-10 week, and where the season standing is headed. <b>The family vs the league</b> pits the family's average against everyone else's. League entries without uploaded picks (and family members whose picks aren't in yet) are simulated from their season so far, so this sharpens as pick sheets arrive.</p>
      <p>On the Standings tab, <b>Family vs the league</b> shows how the family has actually done week by week, including "Team Smelley" best-ball: the family's best score each week added up as if it were one entry.</p>
      <p><b>What-ifs that matter most</b> are the unfinished games that move those chances the most: "If Georgia covers, Jamie's chance goes from 32% to 53%." They're a rooting guide. Tap one to open the game.</p>
      <p><b>The model</b> covers every game on the sheet. It starts from the current DraftKings line with the sportsbook's cut removed, adds a small nudge from power ratings for college games, and prices the pool's printed spread, giving key numbers like 3 and 7 extra weight. It updates as lines move. It isn't a crystal ball: even its favorite picks are only about 53–55% to cover.</p>` },
    { id: 'talk', title: 'Smack Talk', keys: 'chat smack talk message reactions emoji mention tag delete', body: `
      <ul><li>Type a message and press <b>Enter</b> (Shift+Enter for a new line), or tap Send.</li>
      <li>Type <b>@</b> to mention someone: a menu pops up. Keep typing to narrow it down, then tap a name or press Enter or Tab.</li>
      <li><b>Game tag:</b> pick a game from the dropdown to attach it. Tapping the tag opens that game's card.</li>
      <li><b>Reactions:</b> tap <b>＋🙂</b> under any message, or on a pick in a card, to react. Tap your reaction again to remove it.</li>
      <li>You can delete your own messages (the "delete" link next to your name).</li></ul>` },
    { id: 'cards', title: 'Pop-up cards', keys: 'card popup modal tap click details gauge', body: `
      <p>Almost everything opens a card: family cards, games, standings rows, head-to-head squares, charts, even the crest. Close a card with ×, the Esc key, or by tapping outside it.</p>
      <p>A <b>game card</b> has the live score, a gauge showing which side is covering (and by how much), the live chance of covering, the last play, the pool line against the current sportsbook line, and who in the family is on each side.</p>` },
  ]},
  { group: 'The Commentator', topics: [
    { id: 'commentator', title: 'Who is 🎙️ The Commentator?', keys: 'commentator bot ai claude color commentary', body: `
      <p>The Commentator is a chat bot powered by Claude (an AI). It posts cheeky color commentary in Smack Talk when family picks swing: a cover flipping, a late sweat, a bad beat by the hook, a new family leader.</p>
      <ul><li>Ask it something by typing <b>@Commentator</b> in a message. It usually replies within a minute or two.</li>
      <li>Now and then it drops a <b>what-if</b> during games ("Jamie fans: root for Georgia; it takes her from 32% to 53%"), plus a preview of the day's biggest stakes before the first family kickoff. Those come from the same simulation as the Pick Lab.</li>
      <li>It posts at most a few times an hour (what-ifs at most every 40 minutes), so it won't flood the chat.</li>
      <li>It only runs while Tarun's computer has it switched on, so sometimes it's quiet.</li>
      <li>It can only read the pool and post messages. It can't change picks or scores.</li>
      <li>It's meant to tease the picks, not the people. If it ever misses the mark, tell Tarun; he can mute it.</li></ul>` },
  ]},
  { group: 'How the pool works', topics: [
    { id: 'rules', title: 'Scoring rules', keys: 'rules scoring confidence points ten picks tiebreaker', body: `
      <ul><li>Each week you pick <b>10 sides</b> from the sheet, from 10 different games, and give each a unique confidence value from <b>10</b> (most sure) down to <b>1</b>.</li>
      <li>If your side <b>covers the printed spread</b>, you earn that many points. Otherwise zero. Best possible week: 55.</li>
      <li>Every spread ends in ½, so there are no ties (no pushes).</li>
      <li>The tiebreaker is the total points in the Monday night NFL game.</li>
      <li>Picks are graded against the sheet's printed spread, not whatever the line moves to later.</li></ul>` },
    { id: 'glossary', title: 'Glossary', keys: 'glossary spread cover hook juice favorite underdog backdoor push line key number', body: `
      <dl class="gloss">
        <dt>Spread</dt><dd>The points the favorite gives away. Georgia −14½ must win by 15 or more to cover; Oklahoma +14½ covers by winning, or by losing by 14 or fewer.</dd>
        <dt>Cover</dt><dd>Beating the spread. That's what scores points here, not just winning the game.</dd>
        <dt>Favorite / underdog</dt><dd>The team expected to win (minus sign) and the team expected to lose (plus sign).</dd>
        <dt>Hook</dt><dd>The extra half point, as in "−3½". Losing "by the hook" means missing by exactly half a point.</dd>
        <dt>Key numbers</dt><dd>Common winning margins in football, especially 3, 7, 10 and 14. Getting +3½ instead of +3 matters more than most half points.</dd>
        <dt>Backdoor cover</dt><dd>A late, meaningless score that flips the cover (for example, a garbage-time touchdown by the losing team).</dd>
        <dt>Juice</dt><dd>The sportsbook's fee built into a price (like −110). The pool has no juice, but juice hints where the "real" line sits.</dd>
        <dt>Confidence</dt><dd>Your 10-to-1 ranking. Big confidence on a loser hurts most.</dd>
        <dt>Shadow card</dt><dd>Tarun's unofficial, data-driven practice card, tracked for fun and not entered in the pool.</dd>
      </dl>` },
    { id: 'numbers', title: 'Where the numbers come from', keys: 'data espn scores update frequency live delay time zone', body: `
      <ul><li><b>Scores</b> come from ESPN's public scoreboard and refresh about every minute while games are live (every few minutes otherwise). They can lag a TV broadcast by 30 seconds or so.</li>
      <li><b>Times</b> are shown in Eastern Time.</li>
      <li><b>Picks and standings</b> are uploaded by Tarun from the commissioner's sheets. The league's official scores always win if anything disagrees.</li>
      <li><b>Chances to cover and win odds</b> come from live betting lines plus simulation. They're estimates, for fun, not guarantees.</li></ul>` },
  ]},
  { group: 'Privacy & safety', topics: [
    { id: 'privacy', title: 'Who can see what', keys: 'privacy who can see private data security', body: `
      <ul><li>Only signed-in family members can see picks, standings and the chat. Someone who finds the web address sees only the sign-in page.</li>
      <li>Accounts are invite-only; nobody can sign themselves up.</li>
      <li>Everyone in the family can read every chat message. You can delete your own.</li>
      <li>When The Commentator writes a comment, the relevant scores, picks and recent chat lines are sent to Claude to write it.</li></ul>` },
  ]},
  { group: 'For Tarun (admin)', admin: true, topics: [
    { id: 'upload', title: 'Uploading picks and standings', keys: 'upload admin xls picks totals workbook validate duplicate', body: `
      <p>On the <b>Upload</b> tab, drop in pick sheets (one or several <code>.xls</code> files, even a whole-league sheet) or the yearly totals workbook. Nothing is saved until you check the preview and tap <b>Save</b>.</p>
      <ul><li>Each entry is marked <b>new</b>, <b>changed</b> (with exactly what changed), <b>already loaded</b> (identical, skipped) or <b>rejected</b> (with the reason).</li>
      <li>Pick checks: 10 picks, confidences 10–1, every pool number on this week's sheet, no two picks from the same game, no duplicate names, tiebreaker 0–200.</li>
      <li>Totals checks: scores 0–55, no duplicate names. Past-week score changes and entries that would disappear are flagged, and you have to tick a box to confirm them.</li>
      <li>Only Excel files up to 5 MB are accepted. Names are cleaned of stray characters and markup.</li>
      <li>Saves merge into the newest saved copy, so two uploads can't erase each other.</li></ul>` },
    { id: 'newweek', title: 'Starting a new week', keys: 'new week odds doc build push', body: `
      <p>The weekly odds sheet (<code>.doc</code>) is loaded from the computer with <code>tools/build-week.mjs</code> and <code>npm run push</code> (see the README), or ask Claude or Watson to do it. After that, pick sheets and totals can go through the Upload tab.</p>` },
    { id: 'addpeople', title: 'Adding people and mute switch', keys: 'invite add user commentator mute', body: `
      <p>Add family members by listing them in <code>users.local.json</code> and running <code>npm run users</code> (invite email, or a starting password to skip email).</p>
      <p><b>The Commentator</b> is muted or unmuted with the toggle on the Upload tab. It only runs while <code>npm run commentator</code> is running on the PC.</p>` },
  ]},
];
