// ── Firebase Realtime Database setup ──────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDiRippDFQHWUzDuP-RL2-IZpHup-wI278",
  authDomain: "pitch-tracker-d84af.firebaseapp.com",
  databaseURL: "https://pitch-tracker-d84af-default-rtdb.firebaseio.com",
  projectId: "pitch-tracker-d84af",
  storageBucket: "pitch-tracker-d84af.firebasestorage.app",
  messagingSenderId: "626567838676",
  appId: "1:626567838676:web:a801c27d48cc88ec25b441"
};

firebase.initializeApp(FIREBASE_CONFIG);

// App Check — verifies requests come from this app (stops Firebase warning emails)
const appCheck = firebase.appCheck();
appCheck.activate(
  new firebase.appCheck.ReCaptchaV3Provider('6LcoNc8sAAAAAFbYEquDPWyaJKkeMRY2KTcdA7aI'),
  true // auto-refresh tokens
);

const db   = firebase.database();
const auth = firebase.auth();

// Two shared accounts stand in for "admin" and "coach" roles — see CLAUDE.md.
// Sign-in is triggered explicitly by AuthGate (components/AuthGate.js), not
// automatically, since which account signs in now depends on a password only
// people inside the Prime coaching group know.
const ADMIN_EMAIL = "admin@prime-pitchtracker.app";
const COACH_EMAIL = "coach@prime-pitchtracker.app";

// Resolves once a real (admin or coach) user is signed in — all DB calls gate on this.
// Waits indefinitely if nobody signs in, which is the point: no auth, no data access.
// Ignores anonymous users — see the isAnonymous check in __fbOnAuthChange below for why
// a leftover anonymous session must never count as "signed in" here.
const authReady = new Promise(resolve => {
  const unsub = auth.onAuthStateChanged(user => {
    if (user && !user.isAnonymous) { unsub(); resolve(user); }
  });
});

window.__fbRoleForUser = function(user) {
  if (!user) return null;
  return user.email === ADMIN_EMAIL ? "admin" : "coach";
};

// Fires immediately with the current user (or null), then again on every
// sign-in/sign-out — used by AuthGate to decide whether to show the password
// prompt. Returns the unsubscribe function.
//
// Anonymous sessions from before this password gate existed are still sitting
// in some devices' persisted Firebase auth state (anonymous sign-in used to
// run automatically on every load). Firebase's IndexedDB persistence doesn't
// get invalidated just because the Anonymous provider was later disabled in
// the console, so without this check a leftover anonymous user would sail
// straight past the password prompt and get misread as "coach" (an anonymous
// user has no email, so it fails the ADMIN_EMAIL check and falls through).
// Signing it out here forces every such device back through the real gate.
window.__fbOnAuthChange = function(cb) {
  return auth.onAuthStateChanged(user => {
    if (user && user.isAnonymous) {
      auth.signOut();
      cb(null);
      return;
    }
    cb(user);
  });
};

// Tries the entered password against both shared accounts; resolves once
// either one accepts it, rejects if neither does.
window.__fbSignIn = function(password) {
  return auth.signInWithEmailAndPassword(ADMIN_EMAIL, password)
    .catch(() => auth.signInWithEmailAndPassword(COACH_EMAIL, password));
};

// ── Helpers ───────────────────────────────────────────────────────────────
function fbToArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(item => fbNormalise(item));
  return Object.keys(val).sort((a,b)=>Number(a)-Number(b)).map(k => fbNormalise(val[k]));
}
function fbNormalise(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const out = {...obj};
  ["history"].forEach(field => {
    if (out[field] !== undefined) out[field] = fbToArray(out[field]);
  });
  return out;
}

