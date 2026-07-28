// App — root component: team selection, Firebase subscription, tab routing, all handlers.
// Babel/JSX component, loaded via <script type="text/babel" src="components/App.js"></script>.

// ══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════════════════
const TABS = [
  { id:"roster",   label:"Roster",   icon:I.roster   },
  { id:"gamelog",  label:"Game Log", icon:I.gamelog  },
  { id:"season",   label:"Season",   icon:I.history  },
  { id:"settings", label:"Settings", icon:I.settings },
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
  const [updateAvailable, setUpdateAvailable] = useState(false);

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
        .catch(err => {
          console.warn("[pushAudit] Firebase write failed:", err);
          // The optimistic local entry above will never get confirmed by the
          // Firebase listener now - flag it so ActivityScreen can show it as
          // failed instead of leaving it looking like a normal, eventually-
          // synced entry forever.
          if (pushKey) {
            setAuditLog(prev => prev.map(e => e.id === pushKey ? { ...e, _failed: true } : e));
          }
        });
    } catch(e) { console.warn("[pushAudit] error:", e); }
  }

  const addPlayer = useCallback(p => {
    setRoster(r => [...r, p]);
    pushAudit("ADD_PITCHER", `Added ${p.name} #${p.jersey}`, { type:"DELETE_PITCHER", pitcherId: p.id });
  }, []);

  const deletePlayer = useCallback((id, opts) => {
    const pitcher = rosterRef.current.find(p => p.id === id);
    setRoster(r => r.filter(p => p.id !== id));
    setSelectedPlayer(null);
    if (pitcher && !opts?.skipAudit) pushAudit("DELETE_PITCHER", `Deleted ${pitcher.name} #${pitcher.jersey}`, { type:"RESTORE_PITCHER", pitcher });
    return !!pitcher;
  }, []);

  const editPlayer = useCallback((id, updates, opts) => {
    const pitcher = rosterRef.current.find(p => p.id === id);
    if (!pitcher) return false;
    setRoster(r => r.map(p => p.id === id ? {...p,...updates} : p));
    setSelectedPlayer(prev => prev && prev.id === id ? {...prev,...updates} : prev);
    if (!opts?.skipAudit && (updates.name !== undefined || updates.jersey !== undefined)) {
      pushAudit("EDIT_PITCHER", `Edited ${updates.name || pitcher.name} #${updates.jersey ?? pitcher.jersey}`,
        { type:"RESTORE_PITCHER_META", pitcherId: id, name: pitcher.name, jersey: pitcher.jersey });
    }
    return true;
  }, []);

  const addTourney = useCallback(t => {
    setTournaments(ts => [...ts, t]);
    pushAudit("ADD_TOURNEY", `Added tournament "${t.name}"`, { type:"DELETE_TOURNEY", tourneyId: t.id });
  }, []);

  const deleteTourney = useCallback((id, opts) => {
    const tourney = tournamentsRef.current.find(t => t.id === id);
    setTournaments(ts => ts.filter(t => t.id !== id));
    if (tourney && !opts?.skipAudit) pushAudit("DELETE_TOURNEY", `Deleted tournament "${tourney.name}"`, { type:"RESTORE_TOURNEY", tourney });
    return !!tourney;
  }, []);

  const updateTourney = useCallback(t => {
    const old = tournamentsRef.current.find(x => x.id === t.id);
    setTournaments(ts => ts.map(x => x.id === t.id ? t : x));
    if (old) pushAudit("EDIT_TOURNEY", `Edited tournament "${t.name}"`, { type:"RESTORE_TOURNEY", tourney: old });
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

  const deleteGame = useCallback((playerId, gameId, opts) => {
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
    if (entry && !opts?.skipAudit) {
      pushAudit("DELETE_GAME",
        `Deleted game for ${player?.name || playerId} on ${entry.date} (${entry.pitches}p)`,
        { type:"RESTORE_GAME", playerId, entry });
    }
    return !!entry;
  }, []);

  const restoreGame = useCallback((playerId, entry) => {
    const player = rosterRef.current.find(p => p.id === playerId);
    if (!player) return false;
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
    return true;
  }, []);

  // Takes the full audit entry (not just its undoData) so it can log a
  // clean "Undid: <original detail>" entry and report back whether the
  // undo actually found its target - callers use that to tell the user
  // when an undo silently can't do anything (e.g. the pitcher it would
  // restore data onto was since deleted) instead of pretending it worked.
  // Entries already successfully undone this session, guarding against a
  // same-tick double-invocation of executeUndo (e.g. a double-fired touch
  // event). A plain ref, not React state: rosterRef/tournamentsRef are only
  // reassigned during a render, which React 18 batches/defers, so a second
  // synchronous call before any render happens would otherwise still see
  // stale state and re-run the restore - a ref mutates immediately and
  // executeUndo runs synchronously start-to-finish, so this is race-free
  // regardless of render timing. (A normal UI double-click doesn't hit this
  // path at all - React removes/relabels the Undo button after the first
  // click's state change lands - but this closes the gap for anything that
  // can invoke the handler twice without a render in between.)
  const undoneEntryIdsRef = useRef(new Set());

  const executeUndo = useCallback((entry) => {
    const undoData = entry?.undoData;
    if (!undoData) return false;
    if (undoneEntryIdsRef.current.has(entry.id)) return true; // already done - nothing more to do, not a failure
    let ok = true;
    switch (undoData.type) {
      case "DELETE_GAME":
        ok = deleteGame(undoData.playerId, undoData.gameId, { skipAudit:true });
        break;
      case "RESTORE_GAME":
        ok = restoreGame(undoData.playerId, undoData.entry);
        break;
      case "DELETE_PITCHER":
        ok = deletePlayer(undoData.pitcherId, { skipAudit:true });
        break;
      case "RESTORE_PITCHER":
        // The exists-check runs INSIDE the updater, against React's real
        // queued state at flush time, not a possibly-stale outer variable -
        // safe even if this line somehow ran more than once for the same
        // entry (defense in depth on top of the ref guard above).
        setRoster(r => r.some(p => p.id === undoData.pitcher.id) ? r : [...r, undoData.pitcher]);
        break;
      case "RESTORE_PITCHER_META":
        ok = editPlayer(undoData.pitcherId, { name:undoData.name, jersey:undoData.jersey }, { skipAudit:true });
        break;
      case "DELETE_TOURNEY":
        ok = deleteTourney(undoData.tourneyId, { skipAudit:true });
        break;
      case "RESTORE_TOURNEY":
        setTournaments(ts => {
          const exists = ts.some(t => t.id === undoData.tourney.id);
          return exists
            ? ts.map(t => t.id === undoData.tourney.id ? undoData.tourney : t)
            : [...ts, undoData.tourney];
        });
        break;
      default:
        return false;
    }
    if (ok) {
      undoneEntryIdsRef.current.add(entry.id);
      // One consistent, clearly-labeled entry per undo, in place of the
      // mislabeled duplicate (or, for restores, the total silence) this
      // used to produce - undoData:null so an UNDO entry can't itself be undone.
      pushAudit("UNDO", `Undid: ${entry.detail}`, null);
    }
    return ok;
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
      {syncStatus==="error" && (
        <div className="offline-banner" onClick={()=>alert(`Sync error: ${lastSyncError || "Unknown error"}\n\nYour changes are saved on this device but couldn't be written to the server. This usually means a permissions problem, not a dropped connection - it won't fix itself by waiting.`)}
          style={{ background:"rgba(168,85,247,0.12)", borderBottom:"1px solid rgba(168,85,247,0.3)",
          padding:"8px 16px", display:"flex", alignItems:"center", gap:8, cursor:"pointer",
          fontSize:12, color:"#c084fc", fontWeight:600, position:"sticky", top:0, zIndex:30 }}>
          {I.warning} Sync error — tap for details
        </div>
      )}
      {updateAvailable && (
        <div className="offline-banner" onClick={()=>window.__applyPendingAppUpdate && window.__applyPendingAppUpdate()}
          style={{ background:"rgba(56,189,248,0.12)", borderBottom:"1px solid rgba(56,189,248,0.3)",
          padding:"8px 16px", display:"flex", alignItems:"center", gap:8, cursor:"pointer",
          fontSize:12, color:"#38bdf8", fontWeight:600, position:"sticky",
          top:(syncStatus==="offline"||syncStatus==="error")?33:0, zIndex:29 }}>
          ⬆ Update available — tap to refresh
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ background:"rgba(8,12,20,0.9)", backdropFilter:"blur(16px)",
        borderBottom:"1px solid rgba(255,255,255,0.06)",
        padding:"10px 14px",
        position:"sticky",
        top:(((syncStatus==="offline"||syncStatus==="error")?1:0) + (updateAvailable?1:0)) * 33,
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
            {availableCount>0 && <div style={{ padding:"3px 8px", borderRadius:8, background:"rgba(74,222,128,0.15)", fontSize:11, fontWeight:700, color:"#4ade80" }}>{availableCount}✓</div>}
            {restingCount>0  && <div style={{ padding:"3px 8px", borderRadius:8, background:"rgba(244,63,94,0.15)",  fontSize:11, fontWeight:700, color:"#f43f5e" }}>{restingCount}😴</div>}
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
              onDelete={deletePlayer} tournaments={tournaments}
              onEditGame={editGame} onDeleteGame={deleteGame} onEditPlayer={editPlayer}/>
          </ScreenBoundary>
        ) : tab==="roster" ? (
          <EligibilityScreen roster={roster} tournaments={tournaments} onSelect={p=>setSelectedPlayer(p)}/>
        ) : tab==="gamelog" ? (
          <GameLogScreen roster={roster} onLogMultiple={logMultiple} tournaments={tournaments}/>
        ) : tab==="season" ? (
          <ScreenBoundary>
            <SeasonHistory roster={roster} tournaments={tournaments} onEditGame={editGame} onDeleteGame={deleteGame}/>
          </ScreenBoundary>
        ) : (
          <ScreenBoundary>
            <Settings roster={roster} onAddPlayer={addPlayer}
              tournaments={tournaments} onAddTourney={addTourney} onDeleteTourney={deleteTourney} onUpdateTourney={updateTourney}
              auditLog={auditLog} onUndo={executeUndo}
              undidIds={undidIds} onUndid={id => {
                setUndidIds(s => new Set([...s, id]));
                if (window.__fbMarkAuditUndone) window.__fbMarkAuditUndone(teamId, id);
              }}/>
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
              <button key={t.id} onClick={()=>{ setTab(t.id); if(t.id!=="roster") setSelectedPlayer(null); }} aria-pressed={active}
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
