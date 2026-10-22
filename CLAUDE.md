# Pitch Tracker — Claude Instructions

## Development Workflow

For any nontrivial request, follow this sequence. Truly trivial changes
(a typo, a copy tweak, a single-line fix with no ambiguity) can skip straight
to implementation — this process is for anything with real scope or judgment
calls involved.

1. **Understand the goal, then interview.** Before proposing anything, understand
   the overarching goal behind the request, not just its literal wording — then
   ask clarifying questions to fully pin down requirements scope (edge cases,
   what's explicitly out of scope, which existing patterns/files to reuse).
2. **Propose a plan and get approval.** Present the plan and get explicit
   approval before making any code changes. No implementation starts until
   the plan is approved.
3. **Implement** the approved plan.
4. **Independent verification.** Once changes are complete, spin up an
   independent sub-agent (fresh context, doesn't just trust the implementer's
   summary) to write a test suite and verify the change. Cover, at minimum:
   functionality, usability, stability, and security.
5. **Ask before pushing.** Once implemented and verified, ask for explicit
   permission before pushing to GitHub or opening/merging a PR. Never
   auto-push or auto-merge without that go-ahead.

## Version Bumping

Every push to `main` must increment the minor version (e.g. v1.1 → v1.2).
Update **both** of these together:
1. `APP_VERSION` constant in the Babel script block (near line 88)
2. `<meta name="app-version" content="..."/>` in the `<head>` (line 12)

These two must always match. The meta tag is what triggers the automatic
cache-bust on the client.
Only increment the minor version (after the `.`) — bump the major version
only when the user explicitly asks for it.

---

## App Architecture

**Static, multi-file, still zero build step/npm.** `index.html` is now just a
small shell (~230 lines: `<head>`, a head-shell script, 13+3 `<script>` tags,
service worker). Pure logic, Firebase glue, shared UI tokens, and every
screen/modal component were split out of what used to be one 1.65MB file
(Phase 1: `lib/`; Phase 2: `components/`) so both the browser and Claude/tests
can load just what they need:

| File | Contents | Loaded as |
|------|----------|-----------|
| `index.html` | `<head>`, head-shell (hooks/`PitchLogic`/`UIConstants` destructures, `APP_VERSION`, `LOGO_URI`), the component `<script src>` tags, bootstrap render, service worker | shell |
| `lib/firebase-init.js` | `window.__fb*` functions (Firebase RTDB/auth setup) | plain `<script src>` |
| `lib/pitch-logic.js` | Rest-day/eligibility/date/coach-name math, `recomputeLast`, `getActiveTourney` — UMD module, also `require()`'d directly by `tests/logic.test.js` | plain `<script src>`, exposes `window.PitchLogic` |
| `lib/ui-constants.js` | `STATUS`, icon set `I` (includes `settings`), shared style objects (`card`, `inputStyle`, etc.) — contains JSX (icons), IIFE-wrapped | `<script type="text/babel" src>`, exposes `window.UIConstants` |
| `components/shared.js` | `Chip`, `RadialArc`, `ContextPicker`, `ScreenBoundary` | `<script type="text/babel" src>` |
| `components/EditGameModal.js`, `PitcherDetail.js`, `GameLogScreen.js`, `LiveGameScreen.js`, `EligibilityScreen.js`, `TournamentScreen.js`, `EditGameGroupModal.js`, `SeasonHistory.js`, `TeamPickerScreen.js`, `Settings.js` | One screen/modal component each | `<script type="text/babel" src>` each |
| `components/App.js` | `TABS`, `TEAM_ID_KEY`, `TEAM_META_KEY` consts, then `App` (root component, receives `role` prop: team selection, Firebase subscription, tab routing, all handlers) | `<script type="text/babel" src>` |
| `components/AuthGate.js` | `AuthGate` — password + one-time coach-name gate shown before `App`; renders `<App role={role}/>` once signed in and named | `<script type="text/babel" src>` |
| `assets/logo.png` | App logo/icon (was a ~500KB inline base64 blob) | referenced by `LOGO_URI`, apple-touch-icon link |
| `manifest.json` | PWA manifest (was an inline data-URI) | referenced by the manifest `<link>` |
| `tests/logic.test.js` | Dependency-free Node test suite for `lib/pitch-logic.js` | `node tests/logic.test.js` |

`index.html`'s head-shell destructures `window.PitchLogic` and
`window.UIConstants` before any component script loads, so every call site
across all 13 `components/*.js` files (`getAvailabilityStatus(...)`, `card`,
`STATUS[...]`, `useState`, etc.) resolves as a plain free variable — classic
`<script>` tags share one global lexical environment, so this works regardless
of which component file loads in which order. `currentRules` is no longer a
bare mutable global — read it via `getCurrentRules()` and write it via
`setCurrentRules(...)`, both from `lib/pitch-logic.js`.

**Component script order doesn't matter relative to each other** — they only
reference shared globals inside their function bodies, which don't run until
React actually calls them at render time, well after every script tag has
executed. The one hard rule: the bootstrap script (`window.__PitchApp = AuthGate;`
+ `ReactDOM.createRoot(...).render(...)`) must come after all 13 component
`<script>` tags, since `AuthGate` references `App` directly by name (and the
bootstrap script references `AuthGate`).

**Collision rule for any new `lib/`/`components/` file:** classic `<script>`
tags share one global lexical environment. A top-level `const`/`let` declared
in one file collides (`SyntaxError`, crashes the whole page) with the same
name declared at top level in *any other* script tag on the page — this bit
`lib/ui-constants.js` for exactly this reason (it needed an IIFE wrapper) and
is why `components/*.js` files must each contain exactly one top-level
`function`/`class` declaration and nothing else at top level (function/class
declarations don't collide with each other the way `const`/`let` do, since
their names are all unique — but a stray top-level `const` sitting next to one
would).

The service worker (bottom of `index.html`) treats every same-origin request
(the shell, all of `lib/`, `components/`, `assets/`, `manifest.json`) as
network-first, same as HTML navigation — only third-party, version-pinned CDN
scripts (React, Babel) are cache-first. This matters now that code lives in
separate files: without it, a deploy could update `index.html` while a stale
cached `components/TournamentScreen.js` keeps serving old logic.

**Stack:**
- React 18 + ReactDOM loaded from CDN, rendered via `ReactDOM.createRoot`
- Babel standalone transpiles JSX in-browser (script type `text/babel`)
- Firebase Realtime Database (email/password auth via two shared accounts — see Auth below)
- No build step, no bundler, no npm

**Current version:** v3.11

---

## Firebase Structure

**Auth:** No more anonymous sign-in — closed off in favor of two shared Firebase
email/password accounts, `ADMIN_EMAIL` and `COACH_EMAIL` (constants in
`lib/firebase-init.js`), one password each. `AuthGate` (`components/AuthGate.js`)
gates the whole app: shows a single password field, tries it against the admin
account then the coach account (`window.__fbSignIn(password)`), and once
signed in — mandatory, once per device — a "your name" field whose value
(`getCoachName()`/`setCoachName()`, localStorage key `pt_coach_name`) is shown
as "Started by" on a live game. Role
(`"admin"` | `"coach"`) is derived from which account signed in
(`window.__fbRoleForUser(user)`, compares `user.email` to `ADMIN_EMAIL`) and
passed down as a prop: `AuthGate` → `App({ role })` → `TeamPickerScreen({ role })`.
Firebase's default session persistence (IndexedDB) means signing in is a
one-time event per device — it survives reloads and app version bumps, same
as the coach-name entry.

**Leftover anonymous sessions:** devices that used the app before this gate
existed (anonymous sign-in used to run automatically on every load) still had
that anonymous session persisted in IndexedDB — disabling the Anonymous
provider in the Firebase console doesn't retroactively invalidate an
already-cached client session. `__fbOnAuthChange` (`lib/firebase-init.js`)
checks `user.isAnonymous` and calls `auth.signOut()` on any such user instead
of forwarding it to `AuthGate`, so a leftover anonymous session is always
treated as signed-out rather than silently passing the gate and being
misread as `"coach"` (an anonymous user has no email, so it fails the
`ADMIN_EMAIL` check and falls through). `authReady` has the same
`!user.isAnonymous` guard so it can't resolve on a stale anonymous session either.

**Role permissions:** Admin can create seasons and create/edit/delete teams
(`TeamPickerScreen`'s create-team button, season picker, and per-team manage
modal are hidden entirely for `role !== "admin"`; enforced for real by Firebase
rules on `teamsMeta`/`seasonsMeta`/`archive` requiring `auth.token.email` to
match the admin account). Both roles can view/select any team and freely
create/edit/delete roster entries, game log entries, and tournaments (all
under `/teams/{teamId}`, open to any authenticated user). The one-time
seed/migration calls (`__fbMigrateIfNeeded`, `__fbCreatePrime12U`,
`__fbCreatePrime10U`, `__fbMigrateSeasonIfNeeded`) write to admin-gated paths,
so both `App.js` and `TeamPickerScreen.js` only run them when `role === "admin"`
— coaches skip straight to reading `__fbListTeams()`/`__fbListSeasons()`.

All reads/writes wait on `authReady` promise (resolves once a real admin/coach
user is signed in — never resolves if nobody's signed in, which is the point).

**Database paths:**
```
/teams/{teamId}/roster        — object keyed by pitcherId → Pitcher
/teams/{teamId}/tournaments   — object keyed by tourneyId → Tournament
/teams/{teamId}/liveGame      — LiveGame | absent — the one in-progress game (Live tab)
/teamsMeta/{teamId}           — { name, rules, createdAt, seasonId }
/seasonsMeta/{seasonId}       — { term, year, createdAt } — see Seasons below
/auditLog/{teamId}/...        — LEGACY, no longer read or written (audit log removed in v3.9); safe to delete
/archive/{teamId}/meta        — saved on team delete
/archive/{teamId}/data        — saved on team delete
```

**Firebase window functions (injected before React):**
- `__fbMigrateIfNeeded()` — one-time migration from legacy `/team` path to `/teams/prime9u`
- `__fbCreatePrime12U()` / `__fbCreatePrime10U()` — seed demo teams if not present
- `__fbListTeams()` — reads `/teamsMeta` (parent-level read, requires read rule at `teamsMeta`)
- `__fbCreateTeam(teamId, meta)` / `__fbUpdateTeamMeta(teamId, meta)` / `__fbDeleteTeam(teamId)`
- `__fbSubscribe(onData, onConnected, onOffline, teamId)` — live listener on `/teams/{teamId}`
- `__fbSet(key, value, teamId)` — sets `/teams/{teamId}/{key}`
- `__fbMigrateSeasonIfNeeded()` — one-time: ensures a `Spring 2026` season exists (`seasonId: "2026_spring"`) and backfills that `seasonId` onto any `teamsMeta` entry missing one (covers teams created before seasons existed)
- `__fbListSeasons()` — reads `/seasonsMeta` (parent-level read, requires read rule at `seasonsMeta`)
- `__fbCreateSeason(term, year)` — `seasonId` is deterministic (`${year}_${term.toLowerCase()}`), so creating the same term+year twice returns the existing season instead of duplicating it; resolves with the `seasonId`
- `__fbWatchLiveGame(teamId, onData)` — live listener on `/teams/{teamId}/liveGame` (raw value or `null`; App runs it through `normalizeLiveGame`)
- `__fbStartLiveGame(teamId, game)` — transaction: creates the live game unless a real one (with an `id`) exists — an id-less node is junk and gets replaced; resolves `true` if this call created it
- `__fbMutateLiveGame(teamId, gameId, mutate)` — **every** in-game edit: a transaction running `mutate(cur)` (`applyLiveGameAction`) against the server's current value, aborting unless it's still game `gameId`. Plain field `update()`s were tried first and broke under races: a late write after the game was claimed left an id-less junk node (blocking Start), a write to a removed pitcher resurrected them as "active", and two −1 taps drove counts negative. Applied locally immediately, so taps stay instant; concurrent taps from two devices both count (transaction retry)
- `__fbClaimLiveGame(teamId, gameId)` — transaction (not applied locally) that removes the live game only if its id still matches; resolves with the server's copy if this device won, `null` otherwise. Used by both complete and discard, so a game can't be logged twice
- `__fbGetRoster(teamId)` — one-time read of another team's roster (used for roster cloning at team-creation time)
- `__fbSignIn(password)` — tries the password against the admin account, then the coach account; resolves once either succeeds, rejects if neither does
- `__fbOnAuthChange(cb)` — wraps `auth.onAuthStateChanged`; fires immediately with the current user (or `null`), then on every sign-in/out; returns the unsubscribe function
- `__fbRoleForUser(user)` — returns `"admin"` if `user.email === ADMIN_EMAIL`, `"coach"` otherwise, `null` if no user
- `__fbSignOut()` — signs out of Firebase; `AuthGate`'s listener picks up the resulting `null` user and swaps back to the password screen

**Security Rules (current recommended):**
```json
{
  "rules": {
    "teams": { "$teamId": { ".read": "auth != null", ".write": "auth != null" } },
    "teamsMeta": {
      ".read": "auth != null",
      "$teamId": { ".write": "auth.token.email == 'admin@prime-pitchtracker.app'" }
    },
    "seasonsMeta": {
      ".read": "auth != null",
      "$seasonId": { ".write": "auth.token.email == 'admin@prime-pitchtracker.app'" }
    },
    "archive": { "$teamId": { ".read": "auth != null", ".write": "auth.token.email == 'admin@prime-pitchtracker.app'" } }
  }
}
```
`teamsMeta` and `seasonsMeta` both need `.read` at the collection level because
`__fbListTeams`/`__fbListSeasons` read the parent node. `teamsMeta`/`seasonsMeta`/
`archive` writes require the admin account's email (must match `ADMIN_EMAIL` in
`lib/firebase-init.js` exactly) — this is the real enforcement of the admin/coach
split; the app also hides the corresponding UI, but the rules are what actually
stop a coach-authenticated client from writing those paths directly. `teams`
(roster, tournaments, liveGame) stays open to any authenticated user, since
both roles can log games, manage rosters, and manage tournaments. Disabling the
**Anonymous** sign-in provider in the Firebase console (leaving only **Email/Password**
enabled) is what actually keeps non-Prime people out — without that, anyone could
still call `signInAnonymously()` directly against the public API key regardless
of what the app's UI does, since `auth != null` alone doesn't care which
provider produced the auth.

---

## Data Shapes

**Pitcher (stored in roster object):**
```js
{
  id: string,           // e.g. "12u_cooper"
  name: string,
  jersey: string,
  lastPitches: number,
  lastGameDate: string, // "YYYY-MM-DD" or ""
  history: HistoryEntry[]
}
```

**HistoryEntry:**
```js
{
  gameId: string,           // unique, e.g. "g0415_12u_cooper" or sharedGameId+"_"+pitcherId
  date: string,             // "YYYY-MM-DD"
  pitches: number,
  opponent: string | null,
  isTournament: boolean,
  tournamentId: string | null,
  tournamentName: string | null,
  tourneyDay: number | null,
  sharedGameId: string | null  // links multi-pitcher game log entries
}
```

**Tournament:**
```js
{
  id: string,
  name: string,
  startDate: string,    // "YYYY-MM-DD"
  days: number,
  dayLimits: { max: number, isHard: boolean }[], // one per day, index 0 = Day 1
  maxTotal: number,         // pitch cap for the whole tournament - always enforced
  // legacy, still written (mirrors dayLimits[0]) for pre-v3.7 cached clients;
  // never read directly - always go through getTourneyDayLimits(t):
  maxDay1: number,
  day1IsHardLimit: boolean
}
```
Defaults for a new tournament: every day 50 / hard, total 100. Daily limits may
sum to more than `maxTotal`. Tournaments saved before v3.7 have only
`maxDay1`/`day1IsHardLimit`: `getTourneyDayLimits` maps Day 1 from those and
copies `maxDay1` as a *guideline* onto Days 2..N. RTDB may return `dayLimits`
as a `{"0":..,"1":..}` object - `getTourneyDayLimits` handles both.

**Tournament eligibility rules (CPYL — `lib/pitch-logic.js`):**
- *During* a tournament: no rest days between tournament days. A pitcher is
  ineligible on a given day only if (a) rest from before the tournament is
  still owed, (b) that day's **hard** limit has been reached (out for the rest
  of that day), or (c) the tournament total has been reached (out for the rest
  of the tournament). Guidelines never affect eligibility. "Reached" is `>=`:
  hitting exactly the cap is allowed; going over is only legal when finishing
  a batter, which the app can't detect, so it's a warn-and-override at save
  time (`getTourneyLimitViolation`). All pitches count toward the total and rest.
