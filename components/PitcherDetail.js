// PitcherDetail — pitcher stats, season history, log single game (Roster drill-in).
// Babel/JSX component, loaded via <script type="text/babel" src="components/PitcherDetail.js"></script>.

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: PITCHER DETAIL
// ══════════════════════════════════════════════════════════════════════════════
function PitcherDetail({ pitcher, onBack, onLog, onDelete, tournaments, onEditGame, onDeleteGame, onEditPlayer }) {
  const [logOpen, setLogOpen] = useState(false);
  const [pitches, setPitches] = useState(0);
  const [gameDate, setGameDate] = useState(todayStr());
  const [context, setContext] = useState("regular");
  const [tourneyDay, setTourneyDay] = useState(1);
  const [opponent, setOpponent] = useState("");
  const [opponentErr, setOpponentErr] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(pitcher.name);
  const [editJersey, setEditJersey] = useState(pitcher.jersey||"");
  const [editJerseyErr, setEditJerseyErr] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  function validateJersey(val) {
    if (!val) return "";
    if (!/^\d{1,2}$/.test(val)) return "Must be a number 0–99";
    return "";
  }

  const status = getAvailabilityStatus(pitcher, null, tournaments);
  const s = STATUS[status];
  const restInfo = getTourneyAdjustedRestInfo(pitcher, tournaments);
  const eligible = restInfo.eligibleDate;
  const daysLeft = daysUntilEligible(pitcher, null, tournaments);
  const restRemaining = restInfo.isTourney
    ? daysLeft
    : daysLeft - (pitcher.lastGameDate === todayStr() ? 1 : 0);
  const selectedTourney = tournaments.find(t=>t.id===context);
  const seasons = [...new Set((pitcher.history||[]).map(h=>(h.date||'').slice(0,4)).filter(Boolean))].sort().reverse();

  function handleLog() {
    if (pitches < 1) return;
    if (!opponent.trim()) { setOpponentErr(true); return; }
    setOpponentErr(false);
    onLog(pitcher.id, {
      pitches, date:gameDate, opponent,
      isTournament: context!=="regular",
      tournamentId: context!=="regular" ? context : null,
      tournamentName: context!=="regular" ? selectedTourney?.name : null,
      tourneyDay: context!=="regular" ? tourneyDay : null,
    });
    setSaved(true);
    setTimeout(()=>{ setSaved(false); setLogOpen(false); setPitches(0); setOpponent(""); }, 1800);
  }

  const seasonStats = seasons.map(yr => {
    const games = (pitcher.history||[]).filter(h=>h.date.startsWith(yr));
    return { yr, games:games.length, total:games.reduce((s,g)=>s+g.pitches,0),
      avg:games.length?Math.round(games.reduce((s,g)=>s+g.pitches,0)/games.length):0,
      high:games.reduce((m,g)=>Math.max(m,g.pitches),0) };
  });

  return (
    <div style={{ padding:"0 16px 110px" }}>
      {editingEntry && (
        <EditGameModal
          entry={editingEntry}
          pitcherName={pitcher.name}
          roster={[pitcher]}
          tournaments={tournaments}
          onSave={updated=>{ onEditGame(pitcher.id, updated.gameId, updated); setEditingEntry(null); }}
          onDelete={()=>{ onDeleteGame(pitcher.id, editingEntry.gameId); setEditingEntry(null); }}
          onClose={()=>setEditingEntry(null)}/>
      )}

      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 0 16px" }}>
        <button onClick={onBack} style={{ background:"rgba(255,255,255,0.07)", border:"none", borderRadius:10,
          padding:10, color:"rgba(255,255,255,0.7)", cursor:"pointer", display:"flex" }}>{I.back}</button>
        <div style={{ flex:1 }}>
          <h2 style={{ margin:0, fontSize:22, fontWeight:800, color:"#f8fafc", fontFamily:"'Bebas Neue',cursive", letterSpacing:1.5 }}>
            {pitcher.jersey?`#${pitcher.jersey} · `:""}{pitcher.name.toUpperCase()}
          </h2>
        </div>
        <button onClick={()=>{ setEditName(pitcher.name); setEditJersey(pitcher.jersey||""); setEditOpen(o=>!o); }}
          style={{ background:editOpen?"rgba(56,189,248,0.15)":"rgba(255,255,255,0.07)",
            border:`1px solid ${editOpen?"rgba(56,189,248,0.4)":"rgba(255,255,255,0.1)"}`,
            borderRadius:10, padding:10, color:editOpen?"#38bdf8":"rgba(255,255,255,0.5)",
            cursor:"pointer", display:"flex" }}>{I.edit}</button>
        <Chip status={status} size="lg"/>
      </div>

      {/* Edit player details */}
      {editOpen && (
        <div style={{ ...card, border:"1px solid rgba(56,189,248,0.25)", marginBottom:12 }}>
          <p style={sectionLabel}>EDIT PLAYER</p>
          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>NAME</label>
          <input value={editName} onChange={e=>setEditName(e.target.value)}
            style={{ ...inputStyle, marginBottom:10 }}/>
          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>JERSEY #</label>
          <input placeholder="e.g. 07 (optional)" value={editJersey}
            onChange={e=>{ const v=e.target.value.replace(/\D/g,"").slice(0,2); setEditJersey(v); setEditJerseyErr(v?validateJersey(v):""); }}
            style={{ ...inputStyle, width:120, textAlign:"center", marginBottom:editJerseyErr?4:12,
              border:editJerseyErr?"1px solid rgba(244,63,94,0.6)":inputStyle.border }}/>
          {editJerseyErr && <div style={{ fontSize:11, color:"#f87171", marginBottom:8 }}>{editJerseyErr}</div>}
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>{ setEditOpen(false); setEditJerseyErr(""); }} style={cancelBtn}>Cancel</button>
            <button onClick={()=>{
              if (!editName.trim()) return;
              const err = validateJersey(editJersey);
              if (err) { setEditJerseyErr(err); return; }
              onEditPlayer(pitcher.id, { name:editName.trim(), jersey:editJersey.trim() });
              setEditOpen(false); setEditJerseyErr("");
            }} style={{ ...primaryBtn, flex:2 }}>
              {I.check} Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Status hero */}
      <div style={{ background:`radial-gradient(circle at 30% 40%,${s.bg},rgba(0,0,0,0.2))`,
        border:`1px solid ${s.ring}`, borderRadius:20, padding:20, marginBottom:12,
        display:"flex", alignItems:"center", gap:16 }}>
        <div style={{ position:"relative", flexShrink:0 }}>
          <RadialArc value={pitcher.lastPitches} max={getCurrentRules().maxPitches} size={100} strokeW={8} color={s.color}/>
          <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", textAlign:"center" }}>
            <div style={{ fontSize:26, fontWeight:900, color:"#f8fafc", fontFamily:"'Bebas Neue',cursive", lineHeight:1 }}>{pitcher.lastPitches}</div>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)" }}>/{getCurrentRules().maxPitches}</div>
          </div>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:15, fontWeight:700, color:s.color, marginBottom:3 }}>
            {status==="available" ? "✅ Available to pitch" : `⏳ ${restRemaining} day${restRemaining!==1?"s":""} rest remaining`}
          </div>
          {eligible && <div style={{ fontSize:13, color:"rgba(255,255,255,0.5)" }}>
            Eligible: <strong style={{ color:"rgba(255,255,255,0.85)" }}>{formatDate(eligible.toISOString())}</strong>
          </div>}
          {pitcher.lastGameDate && <div style={{ fontSize:12, color:"rgba(255,255,255,0.35)", marginTop:2 }}>
            Last: {formatDate(pitcher.lastGameDate)} · {pitcher.lastPitches}p
          </div>}
        </div>
      </div>

      {/* Log new pitches */}
      {saved ? (
        <div style={{ padding:20, textAlign:"center", background:"rgba(74,222,128,0.08)",
          border:"1px solid rgba(74,222,128,0.25)", borderRadius:16, marginBottom:12 }}>
          <div style={{ fontSize:32 }}>✅</div>
          <div style={{ color:"#4ade80", fontWeight:700, marginTop:6 }}>Pitches logged!</div>
        </div>
      ) : !logOpen ? (
        <button onClick={()=>setLogOpen(true)} style={{ ...primaryBtn, width:"100%", marginBottom:12, padding:14 }}>
          + Log Game Pitches
        </button>
      ) : (
        <div style={{ ...card, border:"1px solid rgba(255,255,255,0.12)" }}>
          <p style={sectionLabel}>LOG PITCHES</p>
          <PitcherStatusBanner pitcher={pitcher} tournaments={tournaments}/>
          <ContextPicker context={context} setContext={setContext}
            tourneyDay={tourneyDay} setTourneyDay={setTourneyDay} tournaments={tournaments} gameDate={gameDate}/>
          <div style={{ textAlign:"center", marginBottom:12 }}>
            <div style={{ position:"relative", display:"inline-block" }}>
              <RadialArc value={pitches} max={getCurrentRules().maxPitches} size={120} strokeW={9} color="#38bdf8"/>
              <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", textAlign:"center" }}>
                <div style={{ fontSize:36, fontWeight:900, lineHeight:1, fontFamily:"'Bebas Neue',cursive",
                  color:pitches>getCurrentRules().maxPitches?"#f43f5e":"#f8fafc" }}>{pitches}</div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)" }}>pitches</div>
              </div>
            </div>
          </div>
          <div style={{ display:"flex", justifyContent:"center", gap:8, marginBottom:10 }}>
            {[-5,-1].map(d=>(
              <button key={d} onClick={()=>setPitches(p=>Math.max(0,p+d))}
                style={{ width:50, height:50, borderRadius:"50%", background:"rgba(255,255,255,0.07)",
                  border:"1px solid rgba(255,255,255,0.12)", color:"rgba(255,255,255,0.8)", fontSize:14, fontWeight:700, cursor:"pointer" }}>{d}</button>
            ))}
            {[1,5].map(d=>(
              <button key={d} onClick={()=>setPitches(p=>p+d)}
                style={{ width:50, height:50, borderRadius:"50%",
                  background:"linear-gradient(135deg,#2563eb,#1d4ed8)", border:"none", color:"#fff", fontSize:14, fontWeight:800, cursor:"pointer",
                  boxShadow:"0 3px 12px rgba(37,99,235,0.4)" }}>+{d}</button>
            ))}
          </div>
          <input type="number" min="0" placeholder="Or type exact count…"
            value={pitches===0?"":String(pitches)}
            onChange={e=>{ const v=parseInt(e.target.value,10); setPitches(isNaN(v)||v<0?0:v); }}
            style={{ ...inputStyle, fontSize:18, fontWeight:800, fontFamily:"'Bebas Neue',cursive", textAlign:"center", marginBottom:10 }}/>
          <input placeholder="Opponent *" value={opponent}
            onChange={e=>{ setOpponent(e.target.value); if(e.target.value.trim()) setOpponentErr(false); }}
            style={{ ...inputStyle, marginBottom:opponentErr?4:10, border:opponentErr?"1px solid rgba(244,63,94,0.6)":inputStyle.border }}/>
          {opponentErr && <div style={{ fontSize:11, color:"#f87171", marginBottom:8 }}>Opponent is required</div>}
          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>GAME DATE</label>
          <input type="date" value={gameDate} onChange={e=>setGameDate(e.target.value)}
            style={{ ...inputStyle, marginBottom:12 }}/>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>{setLogOpen(false);setPitches(0);}} style={cancelBtn}>Cancel</button>
            <button onClick={handleLog} disabled={pitches<1}
              style={{ ...primaryBtn, flex:2, opacity:pitches<1?0.4:1 }}>Save {pitches>0?`${pitches}p`:""}</button>
          </div>
        </div>
      )}

      {/* Season Stats */}
      {seasonStats.filter(s=>s.games>0).length > 0 && (
        <div style={card}>
          <p style={sectionLabel}>SEASON STATS</p>
          {seasonStats.map(st=>(
            <div key={st.yr} style={{ marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:14, fontWeight:700, color:"rgba(255,255,255,0.8)" }}>{st.yr}</span>
                <span style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}>{st.games} games</span>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                {[["Total",`${st.total}p`],["Avg",`${st.avg}p`],["High",`${st.high}p`]].map(([l,v])=>(
                  <div key={l} style={{ flex:1, textAlign:"center", padding:"8px 4px", background:"rgba(255,255,255,0.04)", borderRadius:10 }}>
                    <div style={{ fontSize:16, fontWeight:800, color:"#38bdf8", fontFamily:"'Bebas Neue',cursive" }}>{v}</div>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)" }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History — editable */}
      {pitcher.history?.length > 0 && (
        <div style={card}>
          <p style={sectionLabel}>GAME HISTORY</p>
          {[...pitcher.history].sort((a,b)=>b.date<a.date?-1:1).map((h,i)=>{
            const rd = getRegRestDays(h.pitches);
            return (
              <div key={h.gameId||i}
                style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                  padding:"10px 10px", borderRadius:10, marginBottom:4,
                  background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)" }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:14, fontWeight:700, color:"#f8fafc" }}>{h.pitches}p</span>
                    {h.isTournament && <span style={{ fontSize:9, padding:"2px 6px", background:"rgba(245,158,11,0.15)",
                      border:"1px solid rgba(245,158,11,0.3)", borderRadius:6, color:"#f59e0b", fontWeight:700 }}>
                      {h.tournamentName||"TOURNEY"}{h.tourneyDay?` D${h.tourneyDay}`:""}
                    </span>}
                  </div>
                  <div style={{ fontSize:12, color:"rgba(255,255,255,0.35)" }}>
                    {formatDate(h.date)}{h.opponent?` · vs ${h.opponent}`:""}
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:rd===0?"#4ade80":rd<=1?"#a3e635":rd<=2?"#fb923c":"#f43f5e" }}>
                    {rd===0?"No rest":`${rd}d rest`}
                  </span>
                  <button onClick={()=>setEditingEntry(h)}
                    style={{ background:"rgba(56,189,248,0.08)", border:"1px solid rgba(56,189,248,0.2)",
                      borderRadius:7, padding:"5px 9px", color:"#38bdf8", fontSize:11, fontWeight:700,
                      cursor:"pointer", display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
                    {I.edit} Edit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!confirmRemove ? (
        <button onClick={()=>setConfirmRemove(true)} style={{ width:"100%", background:"transparent",
          border:"1px solid rgba(244,63,94,0.2)", borderRadius:14, padding:12, color:"rgba(244,63,94,0.6)",
          fontSize:14, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
          {I.trash} Remove from Roster
        </button>
      ) : (
        <div style={{ background:"rgba(244,63,94,0.08)", border:"1px solid rgba(244,63,94,0.25)",
          borderRadius:14, padding:14 }}>
          <p style={{ margin:"0 0 10px", fontSize:13, color:"#f87171", fontWeight:600, textAlign:"center" }}>
            Remove {pitcher.name} from the roster? This will delete all their pitch history.
          </p>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>setConfirmRemove(false)} style={{ ...cancelBtn, flex:1 }}>Keep Player</button>
            <button onClick={()=>onDelete(pitcher.id)}
              style={{ flex:2, background:"linear-gradient(135deg,#dc2626,#b91c1c)", border:"none",
                borderRadius:12, padding:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
              Yes, Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