// ── One-time migration: /team → /teams/prime9u ───────────────────────────
window.__fbMigrateIfNeeded = function() {
  return authReady.then(() =>
    db.ref("teamsMeta/prime9u").once("value").then(snap => {
      if (snap.exists()) return;
      return db.ref("team").once("value").then(oldSnap => {
        const oldData = oldSnap.val() || {};
        const meta = {
          name: "Prime 9U",
          rules: { maxPitches: 55, rest1: 20, rest2: 40, rest3: 60 },
          createdAt: new Date().toISOString().split("T")[0]
        };
        const writes = {};
        writes["teamsMeta/prime9u"] = meta;
        writes["teams/prime9u/roster"]      = oldData.roster      || null;
        writes["teams/prime9u/tournaments"] = oldData.tournaments || null;
        return db.ref().update(writes);
      });
    })
  ).catch(() => {});
};

// ── One-time seed: Prime 12U team with 2026 season history ────────────────
window.__fbCreatePrime12U = function() {
  return authReady.then(() =>
    db.ref("teamsMeta/prime12u").once("value").then(snap => {
      if (snap.exists() && snap.val()?.rules) return; // already fully seeded
      if (snap.exists()) {
        // Entry exists but missing rules — patch them in
        return db.ref("teamsMeta/prime12u/rules").set({ maxPitches:75, rest1:25, rest2:45, rest3:65 });
      }
      const pC  = "12u_cooper";
      const pS  = "12u_samuel";
      const pG  = "12u_gage";
      const pJ  = "12u_jacob";
      const pN  = "12u_nico";
      const pJM = "12u_jose";
      const roster = {};
      roster[pC]  = { id:pC,  name:"Cooper",      jersey:"2",  lastPitches:30, lastGameDate:"2026-04-15", history:[
        { gameId:"g0221_"+pC,  date:"2026-02-21", pitches:31, opponent:"The Pack" },
        { gameId:"g0228_"+pC,  date:"2026-02-28", pitches:42, opponent:"Sandlot-Tribe" },
        { gameId:"g0323_"+pC,  date:"2026-03-23", pitches:44, opponent:"Astros" },
        { gameId:"g0328_"+pC,  date:"2026-03-28", pitches:34, opponent:"Cobras" },
        { gameId:"g0415_"+pC,  date:"2026-04-15", pitches:30, opponent:"Bad News Bears" },
      ]};
      roster[pS]  = { id:pS,  name:"Samuel",      jersey:"11", lastPitches:23, lastGameDate:"2026-04-01", history:[
        { gameId:"g0309_"+pS,  date:"2026-03-09", pitches:27, opponent:"Hill Country Heat" },
        { gameId:"g0327_"+pS,  date:"2026-03-27", pitches:38, opponent:"Longhorns" },
        { gameId:"g0401_"+pS,  date:"2026-04-01", pitches:23, opponent:"Dodgers" },
      ]};
      roster[pG]  = { id:pG,  name:"Gage",        jersey:"12", lastPitches:17, lastGameDate:"2026-04-15", history:[
        { gameId:"g0314_"+pG,  date:"2026-03-14", pitches:41, opponent:"Bat City Bombers" },
        { gameId:"g0330_"+pG,  date:"2026-03-30", pitches:46, opponent:"Diamond Hawks" },
        { gameId:"g0415_"+pG,  date:"2026-04-15", pitches:17, opponent:"Bad News Bears" },
      ]};
      roster[pJ]  = { id:pJ,  name:"Jacob",       jersey:"17", lastPitches:15, lastGameDate:"2026-04-01", history:[
        { gameId:"g0216_"+pJ,  date:"2026-02-16", pitches:43, opponent:"Mayhem" },
        { gameId:"g0309_"+pJ,  date:"2026-03-09", pitches:38, opponent:"Hill Country Heat" },
        { gameId:"g0327_"+pJ,  date:"2026-03-27", pitches:48, opponent:"Longhorns" },
        { gameId:"g0401_"+pJ,  date:"2026-04-01", pitches:15, opponent:"Dodgers" },
      ]};
      roster[pN]  = { id:pN,  name:"Nico",        jersey:"22", lastPitches:49, lastGameDate:"2026-03-28", history:[
        { gameId:"g0221_"+pN,  date:"2026-02-21", pitches:45, opponent:"The Pack" },
        { gameId:"g0323_"+pN,  date:"2026-03-23", pitches:16, opponent:"Astros" },
        { gameId:"g0328_"+pN,  date:"2026-03-28", pitches:49, opponent:"Cobras" },
      ]};
      roster[pJM] = { id:pJM, name:"Jose Moises", jersey:"23", lastPitches:15, lastGameDate:"2026-04-15", history:[
        { gameId:"g0216_"+pJM, date:"2026-02-16", pitches:6,  opponent:"Mayhem" },
        { gameId:"g0228_"+pJM, date:"2026-02-28", pitches:34, opponent:"Sandlot-Tribe" },
        { gameId:"g0314_"+pJM, date:"2026-03-14", pitches:35, opponent:"Bat City Bombers" },
        { gameId:"g0330_"+pJM, date:"2026-03-30", pitches:58, opponent:"Diamond Hawks" },
        { gameId:"g0415_"+pJM, date:"2026-04-15", pitches:15, opponent:"Bad News Bears" },
      ]};
      const writes = {};
      writes["teamsMeta/prime12u"] = { name:"Prime 12U", rules:{ maxPitches:75, rest1:25, rest2:45, rest3:65 }, createdAt:Date.now() };
      writes["teams/prime12u/roster"] = roster;
      return db.ref().update(writes);
    })
  ).catch(() => {});
};


