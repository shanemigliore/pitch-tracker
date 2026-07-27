// TournamentScreen — create/edit/delete tournaments (Settings sub-section).
// Viewing a tournament's actual games/pitch usage now lives on the Season tab,
// grouped under that tournament, not here - this is config only.
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
    setView("list");
  }

  if (view==="create") {
    return (
      <div style={{ padding:"0 16px 110px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 0 18px" }}>
          <button onClick={()=>setView("list")} aria-label="Back to tournaments" style={{ background:"rgba(255,255,255,0.07)", border:"none", borderRadius:10,
            padding:10, color:"rgba(255,255,255,0.7)", cursor:"pointer", display:"flex" }}>{I.back}</button>
          <h2 style={{ margin:0, fontSize:22, fontWeight:800, color:"#f8fafc", fontFamily:"'Bebas Neue',cursive", letterSpacing:1.5 }}>NEW TOURNAMENT</h2>
        </div>
        <div style={card}>
          <p style={sectionLabel}>DETAILS</p>
          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>NAME</label>
          <input placeholder="e.g. District 5 Tournament" value={name} onChange={e=>setName(e.target.value)} aria-label="Tournament name"
            style={{ ...inputStyle, marginBottom:10 }}/>
          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>START DATE</label>
          <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} aria-label="Start date"
            style={{ ...inputStyle, marginBottom:10 }}/>
          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>NUMBER OF DAYS</label>
          <div style={{ display:"flex", gap:8, marginBottom:days==="custom"?10:0 }}>
            {[["1","1"],["2","2"],["custom","Custom"]].map(([val,label])=>(
              <button key={val} onClick={()=>setDays(val)} aria-pressed={days===val}
                style={{ flex:1, height:42, borderRadius:10,
                  border:`1px solid ${days===val?"#38bdf8":"rgba(255,255,255,0.1)"}`,
                  background:days===val?"rgba(56,189,248,0.15)":"rgba(255,255,255,0.04)",
                  color:days===val?"#38bdf8":"rgba(255,255,255,0.6)", fontSize:14, fontWeight:700, cursor:"pointer",
                  fontFamily:"'Bebas Neue',cursive" }}>{label}</button>
            ))}
          </div>
          {days==="custom" && (
            <input type="number" min="1" max="14" placeholder="Number of days" aria-label="Number of days"
              value={customDays} onChange={e=>setCustomDays(e.target.value)}
              style={{ ...inputStyle, textAlign:"center", fontSize:18, fontWeight:800,
                fontFamily:"'Bebas Neue',cursive" }}/>
          )}
        </div>
        <div style={card}>
          <p style={sectionLabel}>PITCH RULES</p>

          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>MAX PITCHES — DAY 1</label>
          <input type="number" min="1" placeholder="55" value={maxDay1} onChange={e=>setMaxDay1(e.target.value)} aria-label="Max pitches day 1"
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
          <input type="number" min="1" placeholder="115" value={maxTotal} onChange={e=>setMaxTotal(e.target.value)} aria-label="Max total pitches"
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
    const t = tournaments.find(x=>x.id===editId);
    return (
      <div style={{ padding:"0 16px 110px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 0 18px" }}>
          <button onClick={()=>{ setEditId(null); setView("list"); setConfirmDeleteTourney(false); }} aria-label="Back to tournaments" style={{ background:"rgba(255,255,255,0.07)", border:"none", borderRadius:10,
            padding:10, color:"rgba(255,255,255,0.7)", cursor:"pointer", display:"flex" }}>{I.back}</button>
          <h2 style={{ margin:0, fontSize:22, fontWeight:800, color:"#f8fafc", fontFamily:"'Bebas Neue',cursive", letterSpacing:1.5 }}>EDIT TOURNAMENT</h2>
        </div>
        <div style={card}>
          <p style={sectionLabel}>DETAILS</p>
          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>NAME</label>
          <input placeholder="e.g. District 5 Tournament" value={name} onChange={e=>setName(e.target.value)} aria-label="Tournament name"
            style={{ ...inputStyle, marginBottom:10 }}/>
          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>START DATE</label>
          <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} aria-label="Start date"
            style={{ ...inputStyle, marginBottom:10 }}/>
          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>NUMBER OF DAYS</label>
          <div style={{ display:"flex", gap:8, marginBottom:days==="custom"?10:0 }}>
            {[["1","1"],["2","2"],["custom","Custom"]].map(([val,label])=>(
              <button key={val} onClick={()=>setDays(val)} aria-pressed={days===val}
                style={{ flex:1, height:42, borderRadius:10,
                  border:`1px solid ${days===val?"#38bdf8":"rgba(255,255,255,0.1)"}`,
                  background:days===val?"rgba(56,189,248,0.15)":"rgba(255,255,255,0.04)",
                  color:days===val?"#38bdf8":"rgba(255,255,255,0.6)", fontSize:14, fontWeight:700, cursor:"pointer",
                  fontFamily:"'Bebas Neue',cursive" }}>{label}</button>
            ))}
          </div>
          {days==="custom" && (
            <input type="number" min="1" max="14" placeholder="Number of days" aria-label="Number of days"
              value={customDays} onChange={e=>setCustomDays(e.target.value)}
              style={{ ...inputStyle, textAlign:"center", fontSize:18, fontWeight:800,
                fontFamily:"'Bebas Neue',cursive" }}/>
          )}
        </div>
        <div style={card}>
          <p style={sectionLabel}>PITCH RULES</p>
          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>MAX PITCHES — DAY 1</label>
          <input type="number" min="1" placeholder="55" value={maxDay1} onChange={e=>setMaxDay1(e.target.value)} aria-label="Max pitches day 1"
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
          <input type="number" min="1" placeholder="115" value={maxTotal} onChange={e=>setMaxTotal(e.target.value)} aria-label="Max total pitches"
            style={{ ...inputStyle, fontSize:18, fontFamily:"'Bebas Neue',cursive", fontWeight:800, textAlign:"center" }}/>
        </div>
        <button onClick={handleSaveEdit} disabled={!name.trim()}
          style={{ ...primaryBtn, width:"100%", padding:14, opacity:name.trim()?1:0.4,
            background:"linear-gradient(135deg,#1d4ed8,#1e40af)",
            boxShadow:"0 4px 20px rgba(29,78,216,0.35)" }}>
          Save Changes
        </button>

        {!confirmDeleteTourney ? (
          <button onClick={()=>setConfirmDeleteTourney(true)} style={{ width:"100%", background:"transparent",
            border:"1px solid rgba(244,63,94,0.2)", borderRadius:14, padding:12, marginTop:10, color:"rgba(244,63,94,0.6)",
            fontSize:14, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            {I.trash} Delete Tournament
          </button>
        ) : (
          <div style={{ background:"rgba(244,63,94,0.08)", border:"1px solid rgba(244,63,94,0.25)",
            borderRadius:14, padding:14, marginTop:10 }}>
            <p style={{ margin:"0 0 10px", fontSize:13, color:"#f87171", fontWeight:600, textAlign:"center" }}>
              Delete "{t?.name}"? All pitch data logged for this tournament will be removed from history.
            </p>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>setConfirmDeleteTourney(false)} style={{ ...cancelBtn, flex:1 }}>Keep It</button>
              <button onClick={()=>{ onDeleteTourney(editId); setEditId(null); setView("list"); setConfirmDeleteTourney(false); }}
                style={{ flex:2, background:"linear-gradient(135deg,#dc2626,#b91c1c)", border:"none",
                  borderRadius:12, padding:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                Yes, Delete
              </button>
            </div>
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
          <div key={t.id} onClick={()=>openEdit(t)}
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
