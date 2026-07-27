// GameLogScreen — log a game for multiple pitchers at once.
// Babel/JSX component, loaded via <script type="text/babel" src="components/GameLogScreen.js"></script>.

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: GAME LOG — enter entire game at once, with edit mode
// ══════════════════════════════════════════════════════════════════════════════
function GameLogScreen({ roster, onLogMultiple, tournaments, onEditGame, onDeleteGame }) {
  const [mode, setMode] = useState("new"); // "new" | "edit"
  const [gameDate, setGameDate] = useState(todayStr());
  const [context, setContext] = useState("regular");
  const [tourneyDay, setTourneyDay] = useState(1);
  const [opponent, setOpponent] = useState("");
  const [opponentErr, setOpponentErr] = useState(false);
  const [entries, setEntries] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [saved, setSaved] = useState(false);
  const [warnIneligible, setWarnIneligible] = useState(false);
  const [missingCounts, setMissingCounts] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null); // { pitcher, entry }
  const [editPitcher, setEditPitcher] = useState(null);

  const selectedTourney = tournaments.find(t=>t.id===context);

  function setEntry(id, val) { setEntries(e=>({...e,[id]:val})); }
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

  function handleSave(confirmed=false) {
    const toLog = roster.filter(p=>selectedIds.has(p.id));
    if (toLog.length===0) return;
    if (!opponent.trim()) { setOpponentErr(true); return; }
    setOpponentErr(false);
    if (toLog.some(p=>getCount(p.id)===0)) { setMissingCounts(true); return; }
    setMissingCounts(false);
    const ineligToLog = toLog.filter(p=>getAvailabilityStatus(p,null,tournaments)!=="available");
    if (ineligToLog.length>0 && !confirmed) { setWarnIneligible(true); return; }
    setWarnIneligible(false);
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
    setTimeout(()=>{ setSaved(false); setEntries({}); setSelectedIds(new Set()); setOpponent(""); }, 2200);
  }

  const hasEntries = selectedIds.size > 0;
  const totalPitchers = selectedIds.size;

  // Gather all historical games with their pitchers for the edit tab
  const allGameDates = [...new Set(
    roster.flatMap(p=>(p.history||[]).map(h=>h.date))
  )].sort().reverse();

  // Group history entries by date+opponent
  const gameGroups = allGameDates.slice(0,50).map(date=>{
    const pitchers = roster.flatMap(p=>
      (p.history||[]).filter(h=>h.date===date).map(h=>({...h, pitcherName:p.name, pitcherId:p.id, jersey:p.jersey}))
    );
    const opponent = pitchers[0]?.opponent || "";
    const isTournament = pitchers[0]?.isTournament || false;
    const tournamentName = pitchers[0]?.tournamentName || "";
    const tourneyDay = pitchers[0]?.tourneyDay;
    return { date, opponent, pitchers, isTournament, tournamentName, tourneyDay };
  }).filter(g=>g.pitchers.length>0);

  return (
    <div style={{ padding:"0 16px 110px" }}>
      {editingEntry && (
        <EditGameModal
          entry={editingEntry.entry}
          pitcherName={editingEntry.pitcher.pitcherName||editingEntry.pitcher.name}
          roster={roster}
          tournaments={tournaments}
          onSave={updated=>{ onEditGame(editingEntry.pitcher.pitcherId||editingEntry.pitcher.id, updated.gameId, updated); setEditingEntry(null); }}
          onDelete={()=>{ onDeleteGame(editingEntry.pitcher.pitcherId||editingEntry.pitcher.id, editingEntry.entry.gameId); setEditingEntry(null); }}
          onClose={()=>setEditingEntry(null)}/>
      )}

      <div style={{ padding:"16px 0 14px" }}>
        <h2 style={{ margin:0, fontSize:24, fontWeight:800, color:"#f8fafc", fontFamily:"'Bebas Neue',cursive", letterSpacing:2 }}>GAME LOG</h2>
        <p style={{ margin:0, fontSize:12, color:"rgba(255,255,255,0.4)" }}>Record or edit pitch counts for any game</p>
      </div>

      {/* Mode toggle */}
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        {[["new","+ New Game"],["edit","✏ Edit Past Games"]].map(([m,label])=>(
          <button key={m} onClick={()=>setMode(m)} aria-pressed={mode===m}
            style={{ flex:1, padding:"10px", borderRadius:12,
              border:`1px solid ${mode===m?"#38bdf8":"rgba(255,255,255,0.1)"}`,
              background:mode===m?"rgba(56,189,248,0.15)":"rgba(255,255,255,0.04)",
              color:mode===m?"#38bdf8":"rgba(255,255,255,0.5)", fontSize:13, fontWeight:700, cursor:"pointer" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── NEW GAME MODE ── */}
      {mode==="new" && (
        saved ? (
          <div style={{ textAlign:"center", padding:"50px 20px", background:"rgba(74,222,128,0.07)",
            border:"1px solid rgba(74,222,128,0.25)", borderRadius:20, marginBottom:16 }}>
            <div style={{ fontSize:48, marginBottom:8 }}>✅</div>
            <div style={{ color:"#4ade80", fontSize:18, fontWeight:700 }}>Game Saved!</div>
            <div style={{ color:"rgba(255,255,255,0.4)", fontSize:13, marginTop:4 }}>{totalPitchers} pitcher{totalPitchers!==1?"s":""} logged</div>
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
            </div>

            <div style={card}>
              <p style={sectionLabel}>WHO PITCHED?</p>
              <p style={{ margin:"0 0 12px", fontSize:12, color:"rgba(255,255,255,0.4)" }}>Tap everyone who threw in this game.</p>
              {roster.length===0 ? (
                <div style={{ textAlign:"center", padding:"20px 0", color:"rgba(255,255,255,0.3)", fontSize:13 }}>No players on roster yet</div>
              ) : (
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {sortedRoster.map(p=>{
                    const status = getAvailabilityStatus(p, null, tournaments);
                    const s = STATUS[status];
                    const selected = selectedIds.has(p.id);
                    return (
                      <button key={p.id} type="button" onClick={()=>toggleSelected(p.id)}
                        aria-pressed={selected} aria-label={`${p.name}${selected ? ", selected" : ""}`}
                        style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:20,
                          border:`1px solid ${selected?"#38bdf8":s.ring}`,
                          background:selected?"rgba(56,189,248,0.18)":s.bg,
                          color:selected?"#38bdf8":s.color, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                        {selected && I.check}
                        {p.jersey?`#${p.jersey} `:""}{p.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedIds.size > 0 && (
              <div style={card}>
                <p style={sectionLabel}>PITCH COUNTS</p>
                <p style={{ margin:"0 0 12px", fontSize:12, color:"rgba(255,255,255,0.4)" }}>Enter each pitcher's pitch count for this game.</p>
                {sortedRoster.filter(p=>selectedIds.has(p.id)).map(p=>{
                  const status = getAvailabilityStatus(p, null, tournaments);
                  const s = STATUS[status];
                  const count = getCount(p.id);
                  const overLimit = count > pitcherLimit;
                  const atWarning = context==="regular" && count >= pitcherLimit-10 && count <= pitcherLimit;
                  const rd = getRegRestDays(count);
                  return (
                    <div key={p.id} style={{ marginBottom:6, padding:"8px 12px", borderRadius:12,
                      background:status!=="available"?s.bg:"rgba(255,255,255,0.02)",
                      border:`1px solid ${status!=="available"?s.ring:"rgba(255,255,255,0.07)"}` }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ width:34, height:34, borderRadius:9, background:s.bg, border:`1px solid ${s.ring}`,
                          display:"flex", alignItems:"center", justifyContent:"center",
                          fontFamily:"'Bebas Neue',cursive", fontSize:14, color:s.color, flexShrink:0 }}>
                          {p.jersey?`#${p.jersey}`:p.name[0]}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:"#f8fafc", lineHeight:1.2 }}>{p.name}</div>
                          {status!=="available" ? (
                            <div style={{ fontSize:10, color:s.color, fontWeight:600 }}>
                              {`Eligible ${formatDate(getEligibleDateStr(p, tournaments))}`}
                            </div>
                          ) : (
                            <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)" }}>
                              {p.lastPitches>0?`Last: ${p.lastPitches}p`:"No games"}
                            </div>
                          )}
                        </div>
                        <input type="number" min="0" placeholder="0" aria-label={`${p.name} pitch count`}
                          value={entries[p.id]||""}
                          onChange={e=>{ setMissingCounts(false); setEntry(p.id,e.target.value); }}
                          style={{ ...inputStyle, width:60, flexShrink:0, textAlign:"center", fontSize:18, fontWeight:800,
                            fontFamily:"'Bebas Neue',cursive", padding:"4px 6px",
                            borderColor:overLimit?"rgba(244,63,94,0.5)":atWarning?"rgba(251,146,60,0.5)":"rgba(255,255,255,0.1)",
                            background:overLimit?"rgba(244,63,94,0.1)":atWarning?"rgba(251,146,60,0.08)":"rgba(255,255,255,0.05)" }}/>
                        <div style={{ width:82, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"flex-end" }}>
                          {count>0 ? (
                            <div style={{ textAlign:"right" }}>
                              <div style={{ fontSize:10, fontWeight:700,
                                color:rd===0?"#4ade80":rd===1?"#a3e635":rd===2?"#fb923c":"#f43f5e" }}>
                                {rd===0?"No rest":`${rd}d rest`}
                              </div>
                              <div style={{ fontSize:9,
                                color:overLimit?(context==="regular"?"#f43f5e":"#fb923c"):atWarning?"#fb923c":"rgba(255,255,255,0.35)" }}>
                                {overLimit?(context==="regular"?`${count-pitcherLimit} over`:`${count-pitcherLimit} over`):`${pitcherLimit-count} left`}
                              </div>
                            </div>
                          ) : (
                            <button type="button" onClick={()=>toggleSelected(p.id)}
                              aria-label={`Remove ${p.name} from this game`}
                              style={{ background:"none", border:"none", color:"rgba(255,255,255,0.3)", cursor:"pointer", padding:4 }}>
                              {I.xmark}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {missingCounts && (
                  <div style={{ fontSize:11, color:"#f87171", marginTop:4 }}>Enter a pitch count for everyone selected above (or tap ✕ to remove them).</div>
                )}
              </div>
            )}

            {warnIneligible && (()=>{
              const toLog = roster.filter(p=>selectedIds.has(p.id));
              const inelig = toLog.filter(p=>getAvailabilityStatus(p,null,tournaments)!=="available");
              return (
                <div style={{ ...card, border:"1px solid rgba(251,146,60,0.4)", background:"rgba(251,146,60,0.07)", marginBottom:12 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                    {I.warning}
                    <span style={{ fontSize:14, fontWeight:700, color:"#fb923c" }}>
                      {inelig.length} ineligible pitcher{inelig.length!==1?"s":""} in this game
                    </span>
                  </div>
                  {inelig.map(p=>(
                    <div key={p.id} style={{ fontSize:12, color:"rgba(255,255,255,0.65)", marginBottom:3 }}>
                      {p.jersey?`#${p.jersey} `:""}{p.name} — eligible {formatDate(getEligibleDateStr(p,tournaments))}
                    </div>
                  ))}
                  <div style={{ display:"flex", gap:8, marginTop:12 }}>
                    <button onClick={()=>setWarnIneligible(false)} style={{ ...cancelBtn, flex:1 }}>Go Back</button>
                    <button onClick={()=>handleSave(true)}
                      style={{ flex:2, background:"linear-gradient(135deg,#ea580c,#c2410c)", border:"none",
                        borderRadius:12, padding:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                      Save Anyway
                    </button>
                  </div>
                </div>
              );
            })()}
            {!warnIneligible && (()=>{
              const toLog = roster.filter(p=>selectedIds.has(p.id));
              const inelig = toLog.filter(p=>getAvailabilityStatus(p,null,tournaments)!=="available");
              const maxRest = inelig.reduce((m,p)=>Math.max(m,daysUntilEligible(p,null,tournaments)),0);
              const btnBg = !hasEntries || inelig.length===0
                ? "linear-gradient(135deg,#16a34a,#15803d)"
                : maxRest>=3 ? "linear-gradient(135deg,#dc2626,#b91c1c)"
                : maxRest>=2 ? "linear-gradient(135deg,#ea580c,#c2410c)"
                : "linear-gradient(135deg,#d97706,#b45309)";
              const btnShadow = !hasEntries || inelig.length===0
                ? "0 4px 20px rgba(22,163,74,0.4)"
                : maxRest>=3 ? "0 4px 20px rgba(220,38,38,0.4)"
                : maxRest>=2 ? "0 4px 20px rgba(234,88,12,0.4)"
                : "0 4px 20px rgba(217,119,6,0.4)";
              return (
                <button onClick={()=>handleSave(false)} disabled={!hasEntries}
                  style={{ ...primaryBtn, width:"100%", padding:14, opacity:hasEntries?1:0.4,
                    background:hasEntries?btnBg:undefined, boxShadow:hasEntries?btnShadow:undefined }}>
                  {I.check} Save Game — {totalPitchers} pitcher{totalPitchers!==1?"s":""}
                </button>
              );
            })()}
          </>
        )
      )}

      {/* ── EDIT PAST GAMES MODE ── */}
      {mode==="edit" && (
        gameGroups.length===0 ? (
          <div style={{ textAlign:"center", padding:"40px 20px", color:"rgba(255,255,255,0.3)" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
            <p style={{ fontSize:14 }}>No games logged yet</p>
            <button onClick={()=>setMode("new")}
              style={{ ...primaryBtn, marginTop:8, background:"linear-gradient(135deg,#16a34a,#15803d)",
                boxShadow:"0 4px 16px rgba(22,163,74,0.35)" }}>
              + Log Your First Game
            </button>
          </div>
        ) : gameGroups.map((g,gi)=>(
          <div key={g.date+"_"+gi} style={card}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:"#f8fafc" }}>
                  {formatDate(g.date)}
                  {g.opponent && <span style={{ fontWeight:400, color:"rgba(255,255,255,0.5)" }}> · vs {g.opponent}</span>}
                </div>
                {g.isTournament && (
                  <span style={{ fontSize:10, padding:"2px 7px", background:"rgba(245,158,11,0.15)",
                    border:"1px solid rgba(245,158,11,0.3)", borderRadius:6, color:"#f59e0b", fontWeight:700 }}>
                    🏆 {g.tournamentName||"TOURNAMENT"}{g.tourneyDay?` · DAY ${g.tourneyDay}`:""}
                  </span>
                )}
              </div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.4)" }}>
                {g.pitchers.reduce((s,p)=>s+p.pitches,0)}p total
              </div>
            </div>
            {g.pitchers.map((p,pi)=>{
              const rd = getRegRestDays(p.pitches);
              return (
                <div key={p.gameId||pi} onClick={()=>setEditingEntry({ pitcher:p, entry:p })}
                  style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                    padding:"9px 10px", borderRadius:9, marginBottom:4, cursor:"pointer",
                    background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)" }}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}
                  onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.02)"}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:30, height:30, borderRadius:8,
                      background:"rgba(56,189,248,0.1)", border:"1px solid rgba(56,189,248,0.2)",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontFamily:"'Bebas Neue',cursive", fontSize:12, color:"#38bdf8", flexShrink:0 }}>
                      {p.jersey?`#${p.jersey}`:p.pitcherName[0]}
                    </div>
                    <span style={{ fontSize:13, fontWeight:600, color:"rgba(255,255,255,0.85)" }}>{p.pitcherName}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:15, fontWeight:800, color:"#f8fafc", fontFamily:"'Bebas Neue',cursive" }}>{p.pitches}p</span>
                    <span style={{ fontSize:11, fontWeight:600, color:rd===0?"#4ade80":rd<=1?"#a3e635":rd<=2?"#fb923c":"#f43f5e" }}>
                      {rd===0?"No rest":`${rd}d`}
                    </span>
                    <div style={{ color:"rgba(255,255,255,0.3)" }}>{I.edit}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
