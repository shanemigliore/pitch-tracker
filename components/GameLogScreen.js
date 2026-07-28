// GameLogScreen — log a new game for multiple pitchers at once. Past games are
// browsed/edited from the Season tab now, not here - this screen is entry-only.
// Babel/JSX component, loaded via <script type="text/babel" src="components/GameLogScreen.js"></script>.

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: GAME LOG — enter a new game
// ══════════════════════════════════════════════════════════════════════════════
function GameLogScreen({ roster, onLogMultiple, tournaments }) {
  const [gameDate, setGameDate] = useState(todayStr());
  const [context, setContext] = useState("regular");
  const [tourneyDay, setTourneyDay] = useState(1);
  const [opponent, setOpponent] = useState("");
  const [opponentErr, setOpponentErr] = useState(false);
  const [entries, setEntries] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [saved, setSaved] = useState(false);
  const [warnViolations, setWarnViolations] = useState(false);
  const [missingCounts, setMissingCounts] = useState(false);

  const selectedTourney = tournaments.find(t=>t.id===context);

  // Opponents already played this season, most-recent first — lets a coach
  // tap a repeat opponent instead of retyping a name they've entered before.
  const recentOpponents = (()=>{
    const latest = new Map();
    roster.forEach(p => (p.history||[]).forEach(h => {
      if (!h.opponent) return;
      const prev = latest.get(h.opponent);
      if (!prev || h.date > prev) latest.set(h.opponent, h.date);
    }));
    return [...latest.entries()].sort((a,b)=>(b[1]||"").localeCompare(a[1]||"")).map(([name])=>name).slice(0,6);
  })();

  function setEntry(id, val) { setEntries(e=>({...e,[id]:val})); }
  function bumpEntry(id, delta) { setMissingCounts(false); setEntry(id, String(Math.max(0, getCount(id)+delta))); }
  function getCount(id) { const v=parseInt(entries[id]||"0",10); return isNaN(v)||v<0?0:v; }
  function toggleSelected(id) {
    setMissingCounts(false);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); setEntry(id, ""); }
      else next.add(id);
      return next;
    });
  }

  const pitcherLimit = getCurrentRules().maxPitches;
  const seasonTotal = p => (p.history||[]).reduce((s,g)=>s+(g.pitches||0),0);
  const sortedRoster = [...roster].sort((a,b)=>seasonTotal(b)-seasonTotal(a));

  // Rest-day rule violation (they weren't eligible to pitch as of this game) or
  // tournament pitch-limit violation (this count would push them over the
  // tournament's day1/total cap) - either is worth flagging before save, since
  // both mean "this game breaks a rule," which matters regardless of what their
  // status was walking in.
  function getViolation(p) {
    if (getAvailabilityStatus(p, null, tournaments) !== "available") {
      const eligStr = getEligibleDateStr(p, tournaments);
      return eligStr ? `Resting — eligible ${formatDate(eligStr)}` : "Resting";
    }
    if (context !== "regular" && selectedTourney) {
      const priorGames = (p.history||[]).filter(h=>h.tournamentId===context);
      const priorTotal = priorGames.reduce((s,g)=>s+g.pitches,0);
      const priorDay1 = priorGames.filter(g=>g.tourneyDay===1).reduce((s,g)=>s+g.pitches,0);
      const thisCount = getCount(p.id);
      const newTotal = priorTotal + thisCount;
      const newDay1 = tourneyDay===1 ? priorDay1 + thisCount : priorDay1;
      if (newTotal > selectedTourney.maxTotal) {
        return `Would exceed tournament total (${newTotal}/${selectedTourney.maxTotal}p)`;
      }
      if (selectedTourney.day1IsHardLimit && tourneyDay===1 && newDay1 > selectedTourney.maxDay1) {
        return `Would exceed Day 1 limit (${newDay1}/${selectedTourney.maxDay1}p)`;
      }
    }
    return null;
  }

  function handleSave(confirmed=false) {
    const toLog = roster.filter(p=>selectedIds.has(p.id));
    if (toLog.length===0) return;
    if (!opponent.trim()) { setOpponentErr(true); return; }
    setOpponentErr(false);
    if (toLog.some(p=>getCount(p.id)===0)) { setMissingCounts(true); return; }
    setMissingCounts(false);
    const violations = toLog.map(p=>({ p, reason:getViolation(p) })).filter(v=>v.reason);
    if (violations.length>0 && !confirmed) { setWarnViolations(true); return; }
    setWarnViolations(false);
    const sharedGameId = newId();
    toLog.forEach(p=>{
      onLogMultiple(p.id, {
        pitches: getCount(p.id),
        date: gameDate,
        opponent,
        isTournament: context!=="regular",
        tournamentId: context!=="regular"?context:null,
        tournamentName: context!=="regular"?selectedTourney?.name:null,
        tourneyDay: context!=="regular"?tourneyDay:null,
        gameId: sharedGameId + "_" + p.id,
        sharedGameId,
      });
    });
    setSaved(true);
  }

  function resetForm() {
    setSaved(false); setEntries({}); setSelectedIds(new Set()); setOpponent("");
  }

  const hasEntries = selectedIds.size > 0;
  const totalPitchers = selectedIds.size;

  return (
    <div style={{ padding:"0 16px 110px" }}>
      <div style={{ padding:"16px 0 14px" }}>
        <h2 style={{ margin:0, fontSize:24, fontWeight:800, color:"#f8fafc", fontFamily:"'Bebas Neue',cursive", letterSpacing:2 }}>GAME LOG</h2>
        <p style={{ margin:0, fontSize:12, color:"rgba(255,255,255,0.4)" }}>Record pitch counts for a game</p>
      </div>

      {saved ? (
        <div style={{ textAlign:"center", padding:"50px 20px", background:"rgba(74,222,128,0.07)",
          border:"1px solid rgba(74,222,128,0.25)", borderRadius:20, marginBottom:16 }}>
          <div style={{ fontSize:48, marginBottom:8 }}>✅</div>
          <div style={{ color:"#4ade80", fontSize:18, fontWeight:700 }}>Game Saved!</div>
          <div style={{ color:"rgba(255,255,255,0.4)", fontSize:13, marginTop:4, marginBottom:20 }}>{totalPitchers} pitcher{totalPitchers!==1?"s":""} logged</div>
          <button onClick={resetForm} style={{ ...primaryBtn, padding:"11px 22px", margin:"0 auto" }}>
            {I.plus} Log Another Game
          </button>
        </div>
      ) : (
        <>
          <div style={card}>
            <p style={sectionLabel}>GAME DETAILS</p>
            <ContextPicker context={context} setContext={setContext}
              tourneyDay={tourneyDay} setTourneyDay={setTourneyDay} tournaments={tournaments} gameDate={gameDate}/>
            <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>GAME DATE</label>
            <input type="date" value={gameDate} onChange={e=>setGameDate(e.target.value)} aria-label="Game date"
              style={{ ...inputStyle, marginBottom:10 }}/>
            <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>OPPONENT *</label>
            <input placeholder="Team name (required)" value={opponent} aria-label="Opponent"
              onChange={e=>{ setOpponent(e.target.value); if(e.target.value.trim()) setOpponentErr(false); }}
              style={{ ...inputStyle, border:opponentErr?"1px solid rgba(244,63,94,0.6)":inputStyle.border, marginBottom:opponentErr?4:0 }}/>
            {opponentErr && <div style={{ fontSize:11, color:"#f87171", marginTop:4 }}>Opponent is required</div>}
            {recentOpponents.length > 0 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:8 }}>
                {recentOpponents.map(name=>(
                  <button key={name} type="button" onClick={()=>{ setOpponent(name); setOpponentErr(false); }}
                    aria-label={`Set opponent to ${name}`}
                    style={{ padding:"5px 10px", borderRadius:14,
                      border:`1px solid ${opponent===name?"#38bdf8":"rgba(255,255,255,0.1)"}`,
                      background:opponent===name?"rgba(56,189,248,0.18)":"rgba(255,255,255,0.04)",
                      color:opponent===name?"#38bdf8":"rgba(255,255,255,0.6)", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={card}>
            <p style={sectionLabel}>WHO PITCHED?</p>
            <p style={{ margin:"0 0 12px", fontSize:12, color:"rgba(255,255,255,0.4)" }}>Tap everyone who threw in this game — a pitch count field appears right below their name.</p>
            {roster.length===0 ? (
              <div style={{ textAlign:"center", padding:"20px 0", color:"rgba(255,255,255,0.3)", fontSize:13 }}>No players on roster yet</div>
            ) : (
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:selectedIds.size>0?14:0 }}>
                {sortedRoster.filter(p=>!selectedIds.has(p.id)).map(p=>(
                  <button key={p.id} type="button" onClick={()=>toggleSelected(p.id)}
                    aria-pressed={false} aria-label={p.name}
                    style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:20,
                      border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)",
                      color:"rgba(255,255,255,0.7)", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                    {p.jersey?`#${p.jersey} `:""}{p.name}
                  </button>
                ))}
              </div>
            )}
            {sortedRoster.filter(p=>selectedIds.has(p.id)).map(p=>{
              const count = getCount(p.id);
              const overLimit = count > pitcherLimit;
              const atWarning = context==="regular" && count >= pitcherLimit-10 && count <= pitcherLimit;
              const rd = getRegRestDays(count);
              return (
                <div key={p.id} style={{ marginBottom:8, padding:"10px 12px", borderRadius:12,
                  background:"rgba(56,189,248,0.05)", border:"1px solid rgba(56,189,248,0.2)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                    <div style={{ width:34, height:34, borderRadius:9, background:"rgba(56,189,248,0.1)", border:"1px solid rgba(56,189,248,0.2)",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontFamily:"'Bebas Neue',cursive", fontSize:14, color:"#38bdf8", flexShrink:0 }}>
                      {p.jersey?`#${p.jersey}`:p.name[0]}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#f8fafc", lineHeight:1.2 }}>{p.name}</div>
                    </div>
                    {count>0 && (
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:10, fontWeight:700,
                          color:rd===0?"#4ade80":rd===1?"#a3e635":rd===2?"#fb923c":"#f43f5e" }}>
                          {rd===0?"No rest":`${rd}d rest`}
                        </div>
                        <div style={{ fontSize:9,
                          color:overLimit?"#f43f5e":atWarning?"#fb923c":"rgba(255,255,255,0.35)" }}>
                          {overLimit?`${count-pitcherLimit} over`:`${pitcherLimit-count} left`}
                        </div>
                      </div>
                    )}
                    <button type="button" onClick={()=>toggleSelected(p.id)}
                      aria-label={`Remove ${p.name} from this game`}
                      style={{ background:"none", border:"none", color:"rgba(255,255,255,0.3)", cursor:"pointer", padding:4, flexShrink:0 }}>
                      {I.xmark}
                    </button>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    {[-5,-1].map(d=>(
                      <button key={d} type="button" onClick={()=>bumpEntry(p.id,d)}
                        aria-label={`Subtract ${Math.abs(d)} pitch${Math.abs(d)!==1?"es":""} for ${p.name}`}
                        style={{ flex:1, padding:"7px 0", borderRadius:8, background:"rgba(255,255,255,0.05)",
                          border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.6)", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                        {d}
                      </button>
                    ))}
                    <input type="number" min="0" placeholder="0" aria-label={`${p.name} pitch count`}
                      value={entries[p.id]||""}
                      onChange={e=>{ setMissingCounts(false); setEntry(p.id,e.target.value); }}
                      style={{ ...inputStyle, width:56, flexShrink:0, textAlign:"center", fontSize:18, fontWeight:800,
                        fontFamily:"'Bebas Neue',cursive", padding:"4px 6px",
                        borderColor:overLimit?"rgba(244,63,94,0.5)":atWarning?"rgba(251,146,60,0.5)":"rgba(255,255,255,0.1)",
                        background:overLimit?"rgba(244,63,94,0.1)":atWarning?"rgba(251,146,60,0.08)":"rgba(255,255,255,0.05)" }}/>
                    {[1,5].map(d=>(
                      <button key={d} type="button" onClick={()=>bumpEntry(p.id,d)}
                        aria-label={`Add ${d} pitch${d!==1?"es":""} for ${p.name}`}
                        style={{ flex:1, padding:"7px 0", borderRadius:8, background:"rgba(37,99,235,0.15)",
                          border:"1px solid rgba(37,99,235,0.3)", color:"#60a5fa", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                        +{d}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {missingCounts && (
              <div style={{ fontSize:11, color:"#f87171", marginTop:4 }}>Enter a pitch count for everyone selected above (or tap ✕ to remove them).</div>
            )}
          </div>

          {warnViolations && (()=>{
            const toLog = roster.filter(p=>selectedIds.has(p.id));
            const violations = toLog.map(p=>({ p, reason:getViolation(p) })).filter(v=>v.reason);
            return (
              <div style={{ ...card, border:"1px solid rgba(251,146,60,0.4)", background:"rgba(251,146,60,0.07)", marginBottom:12 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                  {I.warning}
                  <span style={{ fontSize:14, fontWeight:700, color:"#fb923c" }}>
                    {violations.length} pitcher{violations.length!==1?"s":""} would violate a limit
                  </span>
                </div>
                {violations.map(({p,reason})=>(
                  <div key={p.id} style={{ fontSize:12, color:"rgba(255,255,255,0.65)", marginBottom:3 }}>
                    {p.jersey?`#${p.jersey} `:""}{p.name} — {reason}
                  </div>
                ))}
                <div style={{ display:"flex", gap:8, marginTop:12 }}>
                  <button onClick={()=>setWarnViolations(false)} style={{ ...cancelBtn, flex:1 }}>Go Back</button>
                  <button onClick={()=>handleSave(true)}
                    style={{ flex:2, background:"linear-gradient(135deg,#ea580c,#c2410c)", border:"none",
                      borderRadius:12, padding:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                    Save Anyway
                  </button>
                </div>
              </div>
            );
          })()}
          {!warnViolations && (()=>{
            const toLog = roster.filter(p=>selectedIds.has(p.id));
            const hasViolation = toLog.some(p=>getViolation(p));
            const btnBg = !hasEntries || !hasViolation
              ? "linear-gradient(135deg,#16a34a,#15803d)"
              : "linear-gradient(135deg,#ea580c,#c2410c)";
            const btnShadow = !hasEntries || !hasViolation
              ? "0 4px 20px rgba(22,163,74,0.4)"
              : "0 4px 20px rgba(234,88,12,0.4)";
            return (
              <button onClick={()=>handleSave(false)} disabled={!hasEntries}
                style={{ ...primaryBtn, width:"100%", padding:14, opacity:hasEntries?1:0.4,
                  background:hasEntries?btnBg:undefined, boxShadow:hasEntries?btnShadow:undefined }}>
                {I.check} Save Game — {totalPitchers} pitcher{totalPitchers!==1?"s":""}
              </button>
            );
          })()}
        </>
      )}
    </div>
  );
}