- *Regular-season* rest: every outing sets a requirement and the latest eligible
  date wins (`getOutings` → `getTourneyAdjustedRestInfo`). A regular game day
  uses that day's pitches. A tournament uses its **total** pitches, rest starts
  the day after the pitcher's last tournament outing, and the eligible date is
  never earlier than the day after the tournament ends (CPYL: 33 on Fri of a
  Fri–Sun tournament → eligible Monday). This applies while a tournament is in
  progress too (provisional, using the total so far). Thresholds are the team's
  `rest1/2/3`, same as regular season.
- The header's ✓/😴 counts (`App.js`) use `getTourneyEligibility` for today
  while a tournament is active (`getActiveTourney`, shown with a 🏆), and
  regular-season `getAvailabilityStatus` otherwise.
- The tournament day a game counts toward is always derived from its date
  (`getTourneyDayNumber`) — `ContextPicker` no longer has a day picker, and
  saving is blocked when the game date is outside the selected tournament.

**Team rules (currentRules / DEFAULT_RULES):**
```js
{ maxPitches: 55, rest1: 20, rest2: 40, rest3: 60 }
// rest1/2/3 = pitch thresholds that trigger 1/2/3 rest days
```

**Season (stored at `/seasonsMeta/{seasonId}`):**
```js
{
  term: "Winter" | "Spring" | "Summer" | "Fall",
  year: number,
  createdAt: number   // Date.now()
}
```
`seasonId` is deterministic (`${year}_${term.toLowerCase()}`, e.g. `2026_spring`)
so picking the same term+year twice reuses the existing season instead of
creating a duplicate — `__fbCreateSeason` looks up before writing. Display
name ("Spring 2026") is computed via `getSeasonName(season)`, never stored.
A team belongs to exactly one season via `teamsMeta/{teamId}.seasonId`; a
team's roster/tournaments/history do not carry over when it's reassigned or
when a new team is created for a new season — each `teamId` is its own
isolated dataset (see "Roster cloning" under Key Patterns below).

