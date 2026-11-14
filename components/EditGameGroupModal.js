// EditGameGroupModal — edit an entire multi-pitcher game (all pitchers + game details).
// Babel/JSX component, loaded via <script type="text/babel" src="components/EditGameGroupModal.js"></script>.

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: Edit an entire game (all pitchers + game details)
// ══════════════════════════════════════════════════════════════════════════════
function EditGameGroupModal({ game, onEditGame, onDeleteGame, onAddGame, onClose, tournaments, roster = [] }) {
  // Wide screens: a centered dialog instead of a bottom sheet (v3.17)
  const { wide } = useLayout();
  const [editDate, setEditDate] = useState(game.date);
  const [editOpponent, setEditOpponent] = useState(game.opponent || "");
  const [editContext, setEditContext] = useState(
    game.isTournament ? (game.tournamentId || "regular") : "regular"
  );
  const [pitcherPitches, setPitcherPitches] = useState(() => {
    const m = {};
    game.pitchers.forEach(p => { m[p.pitcherId] = String(p.pitches); });
    return m;
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Pitchers added to this past game (v3.22 — e.g. the game was logged before
  // the last pitcher went in). Ids in entry order, counts as typed strings.
  const [addedIds, setAddedIds] = useState([]);
  const [addedPitches, setAddedPitches] = useState({});
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [warnViolations, setWarnViolations] = useState(false);

  const selectedTourney = tournaments.find(t => t.id === editContext);
  const editTourneyDay = selectedTourney ? getTourneyDayNumber(selectedTourney, editDate) : null;
  const dateOutsideTourney = editContext !== "regular" && !!selectedTourney && !editTourneyDay;

  const inGameIds = new Set(game.pitchers.map(p => String(p.pitcherId)));
  const canAdd = typeof onAddGame === "function";
  const addable = canAdd ? roster.filter(p => !inGameIds.has(String(p.id)) && !addedIds.includes(p.id)) : [];
  const addedPitchers = addedIds.map(id => roster.find(p => p.id === id)).filter(Boolean);
  const addedCount = id => {
    const n = parseInt(addedPitches[id], 10);
    return isNaN(n) || n < 1 ? 0 : Math.min(n, 999);
  };
  // Same save-time rule check as Log Game, for the added pitchers only — each
  // one is a new appearance. Existing entries stay unchecked like other edits.
  function getAddedViolation(p) {
    const count = addedCount(p.id);
    if (count < 1) return null;
    const c = getGameLogCheck(p, { context:editContext, tourney:selectedTourney, date:editDate, count, tournaments });
    return c && c.level === "violation" ? c.message : null;
  }
  const addedViolations = addedPitchers.map(p => ({ p, reason:getAddedViolation(p) })).filter(v => v.reason);

  function addPitcher(id) {
    setAddedIds(ids => ids.includes(id) ? ids : [...ids, id]);
    setAddedPitches(m => ({ ...m, [id]: m[id] ?? "" }));
    setShowAddPicker(false);
    setWarnViolations(false);
  }
  function removeAdded(id) {
    setAddedIds(ids => ids.filter(x => x !== id));
    setAddedPitches(m => { const n = { ...m }; delete n[id]; return n; });
    setWarnViolations(false);
  }

  function handleSave(override = false) {
    if (dateOutsideTourney) return;
    if (!override && addedViolations.length > 0) { setWarnViolations(true); return; }
    game.pitchers.forEach(p => {
      const pitches = parseInt(pitcherPitches[p.pitcherId], 10);
      if (isNaN(pitches) || pitches < 1) return;
      onEditGame(p.pitcherId, p.gameId, {
        ...p,
        pitches,
        date: editDate,
        opponent: editOpponent,
        isTournament: editContext !== "regular",
        tournamentId: editContext !== "regular" ? editContext : null,
        tournamentName: editContext !== "regular" ? selectedTourney?.name : null,
        tourneyDay: editContext !== "regular" ? editTourneyDay : null,
      });
    });
    if (canAdd) {
      // Join the game's sharedGameId when it has one (gameId format matches
      // buildGameEntries); a legacy game without one groups by date/opponent/context.
      const sharedGameId = game.pitchers.map(p => p.sharedGameId).find(Boolean) || null;
      const isTournament = editContext !== "regular";
      addedPitchers.forEach(p => {
        const pitches = addedCount(p.id);
        if (pitches < 1) return;
        onAddGame(p.id, {
          pitches,
          date: editDate,
          opponent: editOpponent,
          isTournament,
          tournamentId: isTournament ? editContext : null,
          tournamentName: isTournament ? (selectedTourney?.name || null) : null,
          tourneyDay: isTournament ? editTourneyDay : null,
          gameId: sharedGameId ? sharedGameId + "_" + p.id : newId(),
          sharedGameId,
        });
      });
    }
    onClose();
  }

  function handleDeleteAll() {
    game.pitchers.forEach(p => onDeleteGame(p.pitcherId, p.gameId));
    onClose();
  }

  // Portaled to <body>: inside a scrolling pane (two-pane layouts) iOS clips
  // even a position:fixed overlay to the pane (v3.21).
  return ReactDOM.createPortal(
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:50,
      display:"flex", alignItems:wide?"center":"flex-end", justifyContent:"center",
      paddingLeft:"var(--safe-l)", paddingRight:"var(--safe-r)",
      // Wide dialog: keep a tall one below the status area (unfolded Duo clock) and off the bottom edge
      ...(wide ? { paddingTop:"max(var(--top-gap), 76px)", paddingBottom:24 } : null) }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ width:"100%", maxWidth:wide?520:430, background:"#0f1623",
        border:"1px solid rgba(255,255,255,0.12)", borderRadius:wide?20:"20px 20px 0 0",
        padding:"20px 18px 40px", maxHeight:wide?"100%":"92vh", boxSizing:"border-box", overflowY:"auto" }}>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:"#f8fafc" }}>Edit Game</div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginTop:2 }}>
              {formatDate(game.date)}{game.opponent ? ` · vs ${game.opponent}` : ""}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background:"rgba(255,255,255,0.07)", border:"none", borderRadius:8,
            width:32, height:32, color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:18 }}>✕</button>
        </div>

        <ContextPicker context={editContext} setContext={setEditContext}
          tournaments={tournaments} gameDate={editDate}/>

        <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>GAME DATE</label>
        <input type="date" value={editDate} onChange={e=>setEditDate(e.target.value)} aria-label="Game date"
          style={{ ...inputStyle, marginBottom:10 }}/>

        <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>OPPONENT</label>
        <input placeholder="Team name (optional)" value={editOpponent} onChange={e=>setEditOpponent(e.target.value)} aria-label="Opponent"
          style={{ ...inputStyle, marginBottom:14 }}/>

        <p style={sectionTitle}>PITCHER PITCH COUNTS</p>
        {game.pitchers.map(p => {
          const pitches = parseInt(pitcherPitches[p.pitcherId], 10) || 0;
          const rd = getRegRestDays(pitches);
          const eligDate = editDate && pitches > 0 ? getEligibleDate(editDate, pitches, getRegRestDays) : null;
          function bump(delta) {
            setPitcherPitches(m => ({ ...m, [p.pitcherId]: String(Math.max(0, pitches + delta)) }));
          }
          return (
            <div key={p.pitcherId} style={{ padding:"10px 12px", borderRadius:10, marginBottom:8,
              background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:"rgba(56,189,248,0.1)",
                  border:"1px solid rgba(56,189,248,0.2)", display:"flex", alignItems:"center",
                  justifyContent:"center", fontFamily:"'Bebas Neue',cursive", fontSize:12, color:"#38bdf8", flexShrink:0 }}>
                  {p.jersey ? `#${p.jersey}` : (p.playerName||"?")[0]}
                </div>
                <span style={{ flex:1, fontSize:13, fontWeight:600, color:"rgba(255,255,255,0.85)" }}>{p.playerName}</span>
                {pitches > 0 && (
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:11, fontWeight:700,
                      color:rd===0?"#4ade80":rd===1?"#a3e635":rd===2?"#fb923c":"#f43f5e" }}>
                      {rd===0?"No rest":`${rd}d rest`}
                    </div>
                    {eligDate && (
                      <div style={{ fontSize:9, color:"rgba(255,255,255,0.35)" }}>Elig. {formatDate(eligDate.toISOString())}</div>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                {[-5,-1].map(d=>(
                  <button key={d} type="button" onClick={()=>bump(d)}
                    aria-label={`Subtract ${Math.abs(d)} pitch${Math.abs(d)!==1?"es":""} for ${p.playerName}`}
                    style={{ flex:1, padding:"7px 0", borderRadius:8, background:"rgba(255,255,255,0.05)",
                      border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.6)", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    {d}
                  </button>
                ))}
                <input type="number" min="0" aria-label={`${p.playerName} pitch count`}
                  value={pitcherPitches[p.pitcherId] ?? String(p.pitches)}
                  onChange={e => setPitcherPitches(m => ({ ...m, [p.pitcherId]: e.target.value }))}
                  style={{ ...inputStyle, width:60, flexShrink:0, textAlign:"center", fontSize:18, fontWeight:800,
                    fontFamily:"'Bebas Neue',cursive", padding:"4px 6px" }}/>
                {[1,5].map(d=>(
                  <button key={d} type="button" onClick={()=>bump(d)}
                    aria-label={`Add ${d} pitch${d!==1?"es":""} for ${p.playerName}`}
                    style={{ flex:1, padding:"7px 0", borderRadius:8, background:"rgba(37,99,235,0.15)",
                      border:"1px solid rgba(37,99,235,0.3)", color:"#60a5fa", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    +{d}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {addedPitchers.map(p => {
          const raw = addedPitches[p.id] ?? "";
          const pitches = addedCount(p.id);
          const violation = getAddedViolation(p);
          function bump(delta) {
            setAddedPitches(m => ({ ...m, [p.id]: String(Math.min(999, Math.max(0, (parseInt(m[p.id],10)||0) + delta))) }));
            setWarnViolations(false);
          }
          return (
            <div key={p.id} style={{ padding:"10px 12px", borderRadius:10, marginBottom:8,
              background:"rgba(74,222,128,0.04)", border:`1px solid ${violation?"rgba(251,146,60,0.4)":"rgba(74,222,128,0.25)"}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:"rgba(74,222,128,0.1)",
                  border:"1px solid rgba(74,222,128,0.25)", display:"flex", alignItems:"center",
                  justifyContent:"center", fontFamily:"'Bebas Neue',cursive", fontSize:12, color:"#4ade80", flexShrink:0 }}>
                  {p.jersey ? `#${p.jersey}` : (p.name||"?")[0]}
                </div>
                <span style={{ flex:1, fontSize:13, fontWeight:600, color:"rgba(255,255,255,0.85)" }}>
                  {p.name} <span style={{ fontSize:10, fontWeight:700, color:"#4ade80", marginLeft:4 }}>NEW</span>
                </span>
                <button type="button" onClick={()=>removeAdded(p.id)} aria-label={`Remove ${p.name} from this game`}
                  style={{ background:"rgba(255,255,255,0.07)", border:"none", borderRadius:8, width:28, height:28,
                    color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:14 }}>✕</button>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                {[-5,-1].map(d=>(
                  <button key={d} type="button" onClick={()=>bump(d)}
                    aria-label={`Subtract ${Math.abs(d)} pitch${Math.abs(d)!==1?"es":""} for ${p.name}`}
                    style={{ flex:1, padding:"7px 0", borderRadius:8, background:"rgba(255,255,255,0.05)",
                      border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.6)", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    {d}
                  </button>
                ))}
                <input type="number" min="0" max="999" inputMode="numeric" placeholder="0" aria-label={`${p.name} pitch count`}
                  value={raw}
                  onChange={e => { setAddedPitches(m => ({ ...m, [p.id]: e.target.value })); setWarnViolations(false); }}
                  style={{ ...inputStyle, width:60, flexShrink:0, textAlign:"center", fontSize:18, fontWeight:800,
                    fontFamily:"'Bebas Neue',cursive", padding:"4px 6px" }}/>
                {[1,5].map(d=>(
                  <button key={d} type="button" onClick={()=>bump(d)}
                    aria-label={`Add ${d} pitch${d!==1?"es":""} for ${p.name}`}
                    style={{ flex:1, padding:"7px 0", borderRadius:8, background:"rgba(37,99,235,0.15)",
                      border:"1px solid rgba(37,99,235,0.3)", color:"#60a5fa", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    +{d}
                  </button>
                ))}
              </div>
              {pitches < 1 && (
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginTop:6 }}>Enter a pitch count — 0 won't be saved.</div>
              )}
              {violation && (
                <div style={{ fontSize:11, color:"#fb923c", marginTop:6 }}>{violation}</div>
              )}
            </div>
          );
        })}

        {canAdd && (showAddPicker ? (
          <div style={{ padding:"10px 12px", borderRadius:10, marginBottom:8,
            background:"rgba(255,255,255,0.03)", border:"1px dashed rgba(255,255,255,0.15)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <span style={{ ...sectionLabel }}>ADD A PITCHER</span>
              <button type="button" onClick={()=>setShowAddPicker(false)} aria-label="Close pitcher list"
                style={{ background:"transparent", border:"none", color:"rgba(255,255,255,0.5)", cursor:"pointer", fontSize:14 }}>✕</button>
            </div>
            {addable.length === 0 ? (
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}>Everyone on the roster is already in this game.</div>
            ) : (
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {addable.map(p => (
                  <button key={p.id} type="button" onClick={()=>addPitcher(p.id)}
                    style={{ padding:"7px 11px", borderRadius:20, background:"rgba(255,255,255,0.05)",
                      border:"1px solid rgba(255,255,255,0.12)", color:"rgba(255,255,255,0.8)", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                    {p.jersey ? `#${p.jersey} ` : ""}{p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button type="button" onClick={()=>setShowAddPicker(true)}
            style={{ width:"100%", padding:"9px", borderRadius:10, marginBottom:8, background:"transparent",
              border:"1px dashed rgba(56,189,248,0.35)", color:"#38bdf8", fontSize:13, fontWeight:600, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            {I.plus} Add pitcher
          </button>
        ))}

        {warnViolations && addedViolations.length > 0 ? (
          <div style={{ ...card, border:"1px solid rgba(251,146,60,0.4)", background:"rgba(251,146,60,0.07)", marginTop:16, marginBottom:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              {I.warning}
              <span style={{ fontSize:14, fontWeight:700, color:"#fb923c" }}>
                {addedViolations.length} added pitcher{addedViolations.length!==1?"s":""} would violate a limit
              </span>
            </div>
            {addedViolations.map(({p,reason})=>(
              <div key={p.id} style={{ fontSize:12, color:"rgba(255,255,255,0.65)", marginBottom:3 }}>
                {p.jersey?`#${p.jersey} `:""}{p.name} — {reason}
              </div>
            ))}
            <div style={{ display:"flex", gap:8, marginTop:12 }}>
              <button onClick={()=>setWarnViolations(false)} style={{ ...cancelBtn, flex:1 }}>Go Back</button>
              <button onClick={()=>handleSave(true)} disabled={dateOutsideTourney}
                style={{ flex:2, background:"linear-gradient(135deg,#ea580c,#c2410c)", border:"none",
                  borderRadius:12, padding:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                Save Anyway
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display:"flex", gap:8, marginTop:16, marginBottom:10 }}>
            <button onClick={onClose} style={{ ...cancelBtn, flex:1 }}>Cancel</button>
            <button onClick={()=>handleSave(false)} disabled={dateOutsideTourney}
              style={{ ...primaryBtn, flex:2, opacity:dateOutsideTourney?0.4:1,
                ...(addedViolations.length>0 ? { background:"linear-gradient(135deg,#ea580c,#c2410c)" } : null) }}>
              {I.check} Save Changes
            </button>
          </div>
        )}

        {!confirmDelete ? (
          <button onClick={()=>setConfirmDelete(true)}
            style={{ width:"100%", background:"transparent", border:"1px solid rgba(244,63,94,0.2)",
              borderRadius:12, padding:"10px", color:"rgba(244,63,94,0.6)", fontSize:13, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            {I.trash} Delete this game ({game.pitchers.length} pitcher{game.pitchers.length!==1?"s":""})
          </button>
        ) : (
          <div style={{ background:"rgba(244,63,94,0.08)", border:"1px solid rgba(244,63,94,0.25)",
            borderRadius:12, padding:12 }}>
            <p style={{ margin:"0 0 10px", fontSize:13, color:"#f87171", fontWeight:600 }}>
              Delete all {game.pitchers.length} pitcher entr{game.pitchers.length!==1?"ies":"y"} for this game?
            </p>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>setConfirmDelete(false)} style={{ ...cancelBtn, flex:1 }}>Keep it</button>
              <button onClick={handleDeleteAll}
                style={{ flex:2, background:"linear-gradient(135deg,#dc2626,#b91c1c)", border:"none",
                  borderRadius:12, padding:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                Yes, Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  , document.body);
}