// ── One-time seed: Prime 10U team with 2026 season history ───────────────
window.__fbCreatePrime10U = function() {
  return authReady.then(() =>
    db.ref("teamsMeta/prime10u").once("value").then(snap => {
      if (snap.exists() && snap.val()?.rules) return; // already fully seeded
      if (snap.exists()) {
        return db.ref("teamsMeta/prime10u/rules").set({ maxPitches:55, rest1:20, rest2:40, rest3:60 });
      }
      const pL  = "10u_liam";
      const pM  = "10u_mateo";
      const pJQ = "10u_joaquin";
      const pJT = "10u_jett";
      const pD  = "10u_dean";
      const pB  = "10u_broden";
      const roster = {};
      roster[pL]  = { id:pL,  name:"Liam",    jersey:"19", lastPitches:43, lastGameDate:"2026-04-15", history:[
        { gameId:"g10u_0218_"+pL,  date:"2026-02-18", pitches:28, opponent:"Smoke" },
        { gameId:"g10u_0221_"+pL,  date:"2026-02-21", pitches:52, opponent:"Outlaws" },
        { gameId:"g10u_0328_"+pL,  date:"2026-03-28", pitches:10, opponent:"Prime Rodriguez" },
        { gameId:"g10u_0329_"+pL,  date:"2026-03-29", pitches:28, opponent:"Athletics" },
        { gameId:"g10u_0401_"+pL,  date:"2026-04-01", pitches:51, opponent:"Tribe" },
        { gameId:"g10u_0415_"+pL,  date:"2026-04-15", pitches:43, opponent:"Hawks" },
      ]};
      roster[pM]  = { id:pM,  name:"Mateo",   jersey:"88", lastPitches:27, lastGameDate:"2026-04-15", history:[
        { gameId:"g10u_0218_"+pM,  date:"2026-02-18", pitches:38, opponent:"Smoke" },
        { gameId:"g10u_0304_"+pM,  date:"2026-03-04", pitches:37, opponent:"Diamondbacks" },
        { gameId:"g10u_0314_"+pM,  date:"2026-03-14", pitches:48, opponent:"Diamondbacks" },
        { gameId:"g10u_0329_"+pM,  date:"2026-03-29", pitches:51, opponent:"Athletics" },
        { gameId:"g10u_0401_"+pM,  date:"2026-04-01", pitches:5,  opponent:"Tribe" },
        { gameId:"g10u_0415_"+pM,  date:"2026-04-15", pitches:27, opponent:"Hawks" },
      ]};
      roster[pJQ] = { id:pJQ, name:"Joaquin", jersey:"24", lastPitches:34, lastGameDate:"2026-03-28", history:[
        { gameId:"g10u_0314_"+pJQ, date:"2026-03-14", pitches:25, opponent:"Diamondbacks" },
        { gameId:"g10u_0328_"+pJQ, date:"2026-03-28", pitches:34, opponent:"Prime Rodriguez" },
      ]};
      roster[pJT] = { id:pJT, name:"Jett",    jersey:"99", lastPitches:46, lastGameDate:"2026-03-28", history:[
        { gameId:"g10u_0218_"+pJT, date:"2026-02-18", pitches:11, opponent:"Smoke" },
        { gameId:"g10u_0221_"+pJT, date:"2026-02-21", pitches:4,  opponent:"Outlaws" },
        { gameId:"g10u_0304_"+pJT, date:"2026-03-04", pitches:18, opponent:"Diamondbacks" },
        { gameId:"g10u_0328_"+pJT, date:"2026-03-28", pitches:46, opponent:"Prime Rodriguez" },
      ]};
      roster[pD]  = { id:pD,  name:"Dean",    jersey:"8",  lastPitches:19, lastGameDate:"2026-03-04", history:[
        { gameId:"g10u_0218_"+pD,  date:"2026-02-18", pitches:21, opponent:"Smoke" },
        { gameId:"g10u_0221_"+pD,  date:"2026-02-21", pitches:23, opponent:"Outlaws" },
        { gameId:"g10u_0304_"+pD,  date:"2026-03-04", pitches:19, opponent:"Diamondbacks" },
      ]};
      roster[pB]  = { id:pB,  name:"Broden",  jersey:"4",  lastPitches:61, lastGameDate:"2026-02-28", history:[
        { gameId:"g10u_0221_"+pB,  date:"2026-02-21", pitches:27, opponent:"Outlaws" },
        { gameId:"g10u_0228_"+pB,  date:"2026-02-28", pitches:61, opponent:"Smoke" },
      ]};
      const writes = {};
      writes["teamsMeta/prime10u"] = { name:"Prime 10U", rules:{ maxPitches:55, rest1:20, rest2:40, rest3:60 }, createdAt:Date.now() };
      writes["teams/prime10u/roster"] = roster;
      return db.ref().update(writes);
    })
  ).catch(() => {});
};
// ── One-time migration: assign existing teams to a default season ────────
window.__fbMigrateSeasonIfNeeded = function() {
  const defaultSeasonId = "2026_spring";
  return authReady.then(() =>
    db.ref("seasonsMeta/" + defaultSeasonId).once("value").then(snap => {
      const ensureSeason = snap.exists()
        ? Promise.resolve()
        : db.ref("seasonsMeta/" + defaultSeasonId).set({ term: "Spring", year: 2026, createdAt: Date.now() });
      return ensureSeason.then(() => db.ref("teamsMeta").once("value")).then(teamsSnap => {
        const val = teamsSnap.val() || {};
        const writes = {};
        Object.entries(val).forEach(([id, meta]) => {
          if (!meta.seasonId) writes["teamsMeta/" + id + "/seasonId"] = defaultSeasonId;
        });
        if (Object.keys(writes).length === 0) return;
        return db.ref().update(writes);
      });
    })
  ).catch(() => {});
};

