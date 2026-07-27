// EligibilityScreen — grid of pitcher availability for a chosen date.
// Babel/JSX component, loaded via <script type="text/babel" src="components/EligibilityScreen.js"></script>.

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: ELIGIBILITY CHECKER
// ══════════════════════════════════════════════════════════════════════════════
function EligibilityScreen({ roster, tournaments }) {
  const [checkDate, setCheckDate] = useState(todayStr());
  const [viewMode, setViewMode] = useState(() => {
    const active = getActiveTourney(tournaments, todayStr());
    return active ? active.id : "regular";
  });
  const selectedTourney = tournaments.find(t=>t.id===viewMode);

  function getPitcherTourneyStats(pitcher, tourneyId) {
    const games = (pitcher.history||[]).filter(h=>h.tournamentId===tourneyId);
    const total = games.reduce((s,g)=>s+g.pitches,0);
    const day1 = games.filter(g=>g.tourneyDay===1).reduce((s,g)=>s+g.pitches,0);
    return { total, day1, games };
  }

  function getTourneyEligibility(pitcher, tourney) {
    if (!tourney) return { eligible:true, reason:"" };
    const stats = getPitcherTourneyStats(pitcher, tourney.id);

    // Exceeded tournament total → ineligible for rest of tournament
    if (stats.total >= tourney.maxTotal) return { eligible:false, reason:`Reached tournament total (${stats.total}/${tourney.maxTotal}p)` };

    // Exceeded Day 1 hard limit → ineligible for rest of tournament (only when configured as hard limit)
    if (tourney.day1IsHardLimit && stats.day1 > tourney.maxDay1) return { eligible:false, reason:`Exceeded Day 1 limit (${stats.day1}/${tourney.maxDay1}p)` };

    const remaining = tourney.maxTotal - stats.total;
    return { eligible:true, reason:`${remaining}p remaining in tournament` };
  }

  const totalPitches = p => (p.history || []).reduce((s, g) => s + (g.pitches || 0), 0);
  const allPitchers = [...roster]
    .sort((a, b) => totalPitches(b) - totalPitches(a))
    .map(p => {
      if (viewMode==="regular") {
        const status = getAvailabilityStatus(p, checkDate, tournaments);
        return { ...p, eligible: status==="available", status };
      } else {
        const { eligible, reason } = getTourneyEligibility(p, selectedTourney);
        return { ...p, eligible, status:eligible?"available":"resting", tourneyReason:reason };
      }
    });

  const eligibleList = allPitchers.filter(p=>p.eligible);
  const ineligibleList = allPitchers.filter(p=>!p.eligible);
  const isToday = checkDate===todayStr();
  const isTomorrow = checkDate===addDays(todayStr(),1);
  const displayLabel = isToday?"Today":isTomorrow?"Tomorrow":formatDate(checkDate);

  return (
    <div style={{ padding:"0 16px 110px" }}>
      <div style={{ padding:"16px 0 14px" }}>
        <h2 style={{ margin:0, fontSize:24, fontWeight:800, color:"#f8fafc", fontFamily:"'Bebas Neue',cursive", letterSpacing:2 }}>ELIGIBILITY</h2>
        <p style={{ margin:0, fontSize:12, color:"rgba(255,255,255,0.4)" }}>Check who can pitch on any date</p>
      </div>

      <div style={card}>
        <p style={sectionLabel}>CHECK DATE</p>
        <div style={{ display:"flex", gap:8, marginBottom:10 }}>
          {[[todayStr(),"Today"],[addDays(todayStr(),1),"Tomorrow"],[addDays(todayStr(),2),"In 2 Days"]].map(([d,label])=>(
            <button key={d} onClick={()=>setCheckDate(d)} aria-pressed={checkDate===d}
              style={{ flex:1, padding:"8px 6px", borderRadius:10,
                border:`1px solid ${checkDate===d?"#38bdf8":"rgba(255,255,255,0.1)"}`,
                background:checkDate===d?"rgba(56,189,248,0.15)":"rgba(255,255,255,0.04)",
                color:checkDate===d?"#38bdf8":"rgba(255,255,255,0.6)", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              {label}
            </button>
          ))}
        </div>
        <p style={{ ...sectionLabel, marginTop:10, marginBottom:4 }}>CHOOSE DATE</p>
        <input type="date" value={checkDate} onChange={e=>setCheckDate(e.target.value)} aria-label="Check date" style={inputStyle}/>
      </div>

      <div style={card}>
        <p style={sectionLabel}>VIEW FOR</p>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button onClick={()=>setViewMode("regular")} aria-pressed={viewMode==="regular"}
            style={{ flex:1, minWidth:80, padding:"9px 10px", borderRadius:10,
              border:`1px solid ${viewMode==="regular"?"#2563eb":"rgba(255,255,255,0.1)"}`,
              background:viewMode==="regular"?"rgba(37,99,235,0.2)":"rgba(255,255,255,0.04)",
              color:viewMode==="regular"?"#60a5fa":"rgba(255,255,255,0.6)", fontSize:13, fontWeight:600, cursor:"pointer" }}>
            ⚾ Regular Season
          </button>
          {tournaments.filter(t => !t.startDate || checkDate <= addDays(t.startDate, (t.days||1)-1)).map(t=>(
            <button key={t.id} onClick={()=>setViewMode(t.id)} aria-pressed={viewMode===t.id}
              style={{ flex:1, minWidth:80, padding:"9px 10px", borderRadius:10,
                border:`1px solid ${viewMode===t.id?"#f59e0b":"rgba(255,255,255,0.1)"}`,
                background:viewMode===t.id?"rgba(245,158,11,0.15)":"rgba(255,255,255,0.04)",
                color:viewMode===t.id?"#fbbf24":"rgba(255,255,255,0.6)", fontSize:13, fontWeight:600, cursor:"pointer" }}>
              🏆 {t.name}
            </button>
          ))}
        </div>
        {viewMode!=="regular" && selectedTourney && (
          <div style={{ marginTop:8, fontSize:11, color:"rgba(255,255,255,0.35)" }}>
            Day 1 {selectedTourney.day1IsHardLimit?"limit":"guideline"}: {selectedTourney.maxDay1}p · <strong style={{color:"rgba(255,255,255,0.5)"}}>Total limit: {selectedTourney.maxTotal}p</strong>
          </div>
        )}
      </div>

      {roster.length===0 ? (
        <div style={{ textAlign:"center", padding:"40px 0", color:"rgba(255,255,255,0.2)" }}>
          <p>Add players to your roster first</p>
        </div>
      ) : (
        <>
          <div style={{ ...card, border:"1px solid rgba(74,222,128,0.2)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
              <span style={{ fontSize:16 }}>✅</span>
              <p style={{ ...sectionLabel, margin:0, color:"#4ade80" }}>
                ELIGIBLE {displayLabel.toUpperCase()} — {eligibleList.length} PITCHER{eligibleList.length!==1?"S":""}
              </p>
            </div>
            {eligibleList.length===0 ? (
              <p style={{ fontSize:13, color:"rgba(255,255,255,0.3)", margin:0 }}>No pitchers available on this date</p>
            ) : eligibleList.map(p=>(
              <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0",
                borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ width:36, height:36, borderRadius:9, background:"rgba(74,222,128,0.12)",
                  border:"1px solid rgba(74,222,128,0.3)", display:"flex", alignItems:"center", justifyContent:"center",
                  fontFamily:"'Bebas Neue',cursive", fontSize:14, color:"#4ade80", flexShrink:0 }}>
                  {p.jersey?`#${p.jersey}`:p.name[0]}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"#f8fafc" }}>{p.name}</div>
                  {viewMode!=="regular" && <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>{p.tourneyReason}</div>}
                  {viewMode==="regular" && p.lastPitches>0 && <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>Last: {p.lastPitches}p on {formatDate(p.lastGameDate)}</div>}
                </div>
                <span style={{ fontSize:11, color:"#4ade80", fontWeight:600 }}>Ready</span>
              </div>
            ))}
          </div>

          <div style={{ ...card, border:"1px solid rgba(244,63,94,0.2)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
              <span style={{ fontSize:16 }}>🚫</span>
              <p style={{ ...sectionLabel, margin:0, color:"#f43f5e" }}>
                NOT ELIGIBLE — {ineligibleList.length} PITCHER{ineligibleList.length!==1?"S":""}
              </p>
            </div>
            {ineligibleList.length===0 ? (
              <p style={{ fontSize:13, color:"rgba(255,255,255,0.3)", margin:0 }}>All pitchers eligible!</p>
            ) : ineligibleList.map(p=>{
              const left = daysUntilEligible(p, checkDate, tournaments);
              const restLeft = left - (p.lastGameDate === checkDate ? 1 : 0);
              const eligStr = getEligibleDateStr(p, tournaments);
              return (
                <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0",
                  borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ width:36, height:36, borderRadius:9, background:"rgba(244,63,94,0.1)",
                    border:"1px solid rgba(244,63,94,0.3)", display:"flex", alignItems:"center", justifyContent:"center",
                    fontFamily:"'Bebas Neue',cursive", fontSize:14, color:"#f43f5e", flexShrink:0 }}>
                    {p.jersey?`#${p.jersey}`:p.name[0]}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"#f8fafc" }}>{p.name}</div>
                    {viewMode!=="regular" && p.tourneyReason ? (
                      <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>{p.tourneyReason}</div>
                    ) : eligStr ? (
                      <>
                        <div style={{ fontSize:12, fontWeight:700, color:"#fbbf24" }}>Eligible {formatDate(eligStr)}</div>
                        <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)" }}>{restLeft}d rest remaining</div>
                      </>
                    ) : (
                      <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>Resting</div>
                    )}
                  </div>
                  <Chip status={p.status}/>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
