// EligibilityScreen — the Roster tab: pitcher list grouped by availability for a
// chosen date, with drill-in to PitcherDetail. (Filename predates the merge with
// the old roster list - see CLAUDE.md's Components table for the current mapping.)
// Babel/JSX component, loaded via <script type="text/babel" src="components/EligibilityScreen.js"></script>.

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: ROSTER (pitcher list + eligibility)
// ══════════════════════════════════════════════════════════════════════════════
function EligibilityScreen({ roster, tournaments, onSelect }) {
  const [checkDate, setCheckDate] = useState(todayStr());
  const [viewMode, setViewMode] = useState(() => {
    const active = getActiveTourney(tournaments, todayStr());
    return active ? active.id : "regular";
  });
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [showRulesInfo, setShowRulesInfo] = useState(false);
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
      <div style={{ padding:"16px 0 14px", display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10 }}>
        <div>
          <h2 style={{ margin:0, fontSize:24, fontWeight:800, color:"#f8fafc", fontFamily:"'Bebas Neue',cursive", letterSpacing:2 }}>ROSTER</h2>
          <p style={{ margin:0, fontSize:12, color:"rgba(255,255,255,0.4)" }}>Check who can pitch on any date</p>
        </div>
        <button onClick={()=>setShowRulesInfo(true)} aria-label="View availability key and rest requirements"
          style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 10px", borderRadius:10,
            background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)",
            color:"rgba(255,255,255,0.5)", fontSize:11, fontWeight:700, cursor:"pointer", flexShrink:0, marginTop:2 }}>
          ⓘ Rules
        </button>
      </div>

      <div style={card}>
        <p style={sectionLabel}>CHECK DATE</p>
        <div style={{ display:"flex", gap:8 }}>
          {[[todayStr(),"Today"],[addDays(todayStr(),1),"Tomorrow"],[addDays(todayStr(),2),"In 2 Days"]].map(([d,label])=>(
            <button key={d} onClick={()=>{ setCheckDate(d); setShowCustomDate(false); }} aria-pressed={checkDate===d}
              style={{ flex:1, padding:"8px 6px", borderRadius:10,
                border:`1px solid ${checkDate===d?"#38bdf8":"rgba(255,255,255,0.1)"}`,
                background:checkDate===d?"rgba(56,189,248,0.15)":"rgba(255,255,255,0.04)",
                color:checkDate===d?"#38bdf8":"rgba(255,255,255,0.6)", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              {label}
            </button>
          ))}
          <button onClick={()=>setShowCustomDate(s=>!s)} aria-pressed={showCustomDate} aria-label="Choose a custom date"
            style={{ width:38, flexShrink:0, borderRadius:10,
              border:`1px solid ${showCustomDate?"#38bdf8":"rgba(255,255,255,0.1)"}`,
              background:showCustomDate?"rgba(56,189,248,0.15)":"rgba(255,255,255,0.04)",
              color:showCustomDate?"#38bdf8":"rgba(255,255,255,0.6)", cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center" }}>
            {I.eligibility}
          </button>
        </div>
        {showCustomDate && (
          <input type="date" value={checkDate} onChange={e=>setCheckDate(e.target.value)} aria-label="Check date"
            style={{ ...inputStyle, marginTop:10 }}/>
        )}
      </div>

      <div style={card}>
        <p style={sectionLabel}>VIEW FOR</p>
        {(() => {
          // 3+ total buttons (regular + 2 tournaments) wrap to multiple lines at
          // this width - switch to a single horizontally-scrollable row instead.
          const scrollable = tournaments.length >= 2;
          const btnStyle = scrollable
            ? { flexShrink:0, padding:"9px 14px", borderRadius:10, whiteSpace:"nowrap" }
            : { flex:1, minWidth:80, padding:"9px 10px", borderRadius:10 };
          return (
            <div style={{ display:"flex", gap:8, flexWrap:scrollable?"nowrap":"wrap",
              overflowX:scrollable?"auto":"visible", WebkitOverflowScrolling:"touch" }}>
              <button onClick={()=>setViewMode("regular")} aria-pressed={viewMode==="regular"}
                style={{ ...btnStyle,
                  border:`1px solid ${viewMode==="regular"?"#2563eb":"rgba(255,255,255,0.1)"}`,
                  background:viewMode==="regular"?"rgba(37,99,235,0.2)":"rgba(255,255,255,0.04)",
                  color:viewMode==="regular"?"#60a5fa":"rgba(255,255,255,0.6)", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                ⚾ Regular Season
              </button>
              {tournaments.filter(t => !t.startDate || checkDate <= addDays(t.startDate, (t.days||1)-1)).map(t=>(
                <button key={t.id} onClick={()=>setViewMode(t.id)} aria-pressed={viewMode===t.id}
                  style={{ ...btnStyle,
                    border:`1px solid ${viewMode===t.id?"#f59e0b":"rgba(255,255,255,0.1)"}`,
                    background:viewMode===t.id?"rgba(245,158,11,0.15)":"rgba(255,255,255,0.04)",
                    color:viewMode===t.id?"#fbbf24":"rgba(255,255,255,0.6)", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                  🏆 {t.name}
                </button>
              ))}
            </div>
          );
        })()}
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
              <div key={p.id} onClick={()=>onSelect(p)} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0",
                borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer" }}>
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
                <div style={{ color:"rgba(255,255,255,0.2)" }}>{I.chevron}</div>
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
                <div key={p.id} onClick={()=>onSelect(p)} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0",
                  borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer" }}>
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
                  <div style={{ color:"rgba(255,255,255,0.2)" }}>{I.chevron}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {showRulesInfo && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:50,
          display:"flex", alignItems:"flex-end", justifyContent:"center" }}
          onClick={e=>{ if(e.target===e.currentTarget) setShowRulesInfo(false); }}>
          <div style={{ width:"100%", maxWidth:430, background:"#0f1623",
            border:"1px solid rgba(255,255,255,0.12)", borderRadius:"20px 20px 0 0",
            padding:"20px 18px 40px", maxHeight:"85dvh", overflowY:"auto" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <div style={{ fontSize:16, fontWeight:800, color:"#f8fafc" }}>Availability Key & Rest Requirements</div>
              <button onClick={()=>setShowRulesInfo(false)} aria-label="Close" style={{ background:"rgba(255,255,255,0.07)", border:"none", borderRadius:8,
                width:32, height:32, color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:18 }}>✕</button>
            </div>

            <p style={sectionLabel}>AVAILABILITY KEY</p>
            <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginBottom:18 }}>
              {Object.entries(STATUS).map(([k,v])=>(
                <span key={k} style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:"rgba(255,255,255,0.6)" }}>
                  <span style={{ width:7, height:7, borderRadius:"50%", background:v.color }}/>{v.label}
                </span>
              ))}
            </div>

            <p style={sectionLabel}>REST REQUIREMENTS</p>
            {(()=>{
              const r = getCurrentRules();
              const rows = [
                [`0–${r.rest1} pitches`, "No rest",  "#4ade80"],
                [`${r.rest1+1}–${r.rest2} pitches`, "1 day",   "#a3e635"],
                [`${r.rest2+1}–${r.rest3} pitches`, "2 days",  "#fb923c"],
                [`${r.rest3+1}+ pitches`,                "3 days",  "#f43f5e"],
              ];
              return rows.map(([range, rest, c], i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0",
                  borderBottom:i<3?"1px solid rgba(255,255,255,0.05)":"none", fontSize:13 }}>
                  <span style={{ color:"rgba(255,255,255,0.6)", fontFamily:"'DM Mono',monospace" }}>{range}</span>
                  <span style={{ color:c, fontWeight:600 }}>{rest}</span>
                </div>
              ));
            })()}
            <p style={{ margin:"8px 0 0", fontSize:11, color:"rgba(255,255,255,0.3)", display:"flex", alignItems:"center", gap:5 }}>
              {I.warning} Max {getCurrentRules().maxPitches} — may finish batter already in progress
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