// ── Seasons (list / create) ───────────────────────────────────────────────
window.__fbListSeasons = function() {
  return authReady.then(() =>
    db.ref("seasonsMeta").once("value").then(snap => {
      const val = snap.val() || {};
      return Object.entries(val).map(([id, meta]) => ({ id, ...meta }));
    })
  );
};

// Deterministic id from term+year so picking an existing term/year combo
// reuses the same season instead of creating a duplicate.
window.__fbCreateSeason = function(term, year) {
  const seasonId = year + "_" + term.toLowerCase();
  return authReady.then(() =>
    db.ref("seasonsMeta/" + seasonId).once("value").then(snap => {
      if (snap.exists()) return seasonId;
      return db.ref("seasonsMeta/" + seasonId).set({ term, year, createdAt: Date.now() }).then(() => seasonId);
    })
  );
};

// One-time read of another team's roster (used for roster cloning).
window.__fbGetRoster = function(teamId) {
  return authReady.then(() =>
    db.ref("teams/" + teamId + "/roster").once("value").then(snap => fbToArray(snap.val()))
  );
};

// ── Team meta (list / create / update / delete) ──────────────────────────
window.__fbListTeams = function() {
  return authReady.then(() =>
    db.ref("teamsMeta").once("value").then(snap => {
      const val = snap.val() || {};
      return Object.entries(val).map(([id, meta]) => ({ id, ...meta }));
    })
  );
};

