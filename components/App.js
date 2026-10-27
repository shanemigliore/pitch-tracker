// App — root component: team selection, Firebase subscription, tab routing, all handlers.
// Babel/JSX component, loaded via <script type="text/babel" src="components/App.js"></script>.

// ══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════════════════
const TABS = [
  { id:"roster",   label:"Roster",   icon:I.roster   },
  { id:"live",     label:"Live",     icon:I.live     },
  { id:"gamelog",  label:"Log Game", icon:I.gamelog  },
  { id:"season",   label:"Season",   icon:I.history  },
  { id:"settings", label:"Settings", icon:I.settings },
];

const TEAM_ID_KEY = "pt_selected_team_id";
const TEAM_META_KEY = "pt_selected_team_meta";

function App({ role }) {
  // ── Team selection ──────────────────────────────────────────────────────
  const [teamId,   setTeamId]   = useState(() => localStorage.getItem(TEAM_ID_KEY) || null);
  const [teamMeta, setTeamMeta] = useState(() => {
    try { return JSON.parse(localStorage.getItem(TEAM_META_KEY)) || null; } catch { return null; }
  });
  const [showTeamPicker, setShowTeamPicker] = useState(false);

  // Keep currentRules in sync on every render (before any child renders read it)
  setCurrentRules(teamMeta?.rules || DEFAULT_RULES);

  // Signs out and clears this device's saved name/team so the next person to
  // open the app starts completely fresh (password, name, and team picker).
  function logout() {
    localStorage.removeItem(TEAM_ID_KEY);
    localStorage.removeItem(TEAM_META_KEY);
    setCoachName("");
    window.__fbSignOut();
  }

  function selectTeam(id, meta) {
    // Same team — just close the picker, nothing to reload
    if (id === teamId) {
      setShowTeamPicker(false);
      return;
    }
    localStorage.setItem(TEAM_ID_KEY, id);
    localStorage.setItem(TEAM_META_KEY, JSON.stringify(meta));
    setCurrentRules(meta?.rules || DEFAULT_RULES);
    setTeamId(id);
    setTeamMeta(meta);
    setShowTeamPicker(false);
    // Reset app data for the new team
    setRoster([]);
    setTournaments([]);
    setLiveGame(null);
    setLoaded(false);
    setTab("roster");
    setSelectedPlayer(null);
  }

  // ── App data ────────────────────────────────────────────────────────────
  const [roster,      setRoster]      = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [tab,         setTab]         = useState("roster");
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [loaded,      setLoaded]      = useState(false);
  const [syncStatus,  setSyncStatus]  = useState("connecting");
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [liveGame,    setLiveGame]    = useState(null);

  // Refs for stale-closure-free access inside callbacks
  const rosterRef      = useRef(roster);       rosterRef.current      = roster;
  const tournamentsRef = useRef(tournaments);  tournamentsRef.current = tournaments;
  const teamIdRef      = useRef(teamId);       teamIdRef.current      = teamId;

  // A new deploy doesn't force-reload the page (see index.html's version-check
  // script) - it just flags this, and the banner below lets the user pick when
  // it's safe to refresh instead of losing whatever they're mid-typing.
  useEffect(() => {
    if (window.__pendingAppUpdateVersion) setUpdateAvailable(true);
    function onUpdateAvailable() { setUpdateAvailable(true); }
    window.addEventListener('pt-update-available', onUpdateAvailable);
    return () => window.removeEventListener('pt-update-available', onUpdateAvailable);
  }, []);

  // Firebase real-time listener — re-subscribes when teamId changes
  useEffect(()=>{
    if (!teamId || !window.__fbSubscribe) {
      setLoaded(true);
      setSyncStatus(teamId ? "offline" : "connecting");
      return;
    }
    setSyncStatus("connecting");
    setLoaded(false);
    let unsubFn = null;
    // Run seeds first (ensures rules exist in Firebase), then refresh teamMeta,
    // then start the subscription — so rules are always correct before roster renders.
    // Seeds/migrations write to teamsMeta/seasonsMeta, which Firebase rules restrict
    // to the admin account — only run them as admin, coaches just read what's there.
    const seedIfAdmin = role === "admin"
      ? Promise.all([
          window.__fbMigrateIfNeeded?.() || Promise.resolve(),
          window.__fbCreatePrime12U?.()  || Promise.resolve(),
          window.__fbCreatePrime10U?.()  || Promise.resolve(),
        ]).then(() => window.__fbMigrateSeasonIfNeeded?.() || Promise.resolve())
      : Promise.resolve();
    seedIfAdmin
      .then(() => window.__fbListTeams()).then(list => {
      const fresh = list.find(t => t.id === teamId);
      if (fresh) {
        localStorage.setItem(TEAM_META_KEY, JSON.stringify(fresh));
        setTeamMeta(fresh);
      }
      unsubFn = window.__fbSubscribe(
        (data) => {
          setRoster(data.roster || []);
          setTournaments(data.tournaments || []);
          setLoaded(true);
          setSyncStatus("synced");
        },
        () => setSyncStatus(prev => prev === "connecting" ? prev : "synced"),
        () => setSyncStatus("offline"),
        teamId
      );
    });
    return () => { if (unsubFn) unsubFn(); };
  }, [teamId]);

  // Live game for current team - its own listener, written field-by-field by
  // the live-game handlers below rather than through the roster save effect.
  useEffect(() => {
    setLiveGame(null);
    if (!teamId || !window.__fbWatchLiveGame) return;
    const subscribedTeamId = teamId;
    return window.__fbWatchLiveGame(teamId, raw => {
      if (teamIdRef.current !== subscribedTeamId) return;
      setLiveGame(normalizeLiveGame(raw));
    });
  }, [teamId]);

  // Write to Firebase whenever data changes (after initial load)
  const saveTimeoutRef = useRef(null);
  const [lastSyncError, setLastSyncError] = useState(null);
  useEffect(()=>{
    // Clear any pending save BEFORE the early-return below, so a team switch
    // (which flips `loaded` back to false) can't leave a stale timeout that
    // fires later and stomps the new team's sync status.
    clearTimeout(saveTimeoutRef.current);
    if (!loaded || !teamId || !window.__fbSet) return;
    setSyncStatus("saving");
    saveTimeoutRef.current = setTimeout(() => {
      Promise.all([
        window.__fbSet("roster", roster, teamId),
        window.__fbSet("tournaments", tournaments, teamId),
      ]).then(() => {
        setLastSyncError(null);
        setSyncStatus("synced");
      }).catch(err => {
        console.error("[save] Firebase write failed:", err);
        setLastSyncError(err && err.message ? err.message : String(err));
        // PERMISSION_DENIED (and similar rule-rejection codes) means the write
        // is never going to succeed by itself - that's a different situation
        // from a dropped connection, so it gets a visibly different status.
        setSyncStatus(err && err.code === "PERMISSION_DENIED" ? "error" : "offline");
      });
    }, 600);
    return () => clearTimeout(saveTimeoutRef.current);
  }, [roster, tournaments, loaded]);

  const addPlayer = useCallback(p => {
    setRoster(r => [...r, p]);
  }, []);

  const deletePlayer = useCallback(id => {
    setRoster(r => r.filter(p => p.id !== id));
    setSelectedPlayer(null);
  }, []);

  const editPlayer = useCallback((id, updates) => {
    setRoster(r => r.map(p => p.id === id ? {...p,...updates} : p));
    setSelectedPlayer(prev => prev && prev.id === id ? {...prev,...updates} : prev);
  }, []);

  const addTourney = useCallback(t => {
    setTournaments(ts => [...ts, t]);
  }, []);

  const deleteTourney = useCallback(id => {
    setTournaments(ts => ts.filter(t => t.id !== id));
  }, []);

  const updateTourney = useCallback(t => {
    setTournaments(ts => ts.map(x => x.id === t.id ? t : x));
  }, []);

  const logMultiple = useCallback((playerId, gameData) => {
    const entry = { ...gameData, gameId: gameData.gameId || newId() };
    setRoster(r => r.map(p => {
      if (p.id !== playerId) return p;
      const history = [...(p.history||[]), entry];
      return { ...p, ...recomputeLast(history), history };
    }));
  }, []);

  const editGame = useCallback((playerId, gameId, updatedData) => {
    setRoster(r => r.map(p => {
      if (p.id !== playerId) return p;
      const history = (p.history||[]).map(h => h.gameId === gameId ? {...h,...updatedData} : h);
      return { ...p, ...recomputeLast(history), history };
    }));
    setSelectedPlayer(prev => {
      if (!prev || prev.id !== playerId) return prev;
      const history = (prev.history||[]).map(h => h.gameId === gameId ? {...h,...updatedData} : h);
      return { ...prev, ...recomputeLast(history), history };
    });
  }, []);

  const deleteGame = useCallback((playerId, gameId) => {
    setRoster(r => r.map(p => {
      if (p.id !== playerId) return p;
      const history = (p.history||[]).filter(h => h.gameId !== gameId);
      return { ...p, ...recomputeLast(history), history };
    }));
    setSelectedPlayer(prev => {
      if (!prev || prev.id !== playerId) return prev;
      const history = (prev.history||[]).filter(h => h.gameId !== gameId);
      return { ...prev, ...recomputeLast(history), history };
    });
  }, []);

  // ── Live game handlers ─────────────────────────────────────────────────
  function reportSyncError(err) {
    console.error("[live] Firebase write failed:", err);
    setLastSyncError(err && err.message ? err.message : String(err));
    setSyncStatus(err && err.code === "PERMISSION_DENIED" ? "error" : "offline");
  }

  const startLiveGame = useCallback(({ date, context, opponent }) => {
    const tid = teamIdRef.current;
    if (!tid || !window.__fbStartLiveGame) return Promise.resolve(false);
    return window.__fbStartLiveGame(tid, {
      id: newId(), date, context, opponent: sanitizeOpponent(opponent),
      startedAt: Date.now(), startedBy: getCoachName(),
    });
  }, []);

  const liveGameAction = useCallback((gameId, action) => {
    const tid = teamIdRef.current;
    if (!tid || !window.__fbMutateLiveGame) return;
    window.__fbMutateLiveGame(tid, gameId, cur => applyLiveGameAction(cur, gameId, action)).catch(reportSyncError);
  }, []);

  // Claims the game on the server first (so two coaches finishing at once can't
  // both log it), then logs whatever the server had - not this device's copy.
  // Resolves { count, opponent }, or null if another device got there first.
  // If the team was switched while the claim was pending, the entries would
  // land on the wrong roster - put the game back instead and say so.
  const completeLiveGame = useCallback(gameId => {
    const tid = teamIdRef.current;
    if (!tid || !window.__fbClaimLiveGame) return Promise.resolve(null);
    return window.__fbClaimLiveGame(tid, gameId).then(raw => {
      const game = normalizeLiveGame(raw);
      if (!game) return null;
      if (teamIdRef.current !== tid) {
        return window.__fbStartLiveGame(tid, raw).then(() => {
          throw new Error("You switched teams before the game finished logging. It's back on that team's Live tab — log it from there");
        });
      }
      const onRoster = new Set(rosterRef.current.map(p => p.id));
      const { entries } = liveGameToLogEntries(game, tournamentsRef.current, newId());
      const logged = entries.filter(e => onRoster.has(e.playerId));
      logged.forEach(e => logMultiple(e.playerId, e.data));
      return { count: logged.length, opponent: game.opponent };
    });
  }, [logMultiple]);

  const discardLiveGame = useCallback(gameId => {
    const tid = teamIdRef.current;
    if (!tid || !window.__fbClaimLiveGame) return Promise.resolve(false);
    return window.__fbClaimLiveGame(tid, gameId).then(raw => !!normalizeLiveGame(raw));
  }, []);

  // ── Team picker screen ──────────────────────────────────────────────────
  if (!teamId || showTeamPicker) {
    return <TeamPickerScreen onSelect={selectTeam} showManage={showTeamPicker} role={role}
      onClose={()=>setShowTeamPicker(false)}
      onTeamMetaUpdate={(id, updatedMeta) => {
        if (id === teamId) {
          const merged = { ...teamMeta, ...updatedMeta };
          localStorage.setItem(TEAM_META_KEY, JSON.stringify(merged));
          setTeamMeta(merged);
        }
      }}/>;
  }

  // ── Loading splash ──────────────────────────────────────────────────────
  if (!loaded) return (
    <div style={{ background:"#080c14", minHeight:"100dvh", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", gap:16 }}>
      <img src={LOGO_URI} alt="Prime Baseball" style={{ width:64, height:64, borderRadius:"50%" }}/>
      <div style={{ fontSize:20, fontWeight:800, color:"rgba(255,255,255,0.85)", fontFamily:"'Bebas Neue',cursive", letterSpacing:2 }}>PRIME PITCHING</div>
      <div style={{ fontSize:13, color:"rgba(255,255,255,0.4)", marginTop:-8 }}>{teamMeta?.name}</div>
      <div className="spinner" style={{ fontSize:22, marginTop:4 }}>⟳</div>
      <div style={{ fontSize:12, color:"rgba(255,255,255,0.25)", marginTop:-8 }}>Connecting…</div>
    </div>
  );

  // While a tournament is running today, the header counts tournament
  // eligibility (that day's hard limit, the total, pre-tournament rest) -
  // regular-season status would show everyone who's pitched in it as resting
  // until it ends, which isn't the question mid-tournament.
  const headerTourney = getActiveTourney(tournaments, todayStr());
  const isAvailableNow = p => headerTourney
    ? getTourneyEligibility(p, headerTourney, todayStr(), tournaments).eligible
    : getAvailabilityStatus(p, null, tournaments)==="available";
  const availableCount = roster.filter(isAvailableNow).length;
  const restingCount   = roster.length - availableCount;
  const countScope     = headerTourney ? `today in ${headerTourney.name}` : "for regular season today";

  return (
    <div style={{ background:"#080c14", minHeight:"100dvh", maxWidth:430, margin:"0 auto",
      fontFamily:"'Barlow',sans-serif", color:"#f8fafc", position:"relative", overflowX:"clip",
      backgroundImage:"radial-gradient(ellipse at 20% 0%,rgba(30,58,138,0.25) 0%,transparent 60%),radial-gradient(ellipse at 80% 100%,rgba(22,101,52,0.15) 0%,transparent 60%)" }}>

      {syncStatus==="offline" && (
        <div className="offline-banner" style={{ background:"rgba(244,63,94,0.12)", borderBottom:"1px solid rgba(244,63,94,0.3)",
          padding:"8px calc(16px + var(--corner-r)) 8px 16px", display:"flex", alignItems:"center", gap:8,
          fontSize:12, color:"#f87171", fontWeight:600, position:"sticky", top:"var(--top-gap)", zIndex:30 }}>
          {I.warning} Offline — changes will sync when reconnected
        </div>
      )}
      {syncStatus==="error" && (
        <div className="offline-banner" onClick={()=>alert(`Sync error: ${lastSyncError || "Unknown error"}\n\nYour changes are saved on this device but couldn't be written to the server. This usually means a permissions problem, not a dropped connection - it won't fix itself by waiting.`)}
          style={{ background:"rgba(168,85,247,0.12)", borderBottom:"1px solid rgba(168,85,247,0.3)",
          padding:"8px calc(16px + var(--corner-r)) 8px 16px", display:"flex", alignItems:"center", gap:8, cursor:"pointer",
          fontSize:12, color:"#c084fc", fontWeight:600, position:"sticky", top:"var(--top-gap)", zIndex:30 }}>
          {I.warning} Sync error — tap for details
        </div>
      )}
      {updateAvailable && (
        <div className="offline-banner" onClick={()=>window.__applyPendingAppUpdate && window.__applyPendingAppUpdate()}
          style={{ background:"rgba(56,189,248,0.12)", borderBottom:"1px solid rgba(56,189,248,0.3)",
          padding:"8px calc(16px + var(--corner-r)) 8px 16px", display:"flex", alignItems:"center", gap:8, cursor:"pointer",
          fontSize:12, color:"#38bdf8", fontWeight:600, position:"sticky",
          top:`calc(var(--top-gap) + ${(syncStatus==="offline"||syncStatus==="error")?33:0}px)`, zIndex:29 }}>
          ⬆ Update available — tap to refresh
        </div>
      )}

      {/* ── Header ── */}
      {/* Opaque, no backdrop-filter, pinned below the status bar: iOS 26+ blurs
          whatever translucent content sits in/near the status-bar area. */}
      <div style={{ background:"#080c14",
        borderBottom:"1px solid rgba(255,255,255,0.06)",
        padding:"10px calc(14px + var(--corner-r)) 10px 14px",
        position:"sticky",
        top:`calc(var(--top-gap) + ${(((syncStatus==="offline"||syncStatus==="error")?1:0) + (updateAvailable?1:0)) * 33}px)`,
        zIndex:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {/* Logo */}
          <img src={LOGO_URI} alt="Prime Baseball" style={{ width:36, height:36, borderRadius:"50%", flexShrink:0 }}/>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)", letterSpacing:1, fontWeight:600, textTransform:"uppercase" }}>PRIME PITCHING · {APP_VERSION}</div>
            <div style={{ fontSize:17, fontWeight:900, color:"#38bdf8", fontFamily:"'Bebas Neue',cursive", letterSpacing:2, lineHeight:1.1,
              whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              {teamMeta?.name || "Select Team"}
            </div>
          </div>
          <div style={{ display:"flex", gap:5, alignItems:"center" }}>
            {headerTourney && roster.length>0 && <div title={`Counts are for ${headerTourney.name}`} aria-hidden="true" style={{ fontSize:11 }}>🏆</div>}
            {availableCount>0 && <div title={`${availableCount} eligible ${countScope}`} aria-label={`${availableCount} eligible ${countScope}`} style={{ padding:"3px 8px", borderRadius:8, background:"rgba(74,222,128,0.15)", fontSize:11, fontWeight:700, color:"#4ade80" }}>{availableCount}✓</div>}
            {restingCount>0  && <div title={`${restingCount} not eligible ${countScope}`} aria-label={`${restingCount} not eligible ${countScope}`} style={{ padding:"3px 8px", borderRadius:8, background:"rgba(244,63,94,0.15)",  fontSize:11, fontWeight:700, color:"#f43f5e" }}>{restingCount}😴</div>}
            <div title={syncStatus==="error" && lastSyncError ? `error: ${lastSyncError}` : syncStatus}
              onClick={()=>{ if (syncStatus==="error") alert(`Sync error: ${lastSyncError || "Unknown error"}`); }}
              style={{ width:7, height:7, borderRadius:"50%", flexShrink:0, cursor: syncStatus==="error" ? "pointer" : "default",
              background: syncStatus==="synced"?"#4ade80": syncStatus==="saving"?"#fbbf24": syncStatus==="error"?"#a855f7": syncStatus==="offline"?"#f43f5e":"rgba(255,255,255,0.3)",
              boxShadow:  syncStatus==="synced"?"0 0 6px #4ade80": syncStatus==="saving"?"0 0 6px #fbbf24": syncStatus==="error"?"0 0 6px #a855f7": syncStatus==="offline"?"0 0 6px #f43f5e":"none",
              transition:"background 0.4s, box-shadow 0.4s" }}/>
            <button onClick={()=>setShowTeamPicker(true)}
              style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)",
                borderRadius:8, padding:"5px 8px", color:"rgba(255,255,255,0.5)", cursor:"pointer",
                fontSize:11, fontWeight:700, letterSpacing:0.5 }}>
              TEAM
            </button>
          </div>
        </div>
      </div>

      {/* ── Screens ── */}
      <div>
        {tab==="roster" && selectedPlayer ? (
          <ScreenBoundary onBack={()=>setSelectedPlayer(null)}>
            <PitcherDetail pitcher={selectedPlayer} onBack={()=>setSelectedPlayer(null)}
              tournaments={tournaments}
              onEditGame={editGame} onDeleteGame={deleteGame} onEditPlayer={editPlayer}/>
          </ScreenBoundary>
        ) : tab==="roster" ? (
          <EligibilityScreen roster={roster} tournaments={tournaments} onSelect={p=>setSelectedPlayer(p)}/>
        ) : tab==="live" ? (
          <ScreenBoundary>
            <LiveGameScreen roster={roster} tournaments={tournaments} liveGame={liveGame}
              onStart={startLiveGame} onAction={liveGameAction}
              onComplete={completeLiveGame} onDiscard={discardLiveGame}/>
          </ScreenBoundary>
        ) : tab==="gamelog" ? (
          <GameLogScreen roster={roster} onLogMultiple={logMultiple} tournaments={tournaments}/>
        ) : tab==="season" ? (
          <ScreenBoundary>
            <SeasonHistory roster={roster} tournaments={tournaments} onEditGame={editGame} onDeleteGame={deleteGame}/>
          </ScreenBoundary>
        ) : (
          <ScreenBoundary>
            <Settings roster={roster} onAddPlayer={addPlayer} onDeletePlayer={deletePlayer}
              tournaments={tournaments} onAddTourney={addTourney} onDeleteTourney={deleteTourney} onUpdateTourney={updateTourney}
              role={role} onLogout={logout}/>
          </ScreenBoundary>
        )}
      </div>

      {/* ── Bottom nav ── */}
      {/* Fixed, so body's side padding doesn't reach it: pin between the safe-area
          insets and center within them (left+right+maxWidth+auto margins). The folded
          Duo's corner pill is nowhere near the bottom, so corner mode doesn't apply here. */}
      <div style={{ position:"fixed", bottom:0, left:"var(--safe-l)", right:"calc(var(--safe-r) - var(--corner-r))", margin:"0 auto",
        maxWidth:430, background:"rgba(8,12,20,0.97)", backdropFilter:"blur(20px)",
        borderTop:"1px solid rgba(255,255,255,0.07)", paddingBottom:"env(safe-area-inset-bottom,0px)" }}>
        <div style={{ display:"flex" }}>
          {TABS.map(t=>{
            const active = (tab===t.id && !selectedPlayer) || (tab==="roster" && selectedPlayer && t.id==="roster");
            return (
              <button key={t.id} onClick={()=>{ setTab(t.id); if(t.id!=="roster") setSelectedPlayer(null); }} aria-pressed={active}
                style={{ flex:1, background:"transparent", border:"none", cursor:"pointer",
                  padding:"9px 0 7px", display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                <div style={{ position:"relative", color:active?"#38bdf8":"rgba(255,255,255,0.3)", transition:"color 0.2s" }}>
                  {t.icon}
                  {t.id==="live" && liveGame && (
                    <span className="live-dot" aria-label="Game in progress"
                      style={{ position:"absolute", top:-1, right:-3, width:8, height:8, borderRadius:"50%", background:"#ef4444" }}/>
                  )}
                </div>
                <span style={{ fontSize:10, fontWeight:700, letterSpacing:0.5,
                  color:active?"#38bdf8":"rgba(255,255,255,0.3)", transition:"color 0.2s" }}>
                  {t.label.toUpperCase()}
                </span>
                {active && <div style={{ width:14, height:2, background:"#38bdf8", borderRadius:1 }}/>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
