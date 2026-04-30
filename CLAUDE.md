# Pitch Tracker — Claude Instructions

## Git Workflow

After pushing code changes to the feature branch, automatically complete the full PR flow without asking for confirmation:

1. Create a PR with `gh pr create`
2. Immediately merge it with `gh pr merge --merge`

Use a clear, descriptive PR title and a brief summary of what changed and why.

## Version Bumping

Every PR must increment the minor version (e.g. v1.1 → v1.2). Update **both** of these together:
1. `APP_VERSION` constant in the Babel script block (near line 349)
2. `<meta name="app-version" content="..."/>` in the `<head>` (line 12)

These two must always match. The meta tag is what triggers the automatic cache-bust on the client.
Only increment the minor version (after the `.`) unless explicitly told to change the major version.

---

## App Architecture

**Single file:** `/home/user/pitch-tracker/index.html` — the entire app lives here.

**Stack:**
- React 18 + ReactDOM loaded from CDN, rendered via `ReactDOM.createRoot`
- Babel standalone transpiles JSX in-browser (script type `text/babel`)
- Firebase Realtime Database (anonymous auth via `auth.signInAnonymously()`)
- No build step, no bundler, no npm

**Current version:** v2.15

---

## Firebase Structure

**Auth:** Anonymous sign-in. All reads/writes wait on `authReady` promise (resolved on first `onAuthStateChanged` user).

**Database paths:**
```
/teams/{teamId}/roster        — object keyed by pitcherId → Pitcher
/teams/{teamId}/tournaments   — object keyed by tourneyId → Tournament
/teamsMeta/{teamId}           — { name, rules, createdAt }
/auditLog/{teamId}/{pushKey}  — AuditEntry (limitToLast 50)
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
- `__fbPushAudit(teamId, entry)` — pushes to `/auditLog/{teamId}`
- `__fbWatchAudit(teamId, onData)` — live listener on audit log (last 50, ordered by key)

**Security Rules (current recommended):**
```json
{
  "rules": {
    "teams": { "$teamId": { ".read": "auth != null", ".write": "auth != null" } },
    "teamsMeta": {
      ".read": "auth != null",
      "$teamId": { ".write": "auth != null" }
    },
    "auditLog": { "$teamId": { ".read": "auth != null", ".write": "auth != null" } },
    "archive": { "$teamId": { ".read": "auth != null", ".write": "auth != null" } }
  }
}
```
`teamsMeta` needs `.read` at the collection level because `__fbListTeams` reads the parent node.

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
  day1IsHardLimit: boolean
}
```

**Team rules (currentRules / DEFAULT_RULES):**
```js
{ maxPitches: 55, rest1: 20, rest2: 40, rest3: 60 }
// rest1/2/3 = pitch thresholds that trigger 1/2/3 rest days
```

**AuditEntry (stored in Firebase, received in auditLog array):**
```js
{
  id: string,              // Firebase push key (assigned client-side after fetch)
  ts: number,              // Date.now()
  deviceId: string,
  device: string,
  action: string,          // see Audit Actions below
  detail: string,          // human-readable summary
  undoData: UndoData | null,
  // optional extra fields:
  gameInfo: GameInfo | null,     // for LOG_GAME entries
  pitcherName: string | null,    // for LOG_GAME entries
  pitches: number | null,        // for LOG_GAME entries
  sharedGameId: string | null    // links multi-pitcher game logs
}
```

**GameInfo (attached to LOG_GAME audit entries):**
```js
{
  date: string,
  opponent: string | null,
  isTournament: boolean,
  tournamentName: string | null,
  tourneyDay: number | null
}
```

---

## Audit Actions & UndoData Types

| action | undoData.type | undoData fields |
|--------|--------------|-----------------|
| `LOG_GAME` | `DELETE_GAME` | `playerId`, `gameId` |
| `EDIT_GAME` | `RESTORE_GAME` | `playerId`, `entry` (full old HistoryEntry) |
| `DELETE_GAME` | `RESTORE_GAME` | `playerId`, `entry` |
| `ADD_PLAYER` | `DELETE_PITCHER` | `pitcherId` |
| `EDIT_PLAYER` | `RESTORE_PITCHER_META` | `pitcherId`, `name`, `jersey` |
| `DELETE_PITCHER` | `RESTORE_PITCHER` | `pitcher` (full Pitcher object) |
| `ADD_TOURNEY` | `DELETE_TOURNEY` | `tourneyId` |
| `EDIT_TOURNEY` | `RESTORE_TOURNEY` | `tourney` (full Tournament object) |
| `DELETE_TOURNEY` | `RESTORE_TOURNEY` | `tourney` |

---

## Components

### Screens (tab-level)
| Component | Tab id | Purpose |
|-----------|--------|---------|
| `RosterScreen` | `roster` | Lists pitchers with availability chips; add pitcher form |
| `PitcherDetail` | `roster` (drill-in) | Pitcher stats, season history, log single game |
| `GameLogScreen` | `gamelog` | Log a game for multiple pitchers at once |
| `EligibilityScreen` | `eligibility` | Grid of pitcher availability for a chosen date |
| `TournamentScreen` | `tournament` | Create/edit/delete tournaments |
| `SeasonHistory` | `history` | Season-level game history with leaderboard |
| `ActivityScreen` | `activity` | Audit log with undo capability |
| `TeamPickerScreen` | (pre-app) | Team selection / create / manage |

### Modals & Sub-components
| Component | Purpose |
|-----------|---------|
| `EditGameModal` | Edit or delete a single HistoryEntry |
| `ContextPicker` | Regular season vs. tournament picker (shared by log forms) |
| `PitcherStatusBanner` | Availability banner with rest-day details |
| `Chip` | Small colored status badge |
| `ScreenBoundary` | React error boundary wrapping each screen; shows error + Back button |