window.__fbCreateTeam = function(teamId, meta) {
  return authReady.then(() => db.ref("teamsMeta/" + teamId).set(meta));
};

window.__fbUpdateTeamMeta = function(teamId, meta) {
  return authReady.then(() => db.ref("teamsMeta/" + teamId).update(meta));
};

window.__fbDeleteTeam = function(teamId) {
  return authReady.then(() =>
    Promise.all([
      db.ref("teamsMeta/" + teamId).once("value"),
      db.ref("teams/" + teamId).once("value"),
    ]).then(([metaSnap, dataSnap]) => {
      const writes = {};
      writes["archive/" + teamId + "/meta"]       = metaSnap.val();
      writes["archive/" + teamId + "/data"]       = dataSnap.val();
      writes["archive/" + teamId + "/archivedAt"] = new Date().toISOString();
      writes["teamsMeta/" + teamId]               = null;
      writes["teams/" + teamId]                   = null;
      return db.ref().update(writes);
    })
  );
};

// ── Subscribe to a specific team's data ──────────────────────────────────
window.__fbSubscribe = function(onData, onConnected, onOffline, teamId) {
  const unsubscribeAuth = auth.onAuthStateChanged(user => {
    if (!user) return;
    unsubscribeAuth();
    startListener();
  });

  let cleanupListener = () => {};

  function startListener() {
    const ref = db.ref("teams/" + teamId);
    let everConnected = false;
    db.ref(".info/connected").on("value", snap => {
      if (snap.val()) { everConnected = true; onConnected(); }
      else if (everConnected) onOffline();
    });
    ref.on("value", snap => {
      const val = snap.val() || {};
      onData({ roster: fbToArray(val.roster), tournaments: fbToArray(val.tournaments) });
    }, () => onOffline());
    cleanupListener = () => { ref.off(); db.ref(".info/connected").off(); };
  }

  return () => { cleanupListener(); };
};

// ── Write to a specific team ──────────────────────────────────────────────
window.__fbSet = function(key, value, teamId) {
  return db.ref("teams/" + teamId + "/" + key).set(value);
};

// ── Audit log ─────────────────────────────────────────────────────────────
window.__fbAuditKey = function(teamId) {
  return db.ref("auditLog/" + teamId).push().key;
};
window.__fbPushAudit = function(teamId, entry, key) {
  const ref = key
    ? db.ref("auditLog/" + teamId + "/" + key)
    : db.ref("auditLog/" + teamId).push();
  return authReady.then(() => ref.set(entry));
};

window.__fbMarkAuditUndone = function(teamId, entryId) {
  return authReady.then(() => db.ref("auditLog/" + teamId + "/" + entryId + "/undone").set(true));
};

window.__fbWatchAudit = function(teamId, onData) {
  const ref = db.ref("auditLog/" + teamId).orderByKey().limitToLast(100);
  ref.on("value", snap => {
    const entries = [];
    snap.forEach(child => entries.push({ id: child.key, ...child.val() }));
    onData(entries.reverse());
  });
  return () => ref.off();
};
