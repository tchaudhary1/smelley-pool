// Help content. Plain data so it's easy to edit: each topic has a title, keywords for search,
// and HTML body (trusted, written here, never user input).
export const HELP = [
  { group: 'Getting started', topics: [
    { id: 'what', title: 'What is this?', keys: 'about overview pool dashboard', body: `
      <p>This is the Smelley family's private dashboard for the A80 football pool. It shows everyone's picks with live scores graded against the pool's printed spreads, the league standings, head-to-head records, win odds and what-ifs for the week, how the family stacks up against the whole league, and a family chat with a resident commentator. It all fits the family motto, <i>Nullum praesidium securum est</i>: no lead is safe.</p>
      <p>Only family members can sign in, and everything behind the login (picks, standings, chat) is private to the family.</p>` },
    { id: 'signin', title: 'Signing in', keys: 'login log in sign in email password forgot link magic', body: `
      <p>Use the email address Tarun added for you. There are two ways in:</p>
      <ul><li><b>Email + password</b>, if you've set a password.</li>
      <li><b>Email me a sign-in link</b>: type your email, tap the link under the button, then open the email on the same device and tap the link. It signs you straight in. No password needed.</li></ul>
      <p>You stay signed in on that device until you sign out.</p>` },
    { id: 'password', title: 'Setting or changing your password', keys: 'password change set new reset forgot forgotten account menu sign out', body: `
      <p>Once signed in, tap your name in the top-right corner. That menu has <b>Set or change password</b> (at least 8 characters) and <b>Sign out</b>.</p>
      <p>A password is optional: you can always use the emailed sign-in link instead. Forgot it? Tap <b>Forgot password?</b> on the sign-in page.</p>` },
    { id: 'phone', title: 'Put it on your phone’s home screen', keys: 'iphone android app icon home screen install', body: `
      <p><b>iPhone (Safari):</b> open the site, tap the Share button (square with an arrow), then <b>Add to Home Screen</b>.</p>
      <p><b>Android (Chrome or Firefox):</b> open the site, tap the ⋮ menu, then <b>Add to Home screen</b> (or <b>Install</b>).</p>
      <p>It then opens like an app, with the crest as its icon.</p>` },
    { id: 'getting-around', title: 'Getting around (tabs, arrows, cards)', keys: 'navigation tabs arrows scroll swipe menu cards tap mobile phone', body: `
      <ul><li>The tabs run across the top: <b>Game Day, Standings, Head to Head, Pick Lab, Smack Talk, Help</b> (plus <b>Upload</b> for Tarun). On a phone they don't all fit: swipe the tab bar, or tap the <b>‹ ›</b> arrows that appear at its edges when more tabs are hidden that way.</li>
      <li>Almost everything opens a <b>card</b> with more detail: family cards, games, standings rows, head-to-head squares, what-ifs, charts, even the crest. On a phone, cards slide up from the bottom. Close with ×, by tapping outside, or with the Esc key.</li>
      <li>Everything refreshes on its own: about every minute while games are live, every few minutes otherwise. Pull down (phone) or reload to refresh right away.</li></ul>` },
  ]},
  { group: 'Sign-in trouble', topics: [
    { id: 'noemail', title: 'The sign-in or reset email never arrived', keys: 'email not received spam junk missing link', body: `
      <ul><li>Check your spam or junk folder, and the Promotions tab in Gmail. It comes from Supabase, the service that runs the logins.</li>
      <li>Wait a few minutes. The free email service sends only a handful of emails per hour for the whole family, so a busy moment can delay it.</li>
      <li>Make sure you typed the same email Tarun added for you.</li>
      <li>Still nothing? Ask Tarun, who can set a starting password for you so no email is needed.</li></ul>` },
    { id: 'expired', title: '"Link expired" or the link opens a blank page', keys: 'expired invalid link blank otp token', body: `
      <p>Sign-in and reset links work once, for a limited time. If you tap an old link, or tap it twice, it won't work. Go back to the sign-in page and request a fresh one.</p>
      <p>Open the link on the <b>same device and browser</b> where you want to be signed in.</p>` },
    { id: 'notlist', title: '"That email isn’t on the family list"', keys: 'not on family list not allowed signup invite', body: `
      <p>The dashboard is invite-only, and that email hasn't been added. Maybe you have a second address? Ask Tarun to add the email you want to use. Nobody can sign themselves up.</p>` },
    { id: 'wrongpw', title: '"Wrong email or password"', keys: 'wrong password invalid credentials', body: `
      <p>Double-check the email for typos. If you've forgotten your password, tap <b>Forgot password?</b> to get a reset link, or tap <b>Email me a sign-in link</b> to skip the password entirely.</p>` },
    { id: 'toomany', title: '"Too many emails just now"', keys: 'rate limit too many emails', body: `
      <p>The free email service has an hourly limit. Wait a little while and try again, or sign in with your password if you have one.</p>` },
    { id: 'stuck', title: 'The page looks stuck, blank or out of date', keys: 'blank stuck loading refresh cache old update', body: `
      <ul><li>Pull down to refresh (phone), or press <b>Ctrl+F5</b> or <b>Cmd+Shift+R</b> (computer). After an update to the site, one refresh picks up the new version.</li>
      <li>Still stuck? Sign out from the menu under your name and sign back in.</li>
      <li>"Couldn't load pool data" usually means a weak connection; try again in a minute.</li></ul>` },
  ]},
  { group: 'The tabs', topics: [
    { id: 'gameday', title: 'Game Day', keys: 'game day scoreboard pips banked live max expected slate lead watch win week league', body: `
      <p><b>Family scoreboard:</b> one card per person for this week. Tap a card for that person's full week.</p>
      <ul><li><b>pts banked</b>: points already won from finished games.</li>
      <li><b>Live +N</b>: points currently covering in games being played right now. Not locked in yet!</li>
      <li><b>Max</b>: the most you can still finish with (banked plus every pick not yet lost).</li>
      <li><b>Exp</b>: expected points, a best guess that blends each pick's chance of covering.</li>
      <li><b>🏆 Win week</b>: chance to win the family this week (once two or more family cards are loaded). Until then, <b>⚔️ Beats shadow</b> shows the head-to-head against Tarun's unofficial shadow card.</li>
      <li><b>🏟️ League</b>: likely rank among all league entries this week, and the chance of a top-10 week.</li>
      <li>The <b>row of numbered boxes</b> is your picks by confidence, 10 down to 1: solid green won, green outline winning right now, orange losing right now, crossed out lost, grey not started.</li></ul>
      <p><b>Lead Watch</b> shows games in progress where a family pick is on the line, and whether each person is covering and by how much. "Not safe" means the cushion is less than a touchdown. Before games start, it shows what's kicking off next.</p>
      <p><b>The slate</b> lists every game on this week's sheet. Use the filters (Family picks, All, Live, NFL, College, Final). Tap any game for its card.</p>` },
    { id: 'reading-games', title: 'Reading a game row', keys: 'spread home number pool # chips hook cover bar', body: `
      <ul><li>The <b>favorite</b> is on the left with the minus spread; the <b>underdog</b> is on the right with the plus spread.</li>
      <li><b>HOME</b> marks the home team (the sheet prints home teams in CAPITALS).</li>
      <li><b>#</b> is the pool number you write on your pick sheet.</li>
      <li>The <b>little colored chips</b> under a team show who in the family picked that side, with how many confidence points. A dashed chip is Tarun's unofficial shadow card.</li>
      <li>The <b>thin bar</b> under a live score is the favorite's chance to cover right now.</li>
      <li>A team name turns <b>green</b> when that side is covering.</li>
      <li><b>DECIDED BY THE HOOK</b> means the game finished exactly half a point from the spread.</li></ul>` },
    { id: 'standings', title: 'Standings', keys: 'standings league rank tie T- back pctl percentile charts race family cup best ball family vs league', body: `
      <p>The whole league's season totals, straight from the commissioner's weekly workbook. Switch between <b>Family only</b> and <b>Whole league</b>, or search a name. Tap a row for that person's card with their week-by-week scores and ranks.</p>
      <ul><li><b>T-9</b> means tied for 9th.</li>
      <li>The current week's column shows <b>live</b> points (marked *) for anyone whose picks are loaded. Official scores replace them when the commissioner posts totals.</li>
      <li><b>Back</b>: points behind the league leader. <b>Pctl</b>: percentile (90 = better than 90% of the league). On a phone, the week-by-week and percentile columns are hidden to fit the screen; tap a row to see them.</li>
      <li>The <b>shadow card</b> row (striped) is Tarun's unofficial experiment. It isn't ranked.</li></ul>
      <p>Below the table:</p>
      <ul><li><b>Every weekly score in the league</b>: each dot is one entry's week; the family is in color. Tap for week-by-week details.</li>
      <li><b>The race</b>: cumulative points against the league median and the 10th-place line.</li>
      <li><b>Season totals</b>: where each of us sits in the league's spread of scores.</li>
      <li><b>The Family Cup</b>: the family's season order with medals and weekly family wins. Tarun's shadow card appears at the bottom, clearly marked unofficial, and it's compared only on the weeks it has played.</li>
      <li><b>Family vs the league</b>: the family's average against everyone else's, week by week, plus <b>"Team Smelley" best-ball</b>: the family's best score each week added up as if it were one entry, and where that would rank.</li></ul>` },
    { id: 'h2h', title: 'Head to Head', keys: 'head to head matrix record swing grid', body: `
      <p>The grid shows each pair's week-by-week record: read across a row, so "3–0" means that row's person outscored that column's person in 3 weeks. Green means the row leads, red means they trail. Tap a square for details, including this week's shared picks and direct clashes. On a phone, the columns show avatars only so the whole grid fits.</p>
      <p>The last row is Tarun's shadow card, compared only on the weeks it has played. <b>Swing games</b> are this week's games where the family is on opposite sides: the ones that decide bragging rights.</p>` },
    { id: 'lab', title: 'Pick Lab', keys: 'pick lab insights style consensus model race simulation what-if what if win odds chance league versus', body: `
      <p><b>This week's race</b> plays the rest of the week out 5,000 times, using every game's chance to cover (live during games). It shows each person's chance to win the family this week, expected score and likely range. With only one family card loaded, it's head to head against Tarun's shadow card.</p>
      <p><b>What-ifs that matter most</b> are the unfinished games that move those chances the most: "If Georgia covers, Jamie's chance goes from 32% to 53%." Think of them as a rooting guide. Tap one to open the game.</p>
      <p><b>Versus the league</b> ranks each of us among all the league's entries: likely rank this week, chance of a top-10 week, chance of a top-quarter week, and where the season ranking is headed after this week. <b>The family vs the league</b> pits the family's average against everyone else's, with its own what-ifs.</p>
      <p><b>Storylines</b> (boldest pick, loneliest pick, family consensus, what the model likes and doesn't), <b>pick styles</b> (favorites vs underdogs, home vs road, NFL vs college), the <b>consensus board</b> of every game with a family pick, and <b>the shadow card</b> round it out.</p>` },
    { id: 'talk', title: 'Smack Talk', keys: 'chat smack talk message reactions emoji mention tag delete', body: `
      <ul><li>Type a message and press <b>Enter</b> (Shift+Enter for a new line), or tap Send (the gold ➤ on a phone). On a phone the chat fills the screen and stays above the keyboard.</li>
      <li>Type <b>@</b> to mention someone: a menu pops up with the family and the Commentator. Keep typing to narrow it down, then tap a name or press Enter or Tab. Mentions are highlighted, and yours get a gold outline.</li>
      <li><b>Game tag:</b> tap the 🏈 chip to attach a game. Tapping the tag on a message opens that game's card.</li>
      <li><b>Reactions:</b> tap <b>＋🙂</b> under any message, or on a pick in a card, to react. Tap your reaction again to remove it.</li>
      <li>You can delete your own messages (the "delete" link next to your name).</li></ul>` },
    { id: 'history', title: 'History (past seasons)', keys: 'history 2024 2025 last year past seasons archive champions week by week bowls lessons all seasons year over year held up flipped', body: `
      <p>The <b>History</b> tab rebuilds past seasons pick by pick from the commissioner's files, with every game graded against the final score. Two seasons are in so far, 2024 and 2025. About 98–99% of rebuilt cards match the official weekly scores exactly, and the official scores always win.)</p>
      <p>Use the season buttons at the top to switch years, or pick <b>All seasons</b>.</p>
      <ul><li><b>Champions</b> for the season, weeks 1–19 and the bowl pool.</li>
      <li><b>The family vs the league</b>: weeks the family beat the league average, and "Team Smelley" best-ball.</li>
      <li><b>The family's season</b>: finish, points, average, best week, weekly top-4 finishes, bowl rank and cover rate. Tap a name for the full scouting report.</li>
      <li><b>What worked league-wide</b>: patterns across every card in the league. ★ marks the ones big enough to be real rather than luck.</li>
      <li><b>All seasons</b>: champions by year, each family member's finish every season with their combined cover rate, 10s, underdog share and ordering, and <b>Did the lessons hold up?</b>, which checks each league-wide pattern year over year. A pattern that points the same way every year is marked ★ Held up. One that clearly reversed is marked ↔ Flipped (contrarian picks and home teams both flipped between 2024 and 2025), and one that showed up in only one season is marked ½ One year only. Scouting reports only quote the ones that held up.</li>
      <li><b>Week by week</b>: pick any week to see how the family scored and ranked, the league's top 4, and every game the family picked with the final score and who covered.</li></ul>` },
    { id: 'scouting', title: 'Scouting reports (tap any name)', keys: 'scouting report profile player name tap analysis trends quirks neighborhood strategy', body: `
      <p>Tap anyone's name (in Standings, History, or inside another report) to see how they pick:</p>
      <ul><li><b>The headline numbers</b>: this season's rank, last season's finish, weekly average, and a <b>season by season</b> table when they've played more than one year; cover rate, bowl rank, and how many points a week their confidence ordering adds or costs.</li>
      <li><b>What stands out</b> (from every season combined): only the habits that are clearly unusual compared with the rest of the league.</li>
      <li><b>How they pick</b>: underdogs, home teams, NFL, big favorites, big underdogs and contrarian picks, each against a gold tick for the league's typical rate, with how those picks did.</li>
      <li><b>By confidence</b>: how their high, middle and low confidence picks (and their 10s) covered.</li>
      <li><b>The neighborhood</b>: the players ranked just ahead of and behind them this season, with each one's finish in every past season, and <b>what separates them</b>, including whether that difference actually paid off league-wide or is just style.</li></ul>
      <p>Pick habits pool every season on file (about 360 picks per person over 2024 and 2025). The week-by-week chart has a button for each season. Useful for thinking about strategy, not guarantees.</p>` },
    { id: 'cards', title: 'Pop-up cards', keys: 'card popup modal tap click details gauge what it means', body: `
      <p>A <b>game card</b> has the live score, a gauge showing which side is covering (and by how much), the live chance of covering, the last play, the pool line next to the current market line and the model's cover chances, who in the family is on each side, and <b>What it means for the race</b>: how that game moves the family race, the league race and the family-vs-league battle.</p>
      <p>A <b>person card</b> has their week (banked, max, expected), season total and percentile, a weekly chart against the league average, and every pick with its live status and chance to cover.</p>` },
  ]},
  { group: 'The numbers', topics: [
    { id: 'model', title: 'How cover chances are calculated', keys: 'model probability cover chance market draftkings juice vig ratings key numbers', body: `
      <p>For every game on the sheet (NFL, Thursday and Friday college, and Saturday), the model:</p>
      <ol><li>takes the current DraftKings line and price from ESPN, and removes the sportsbook's built-in cut ("juice") to get the market's fair view;</li>
      <li>for college games, nudges that slightly using independent power ratings;</li>
      <li>prices the pool's printed spread against it, giving extra weight to football's common margins (3, 7, 10, 14…).</li></ol>
      <p>Once a game kicks off, its pregame line is frozen and the live score takes over. It isn't a crystal ball: even its favorite picks are only about 53–55% to cover.</p>` },
    { id: 'sim', title: 'Win odds, rankings and what-ifs', keys: 'simulation simulated 5000 projected field model league odds rank top 10 top quarter', body: `
      <p>Every refresh, the dashboard plays the rest of the week out 5,000 times with those cover chances (finished games are fixed). From that come each person's family win odds, head-to-head odds, likely score range, league rank and top-10 chances, and the what-ifs.</p>
      <p><b>League entries whose picks aren't uploaded</b>, and <b>family members whose picks aren't in yet</b> (marked "projected"), are simulated from their season so far, pulled strongly toward the league average because a few weeks is a tiny sample. As pick sheets are uploaded, real picks replace those guesses and everything sharpens.</p>` },
    { id: 'numbers', title: 'Where the data comes from', keys: 'data espn scores update frequency live delay time zone', body: `
      <ul><li><b>Scores and lines</b> come from ESPN's public scoreboard and refresh about every minute while games are live. They can lag a TV broadcast by 30 seconds or so.</li>
      <li><b>Times</b> are shown in Eastern Time.</li>
      <li><b>Picks and standings</b> are uploaded by Tarun from the commissioner's sheets. The league's official scores always win if anything disagrees.</li>
      <li><b>Chances, odds and rankings</b> are estimates, for fun, not guarantees.</li></ul>` },
  ]},
  { group: 'The Commentator', topics: [
    { id: 'commentator', title: 'Who is 🎙️ The Commentator?', keys: 'commentator bot ai claude color commentary', body: `
      <p>The Commentator is a chat bot powered by Claude (an AI) that posts cheeky color commentary in Smack Talk. It chimes in when:</p>
      <ul><li>a cover flips during a game, or a late game is within a score of the number ("no lead is safe");</li>
      <li>a game with family money on it goes final, especially bad beats by the half-point hook;</li>
      <li>someone takes the family lead for the week;</li>
      <li>a live game swings a storyline: the family race, someone's shot at a top-10 league week, or the family against the league (these <b>what-ifs</b> come at most every 40 minutes);</li>
      <li>the first family game of the day is about to kick off (a preview of the day's biggest stakes);</li>
      <li>someone tags <b>@Commentator</b>. It notices within about 10 seconds and usually answers within half a minute. Blinking dots in the chat mean it is working on it. Only tagged messages get an answer; if the dots sit there for a while, it may be offline.</li></ul>
      <p><b>Ask it anything about the pool.</b> It answers from the same live data as the dashboard: everyone's picks and live status, win odds, head-to-heads, league and season rankings, and the family against the league. Try:</p>
      <ul><li>"@Commentator how is the family doing against the league?"</li>
      <li>"@Commentator what if Georgia covers and Penn State doesn't?" (it re-runs the simulation with those results locked in)</li>
      <li>"@Commentator what does Jamie need to win the week?"</li>
      <li>"@Commentator how does Wyatt Johnson pick?" or "who in the family is best with their 10s?" (it knows past seasons too)</li></ul>
      <p>If the answer isn't in the data, it says so rather than guessing.</p>
      <p>It uses everyone's correct pronouns, sticks to the actual numbers, and teases the picks, not the people. It can only read the pool and post messages; it can't change picks or scores.</p>` },
    { id: 'preview', title: 'The weekend kickoff preview', keys: 'preview weekend kickoff hype summary storylines', body: `
      <p>Once every family pick sheet and nearly all of the league's are loaded, the Commentator posts one longer hype message for the weekend: Thursday's results so far, the family race, the family consensus and the big family "civil war", the boldest and most contrarian picks, each of us against the league, the family against the league, the biggest swing games from Saturday through Monday, and the tiebreaker guesses. It posts once per week.</p>` },
    { id: 'quiet', title: 'Why is the Commentator quiet?', keys: 'quiet silent muted not posting offline', body: `
      <p>It runs on Tarun's computer, so it's silent when that computer is off or asleep. It also caps itself (a few posts an hour, a handful per game) so it won't flood the chat, and Tarun can mute it. If it ever misses the mark, tell Tarun.</p>` },
  ]},
  { group: 'How the pool works', topics: [
    { id: 'rules', title: 'Scoring rules', keys: 'rules scoring confidence points ten picks tiebreaker', body: `
      <ul><li>Each week you pick <b>10 sides</b> from the sheet, from 10 different games, and give each a unique confidence value from <b>10</b> (most sure) down to <b>1</b>.</li>
      <li>If your side <b>covers the printed spread</b>, you earn that many points. Otherwise zero. Best possible week: 55.</li>
      <li>Every spread ends in ½, so there are no ties (no pushes).</li>
      <li>The tiebreaker is the total points in the Monday night NFL game.</li>
      <li>Picks are graded against the sheet's printed spread, not whatever the line moves to later.</li></ul>` },
    { id: 'glossary', title: 'Glossary', keys: 'glossary spread cover hook juice favorite underdog backdoor push line key number best ball percentile what-if shadow', body: `
      <dl class="gloss">
        <dt>Spread</dt><dd>The points the favorite gives away. Georgia −14½ must win by 15 or more to cover; Oklahoma +14½ covers by winning, or by losing by 14 or fewer.</dd>
        <dt>Cover</dt><dd>Beating the spread. That's what scores points here, not just winning the game.</dd>
        <dt>Favorite / underdog</dt><dd>The team expected to win (minus sign) and the team expected to lose (plus sign).</dd>
        <dt>Hook</dt><dd>The extra half point, as in "−3½". Losing "by the hook" means missing by exactly half a point.</dd>
        <dt>Key numbers</dt><dd>Common winning margins in football, especially 3, 7, 10 and 14. Getting +3½ instead of +3 matters more than most half points.</dd>
        <dt>Backdoor cover</dt><dd>A late, meaningless score that flips the cover (for example, a garbage-time touchdown by the losing team).</dd>
        <dt>Juice</dt><dd>The sportsbook's fee built into a price (like −110). The pool has no juice, but juice hints where the "real" line sits.</dd>
        <dt>Confidence</dt><dd>Your 10-to-1 ranking. Big confidence on a loser hurts most.</dd>
        <dt>What-if</dt><dd>How one game's result changes a chance: "if Georgia covers, 32% becomes 53%".</dd>
        <dt>Percentile</dt><dd>Share of the league you're ahead of: 90 means better than 90% of entries.</dd>
        <dt>Best-ball</dt><dd>Taking the family's single best score each week, as if the family were one entry.</dd>
        <dt>Projected</dt><dd>Simulated from someone's season so far because their picks for this week aren't loaded yet.</dd>
        <dt>Shadow card</dt><dd>Tarun's unofficial, data-driven practice card, tracked for fun and not entered in the pool.</dd>
      </dl>` },
  ]},
  { group: 'Privacy & safety', topics: [
    { id: 'privacy', title: 'Who can see what', keys: 'privacy who can see private data security', body: `
      <ul><li>Only signed-in family members can see picks, standings and the chat. Someone who finds the web address sees only the sign-in page.</li>
      <li>Accounts are invite-only; nobody can sign themselves up, and sign-in links only go to emails already on the list.</li>
      <li>Everyone in the family can read every chat message. You can delete your own.</li>
      <li>When The Commentator writes a comment, the relevant scores, picks and recent chat lines are sent to Claude to write it.</li></ul>` },
  ]},
  { group: 'For Tarun (admin)', admin: true, topics: [
    { id: 'upload', title: 'Uploading picks and standings', keys: 'upload admin xls picks totals workbook validate duplicate', body: `
      <p>On the <b>Upload</b> tab, drop in pick sheets (one or several <code>.xls</code> files, including a whole-league sheet) or the yearly totals workbook. Nothing is saved until you check the preview and tap <b>Save</b>.</p>
      <ul><li>Each entry is marked <b>new</b>, <b>changed</b> (with exactly what changed), <b>already loaded</b> (identical, skipped) or <b>rejected</b> (with the reason).</li>
      <li>Pick checks: 10 picks, confidences 10–1, every pool number on this week's sheet, no two picks from the same game, no duplicate names, tiebreaker 0–200.</li>
      <li>Totals checks: scores 0–55, no duplicate names. Past-week score changes and entries that would disappear are flagged, and you have to tick a box to confirm them.</li>
      <li>Only Excel files up to 5 MB are accepted. Names are cleaned of stray characters and markup.</li>
      <li>Saves merge into the newest saved copy, so two uploads can't erase each other. Win odds and league projections update right after a save.</li></ul>` },
    { id: 'admin-preview', title: 'Weekend preview controls', keys: 'weekend preview send now queue admin', body: `
      <p>The <b>📣 Weekend kickoff preview</b> card shows how many family and league pick sheets are loaded. The preview posts automatically once all family sheets and 90% of the league's are in, or right away with <b>Send the weekend preview now</b>. It posts once per week, needs the Commentator running, and waits while the Commentator is muted.</p>` },
    { id: 'chat-archive', title: 'Clearing the chat, and archives', keys: 'clear reset chat archive delete download smack talk admin', body: `
      <p>On the Upload tab, <b>💬 Smack Talk: clear &amp; archives</b> lets you start the chat fresh. <b>Clear chat</b> doesn't delete anything: it files every current message under the archive name you give it, and the chat empties for everyone.</p>
      <ul><li><b>View</b> opens an archive read-only. <b>Download</b> saves it as a text file.</li>
      <li><b>Delete</b> removes an archive and its reactions permanently. You have to type DELETE, and it can't be undone, so download it first if there's any chance you'll want it.</li>
      <li>Only you can see archives. Family members only ever see the live chat.</li></ul>` },
    { id: 'newweek', title: 'Starting a new week', keys: 'new week odds doc build push model ratings', body: `
      <p>The weekly odds sheet (<code>.doc</code>) is loaded from the computer with <code>tools/build-week.mjs</code> and <code>npm run push</code> (see the README), or ask Claude or Watson to do it. Set <code>currentWeek</code> in <code>local-data/settings.json</code> and push it too. Optional: refresh the college power-ratings nudge with <code>tools/model-residuals.mjs</code> and <code>tools/set-model-r.mjs</code>. After that, pick sheets and totals go through the Upload tab.</p>` },
    { id: 'addpeople', title: 'Adding people, and running the Commentator', keys: 'invite add user commentator mute start run', body: `
      <p>Add family members by listing them in <code>users.local.json</code> and running <code>npm run users</code> (an invite email, or a starting password so no email is needed).</p>
      <p><b>The Commentator</b> runs with <code>npm run commentator</code> on the PC and is muted or unmuted with the toggle on the Upload tab. Its log is <code>commentator.log</code>. It only calls Claude when it has something to post: about 1,300 tokens per post, and nothing while idle.</p>` },
  ]},
];
