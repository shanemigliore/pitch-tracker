// SeasonHistory — season-level game history with leaderboard, grouped by game.
// Babel/JSX component, loaded via <script type="text/babel" src="components/SeasonHistory.js"></script>.

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: SEASON HISTORY — grouped by game
// ══════════════════════════════════════════════════════════════════════════════
function SeasonHistory({ roster, tournaments, onEditGame, onDeleteGame }) {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [filterPitcherId, setFilterPitcherId] = useState("all");
  const [editingGame, setEditingGame] = useState(null);

  const years = [...new Set(roster.flatMap(p=>(p.history||[]).map(h=>(h.date||'').slice(0,4)).filter(Boolean)))].sort().reverse();
  const displayYear = years.includes(year) ? year : (years[0]||year);

  // All entries for this year with pitcher info
  const allEntries = roster.flatMap(p =>
    (p.history||[]).filter(h=>h.date?.startsWith(displayYear))
      .map(h=>({ ...h, playerName:p.name, jersey:p.jersey, pitcherId:p.id }))
  );

  // Group entries into games using sharedGameId when present, else date+opponent+context
  const allGameGroups = (() => {
    const groups = new Map();
    allEntries.forEach(entry => {
      const key = entry.sharedGameId ||
        `${entry.date}|${entry.opponent||""}|${String(entry.isTournament)}|${entry.tournamentId||""}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          date: entry.date,
          opponent: entry.opponent || "",
          isTournament: entry.isTournament || false,
          tournamentName: entry.tournamentName || "",
          tournamentId: entry.tournamentId || null,
          tourneyDay: entry.tourneyDay || null,
          pitchers: [],
        });
      }
      groups.get(key).pitchers.push(entry);
    });
    return [...groups.values()].sort((a,b) => b.date.localeCompare(a.date));
  })();

  // When a pitcher is filtered, show only games where that pitcher appeared
  const gameGroups = filterPitcherId==="all"
    ? allGameGroups
    : allGameGroups.filter(g => g.pitchers.some(p => String(p.pitcherId)===String(filterPitcherId)));

  // Stats scoped to filtered pitcher (or all)
  const filteredEntries = filterPitcherId==="all"
    ? allEntries
    : allEntries.filter(e => String(e.pitcherId)===String(filterPitcherId));
  const totalPitches = filteredEntries.reduce((s,g)=>s+g.pitches, 0);
  const distinctGameCount = gameGroups.length;

  const pitchersWithGames = roster.filter(p=>(p.history||[]).some(h=>h.date?.startsWith(displayYear)));

  const leaderboard = roster.map(p=>{
    const games = (p.history||[]).filter(h=>h.date?.startsWith(displayYear));
    return { id:p.id, name:p.name, jersey:p.jersey, games:games.length,
      total:games.reduce((s,g)=>s+g.pitches,0),
      avg:games.length?Math.round(games.reduce((s,g)=>s+g.pitches,0)/games.length):0 };
  }).filter(p=>p.games>0).sort((a,b)=>b.total-a.total);

  const activePitcher = filterPitcherId!=="all" ? roster.find(p=>String(p.id)===String(filterPitcherId)) : null;

  return (
    <div style={{ padding:"0 16px 110px" }}>
      {editingGame && (
        <EditGameGroupModal
          game={editingGame}
          tournaments={tournaments}
          onEditGame={onEditGame}
          onDeleteGame={onDeleteGame}
          onClose={()=>setEditingGame(null)}/>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 0 14px" }}>
        <div>
          <h2 style={{ margin:0, fontSize:24, fontWeight:800, color:"#f8fafc", fontFamily:"'Bebas Neue',cursive", letterSpacing:2 }}>HISTORY</h2>
          <p style={{ margin:0, fontSize:12, color:"rgba(255,255,255,0.4)" }}>{distinctGameCount} game{distinctGameCount!==1?"s":""} · {filteredEntries.length} appearance{filteredEntries.length!==1?"s":""}</p>
        </div>
        {years.length>1 && (
          <select value={displayYear} onChange={e=>setYear(e.target.value)} aria-label="Year"
            style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)",
              borderRadius:10, padding:"6px 10px", color:"#f8fafc", fontSize:14 }}>
            {years.map(y=><option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>

      {/* Pitcher filter */}
      {pitchersWithGames.length > 1 && (
        <div style={card}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
            {I.filter}
            <p style={{ ...sectionLabel, margin:0 }}>FILTER BY PITCHER</p>
          </div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <button onClick={()=>setFilterPitcherId("all")} aria-pressed={filterPitcherId==="all"}
              style={{ padding:"6px 12px", borderRadius:20,
                border:`1px solid ${filterPitcherId==="all"?"#38bdf8":"rgba(255,255,255,0.1)"}`,
                background:filterPitcherId==="all"?"rgba(56,189,248,0.15)":"rgba(255,255,255,0.04)",
                color:filterPitcherId==="all"?"#38bdf8":"rgba(255,255,255,0.5)",
                fontSize:12, fontWeight:700, cursor:"pointer" }}>
              All Pitchers
            </button>
            {pitchersWithGames.map(p=>(
              <button key={p.id} onClick={()=>setFilterPitcherId(String(p.id))} aria-pressed={String(filterPitcherId)===String(p.id)}
                style={{ padding:"6px 12px", borderRadius:20,
                  border:`1px solid ${String(filterPitcherId)===String(p.id)?"#38bdf8":"rgba(255,255,255,0.1)"}`,
                  background:String(filterPitcherId)===String(p.id)?"rgba(56,189,248,0.15)":"rgba(255,255,255,0.04)",
                  color:String(filterPitcherId)===String(p.id)?"#38bdf8":"rgba(255,255,255,0.5)",
                  fontSize:12, fontWeight:700, cursor:"pointer" }}>
                {p.jersey?`#${p.jersey} `:""}{p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {gameGroups.length===0 ? (
        <div style={{ textAlign:"center", padding:"60px 0", color:"rgba(255,255,255,0.2)" }}>
          <div style={{ fontSize:56, marginBottom:12 }}>📊</div>
          <p style={{ fontSize:15, fontWeight:600 }}>
            {filterPitcherId==="all" ? `No games logged for ${displayYear}` : `No games for ${activePitcher?.name} in ${displayYear}`}
          </p>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:12 }}>
            {[["Total",totalPitches+"p","#38bdf8"],
              ["Games",distinctGameCount,"#4ade80"],
              ["Tourney",gameGroups.filter(g=>g.isTournament).length,"#f59e0b"]
            ].map(([l,v,c])=>(
              <div key={l} style={{ textAlign:"center", padding:"12px 6px", background:"rgba(255,255,255,0.03)",
                border:"1px solid rgba(255,255,255,0.07)", borderRadius:12 }}>
                <div style={{ fontSize:22, fontWeight:900, color:c, fontFamily:"'Bebas Neue',cursive" }}>{v}</div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)" }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Leaderboard — only when showing all pitchers */}
          {filterPitcherId==="all" && leaderboard.length===0 && (
            <div style={{ ...card, textAlign:"center", padding:"28px 16px", color:"rgba(255,255,255,0.3)" }}>
              <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
              <p style={{ margin:0, fontSize:13, fontWeight:600 }}>No games logged for {displayYear}</p>
              <p style={{ margin:"4px 0 0", fontSize:12 }}>Log a game to see the leaderboard</p>
            </div>
          )}
          {filterPitcherId==="all" && leaderboard.length>0 && (
            <div style={card}>
              <p style={sectionLabel}>LEADERBOARD</p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 54px 48px 54px", columnGap:8,
                marginBottom:6, paddingBottom:6, borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
                <span style={{ fontSize:10, color:"rgba(255,255,255,0.35)", fontWeight:700, letterSpacing:1 }}>PLAYER</span>
                <span style={{ fontSize:10, color:"rgba(255,255,255,0.35)", fontWeight:700, letterSpacing:1, textAlign:"right" }}>GAMES</span>
                <span style={{ fontSize:10, color:"rgba(255,255,255,0.35)", fontWeight:700, letterSpacing:1, textAlign:"right" }}>AVG</span>
                <span style={{ fontSize:10, color:"rgba(255,255,255,0.35)", fontWeight:700, letterSpacing:1, textAlign:"right" }}>TOT</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 54px 48px 54px", columnGap:8 }}>
                {leaderboard.map((p,i)=>(
                  <React.Fragment key={p.id}>
                    <div onClick={()=>setFilterPitcherId(String(p.id))}
                      style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer",
                        padding:"7px 0", borderBottom:i<leaderboard.length-1?"1px solid rgba(255,255,255,0.04)":"none" }}>
                      <span style={{ width:20, height:20, borderRadius:6,
                        background:i===0?"rgba(251,191,36,0.2)":i===1?"rgba(156,163,175,0.15)":i===2?"rgba(180,120,60,0.15)":"rgba(255,255,255,0.04)",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:10, fontWeight:800, color:i===0?"#fbbf24":i===1?"#9ca3af":i===2?"#b47a3c":"rgba(255,255,255,0.3)", flexShrink:0 }}>
                        {i+1}
                      </span>
                      <span style={{ fontSize:13, color:"rgba(255,255,255,0.8)", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.jersey?`#${p.jersey} `:""}{p.name}</span>
                    </div>
                    <span onClick={()=>setFilterPitcherId(String(p.id))} style={{ fontSize:13, color:"rgba(255,255,255,0.5)", fontFamily:"'DM Mono',monospace", textAlign:"right", cursor:"pointer",
                      padding:"7px 0", borderBottom:i<leaderboard.length-1?"1px solid rgba(255,255,255,0.04)":"none", display:"flex", alignItems:"center", justifyContent:"flex-end" }}>{p.games}</span>
                    <span onClick={()=>setFilterPitcherId(String(p.id))} style={{ fontSize:13, color:"#38bdf8", fontFamily:"'DM Mono',monospace", textAlign:"right", cursor:"pointer",
                      padding:"7px 0", borderBottom:i<leaderboard.length-1?"1px solid rgba(255,255,255,0.04)":"none", display:"flex", alignItems:"center", justifyContent:"flex-end" }}>{p.avg}p</span>
                    <span onClick={()=>setFilterPitcherId(String(p.id))} style={{ fontSize:13, color:"#f8fafc", fontFamily:"'DM Mono',monospace", fontWeight:700, textAlign:"right", cursor:"pointer",
                      padding:"7px 0", borderBottom:i<leaderboard.length-1?"1px solid rgba(255,255,255,0.04)":"none", display:"flex", alignItems:"center", justifyContent:"flex-end" }}>{p.total}p</span>
                  </React.Fragment>
                ))}
              </div>
              <p style={{ margin:"8px 0 0", fontSize:10, color:"rgba(255,255,255,0.25)" }}>Tap a player to filter their games</p>
            </div>
          )}

          {/* Filtered pitcher summary */}
          {activePitcher && (
            <div style={{ ...card, border:"1px solid rgba(56,189,248,0.2)", background:"rgba(56,189,248,0.04)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:15, fontWeight:800, color:"#38bdf8" }}>{activePitcher.jersey?`#${activePitcher.jersey} `:""}{activePitcher.name}</div>
                  <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginTop:2 }}>
                    {distinctGameCount} game{distinctGameCount!==1?"s":""} · {totalPitches}p total · avg {distinctGameCount?Math.round(totalPitches/distinctGameCount):0}p/game
                  </div>
                </div>
                <Chip status={getAvailabilityStatus(activePitcher, null, tournaments)} size="lg"/>
              </div>
            </div>
          )}

          {/* Games — one card per game, tap to edit */}
          {gameGroups.map((g,gi) => {
            const gameTotalPitches = g.pitchers.reduce((s,p)=>s+p.pitches, 0);
            return (
              <div key={g.key||gi} style={card}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"#f8fafc" }}>
                      {formatDate(g.date)}
                      {g.opponent && <span style={{ fontWeight:400, color:"rgba(255,255,255,0.5)" }}> · vs {g.opponent}</span>}
                    </div>
                    {g.isTournament ? (
                      <span style={{ fontSize:10, padding:"2px 7px", background:"rgba(245,158,11,0.15)",
                        border:"1px solid rgba(245,158,11,0.3)", borderRadius:6, color:"#f59e0b", fontWeight:700,
                        display:"inline-block", marginTop:4 }}>
                        🏆 {g.tournamentName||"TOURNAMENT"}{g.tourneyDay?` · DAY ${g.tourneyDay}`:""}
                      </span>
                    ) : (
                      <span style={{ fontSize:10, color:"rgba(255,255,255,0.3)", marginTop:2, display:"block" }}>
                        Regular Season
                      </span>
                    )}
                  </div>
                  <button onClick={()=>setEditingGame(g)}
                    style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 10px",
                      background:"rgba(56,189,248,0.08)", border:"1px solid rgba(56,189,248,0.2)",
                      borderRadius:8, color:"#38bdf8", fontSize:12, fontWeight:700, cursor:"pointer", flexShrink:0 }}>
                    {I.edit} Edit
                  </button>
                </div>
                {g.pitchers.map((p,pi) => {
                  const rd = getRegRestDays(p.pitches);
                  return (
                    <div key={p.gameId||pi} style={{ display:"flex", alignItems:"center", gap:8,
                      padding:"7px 10px", borderRadius:9, marginBottom:4,
                      background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)" }}>
                      <div style={{ width:28, height:28, borderRadius:7,
                        background:"rgba(56,189,248,0.1)", border:"1px solid rgba(56,189,248,0.2)",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontFamily:"'Bebas Neue',cursive", fontSize:11, color:"#38bdf8", flexShrink:0 }}>
                        {p.jersey?`#${p.jersey}`:(p.playerName||"?")[0]}
                      </div>
                      <span style={{ flex:1, fontSize:13, fontWeight:600, color:"rgba(255,255,255,0.85)" }}>{p.playerName}</span>
                      <span style={{ fontSize:15, fontWeight:800, color:"#f8fafc", fontFamily:"'Bebas Neue',cursive" }}>{p.pitches}p</span>
                      <span style={{ fontSize:11, fontWeight:600, minWidth:44, textAlign:"right",
                        color:rd===0?"#4ade80":rd===1?"#a3e635":rd===2?"#fb923c":"#f43f5e" }}>
                        {rd===0?"No rest":`${rd}d rest`}
                      </span>
                    </div>
                  );
                })}
                {g.pitchers.length > 1 && (
                  <div style={{ paddingTop:6, marginTop:2, borderTop:"1px solid rgba(255,255,255,0.05)",
                    fontSize:11, color:"rgba(255,255,255,0.3)", textAlign:"right" }}>
                    {gameTotalPitches}p combined
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
