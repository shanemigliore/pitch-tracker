// Settings — the Settings tab: add pitchers, manage tournaments, activity log.
// A small sub-nav over three sections that used to be their own top-level tabs.
// Babel/JSX component, loaded via <script type="text/babel" src="components/Settings.js"></script>.

// ══════════════════════════════════════════════════════════════════════════════
// ADD PITCHER (Settings sub-section) — ported from the old standalone Roster tab
// ══════════════════════════════════════════════════════════════════════════════
function AddPitcherSection({ roster, onAdd }) {
  const [name, setName] = useState("");
  const [jersey, setJersey] = useState("");
  const [jerseyErr, setJerseyErr] = useState("");
  const [confirmDupeName, setConfirmDupeName] = useState(false);

  function validateJersey(val) {
    if (!val) return "";
    if (!/^\d{1,2}$/.test(val)) return "Must be a number 0–99";
    // Compare numerically, not as strings - "7" and "07" are the same number
    if (roster.some(p => p.jersey && parseInt(p.jersey, 10) === parseInt(val, 10))) return `#${val} is already taken`;
    return "";
  }

  function submit(confirmed=false) {
    if (!name.trim()) return;
    const err = validateJersey(jersey);
    if (err) { setJerseyErr(err); return; }
    // Duplicate jersey numbers are a hard block (above); duplicate names are
    // plausible on a real roster (two kids can share a first name), so just
    // confirm rather than block.
    const dupeName = roster.some(p => p.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (dupeName && !confirmed) { setConfirmDupeName(true); return; }
    onAdd({ id:newId(), name:name.trim(), jersey:jersey.trim(),
      lastPitches:0, lastGameDate:null, history:[] });
    setName(""); setJersey(""); setJerseyErr(""); setConfirmDupeName(false);
  }

  return (
    <div style={{ padding:"0 16px 110px" }}>
      <div style={{ ...card, border:"1px solid rgba(255,255,255,0.12)" }}>
        <p style={sectionLabel}>NEW PLAYER</p>
        <input aria-label="Full name" placeholder="Full name" value={name}
          onChange={e=>{ setName(e.target.value); setConfirmDupeName(false); }}
          onKeyDown={e=>e.key==="Enter"&&submit()} style={{ ...inputStyle, marginBottom:8 }}/>
        <input aria-label="Jersey number" placeholder="e.g. 07 (optional)" value={jersey}
          onChange={e=>{ const v=e.target.value.replace(/\D/g,"").slice(0,2); setJersey(v); setJerseyErr(v?validateJersey(v):""); }}
          style={{ ...inputStyle, marginBottom:jerseyErr?4:10, width:120, textAlign:"center",
            border:jerseyErr?"1px solid rgba(244,63,94,0.6)":inputStyle.border }}/>
        {jerseyErr && <div style={{ fontSize:11, color:"#f87171", marginBottom:8 }}>{jerseyErr}</div>}
        {confirmDupeName && (
          <div style={{ fontSize:12, color:"#fbbf24", marginBottom:8, padding:"8px 10px",
            background:"rgba(251,191,36,0.08)", border:"1px solid rgba(251,191,36,0.3)", borderRadius:8 }}>
            A pitcher named "{name.trim()}" already exists — add anyway?
          </div>
        )}
        {confirmDupeName ? (
          <button onClick={()=>submit(true)} style={{ ...primaryBtn, width:"100%",
            background:"linear-gradient(135deg,#ea580c,#c2410c)" }}>Add Anyway</button>
        ) : (
          <button onClick={()=>submit()} style={{ ...primaryBtn, width:"100%" }}>{I.plus} Add to Roster</button>
        )}
      </div>

      {roster.length>0 && (
        <div style={{ ...card, marginTop:12 }}>
          <p style={sectionLabel}>CURRENT ROSTER ({roster.length})</p>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {[...roster].sort((a,b)=>a.name.localeCompare(b.name)).map(p=>(
              <span key={p.id} style={{ fontSize:12, padding:"5px 10px", borderRadius:20,
                background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.6)" }}>
                {p.jersey?`#${p.jersey} `:""}{p.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: SETTINGS
// ══════════════════════════════════════════════════════════════════════════════
function Settings({ roster, onAddPlayer, tournaments, onAddTourney, onDeleteTourney, onUpdateTourney,
  auditLog, onUndo, undidIds, onUndid }) {
  const [section, setSection] = useState("roster");

  const sections = [
    ["roster", "Roster"],
    ["tournaments", "Tournaments"],
    ["activity", "Activity"],
  ];

  return (
    <div>
      <div style={{ padding:"16px 16px 14px" }}>
        <h2 style={{ margin:0, fontSize:24, fontWeight:800, color:"#f8fafc", fontFamily:"'Bebas Neue',cursive", letterSpacing:2 }}>SETTINGS</h2>
      </div>

      <div style={{ display:"flex", gap:8, margin:"0 16px 14px" }}>
        {sections.map(([id,label])=>(
          <button key={id} onClick={()=>setSection(id)} aria-pressed={section===id}
            style={{ flex:1, padding:"10px", borderRadius:12,
              border:`1px solid ${section===id?"#38bdf8":"rgba(255,255,255,0.1)"}`,
              background:section===id?"rgba(56,189,248,0.15)":"rgba(255,255,255,0.04)",
              color:section===id?"#38bdf8":"rgba(255,255,255,0.5)", fontSize:13, fontWeight:700, cursor:"pointer" }}>
            {label}
          </button>
        ))}
      </div>

      {section==="roster" && <AddPitcherSection roster={roster} onAdd={onAddPlayer}/>}
      {section==="tournaments" && (
        <TournamentScreen roster={roster} tournaments={tournaments}
          onAddTourney={onAddTourney} onDeleteTourney={onDeleteTourney} onUpdateTourney={onUpdateTourney}/>
      )}
      {section==="activity" && (
        <ActivityScreen auditLog={auditLog} roster={roster} onUndo={onUndo} undidIds={undidIds} onUndid={onUndid}/>
      )}
    </div>
  );
}
