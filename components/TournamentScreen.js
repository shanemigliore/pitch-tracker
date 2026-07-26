// TournamentScreen — create/edit/delete tournaments.
// Babel/JSX component, loaded via <script type="text/babel" src="components/TournamentScreen.js"></script>.

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: TOURNAMENT MANAGER
// ══════════════════════════════════════════════════════════════════════════════
function TournamentScreen({ roster, tournaments, onAddTourney, onDeleteTourney, onUpdateTourney }) {
  const [view, setView] = useState("list");
  const [editId, setEditId] = useState(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(todayStr());
  const [days, setDays] = useState("2");
  const [customDays, setCustomDays] = useState("");
  const [maxDay1, setMaxDay1] = useState("55");
  const [maxTotal, setMaxTotal] = useState("115");
  const [day1IsHardLimit, setDay1IsHardLimit] = useState(false);
  const [confirmDeleteTourney, setConfirmDeleteTourney] = useState(false);

  function openEdit(t) {
    setEditId(t.id);
    setName(t.name);
    setStartDate(t.startDate || todayStr());
    const d = t.days || 2;
    if (d === 1 || d === 2) { setDays(String(d)); setCustomDays(""); }
    else { setDays("custom"); setCustomDays(String(d)); }
    setMaxDay1(String(t.maxDay1 || 55));
    setMaxTotal(String(t.maxTotal || 115));
    setDay1IsHardLimit(!!t.day1IsHardLimit);
    setView("edit");
  }

  function handleCreate() {
    if (!name.trim()) return;
    const resolvedDays = days==="custom" ? (parseInt(customDays)||1) : (parseInt(days)||2);
    onAddTourney({ id:newId(), name:name.trim(), startDate, days:resolvedDays,
      maxDay1:parseInt(maxDay1)||55,
      maxTotal:parseInt(maxTotal)||115,
      day1IsHardLimit,
      createdAt:todayStr() });
    setName(""); setStartDate(todayStr()); setDays("2"); setCustomDays(""); setMaxDay1("55"); setMaxTotal("115"); setDay1IsHardLimit(false);
    setView("list");
  }

  function handleSaveEdit() {
    if (!name.trim() || !editId) return;
    const resolvedDays = days==="custom" ? (parseInt(customDays)||1) : (parseInt(days)||2);
    const original = tournaments.find(t=>t.id===editId);
    onUpdateTourney({ ...original, name:name.trim(), startDate, days:resolvedDays,
      maxDay1:parseInt(maxDay1)||55,
      maxTotal:parseInt(maxTotal)||115,
      day1IsHardLimit });
    setEditId(null);
    setView(editId);
  }

  if (view==="create") {
    return (
      <div style={{ padding:"0 16px 110px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 0 18px" }}>
          <button onClick={()=>setView("list")} style={{ background:"rgba(255,255,255,0.07)", border:"none", borderRadius:10,
            padding:10, color:"rgba(255,255,255,0.7)", cursor:"pointer", display:"flex" }}>{I.back}</button>
          <h2 style={{ margin:0, fontSize:22, fontWeight:800, color:"#f8fafc", fontFamily:"'Bebas Neue',cursive", letterSpacing:1.5 }}>NEW TOURNAMENT</h2>
        </div>
        <div style={card}>
          <p style={sectionLabel}>DETAILS</p>
          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>NAME</label>
          <input placeholder="e.g. District 5 Tournament" value={name} onChange={e=>setName(e.target.value)}
            style={{ ...inputStyle, marginBottom:10 }}/>
          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>START DATE</label>
          <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}
            style={{ ...inputStyle, marginBottom:10 }}/>
          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>NUMBER OF DAYS</label>
          <div style={{ display:"flex", gap:8, marginBottom:days==="custom"?10:0 }}>
            {[["1","1"],["2","2"],["custom","Custom"]].map(([val,label])=>(
              <button key={val} onClick={()=>setDays(val)}
                style={{ flex:1, height:42, borderRadius:10,
                  border:`1px solid ${days===val?"#38bdf8":"rgba(255,255,255,0.1)"}`,
                  background:days===val?"rgba(56,189,248,0.15)":"rgba(255,255,255,0.04)",
                  color:days===val?"#38bdf8":"rgba(255,255,255,0.6)", fontSize:14, fontWeight:700, cursor:"pointer",
                  fontFamily:"'Bebas Neue',cursive" }}>{label}</button>
            ))}
          </div>
          {days==="custom" && (
            <input type="number" min="1" max="14" placeholder="Number of days"
              value={customDays} onChange={e=>setCustomDays(e.target.value)}
              style={{ ...inputStyle, textAlign:"center", fontSize:18, fontWeight:800,
                fontFamily:"'Bebas Neue',cursive" }}/>
          )}
        </div>
        <div style={card}>
          <p style={sectionLabel}>PITCH RULES</p>

          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>MAX PITCHES — DAY 1</label>
          <input type="number" min="1" placeholder="55" value={maxDay1} onChange={e=>setMaxDay1(e.target.value)}
            style={{ ...inputStyle, fontSize:18, fontFamily:"'Bebas Neue',cursive", fontWeight:800, textAlign:"center", marginBottom:10 }}/>

          <label style={{ ...sectionLabel, display:"block", marginBottom:6 }}>DAY 1 LIMIT TYPE</label>
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            <label style={{ flex:1, display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:10, cursor:"pointer",
              border:`1px solid ${!day1IsHardLimit?"#4ade80":"rgba(255,255,255,0.1)"}`,
              background:!day1IsHardLimit?"rgba(74,222,128,0.12)":"rgba(255,255,255,0.04)" }}>
              <input type="radio" name="d1type" checked={!day1IsHardLimit} onChange={()=>setDay1IsHardLimit(false)}
                style={{ accentColor:"#4ade80", width:15, height:15, flexShrink:0 }}/>
              <span style={{ fontSize:13, fontWeight:600, color:!day1IsHardLimit?"#4ade80":"rgba(255,255,255,0.5)" }}>Guideline only</span>
            </label>
            <label style={{ flex:1, display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:10, cursor:"pointer",
              border:`1px solid ${day1IsHardLimit?"#f43f5e":"rgba(255,255,255,0.1)"}`,
              background:day1IsHardLimit?"rgba(244,63,94,0.12)":"rgba(255,255,255,0.04)" }}>
              <input type="radio" name="d1type" checked={day1IsHardLimit} onChange={()=>setDay1IsHardLimit(true)}
                style={{ accentColor:"#f43f5e", width:15, height:15, flexShrink:0 }}/>
              <span style={{ fontSize:13, fontWeight:600, color:day1IsHardLimit?"#f43f5e":"rgba(255,255,255,0.5)" }}>Hard limit</span>
            </label>
          </div>
          <p style={{ margin:"0 0 14px", fontSize:11, color:"rgba(255,255,255,0.4)", lineHeight:1.5 }}>
            {day1IsHardLimit
              ? <><strong style={{color:"#f43f5e"}}>Hard limit:</strong> exceeding the Day 1 cap makes a pitcher ineligible for the rest of the tournament.</>
              : <><strong style={{color:"#4ade80"}}>Guideline:</strong> Day 1 limit is informational only and does not affect eligibility.</>}
          </p>

          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>MAX PITCHES — ENTIRE TOURNAMENT (eligibility limit)</label>
          <input type="number" min="1" placeholder="115" value={maxTotal} onChange={e=>setMaxTotal(e.target.value)}
            style={{ ...inputStyle, fontSize:18, fontFamily:"'Bebas Neue',cursive", fontWeight:800, textAlign:"center" }}/>
        </div>
        <button onClick={handleCreate} disabled={!name.trim()}
          style={{ ...primaryBtn, width:"100%", padding:14, opacity:name.trim()?1:0.4,
            background:"linear-gradient(135deg,#d97706,#b45309)",
            boxShadow:"0 4px 20px rgba(217,119,6,0.35)" }}>
          🏆 Create Tournament
        </button>
      </div>
    );
  }

  if (view==="edit") {
    return (
      <div style={{ padding:"0 16px 110px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 0 18px" }}>
          <button onClick={()=>{ setEditId(null); setView(editId); }} style={{ background:"rgba(255,255,255,0.07)", border:"none", borderRadius:10,
            padding:10, color:"rgba(255,255,255,0.7)", cursor:"pointer", display:"flex" }}>{I.back}</button>
          <h2 style={{ margin:0, fontSize:22, fontWeight:800, color:"#f8fafc", fontFamily:"'Bebas Neue',cursive", letterSpacing:1.5 }}>EDIT TOURNAMENT</h2>
        </div>
        <div style={card}>
          <p style={sectionLabel}>DETAILS</p>
          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>NAME</label>
          <input placeholder="e.g. District 5 Tournament" value={name} onChange={e=>setName(e.target.value)}
            style={{ ...inputStyle, marginBottom:10 }}/>
          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>START DATE</label>
          <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}
            style={{ ...inputStyle, marginBottom:10 }}/>
          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>NUMBER OF DAYS</label>
          <div style={{ display:"flex", gap:8, marginBottom:days==="custom"?10:0 }}>
            {[["1","1"],["2","2"],["custom","Custom"]].map(([val,label])=>(
              <button key={val} onClick={()=>setDays(val)}
                style={{ flex:1, height:42, borderRadius:10,
                  border:`1px solid ${days===val?"#38bdf8":"rgba(255,255,255,0.1)"}`,
                  background:days===val?"rgba(56,189,248,0.15)":"rgba(255,255,255,0.04)",
                  color:days===val?"#38bdf8":"rgba(255,255,255,0.6)", fontSize:14, fontWeight:700, cursor:"pointer",
                  fontFamily:"'Bebas Neue',cursive" }}>{label}</button>
            ))}
          </div>
          {days==="custom" && (
            <input type="number" min="1" max="14" placeholder="Number of days"
              value={customDays} onChange={e=>setCustomDays(e.target.value)}
              style={{ ...inputStyle, textAlign:"center", fontSize:18, fontWeight:800,
                fontFamily:"'Bebas Neue',cursive" }}/>
          )}
        </div>
        <div style={card}>
          <p style={sectionLabel}>PITCH RULES</p>
          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>MAX PITCHES — DAY 1</label>
          <input type="number" min="1" placeholder="55" value={maxDay1} onChange={e=>setMaxDay1(e.target.value)}
            style={{ ...inputStyle, fontSize:18, fontFamily:"'Bebas Neue',cursive", fontWeight:800, textAlign:"center", marginBottom:10 }}/>
          <label style={{ ...sectionLabel, display:"block", marginBottom:6 }}>DAY 1 LIMIT TYPE</label>
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            <label style={{ flex:1, display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:10, cursor:"pointer",
              border:`1px solid ${!day1IsHardLimit?"#4ade80":"rgba(255,255,255,0.1)"}`,
              background:!day1IsHardLimit?"rgba(74,222,128,0.12)":"rgba(255,255,255,0.04)" }}>
              <input type="radio" name="d1type" checked={!day1IsHardLimit} onChange={()=>setDay1IsHardLimit(false)}
                style={{ accentColor:"#4ade80", width:15, height:15, flexShrink:0 }}/>
              <span style={{ fontSize:13, fontWeight:600, color:!day1IsHardLimit?"#4ade80":"rgba(255,255,255,0.5)" }}>Guideline only</span>
            </label>
            <label style={{ flex:1, display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:10, cursor:"pointer",
              border:`1px solid ${day1IsHardLimit?"#f43f5e":"rgba(255,255,255,0.1)"}`,
              background:day1IsHardLimit?"rgba(244,63,94,0.12)":"rgba(255,255,255,0.04)" }}>
              <input type="radio" name="d1type" checked={day1IsHardLimit} onChange={()=>setDay1IsHardLimit(true)}
                style={{ accentColor:"#f43f5e", width:15, height:15, flexShrink:0 }}/>
              <span style={{ fontSize:13, fontWeight:600, color:day1IsHardLimit?"#f43f5e":"rgba(255,255,255,0.5)" }}>Hard limit</span>
            </label>
          </div>
          <p style={{ margin:"0 0 14px", fontSize:11, color:"rgba(255,255,255,0.4)", lineHeight:1.5 }}>
            {day1IsHardLimit
              ? <><strong style={{color:"#f43f5e"}}>Hard limit:</strong> exceeding the Day 1 cap makes a pitcher ineligible for the rest of the tournament.</>
              : <><strong style={{color:"#4ade80"}}>Guideline:</strong> Day 1 limit is informational only and does not affect eligibility.</>}
          </p>
          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>MAX PITCHES — ENTIRE TOURNAMENT (eligibility limit)</label>
          <input type="number" min="1" placeholder="115" value={maxTotal} onChange={e=>setMaxTotal(e.target.value)}
            style={{ ...inputStyle, fontSize:18, fontFamily:"'Bebas Neue',cursive", fontWeight:800, textAlign:"center" }}/>
        </div>
        <button onClick={handleSaveEdit} disabled={!name.trim()}
          style={{ ...primaryBtn, width:"100%", padding:14, opacity:name.trim()?1:0.4,
            background:"linear-gradient(135deg,#1d4ed8,#1e40af)",
            boxShadow:"0 4px 20px rgba(29,78,216,0.35)" }}>
          Save Changes
        </button>
      </div>
    );
  }

  if (view!=="list") {
    const t = tournaments.find(t=>t.id===view);
    if (!t) { return null; }
    const allEntries = roster.flatMap(p=>
      (p.history||[]).filter(h=>h.tournamentId===t.id).map(h=>({...h,playerName:p.name,jersey:p.jersey,playerId:p.id}))
    ).sort((a,b)=>a.date<b.date?-1:1);
    const byDay = {};
    allEntries.forEach(e=>{ const d=e.tourneyDay||1; if(!byDay[d]) byDay[d]=[]; byDay[d].push(e); });
    const totalPitches = allEntries.reduce((s,e)=>s+e.pitches,0);
    const uniquePlayers = [...new Map(allEntries.map(e=>[e.playerId,e])).values()];

    return (
      <div style={{ padding:"0 16px 110px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 0 18px" }}>
          <button onClick={()=>setView("list")} style={{ background:"rgba(255,255,255,0.07)", border:"none", borderRadius:10,
            padding:10, color:"rgba(255,255,255,0.7)", cursor:"pointer", display:"flex" }}>{I.back}</button>
          <div style={{ flex:1 }}>
            <h2 style={{ margin:0, fontSize:21, fontWeight:800, color:"#f8fafc", fontFamily:"'Bebas Neue',cursive", letterSpacing:1.5 }}>
              🏆 {t.name.toUpperCase()}
            </h2>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>{t.days}-day tournament</div>
          </div>
          <button onClick={()=>openEdit(t)}
            style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8,
              padding:10, color:"rgba(255,255,255,0.7)", cursor:"pointer", display:"flex" }}>{I.edit}</button>
          <button onClick={()=>setConfirmDeleteTourney(true)}
            style={{ background:"rgba(244,63,94,0.1)", border:"1px solid rgba(244,63,94,0.25)", borderRadius:8,
              padding:10, color:"rgba(244,63,94,0.7)", cursor:"pointer", display:"flex" }}>{I.trash}</button>
        </div>
        {confirmDeleteTourney && (
          <div style={{ background:"rgba(244,63,94,0.08)", border:"1px solid rgba(244,63,94,0.25)",
            borderRadius:14, padding:14, marginBottom:12 }}>
            <p style={{ margin:"0 0 10px", fontSize:13, color:"#f87171", fontWeight:600, textAlign:"center" }}>
              Delete "{t.name}"? All pitch data logged for this tournament will be removed from history.
            </p>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>setConfirmDeleteTourney(false)} style={{ ...cancelBtn, flex:1 }}>Keep It</button>
              <button onClick={()=>{ onDeleteTourney(t.id); setView("list"); setConfirmDeleteTourney(false); }}
                style={{ flex:2, background:"linear-gradient(135deg,#dc2626,#b91c1c)", border:"none",
                  borderRadius:12, padding:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                Yes, Delete
              </button>
            </div>
          </div>
        )}

        <div style={card}>
          <p style={sectionLabel}>PITCH RULES</p>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
            <div style={{ textAlign:"center", padding:"10px 6px", background:"rgba(255,255,255,0.04)", borderRadius:10,
              border:`1px solid ${t.day1IsHardLimit?"rgba(244,63,94,0.25)":"rgba(255,255,255,0.06)"}` }}>
              <div style={{ fontSize:20, fontWeight:800, color:t.day1IsHardLimit?"#f43f5e":"#fbbf24", fontFamily:"'Bebas Neue',cursive" }}>{t.maxDay1}p</div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)" }}>Day 1</div>
              <div style={{ fontSize:9, color:t.day1IsHardLimit?"rgba(244,63,94,0.6)":"rgba(255,255,255,0.2)", marginTop:1 }}>{t.day1IsHardLimit?"hard limit":"guideline"}</div>
            </div>
            <div style={{ textAlign:"center", padding:"10px 6px", background:"rgba(255,255,255,0.04)", borderRadius:10,
              border:"1px solid rgba(251,146,60,0.25)" }}>
              <div style={{ fontSize:20, fontWeight:800, color:"#fb923c", fontFamily:"'Bebas Neue',cursive" }}>{t.maxTotal}p</div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)" }}>Total</div>
              <div style={{ fontSize:9, color:"rgba(255,255,255,0.2)", marginTop:1 }}>eligibility limit</div>
            </div>
          </div>
        </div>
        {allEntries.length>0 && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:12 }}>
            {[["Appearances",allEntries.length,"#38bdf8"],["Pitchers",uniquePlayers.length,"#a78bfa"],["Total",totalPitches+"p","#fb923c"]].map(([l,v,c])=>(
              <div key={l} style={{ textAlign:"center", padding:"12px 6px", background:"rgba(255,255,255,0.03)",
                border:"1px solid rgba(255,255,255,0.07)", borderRadius:12 }}>
                <div style={{ fontSize:22, fontWeight:900, color:c, fontFamily:"'Bebas Neue',cursive" }}>{v}</div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)" }}>{l}</div>
              </div>
            ))}
          </div>
        )}
        {/* Pitcher eligibility & remaining pitches — ALL roster players */}
        <div style={card}>
          <p style={sectionLabel}>PITCHER STATUS & REMAINING PITCHES</p>
          <div style={{ display:"grid", gridTemplateColumns:t.day1IsHardLimit?"1fr auto auto":"1fr auto", gap:"4px 10px",
            fontSize:9, color:"rgba(255,255,255,0.3)", fontWeight:700, letterSpacing:1,
            paddingBottom:8, marginBottom:8, borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
            <span>PITCHER</span>
            {t.day1IsHardLimit && <span style={{textAlign:"right"}}>DAY 1 REM</span>}
            <span style={{textAlign:"right"}}>TOTAL REM</span>
          </div>
          {roster.map(p=>{
            const pGames = allEntries.filter(e=>e.playerId===p.id);
            const day1Used = pGames.filter(e=>e.tourneyDay===1).reduce((s,e)=>s+e.pitches,0);
            const totalUsed = pGames.reduce((s,e)=>s+e.pitches,0);
            const day1Rem = Math.max(0, t.maxDay1 - day1Used);
            const totalRem = Math.max(0, t.maxTotal - totalUsed);
            const exceededDay1 = t.day1IsHardLimit && day1Used > t.maxDay1;
            const exceededTotal = totalUsed >= t.maxTotal;
            const ineligible = exceededDay1 || exceededTotal;
            const ineligReason = exceededTotal
              ? `Exceeded total limit (${totalUsed}/${t.maxTotal}p)`
              : exceededDay1
              ? `Exceeded Day 1 limit (${day1Used}/${t.maxDay1}p)`
              : null;

            const totalPct = Math.min(totalUsed/t.maxTotal, 1);
            const nameColor = ineligible ? "#f43f5e" : "#f8fafc";
            const day1RemColor = exceededDay1 ? "#f43f5e" : day1Rem===0 ? "rgba(255,255,255,0.3)" : day1Rem<=10 ? "#fb923c" : "#4ade80";
            const totalRemColor = exceededTotal ? "#f43f5e" : totalRem<=15 ? "#fb923c" : "#38bdf8";

            return (
              <div key={p.id} style={{ marginBottom:10, paddingBottom:10,
                borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                {/* Row: name + remaining columns */}
                <div style={{ display:"grid", gridTemplateColumns:t.day1IsHardLimit?"1fr auto auto":"1fr auto", gap:"4px 10px", alignItems:"center", marginBottom:6 }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:nameColor, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {p.jersey?`#${p.jersey} `:""}{p.name}
                      </span>
                      {ineligible && (
                        <span style={{ fontSize:9, padding:"1px 6px", background:"rgba(244,63,94,0.15)",
                          border:"1px solid rgba(244,63,94,0.3)", borderRadius:20, color:"#f43f5e", fontWeight:700, flexShrink:0 }}>
                          INELIGIBLE
                        </span>
                      )}
                      {!ineligible && pGames.length===0 && (
                        <span style={{ fontSize:9, padding:"1px 6px", background:"rgba(74,222,128,0.1)",
                          border:"1px solid rgba(74,222,128,0.2)", borderRadius:20, color:"#4ade80", fontWeight:700, flexShrink:0 }}>
                          NOT YET PITCHED
                        </span>
                      )}
                    </div>
                    {ineligReason && (
                      <div style={{ fontSize:10, color:"rgba(244,63,94,0.7)", marginTop:1 }}>{ineligReason}</div>
                    )}
                    {!ineligible && pGames.length>0 && (
                      <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", marginTop:1 }}>
                        {totalUsed}p used of {t.maxTotal}p total
                      </div>
                    )}
                    {!ineligible && !t.day1IsHardLimit && day1Used>0 && day1Used>t.maxDay1 && (
                      <div style={{ fontSize:10, color:"rgba(251,191,36,0.7)", marginTop:1 }}>
                        ⚠ Day 1: {day1Used}/{t.maxDay1}p (over guideline)
                      </div>
                    )}
                  </div>
                  {t.day1IsHardLimit && (
                    <div style={{ textAlign:"right", minWidth:56 }}>
                      <div style={{ fontSize:15, fontWeight:800, color:day1RemColor, fontFamily:"'Bebas Neue',cursive", lineHeight:1 }}>
                        {exceededDay1 ? "—" : `${day1Rem}p`}
                      </div>
                      <div style={{ fontSize:9, color:"rgba(255,255,255,0.25)" }}>Day 1</div>
                    </div>
                  )}
                  <div style={{ textAlign:"right", minWidth:56 }}>
                    <div style={{ fontSize:15, fontWeight:800, color:totalRemColor, fontFamily:"'Bebas Neue',cursive", lineHeight:1 }}>
                      {exceededTotal ? "0p" : `${totalRem}p`}
                    </div>
                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.25)" }}>Total</div>
                  </div>
                </div>
                {/* Progress bar: total pitches used */}
                <div style={{ height:4, background:"rgba(255,255,255,0.06)", borderRadius:4 }}>
                  <div style={{ height:"100%", width:`${totalPct*100}%`, borderRadius:4,
                    background:ineligible?"#f43f5e":totalPct>=0.8?"#fb923c":"#38bdf8", transition:"width 0.3s" }}/>
                </div>
              </div>
            );
          })}
        </div>
        {Object.keys(byDay).length>0 && (
          <div style={card}>
            <p style={sectionLabel}>GAME LOG BY DAY</p>
            {Array.from({length:t.days},(_,i)=>i+1).map(day=>{
              const dayEntries = byDay[day]||[];
              const day1Label = day===1 ? `${t.maxDay1}p ${t.day1IsHardLimit?"hard limit":"guideline"}` : null;
              return (
                <div key={day} style={{ marginBottom:day<t.days?16:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#f59e0b", marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
                    <div style={{ width:22, height:22, borderRadius:6, background:"rgba(245,158,11,0.15)",
                      border:"1px solid rgba(245,158,11,0.3)", display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:11, fontWeight:800, color:"#f59e0b" }}>{day}</div>
                    Day {day} {day1Label && <span style={{ fontWeight:400, color:"rgba(255,255,255,0.4)", fontSize:12 }}>({day1Label})</span>}
                    {dayEntries.length===0 && <span style={{ color:"rgba(255,255,255,0.3)", fontWeight:400 }}>— No entries</span>}
                  </div>
                  {dayEntries.map((e,i)=>{
                    const rd = getRegRestDays(e.pitches);
                    return (
                      <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                        padding:"8px 10px", background:"rgba(255,255,255,0.02)", borderRadius:10, marginBottom:5 }}>
                        <div>
                          <div style={{ fontSize:13, color:"#f8fafc", fontWeight:600 }}>{e.jersey?`#${e.jersey} `:""}{e.playerName}</div>
                          <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)" }}>
                            {formatDate(e.date)}{e.opponent?` · vs ${e.opponent}`:""}
                            {day===1 && e.pitches>t.maxDay1 && <span style={{ color:t.day1IsHardLimit?"#f43f5e":"#fb923c", marginLeft:4 }}>⚠ over Day 1 {t.day1IsHardLimit?"limit":"guideline"}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontSize:17, fontWeight:800, color:(day===1&&e.pitches>t.maxDay1)?"#fb923c":"#38bdf8", fontFamily:"'Bebas Neue',cursive" }}>{e.pitches}p</div>
                          <div style={{ fontSize:11, color:rd===0?"#4ade80":rd<=2?"#fb923c":"#f43f5e", fontWeight:600 }}>{rd===0?"No rest":`${rd}d`}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
        {allEntries.length===0 && (
          <div style={{ textAlign:"center", padding:"30px 0", color:"rgba(255,255,255,0.3)" }}>
            <p style={{ fontSize:13 }}>No pitches logged for this tournament yet.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding:"0 16px 110px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 0 14px" }}>
        <div>
          <h2 style={{ margin:0, fontSize:24, fontWeight:800, color:"#f8fafc", fontFamily:"'Bebas Neue',cursive", letterSpacing:2 }}>TOURNAMENTS</h2>
          <p style={{ margin:0, fontSize:12, color:"rgba(255,255,255,0.4)" }}>{tournaments.length} configured</p>
        </div>
        <button onClick={()=>setView("create")} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px",
          background:"linear-gradient(135deg,#d97706,#b45309)", border:"none", borderRadius:20,
          color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", boxShadow:"0 2px 12px rgba(217,119,6,0.35)" }}>
          {I.plus} New
        </button>
      </div>
      {tournaments.length===0 ? (
        <div style={{ textAlign:"center", padding:"60px 0", color:"rgba(255,255,255,0.2)" }}>
          <div style={{ fontSize:56, marginBottom:12 }}>🏆</div>
          <p style={{ fontSize:15, fontWeight:600 }}>No tournaments yet</p>
          <p style={{ fontSize:13 }}>Tap "New" to configure a tournament with custom pitch rules</p>
        </div>
      ) : tournaments.map(t=>{
        const entries = roster.flatMap(p=>(p.history||[]).filter(h=>h.tournamentId===t.id));
        const players = new Set(entries.map(e=>e.playerId||"?")).size;
        const today = todayStr();
        const endDate = t.startDate ? addDays(t.startDate, t.days - 1) : null;
        const tStatus = !t.startDate ? null
          : today < t.startDate ? "upcoming"
          : endDate && today <= endDate ? "active"
          : "past";
        const tBadge = tStatus==="active" ? { label:"ACTIVE", color:"#4ade80", bg:"rgba(74,222,128,0.12)", border:"rgba(74,222,128,0.3)" }
          : tStatus==="upcoming" ? { label:"UPCOMING", color:"#38bdf8", bg:"rgba(56,189,248,0.1)", border:"rgba(56,189,248,0.25)" }
          : tStatus==="past" ? { label:"PAST", color:"rgba(255,255,255,0.35)", bg:"rgba(255,255,255,0.05)", border:"rgba(255,255,255,0.1)" }
          : null;
        return (
          <div key={t.id} onClick={()=>setView(t.id)}
            style={{ display:"flex", alignItems:"center", gap:12, padding:14, marginBottom:8,
              background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)",
              borderLeft:`3px solid ${tStatus==="active"?"#4ade80":tStatus==="upcoming"?"#38bdf8":"#f59e0b"}`, borderRadius:14, cursor:"pointer" }}>
            <div style={{ width:42, height:42, borderRadius:11, background:"rgba(245,158,11,0.12)",
              border:"1px solid rgba(245,158,11,0.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>🏆</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                <span style={{ fontSize:15, fontWeight:700, color:"#f8fafc" }}>{t.name}</span>
                {tBadge && <span style={{ fontSize:9, fontWeight:800, letterSpacing:0.8, padding:"2px 6px",
                  borderRadius:5, color:tBadge.color, background:tBadge.bg, border:`1px solid ${tBadge.border}` }}>{tBadge.label}</span>}
              </div>
              {t.startDate && <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginTop:1 }}>
                {formatDate(t.startDate)}{endDate && endDate!==t.startDate ? ` – ${formatDate(endDate)}` : ""}
              </div>}
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.35)", marginTop:1 }}>
                {t.days} day{t.days!==1?"s":""} · Day 1: {t.maxDay1}p {t.day1IsHardLimit?"(hard limit)":"(guideline)"} · {t.maxTotal}p total
              </div>
              {entries.length>0 && <div style={{ fontSize:11, color:"rgba(255,255,255,0.3)", marginTop:1 }}>{entries.length} appearances · {players} pitcher{players!==1?"s":""}</div>}
            </div>
            <div style={{ color:"rgba(255,255,255,0.2)", flexShrink:0 }}>{I.chevron}</div>
          </div>
        );
      })}
    </div>
  );
}
