// EditGameGroupModal — edit an entire multi-pitcher game (all pitchers + game details).
// Babel/JSX component, loaded via <script type="text/babel" src="components/EditGameGroupModal.js"></script>.

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: Edit an entire game (all pitchers + game details)
// ══════════════════════════════════════════════════════════════════════════════
function EditGameGroupModal({ game, onEditGame, onDeleteGame, onClose, tournaments }) {
  const [editDate, setEditDate] = useState(game.date);
  const [editOpponent, setEditOpponent] = useState(game.opponent || "");
  const [editContext, setEditContext] = useState(
    game.isTournament ? (game.tournamentId || "regular") : "regular"
  );
  const [editTourneyDay, setEditTourneyDay] = useState(game.tourneyDay || 1);
  const [pitcherPitches, setPitcherPitches] = useState(() => {
    const m = {};
    game.pitchers.forEach(p => { m[p.pitcherId] = String(p.pitches); });
    return m;
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selectedTourney = tournaments.find(t => t.id === editContext);

  function handleSave() {
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
        tourneyDay: editContext !== "regular" ? parseInt(editTourneyDay, 10) : null,
      });
    });
    onClose();
  }

  function handleDeleteAll() {
    game.pitchers.forEach(p => onDeleteGame(p.pitcherId, p.gameId));
    onClose();
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:50,
      display:"flex", alignItems:"flex-end", justifyContent:"center" }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ width:"100%", maxWidth:430, background:"#0f1623",
        border:"1px solid rgba(255,255,255,0.12)", borderRadius:"20px 20px 0 0",
        padding:"20px 18px 40px", maxHeight:"92vh", overflowY:"auto" }}>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:"#f8fafc" }}>Edit Game</div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginTop:2 }}>
              {formatDate(game.date)}{game.opponent ? ` · vs ${game.opponent}` : ""}
            </div>
          </div>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.07)", border:"none", borderRadius:8,
            width:32, height:32, color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:18 }}>✕</button>
        </div>

        <ContextPicker context={editContext} setContext={setEditContext}
          tourneyDay={editTourneyDay} setTourneyDay={setEditTourneyDay}
          tournaments={tournaments} gameDate={editDate}/>

        <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>GAME DATE</label>
        <input type="date" value={editDate} onChange={e=>setEditDate(e.target.value)}
          style={{ ...inputStyle, marginBottom:10 }}/>

        <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>OPPONENT</label>
        <input placeholder="Team name (optional)" value={editOpponent} onChange={e=>setEditOpponent(e.target.value)}
          style={{ ...inputStyle, marginBottom:14 }}/>

        <p style={sectionLabel}>PITCHER PITCH COUNTS</p>
        {game.pitchers.map(p => {
          const pitches = parseInt(pitcherPitches[p.pitcherId], 10) || 0;
          const rd = getRegRestDays(pitches);
          return (
            <div key={p.pitcherId} style={{ display:"flex", alignItems:"center", gap:8,
              padding:"8px 10px", borderRadius:10, marginBottom:6,
              background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ width:32, height:32, borderRadius:8, background:"rgba(56,189,248,0.1)",
                border:"1px solid rgba(56,189,248,0.2)", display:"flex", alignItems:"center",
                justifyContent:"center", fontFamily:"'Bebas Neue',cursive", fontSize:12, color:"#38bdf8", flexShrink:0 }}>
                {p.jersey ? `#${p.jersey}` : (p.playerName||"?")[0]}
              </div>
              <span style={{ flex:1, fontSize:13, fontWeight:600, color:"rgba(255,255,255,0.85)" }}>{p.playerName}</span>
              <input type="number" min="0"
                value={pitcherPitches[p.pitcherId] ?? String(p.pitches)}
                onChange={e => setPitcherPitches(m => ({ ...m, [p.pitcherId]: e.target.value }))}
                style={{ ...inputStyle, width:64, textAlign:"center", fontSize:18, fontWeight:800,
                  fontFamily:"'Bebas Neue',cursive", padding:"4px 6px" }}/>
              {pitches > 0 && (
                <span style={{ fontSize:11, fontWeight:600, minWidth:48, textAlign:"right",
                  color:rd===0?"#4ade80":rd===1?"#a3e635":rd===2?"#fb923c":"#f43f5e" }}>
                  {rd===0?"No rest":`${rd}d rest`}
                </span>
              )}
            </div>
          );
        })}

        <div style={{ display:"flex", gap:8, marginTop:16, marginBottom:10 }}>
          <button onClick={onClose} style={{ ...cancelBtn, flex:1 }}>Cancel</button>
          <button onClick={handleSave} style={{ ...primaryBtn, flex:2 }}>{I.check} Save Changes</button>
        </div>

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
  );
}
