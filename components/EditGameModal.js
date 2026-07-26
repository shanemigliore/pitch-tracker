// EditGameModal — modal to edit or delete a single HistoryEntry.
// Babel/JSX component, loaded via <script type="text/babel" src="components/EditGameModal.js"></script>.

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: EDIT SINGLE GAME ENTRY
// ══════════════════════════════════════════════════════════════════════════════
function EditGameModal({ entry, pitcherName, roster, tournaments, onSave, onDelete, onClose }) {
  const [pitches, setPitches] = useState(entry.pitches);
  const [date, setDate] = useState(entry.date);
  const [opponent, setOpponent] = useState(entry.opponent || "");
  const [context, setContext] = useState(entry.isTournament ? (entry.tournamentId || "regular") : "regular");
  const [tourneyDay, setTourneyDay] = useState(entry.tourneyDay || 1);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selectedTourney = tournaments.find(t=>t.id===context);

  function handleSave() {
    if (pitches < 1) return;
    onSave({
      ...entry,
      pitches,
      date,
      opponent,
      isTournament: context !== "regular",
      tournamentId: context !== "regular" ? context : null,
      tournamentName: context !== "regular" ? selectedTourney?.name : null,
      tourneyDay: context !== "regular" ? tourneyDay : null,
    });
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
            <div style={{ fontSize:16, fontWeight:800, color:"#f8fafc" }}>Edit Game Entry</div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginTop:2 }}>{pitcherName}</div>
          </div>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.07)", border:"none", borderRadius:8,
            width:32, height:32, color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:18 }}>✕</button>
        </div>

        {/* Pitch count */}
        <label style={{ ...sectionLabel, display:"block", marginBottom:6 }}>PITCH COUNT</label>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
          <button onClick={()=>setPitches(p=>Math.max(0,p-1))}
            style={{ width:44, height:44, borderRadius:"50%", background:"rgba(255,255,255,0.07)",
              border:"1px solid rgba(255,255,255,0.12)", color:"#f8fafc", fontSize:18, fontWeight:700, cursor:"pointer" }}>−</button>
          <input type="number" min="0" value={pitches===0?"":String(pitches)}
            onChange={e=>{ const v=parseInt(e.target.value,10); setPitches(isNaN(v)||v<0?0:v); }}
            style={{ ...inputStyle, flex:1, textAlign:"center", fontSize:28, fontWeight:900,
              fontFamily:"'Bebas Neue',cursive", height:52, padding:"4px 8px" }}/>
          <button onClick={()=>setPitches(p=>p+1)}
            style={{ width:44, height:44, borderRadius:"50%",
              background:"linear-gradient(135deg,#2563eb,#1d4ed8)", border:"none",
              color:"#fff", fontSize:18, fontWeight:700, cursor:"pointer",
              boxShadow:"0 2px 10px rgba(37,99,235,0.4)" }}>+</button>
        </div>
        <div style={{ display:"flex", gap:6, marginBottom:14 }}>
          {[-5,-1,1,5].map(d=>(
            <button key={d} onClick={()=>setPitches(p=>Math.max(0,p+d))}
              style={{ flex:1, padding:"7px 0", borderRadius:8,
                background: d>0 ? "rgba(37,99,235,0.15)" : "rgba(255,255,255,0.05)",
                border:`1px solid ${d>0?"rgba(37,99,235,0.3)":"rgba(255,255,255,0.1)"}`,
                color: d>0 ? "#60a5fa" : "rgba(255,255,255,0.6)", fontSize:12, fontWeight:700, cursor:"pointer" }}>
              {d>0?`+${d}`:d}
            </button>
          ))}
        </div>

        {/* Rest preview */}
        {pitches > 0 && (
          <div style={{ marginBottom:14, padding:"8px 12px", background:"rgba(255,255,255,0.03)",
            border:"1px solid rgba(255,255,255,0.07)", borderRadius:10,
            display:"flex", gap:16, justifyContent:"center" }}>
            {(() => {
              const rd = getRegRestDays(pitches);
              const eligDate = date ? getEligibleDate(date, pitches, getRegRestDays) : null;
              return (
                <>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:18, fontWeight:800, fontFamily:"'Bebas Neue',cursive",
                      color: rd===0?"#4ade80":rd===1?"#a3e635":rd===2?"#fb923c":"#f43f5e" }}>
                      {rd===0?"NONE":`${rd} DAY${rd!==1?"S":""}`}
                    </div>
                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.35)" }}>REST REQ.</div>
                  </div>
                  {eligDate && (
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:18, fontWeight:800, fontFamily:"'Bebas Neue',cursive", color:"rgba(255,255,255,0.7)" }}>
                        {formatDate(eligDate.toISOString())}
                      </div>
                      <div style={{ fontSize:9, color:"rgba(255,255,255,0.35)" }}>ELIGIBLE</div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Game type */}
        <ContextPicker context={context} setContext={setContext}
          tourneyDay={tourneyDay} setTourneyDay={setTourneyDay} tournaments={tournaments} gameDate={date}/>

        {/* Date */}
        <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>GAME DATE</label>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)}
          style={{ ...inputStyle, marginBottom:10 }}/>

        {/* Opponent */}
        <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>OPPONENT</label>
        <input placeholder="Team name (optional)" value={opponent} onChange={e=>setOpponent(e.target.value)}
          style={{ ...inputStyle, marginBottom:16 }}/>

        {/* Actions */}
        <div style={{ display:"flex", gap:8, marginBottom:10 }}>
          <button onClick={onClose} style={{ ...cancelBtn, flex:1 }}>Cancel</button>
          <button onClick={handleSave} disabled={pitches<1}
            style={{ ...primaryBtn, flex:2, opacity:pitches<1?0.4:1 }}>
            {I.check} Save Changes
          </button>
        </div>

        {/* Delete */}
        {!confirmDelete ? (
          <button onClick={()=>setConfirmDelete(true)}
            style={{ width:"100%", background:"transparent", border:"1px solid rgba(244,63,94,0.2)",
              borderRadius:12, padding:"10px", color:"rgba(244,63,94,0.6)", fontSize:13, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            {I.trash} Delete this game entry
          </button>
        ) : (
          <div style={{ background:"rgba(244,63,94,0.08)", border:"1px solid rgba(244,63,94,0.25)",
            borderRadius:12, padding:12 }}>
            <p style={{ margin:"0 0 10px", fontSize:13, color:"#f87171", fontWeight:600 }}>
              Delete this game entry for {pitcherName}?
            </p>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>setConfirmDelete(false)} style={{ ...cancelBtn, flex:1 }}>Keep it</button>
              <button onClick={onDelete}
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