---

## App-Level State (`App` component)

```js
teamId            // string | null — persisted to localStorage (TEAM_ID_KEY)
teamMeta          // { name, rules, ... } | null
connected         // boolean — Firebase .info/connected
loaded            // boolean — initial data received from Firebase
roster            // Pitcher[] — sorted by name
tournaments       // Tournament[]
tab               // "roster"|"gamelog"|"eligibility"|"tournament"|"history"|"activity"
selectedPlayer    // Pitcher | null — active drill-in on Roster tab
auditLog          // AuditEntry[] — last 50, newest first
undidIds          // Set<string> — audit entry IDs that have been undone (persists across tab changes)
```

## App-Level Handlers

| Handler | What it does |
|---------|-------------|
| `addPlayer(p)` | Adds pitcher to roster, pushes ADD_PLAYER audit |
| `deletePlayer(id)` | Removes pitcher, pushes DELETE_PITCHER audit |
| `editPlayer(id, updates)` | Updates pitcher name/jersey, pushes EDIT_PLAYER audit |
| `logGame(playerId, gameData)` | Adds single HistoryEntry, calls `recomputeLast`, pushes LOG_GAME audit |
| `logMultiple(playerId, gameData)` | Same as logGame but preserves `sharedGameId` for grouping |
| `editGame(playerId, gameId, updatedData)` | Updates HistoryEntry fields, pushes EDIT_GAME audit |
| `deleteGame(playerId, gameId)` | Removes HistoryEntry, pushes DELETE_GAME audit |
| `restoreGame(playerId, entry)` | Re-inserts a deleted HistoryEntry |
| `addTourney(t)` | Adds tournament, pushes ADD_TOURNEY audit |
| `deleteTourney(id)` | Removes tournament, pushes DELETE_TOURNEY audit |
| `updateTourney(t)` | Updates tournament, pushes EDIT_TOURNEY audit |
| `executeUndo(undoData)` | Dispatches to correct handler based on `undoData.type` |
| `pushAudit(action, detail, undoData, extra)` | Writes to `/auditLog/{teamId}` via `__fbPushAudit`; `extra` is spread into the entry |

---

## Key Utility Functions

| Function | Purpose |
|----------|---------|
| `getEligibleDate(gameDate, pitches, restFn)` | Returns Date or null; null-guards empty/invalid dates |
| `getRegRestDays(pitches)` | Returns 0/1/2/3 rest days based on pitch count vs. `currentRules` |
| `getTourneyAdjustedRestInfo(pitcher, tournaments)` | Checks if last game was a tournament and adjusts rest |
| `getAvailabilityStatus(pitcher, onDate, tournaments)` | Returns STATUS key for a pitcher on a given date |
| `daysUntilEligible(pitcher, onDate, tournaments)` | Returns number of days until pitcher can throw |
| `getEligibleDateStr(pitcher, tournaments)` | Human-readable eligible date string |
| `recomputeLast(history)` | Returns `{ lastPitches, lastGameDate }` from history array |
| `getSubjectKey(undoData)` | Returns a stable string key for the subject of an undo (used for canUndoSet) |
| `todayStr()` | Returns today as `"YYYY-MM-DD"` |
| `formatDate(iso)` | Formats `"YYYY-MM-DD"` to `"Mon DD, YYYY"` |
| `addDays(dateStr, n)` | Returns new date string n days after input |
| `newId()` | Returns a unique ID string (timestamp + random) |
| `getDeviceId()` / `getDeviceName()` | Device fingerprint for audit log attribution |
| `load(key)` / `save(key, val)` | localStorage helpers; `save` also calls `__fbSet` |

---

## Key Patterns & Constraints

**ScreenBoundary:** Every tab-level screen is wrapped in `<ScreenBoundary>` to prevent render crashes from cascading to a blank page. `ScreenBoundary` on the Roster drill-in also receives `onBack` to render a "← Back to Roster" button.

**`pushAudit` extra param:** The 4th argument is spread into the audit entry. Use it to attach `gameInfo`, `pitcherName`, `pitches`, and `sharedGameId` for LOG_GAME entries so ActivityScreen can render rich details.

**Undo ordering (`canUndoSet`):** Only the most-recent non-undone audit entry for each subject is undoable at any time. Computed by iterating `auditLog` (newest-first), tracking seen subject keys via `getSubjectKey`. Undone entries (in `undidIds`) don't block their subject — the next older entry becomes the undoable one.

**`undidIds` persistence:** Stored in App state (not component-local), so grayed/undone items stay grayed when navigating between tabs.

**Multi-pitcher game log grouping:** When logging via `GameLogScreen`, all pitchers share a `sharedGameId`. Each audit entry gets that ID. `ActivityScreen` groups them into a single display item using `seenSharedIds`.

**`recomputeLast`:** Must be called after any history mutation (log/edit/delete) and the result spread back into the pitcher object before saving to Firebase.

**`getEligibleDate` null guards:** Always returns `null` for missing/empty `gameDate` or when `new Date(...)` produces `isNaN`. Never return an Invalid Date (which is truthy and breaks `.toISOString()`).

**Data persistence:** Roster and tournaments are saved to Firebase on every change via a `useEffect` that watches both arrays. The audit log is written directly in each handler via `pushAudit`.

**Team selection:** Stored in `localStorage` under `TEAM_ID_KEY = "pt_selected_team_id"`. On load, if a stored ID exists the app skips `TeamPickerScreen` and goes straight to the team.
