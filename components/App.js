// App — root component: team selection, Firebase subscription, tab routing, all handlers.
// Babel/JSX component, loaded via <script type="text/babel" src="components/App.js"></script>.

// ══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════════════════
const TABS = [
  { id:"roster",      label:"Roster",      icon:I.roster      },
  { id:"gamelog",     label:"Game Log",    icon:I.gamelog     },
  { id:"eligibility", label:"Eligibility", icon:I.eligibility },
  { id:"tournament",  label:"Tourney",     icon:I.tournament  },
  { id:"history",     label:"History",     icon:I.history     },
  { id:"activity",    label:"Activity",    icon:I.activity    },
];

const TEAM_ID_KEY = "pt_selected_team_id";
const TEAM_META_KEY = "pt_selected_team_meta";

function App() {
  // ── Team selection ──────────────────────────────────────────────────────
  const [teamId,   setTeamId]   = useState(() => localStorage.getItem(TEAM_ID_KEY) || null);
  const [teamMeta, setTeamMeta] = useState(() => {
    try { return JSON.parse(localStorage.getItem(TEAM_META_KEY)) || null; } catch { return null; }
  });
  const [showTeamPicker, setShowTeamPicker] = useState(false);

  // Keep currentRules in sync on every render (before any child renders read it)
  setCurrentRules(teamMeta?.rules || DEFAULT_RULES);

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
  const [auditLog,    setAuditLog]    = useState([]);
  const [undidIds,    setUndidIds]    = useState(new Set());

  // Refs for stale-closure-free access inside callbacks
  const rosterRef      = useRef(roster);       rosterRef.current      = roster;
  const tournamentsRef = useRef(tournaments);  tournamentsRef.current = tournaments;
  const teamIdRef      = useRef(teamId);       teamIdRef.current      = teamId;

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
    Promise.all([
      window.__fbMigrateIfNeeded?.() || Promise.resolve(),
      window.__fbCreatePrime12U?.()  || Promise.resolve(),
      window.__fbCreatePrime10U?.()  || Promise.resolve(),
    ]).then(() => window.__fbListTeams()).then(list => {
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

  // Subscribe to audit log for current team
  useEffect(() => {
    if (!teamId || !window.__fbWatchAudit) return;
    setAuditLog([]);
    setUndidIds(new Set());
    // Capture teamId so the callback can detect if it fires after the team changed.
    // Without this guard, a stale callback from a previous team fires after the new
    // team's callback and can wipe out the new entries (since confirmed entries have
    // no _local flag and get replaced by the stale team's empty-or-wrong entries).
    const subscribedTeamId = teamId;
    const unsub = window.__fbWatchAudit(teamId, entries => {
      if (teamIdRef.current !== subscribedTeamId) return;
      // Merge: keep local optimistic entries not yet confirmed in Firebase, then add Firebase data
      const fbIds = new Set(entries.map(e => e.id));
      setAuditLog(prev => {
        const unconfirmed = prev.filter(e => e._local && !fbIds.has(e.id));
        return [...unconfirmed, ...entries];
      });
      setUndidIds(prev => {
        const fromDb = new Set(entries.filter(e => e.undone).map(e => e.id));
        return new Set([...prev, ...fromDb]);
      });
    });
    return () => unsub();
  }, [teamId]);

  // Write to Firebase whenever data changes (after initial load)
  const saveTimeoutRef = useRef(null);
  useEffect(()=>{
    if (!loaded || !teamId || !window.__fbSet) return;
    setSyncStatus("saving");
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      Promise.all([
        window.__fbSet("roster", roster, teamId),
        window.__fbSet("tournaments", tournaments, teamId),
      ]).then(() => setSyncStatus("synced"))
        .catch(() => setSyncStatus("offline"));
    }, 600);
  }, [roster, tournaments, loaded]);

  function pushAudit(action, detail, undoData, extra) {
    try {
      const tid = teamIdRef.current;
      if (!tid || !window.__fbPushAudit) return;
      const entryData = { ts: Date.now(), deviceId: getDeviceId(), device: getDeviceName(), action, detail, undoData, ...(extra||{}) };
      // Generate the real Firebase push key offline so the local entry has the correct id from the start
      const pushKey = window.__fbAuditKey ? window.__fbAuditKey(tid) : null;
      if (pushKey) {
        setAuditLog(prev => [{ id: pushKey, _local: true, ...entryData }, ...prev]);
      }
      window.__fbPushAudit(tid, entryData, pushKey)
        .catch(err => console.warn("[pushAudit] Firebase write failed:", err));
    } catch(e) { console.warn("[pushAudit] error:", e); }
  }

  const addPlayer = useCallback(p => {
    setRoster(r => [...r, p]);
    pushAudit("ADD_PITCHER", `Added ${p.name} #${p.jersey}`, { type:"DELETE_PITCHER", pitcherId: p.id });
  }, []);

  const deletePlayer = useCallback(id => {
    const pitcher = rosterRef.current.find(p => p.id === id);
    setRoster(r => r.filter(p => p.id !== id));
    setSelectedPlayer(null);
    if (pitcher) pushAudit("DELETE_PITCHER", `Deleted ${pitcher.name} #${pitcher.jersey}`, { type:"RESTORE_PITCHER", pitcher });
  }, []);

  const editPlayer = useCallback((id, updates) => {
    const pitcher = rosterRef.current.find(p => p.id === id);
    setRoster(r => r.map(p => p.id === id ? {...p,...updates} : p));
    setSelectedPlayer(prev => prev && prev.id === id ? {...prev,...updates} : prev);
    if (pitcher && (updates.name !== undefined || updates.jersey !== undefined)) {
      pushAudit("EDIT_PITCHER", `Edited ${updates.name || pitcher.name} #${updates.jersey ?? pitcher.jersey}`,
        { type:"RESTORE_PITCHER_META", pitcherId: id, name: pitcher.name, jersey: pitcher.jersey });
    }
  }, []);

  const addTourney = useCallback(t => {
    setTournaments(ts => [...ts, t]);
    pushAudit("ADD_TOURNEY", `Added tournament "${t.name}"`, { type:"DELETE_TOURNEY", tourneyId: t.id });
  }, []);

  const deleteTourney = useCallback(id => {
    const tourney = tournamentsRef.current.find(t => t.id === id);
    setTournaments(ts => ts.filter(t => t.id !== id));
    if (tourney) pushAudit("DELETE_TOURNEY", `Deleted tournament "${tourney.name}"`, { type:"RESTORE_TOURNEY", tourney });
  }, []);

  const updateTourney = useCallback(t => {
    const old = tournamentsRef.current.find(x => x.id === t.id);
    setTournaments(ts => ts.map(x => x.id === t.id ? t : x));
    if (old) pushAudit("EDIT_TOURNEY", `Edited tournament "${t.name}"`, { type:"RESTORE_TOURNEY", tourney: old });
  }, []);

  const logGame = useCallback((playerId, gameData) => {
    const entry = { ...gameData, gameId: gameData.gameId || newId() };
    const player = rosterRef.current.find(p => p.id === playerId);
    setRoster(r => r.map(p => {
      if (p.id !== playerId) return p;
      const history = [...(p.history||[]), entry];
      return { ...p, ...recomputeLast(history), history };
    }));
    setSelectedPlayer(prev => {
      if (!prev || prev.id !== playerId) return prev;
      const history = [...(prev.history||[]), entry];
      return { ...prev, ...recomputeLast(history), history };
    });
    const gi = { date:entry.date, opponent:entry.opponent||null, isTournament:!!entry.isTournament, tournamentName:entry.tournamentName||null, tourneyDay:entry.tourneyDay||null };
    pushAudit("LOG_GAME", `${player?.name||playerId}: ${entry.pitches}p`,
      { type:"DELETE_GAME", playerId, gameId: entry.gameId },
      { gameInfo: gi, pitcherName: player?.name||playerId, pitches: entry.pitches });
  }, []);

  const logMultiple = useCallback((playerId, gameData) => {
    const entry = { ...gameData, gameId: gameData.gameId || newId() };
    const player = rosterRef.current.find(p => p.id === playerId);
    setRoster(r => r.map(p => {
      if (p.id !== playerId) return p;
      const history = [...(p.history||[]), entry];
      return { ...p, ...recomputeLast(history), history };
    }));
    const gi = { date:entry.date, opponent:entry.opponent||null, isTournament:!!entry.isTournament, tournamentName:entry.tournamentName||null, tourneyDay:entry.tourneyDay||null };
    pushAudit("LOG_GAME", `${player?.name||playerId}: ${entry.pitches}p`,
      { type:"DELETE_GAME", playerId, gameId: entry.gameId },
      { sharedGameId: entry.sharedGameId||null, gameInfo: gi, pitcherName: player?.name||playerId, pitches: entry.pitches });
  }, []);

  const editGame = useCallback((playerId, gameId, updatedData) => {
    const player = rosterRef.current.find(p => p.id === playerId);
    const oldEntry = player?.history?.find(h => h.gameId === gameId);
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
    if (oldEntry) {
      pushAudit("EDIT_GAME",
        `Edited game for ${player?.name || playerId} on ${oldEntry.date} (${oldEntry.pitches}p → ${updatedData.pitches ?? oldEntry.pitches}p)`,
        { type:"RESTORE_GAME", playerId, entry: oldEntry });
    }
  }, []);

  const deleteGame = useCallback((playerId, gameId) => {
    const player = rosterRef.current.find(p => p.id === playerId);
    const entry = player?.history?.find(h => h.gameId === gameId);
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
    if (entry) {
      pushAudit("DELETE_GAME",
        `Deleted game for ${player?.name || playerId} on ${entry.date} (${entry.pitches}p)`,
        { type:"RESTORE_GAME", playerId, entry });
    }
  }, []);

  const restoreGame = useCallback((playerId, entry) => {
    setRoster(r => r.map(p => {
      if (p.id !== playerId) return p;
      const exists = (p.history||[]).some(h => h.gameId === entry.gameId);
      const history = exists
        ? (p.history||[]).map(h => h.gameId === entry.gameId ? entry : h)
        : [...(p.history||[]), entry].sort((a,b) => (a.date||'').localeCompare(b.date||''));
      return { ...p, ...recomputeLast(history), history };
    }));
    setSelectedPlayer(prev => {
      if (!prev || prev.id !== playerId) return prev;
      const exists = (prev.history||[]).some(h => h.gameId === entry.gameId);
      const history = exists
        ? (prev.history||[]).map(h => h.gameId === entry.gameId ? entry : h)
        : [...(prev.history||[]), entry].sort((a,b) => (a.date||'').localeCompare(b.date||''));
      return { ...prev, ...recomputeLast(history), history };
    });
  }, []);

  const executeUndo = useCallback((undoData) => {
    if (!undoData) return;
    switch (undoData.type) {
      case "DELETE_GAME":          deleteGame(undoData.playerId, undoData.gameId);  break;
      case "RESTORE_GAME":         restoreGame(undoData.playerId, undoData.entry);  break;
      case "DELETE_PITCHER":       deletePlayer(undoData.pitcherId);                break;
      case "RESTORE_PITCHER":      setRoster(r => [...r, undoData.pitcher]);        break;
      case "RESTORE_PITCHER_META": editPlayer(undoData.pitcherId, { name:undoData.name, jersey:undoData.jersey }); break;
      case "DELETE_TOURNEY":       deleteTourney(undoData.tourneyId);               break;
      case "RESTORE_TOURNEY":
        setTournaments(ts => {
          const exists = ts.some(t => t.id === undoData.tourney.id);
          return exists
            ? ts.map(t => t.id === undoData.tourney.id ? undoData.tourney : t)
            : [...ts, undoData.tourney];
        });
        break;
      default: break;
    }
  }, [deleteGame, restoreGame, deletePlayer, editPlayer, deleteTourney]);

  // ── Team picker screen ──────────────────────────────────────────────────
  if (!teamId || showTeamPicker) {
    return <TeamPickerScreen onSelect={selectTeam} showManage={showTeamPicker}
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
    <div style={{ background:"#080c14", minHeight:"100vh", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", gap:16 }}>
      <img src={LOGO_URI} alt="Prime Baseball" style={{ width:64, height:64, borderRadius:"50%" }}/>
      <div style={{ fontSize:20, fontWeight:800, color:"rgba(255,255,255,0.85)", fontFamily:"'Bebas Neue',cursive", letterSpacing:2 }}>PRIME PITCHING</div>
      <div style={{ fontSize:13, color:"rgba(255,255,255,0.4)", marginTop:-8 }}>{teamMeta?.name}</div>
      <div className="spinner" style={{ fontSize:22, marginTop:4 }}>⟳</div>
      <div style={{ fontSize:12, color:"rgba(255,255,255,0.25)", marginTop:-8 }}>Connecting…</div>
    </div>
  );

  const availableCount = roster.filter(p=>getAvailabilityStatus(p, null, tournaments)==="available").length;
  const restingCount   = roster.filter(p=>getAvailabilityStatus(p, null, tournaments)!=="available").length;

  return (
    <div style={{ background:"#080c14", minHeight:"100vh", maxWidth:430, margin:"0 auto",
      fontFamily:"'Barlow',sans-serif", color:"#f8fafc", position:"relative", overflowX:"hidden",
      backgroundImage:"radial-gradient(ellipse at 20% 0%,rgba(30,58,138,0.25) 0%,transparent 60%),radial-gradient(ellipse at 80% 100%,rgba(22,101,52,0.15) 0%,transparent 60%)" }}>

      {syncStatus==="offline" && (
        <div className="offline-banner" style={{ background:"rgba(244,63,94,0.12)", borderBottom:"1px solid rgba(244,63,94,0.3)",
          padding:"8px 16px", display:"flex", alignItems:"center", gap:8,
          fontSize:12, color:"#f87171", fontWeight:600, position:"sticky", top:0, zIndex:30 }}>
          {I.warning} Offline — changes will sync when reconnected
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ background:"rgba(8,12,20,0.9)", backdropFilter:"blur(16px)",
        borderBottom:"1px solid rgba(255,255,255,0.06)",
        padding:"10px 14px",
        position:"sticky", top:syncStatus==="offline"?33:0, zIndex:20 }}>
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
            {availableCount>0 && <div style={{ padding:"3px 8px", borderRadius:8, background:"rgba(74,222,128,0.15)", fontSize:11, fontWeight:700, color:"#4ade80" }}>{availableCount}✓</div>}
            {restingCount>0  && <div style={{ padding:"3px 8px", borderRadius:8, background:"rgba(244,63,94,0.15)",  fontSize:11, fontWeight:700, color:"#f43f5e" }}>{restingCount}😴</div>}
            <div title={syncStatus} style={{ width:7, height:7, borderRadius:"50%", flexShrink:0,
              background: syncStatus==="synced"?"#4ade80": syncStatus==="saving"?"#fbbf24": syncStatus==="offline"?"#f43f5e":"rgba(255,255,255,0.3)",
              boxShadow:  syncStatus==="synced"?"0 0 6px #4ade80": syncStatus==="saving"?"0 0 6px #fbbf24": syncStatus==="offline"?"0 0 6px #f43f5e":"none",
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
              onLog={logGame} onDelete={deletePlayer} tournaments={tournaments}
              onEditGame={editGame} onDeleteGame={deleteGame} onEditPlayer={editPlayer}/>
          </ScreenBoundary>
        ) : tab==="roster" ? (
          <RosterScreen roster={roster} tournaments={tournaments} onAdd={addPlayer} onSelect={p=>setSelectedPlayer(p)} onEditPlayer={editPlayer}/>
        ) : tab==="gamelog" ? (
          <GameLogScreen roster={roster} onLogMultiple={logMultiple} tournaments={tournaments}
            onEditGame={editGame} onDeleteGame={deleteGame}/>
        ) : tab==="eligibility" ? (
          <EligibilityScreen roster={roster} tournaments={tournaments}/>
        ) : tab==="tournament" ? (
          <TournamentScreen roster={roster} tournaments={tournaments} onAddTourney={addTourney} onDeleteTourney={deleteTourney} onUpdateTourney={updateTourney}/>
        ) : tab==="activity" ? (
          <ActivityScreen auditLog={auditLog} roster={roster} onUndo={executeUndo}
            undidIds={undidIds} onUndid={id => {
              setUndidIds(s => new Set([...s, id]));
              if (window.__fbMarkAuditUndone) window.__fbMarkAuditUndone(teamId, id);
            }}/>
        ) : (
          <ScreenBoundary>
            <SeasonHistory roster={roster} tournaments={tournaments} onEditGame={editGame} onDeleteGame={deleteGame}/>
          </ScreenBoundary>
        )}
      </div>

      {/* ── Bottom nav ── */}
      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)",
        width:"100%", maxWidth:430, background:"rgba(8,12,20,0.97)", backdropFilter:"blur(20px)",
        borderTop:"1px solid rgba(255,255,255,0.07)", paddingBottom:"env(safe-area-inset-bottom,0px)" }}>
        <div style={{ display:"flex" }}>
          {TABS.map(t=>{
            const active = (tab===t.id && !selectedPlayer) || (tab==="roster" && selectedPlayer && t.id==="roster");
            return (
              <button key={t.id} onClick={()=>{ setTab(t.id); if(t.id!=="roster") setSelectedPlayer(null); }}
                style={{ flex:1, background:"transparent", border:"none", cursor:"pointer",
                  padding:"9px 0 7px", display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                <div style={{ color:active?"#38bdf8":"rgba(255,255,255,0.3)", transition:"color 0.2s" }}>{t.icon}</div>
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