**LiveGame (stored at `/teams/{teamId}/liveGame`, at most one per team):**
```js
{
  id: string,               // newId(); claim/complete/discard check it still matches
  date: string,             // "YYYY-MM-DD", defaults to today, keeps its date if left unfinished
  context: "regular" | tourneyId,
  opponent: string,         // optional while live, required to log; trimmed, max 60 chars
  startedAt: number, startedBy: string,  // getCoachName() of whoever started it
  pitchers: { [pitcherId]: { pitches: number /* 0..999 */, status: "active" | "left",
                             order: number, enteredAt: number, leftAt: number | null } }
}
```
Any authenticated client can write it, so it's always read through
`normalizeLiveGame` (returns `null` for anything malformed, drops pitcher entries without a valid
`status`, clamps counts, sanitizes the opponent). No new security rules — it's under `/teams/{teamId}`.

---

## Components

Every component listed below lives in its own file under `components/`
(Phase 2 of the split — see App Architecture above), except the four in
`components/shared.js`.

The bottom nav has 5 tabs (Roster, Live, Game Log, Season, Settings). The 4 non-Live tabs are a deliberate consolidation (originally 6
tabs) so related information isn't split across screens the coach has to flip
between, and so info that's only relevant in one context (e.g. pre-game
eligibility) doesn't linger where it isn't — see "Key Patterns" below for the
specific principle.

### Screens (tab-level)
| Component | File | Tab id | Purpose |
|-----------|------|--------|---------|
| `EligibilityScreen` | `components/EligibilityScreen.js` | `roster` | **The Roster tab.** Pitcher list grouped by availability for a chosen date (regular season or a specific tournament's budget), tap a pitcher to drill into `PitcherDetail`. (Filename predates the merge with the old standalone roster list.) |
| `PitcherDetail` | `components/PitcherDetail.js` | `roster` (drill-in) | Pitcher stats, editable season history, edit name/jersey, remove from roster. Logging a new game happens on the Game Log tab, not here. |
| `LiveGameScreen` | `components/LiveGameScreen.js` | `live` | **The Live tab.** Running pitch counts for the game in progress, shared live across devices via `/teams/{teamId}/liveGame`. Setup (date defaults to today, `ContextPicker`, opponent + recent-opponent chips) → in-game cards (rings with the count each tracks inside — one TODAY ring regular, DAY N + TOURNEY in a tournament, rest steps as ticks; the active pitcher's card has a 2px blue border + glow and shows amber milestone banners; −1/+1/+5 + tap-to-type running total, pitches left, rest hint, "Left game" / "Put back in…" / Remove) → available pitchers (tap to bring in) → not-available list with reasons → **Log Complete Game** (same checks/entries as Game Log) or Discard. The tab icon gets a pulsing red dot while a game is live. |
| `GameLogScreen` | `components/GameLogScreen.js` | `gamelog` | Log a **new** game for multiple pitchers at once (two-step: who pitched, then pitch counts). Entry-only — browsing/editing past games moved to the Season tab. |
| `SeasonHistory` | `components/SeasonHistory.js` | `season` | **The Season tab.** Chronological game history with leaderboard. Tournament games collapse into one container per tournament (day-by-day breakdown inside), positioned by its most recent game date, so the whole season is browsable as one continuous list without switching to a separate tournament view. |
| `Settings` | `components/Settings.js` | `settings` | **The Settings tab.** Sub-nav over three sections: Roster (add a pitcher — `AddPitcherSection`, same file), Tournaments (renders `TournamentScreen`), Account (signed-in name/role + log out — `AccountSection`, same file). |
| `TournamentScreen` | `components/TournamentScreen.js` | (Settings sub-section) | Create/edit/delete tournaments — config only. Viewing a tournament's actual games/pitch usage lives on the Season tab now, grouped under that tournament. |
| `TeamPickerScreen` | `components/TeamPickerScreen.js` | (pre-app) | Team selection / create / manage — reached via the header's TEAM button, not a tab. Teams are grouped under season headers (newest season first); create/edit forms let you pick a season or spin up a new one inline (`+ New Season`), and optionally clone another team's roster (fresh id per pitcher, stats/history reset) either while creating a team or via "Clone Roster to New Team" from an existing team's manage modal. Team selection is open to any role; the create-team button, `+ New Season` picker, and per-team manage modal (rename/rules/season/delete/clone) only render when `role === "admin"`. |
| `AuthGate` | `components/AuthGate.js` | (pre-app, above `TeamPickerScreen`) | Root-most component (see App Architecture bootstrap). Password field → `window.__fbSignIn`; once signed in, a mandatory one-time "your name" field (`setCoachName`) if none is stored yet; then renders `<App role={role}/>`. Both steps persist across reloads/version bumps (Firebase session persistence + localStorage), so a coach only ever sees this once per device. |

### Modals & Sub-components
| Component | File | Purpose |
|-----------|------|---------|
| `EditGameModal` | `components/EditGameModal.js` | Edit or delete a single HistoryEntry |
| `EditGameGroupModal` | `components/EditGameGroupModal.js` | Edit/delete a multi-pitcher (`sharedGameId`) game log entry — also used for a single day within a Season-tab tournament container |
| `AddPitcherSection` | `components/Settings.js` | New-pitcher form (duplicate jersey blocked, duplicate name soft-warned) — Settings' Roster sub-section |
| `AccountSection` | `components/Settings.js` | Shows signed-in name + role (Admin/Coach) and a confirm-then-log-out button — Settings' Account sub-section |
| `ContextPicker` | `components/shared.js` | Regular season vs. tournament picker (shared by log forms) |
| `Chip` | `components/shared.js` | Small colored status badge |
| `RadialArc` | `components/shared.js` | SVG radial progress ring (pitch count vs. max). Optional `ticks` (values marked on the ring) and `guideline` (dashed track, tops out amber not red) |
| `ScreenBoundary` | `components/shared.js` | React error boundary wrapping each screen; shows error + Back button |

---

## App-Level State (`App` component)

```js
role              // "admin" | "coach" — prop from AuthGate, not local state; passed through
                  // to TeamPickerScreen to gate create/edit/delete-team and season UI, and
                  // to Settings/AccountSection to display which role is signed in
teamId            // string | null — persisted to localStorage (TEAM_ID_KEY)
teamMeta          // { name, rules, ... } | null
syncStatus        // "connecting"|"saving"|"synced"|"offline"|"error" — "error" is a
                  // permission-denied-style write rejection (distinct purple dot/banner,
                  // tappable to show the real error), as opposed to "offline" (dropped
                  // connection, will retry once reconnected)
lastSyncError     // string | null — human-readable detail shown when syncStatus is "error"
loaded            // boolean — initial data received from Firebase
roster            // Pitcher[] — sorted by name
tournaments       // Tournament[]
liveGame          // LiveGame | null — normalized, from its own __fbWatchLiveGame listener
tab               // "roster"|"live"|"gamelog"|"season"|"settings"
selectedPlayer    // Pitcher | null — active drill-in on Roster tab
```

## App-Level Handlers

| Handler | What it does |
|---------|-------------|
| `addPlayer(p)` | Adds pitcher to roster |
| `deletePlayer(id)` | Removes pitcher |
| `editPlayer(id, updates)` | Updates pitcher name/jersey |
| `logMultiple(playerId, gameData)` | Adds single HistoryEntry (one call per pitcher in the game), calls `recomputeLast`, preserves `sharedGameId` for grouping. The only game-logging path now — GameLogScreen is the single place to log a new game. |
| `editGame(playerId, gameId, updatedData)` | Updates HistoryEntry fields |
| `deleteGame(playerId, gameId)` | Removes HistoryEntry |
| `addTourney(t)` | Adds tournament |
| `deleteTourney(id)` | Removes tournament |
| `updateTourney(t)` | Updates tournament |
| `startLiveGame({date, context, opponent})` | `__fbStartLiveGame` with a fresh id and `startedBy: getCoachName()` |
| `liveGameAction(gameId, action)` | `__fbMutateLiveGame` with `applyLiveGameAction`; a rejected write goes to the same sync-error banner as roster saves |
| `completeLiveGame(gameId)` | `__fbClaimLiveGame`, then `liveGameToLogEntries` on the **server's** copy → `logMultiple` per pitcher still on the roster. Resolves `{count, opponent}`, or `null` if another device already finished/discarded it. If the team was switched while the claim was pending, it writes the game back to its team and rejects instead of logging onto the wrong roster |
| `discardLiveGame(gameId)` | `__fbClaimLiveGame`; resolves whether this device discarded it |
| `logout()` | Confirmed via `AccountSection`'s prompt before it's called. Clears the saved team (`TEAM_ID_KEY`/`TEAM_META_KEY`) and coach name (`setCoachName("")`), then calls `__fbSignOut()` — `AuthGate`'s listener picks up the resulting sign-out and swaps back to the password screen, so the next person on this device starts completely fresh. |

---

## Key Utility Functions

| Function | Purpose |
|----------|---------|
| `getEligibleDate(gameDate, pitches, restFn)` | Returns Date or null; null-guards empty/invalid dates |
| `getRegRestDays(pitches)` | Returns 0/1/2/3 rest days based on pitch count vs. `currentRules` |
| `getTourneyAdjustedRestInfo(pitcher, tournaments, opts?)` | Regular-season rest across all outings (regular game days + whole tournaments); returns the binding one `{ isTourney, tournamentId, totalPitches, lastPitchDate, eligibleDate, restDays }`. `opts.before` = only outings strictly before that date |
| `getTourneyDayLimits(t)` / `getTourneyMaxTotal(t)` / `getTourneyDays(t)` / `getTourneyEndDate(t)` | Read tournament config (new or legacy shape) |
| `getTourneyDayNumber(t, dateStr)` | 1-based tournament day for a date, `null` outside the tournament |
| `getPitcherTourneyStats(pitcher, t)` | `{ total, byDay[], games, lastPitchDate }` for one tournament |
| `getTourneyEligibility(pitcher, t, dateStr, tournaments)` | In-tournament eligibility on a date (dates before start = Day 1): `{ eligible, reason, dayNum, dayPitches, dayLimit, pitchesLeft, ... }` |
| `getTourneyLimitViolation(pitcher, t, dateStr, count, tournaments)` | Save-time check for a tournament game: `null`, `{level:"note"}` (guideline, non-blocking) or `{level:"violation"}` |
| `getGameLogCheck(pitcher, {context, tourney, date, count, tournaments})` | Save-time rule check shared by Game Log and Live: regular-season rest owed, or `getTourneyLimitViolation` |
| `buildGameEntries({pitchers, date, opponent, context, tourney, sharedGameId})` | HistoryEntry payloads (`{playerId, data}`) for one game — shared by Game Log and Live |
| `getLivePitcherBudget(pitcher, liveGame, tournaments)` | Live tab per-pitcher view: `{ inGame, hasLeft, count, eligible, reason, priorToday, pitchesLeft, leftLabel, arcValue, arcMax, note, rest }`. Eligibility is from logged history only (so it doesn't flip mid-game); pitches left includes the live count. Regular: `maxPitches` per day minus already-logged same-day pitches + live count. Tournament: tighter of the day's hard limit and the total. Also `rings` (`[{key,label,value,max,ticks,guideline}]` — one TODAY ring for regular, DAY N + TOURNEY for a tournament) and `milestones` (from `getLiveMilestones`) |
| `getLiveMilestones({restUsed, limits, restAfterTourney})` | Live-tab warnings, most urgent first: each rest step from 5 pitches out (`Next pitch = N rest days` at exactly the step, since rest is strict `>`), a 3-pitch `Now N rest days` after crossing, and each limit from 5 left (`At … — finish batter only` when reached; guideline limits only warn, level `soft`). Steps above the daily max still warn. Count-based, so every device shows the same |
| `getRestTicks(max)` | Team rest steps that fit inside a ring of size `max` (tick marks) |
| `getRestThresholdInfo(pitches)` | `{ restDays, nextAt, nextRestDays }` — next rest threshold (strict `>`, so `nextAt = restN + 1`) |
| `applyLiveGameAction(raw, gameId, action)` | Pure reducer for Live-tab edits (`setField`/`bump`/`setCount`/`add`/`undoAdd`/`markLeft`/`putBack`/`remove`) on the raw server value; returns the new value or `undefined` (abort) when the game id doesn't match or the target pitcher isn't in the game. `add` auto-marks active pitchers left; `undoAdd` refuses once the new pitcher has thrown; counts clamp to 0..999 |
| `liveGameToLogEntries(liveGame, tournaments, sharedGameId)` | `{ entries, dropped }` — 0-count pitchers dropped, entry order preserved |
| `normalizeLiveGame(raw)` / `sanitizeLiveCount(v)` / `sanitizeOpponent(s)` | Untrusted-input guards for the live game (counts 0..`LIVE_MAX_COUNT`, opponent ≤ `LIVE_OPPONENT_MAX`) |
| `getAvailabilityStatus(pitcher, onDate, tournaments)` | Returns STATUS key for a pitcher on a given date |
| `daysUntilEligible(pitcher, onDate, tournaments)` | Returns number of days until pitcher can throw |
| `getEligibleDateStr(pitcher, tournaments, opts?)` | Eligible date as `"YYYY-MM-DD"` (or `null`); `opts.before` as above |
| `recomputeLast(history)` | Returns `{ lastPitches, lastGameDate }` from history array |
| `todayStr()` | Returns today as `"YYYY-MM-DD"` |
| `formatDate(iso)` | Formats `"YYYY-MM-DD"` to `"Mon DD, YYYY"` |
| `addDays(dateStr, n)` | Returns new date string n days after input |
| `newId()` | Returns a unique ID string (timestamp + random) |
| `getCoachName()` / `setCoachName(name)` | localStorage-backed coach name (`pt_coach_name`), captured once via `AuthGate`; used as a live game's `startedBy` |
| `load(key)` / `save(key, val)` | localStorage helpers; `save` also calls `__fbSet` |
| `getSeasonName(season)` | Formats `{term,year}` as `"Spring 2026"` |
| `compareSeasonsDesc(a, b)` | Array-sort comparator: newest season first (year desc, then term rank Winter<Spring<Summer<Fall within a year) |

---

## Key Patterns & Constraints

**ScreenBoundary:** Every tab-level screen is wrapped in `<ScreenBoundary>` to prevent render crashes from cascading to a blank page. `ScreenBoundary` on the Roster drill-in also receives `onBack` to render a "← Back to Roster" button.

**Multi-pitcher game log grouping:** When logging via `GameLogScreen` (or completing a live game), all pitchers share a `sharedGameId`; the Season tab groups them into one game and `EditGameGroupModal` edits/deletes them together.

**`recomputeLast`:** Must be called after any history mutation (log/edit/delete) and the result spread back into the pitcher object before saving to Firebase.

**`getEligibleDate` null guards:** Always returns `null` for missing/empty `gameDate` or when `new Date(...)` produces `isNaN`. Never return an Invalid Date (which is truthy and breaks `.toISOString()`).

**Data persistence:** Roster and tournaments are saved to Firebase on every change via a `useEffect` that watches both arrays.

**No audit log / undo (removed v3.9):** the Settings → Activity log never showed reliably and was removed along with undo. Fixing a mistake = edit/delete the game on the Season tab or in `PitcherDetail`, or edit the pitcher/tournament directly.

**iOS status bar / sticky header:** the app runs under the status bar (`black-translucent` + `viewport-fit=cover`). `--top-gap` (`:root` in `index.html`) = `env(safe-area-inset-top) + 32px` in the installed home-screen app (`@media (display-mode: standalone)`), just the inset in a browser tab. `body::before` is a fixed opaque strip of that height, body `padding-top` matches, and the sticky header + banners in `App.js` pin at `var(--top-gap)` rather than `0`. The extra 32px exists because iOS 26.1+ paints its own blur/gradient scrim over the top of `black-translucent` home-screen apps (it sits above page content, so making the header opaque alone didn't help — v3.9) and the scrim reaches below the status bar; only the plain strip sits in that band now. If the logo is still soft, raise the 32; the alternative fix is removing the `apple-mobile-web-app-status-bar-style` meta, which needs every device to re-add the app to the home screen. The App wrapper uses `overflowX:"clip"`, not `"hidden"` — `hidden` makes it a scroll container, so `sticky` binds to it instead of the viewport and the header never sticks (and the env() offset then just pushes it down). Keep the header opaque with no `backdrop-filter` — iOS 26+ applies a top-edge blur that smears translucent content near the status bar.

**Team selection:** Stored in `localStorage` under `TEAM_ID_KEY = "pt_selected_team_id"`. On load, if a stored ID exists the app skips `TeamPickerScreen` and goes straight to the team.

**Season-scoped isolation / roster cloning:** Two teams can share a name (e.g. "Prime 10U" in both `Fall 2026` and `Spring 2027`) because each is its own `teamId` with its own `/teams/{teamId}/roster`, `/teams/{teamId}/tournaments`, and history — nothing carries over automatically between seasons. To start a new season's team with last season's roster, `TeamPickerScreen` reads the source team's roster via `__fbGetRoster`, assigns each pitcher a **new id** via `newId()`, and resets `lastPitches: 0, lastGameDate: "", history: []` — only `name`/`jersey` copy over. Tournaments are never cloned (they're season-specific by nature).

**Repeat info only where it's contextually useful:** `GameLogScreen` deliberately does not show a pitcher's pre-game eligibility/rest status while picking who pitched or entering counts — the game already happened, so "were they allowed to start" isn't the question at that point. What it does check, once counts are entered (`getCheck` in `GameLogScreen.js`, judged as of the game date): for a regular-season game, rest still owed from earlier outings (`getEligibleDateStr(..., {before: gameDate})`); for a tournament game, `getTourneyLimitViolation` (pre-tournament rest, that day's hard limit, the tournament total) — either blocks Save behind a warn-and-override screen, same pattern as the old ineligible-pitcher warning. If you're tempted to add a status chip back into the entry flow, check whether it's answering a question that's actually relevant post-hoc before doing so.

**Live game (Live tab):** one per team. Bringing a pitcher in auto-marks whoever is pitching as "left" (with a 10s Undo for a mistap); once left, a pitcher can't return — "Put back in…" exists only to fix mistakes, behind a confirm. Unavailable pitchers (resting, at a tournament limit, already at the daily max) can't be brought in. Counts may go over the limit (finishing a batter) with a red warning; logging then goes through the same warn-and-override as Game Log. A game from an earlier date stays put with an "Unfinished game" banner and keeps its own date when logged. Typed fields (count, opponent) hold a local draft while focused and commit on blur/Enter, so a remote update can't yank the value mid-typing. `__fbSubscribe` skips its callback when only `liveGame` changed (roster/tournaments JSON unchanged) — otherwise every +1 tap on any device would hand App a fresh roster array and the save effect would write the whole roster back.

**`window.__pendingAppUpdateVersion` / `window.__applyPendingAppUpdate`:** set by the version-check script in `index.html` on a deploy mismatch, instead of reloading immediately (which could wipe unsaved input mid-entry). `App.js` listens for the `pt-update-available` window event (and checks the flag on mount, in case the event fired before the listener attached) and shows a tappable banner; the banner calls `window.__applyPendingAppUpdate()` to actually clear caches and reload, on the user's own timing.
