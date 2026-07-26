// RosterScreen — Roster tab: lists pitchers with availability chips; add pitcher form.
// Babel/JSX component, loaded via <script type="text/babel" src="components/RosterScreen.js"></script>.

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: ROSTER
// ══════════════════════════════════════════════════════════════════════════════
function RosterScreen({ roster, onAdd, onSelect, tournaments }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [jersey, setJersey] = useState("");
  const [jerseyErr, setJerseyErr] = useState("");

  const totalPitches = p => (p.history || []).reduce((s, g) => s + (g.pitches || 0), 0);
  const sorted = [...roster].sort((a, b) => totalPitches(b) - totalPitches(a));
  const available = sorted.filter(p=>getAvailabilityStatus(p, null, tournaments)==="available").length;

  function validateJersey(val) {
    if (!val) return "";
    if (!/^\d{1,2}$/.test(val)) return "Must be a number 0–99";
    return "";
  }

  function submit() {
    if (!name.trim()) return;
    const err = validateJersey(jersey);
    if (err) { setJerseyErr(err); return; }
    onAdd({ id:Date.now(), name:name.trim(), jersey:jersey.trim(),
      lastPitches:0, lastGameDate:null, history:[] });
    setName(""); setJersey(""); setJerseyErr(""); setOpen(false);
  }

  return (
    <div style={{ padding:"0 16px 110px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 0 14px" }}>
        <div>
          <h2 style={{ margin:0, fontSize:24, fontWeight:800, color:"#f8fafc", fontFamily:"'Bebas Neue',cursive", letterSpacing:2 }}>ROSTER</h2>
          <p style={{ margin:0, fontSize:12, color:"rgba(255,255,255,0.4)" }}>{available} of {roster.length} available today</p>
        </div>
        <button onClick={()=>setOpen(!open)} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px",
          background:"linear-gradient(135deg,#16a34a,#15803d)", border:"none", borderRadius:20,
          color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", boxShadow:"0 2px 12px rgba(22,163,74,0.35)" }}>
          {I.plus} Add
        </button>
      </div>

      {open && (
        <div style={{ ...card, border:"1px solid rgba(255,255,255,0.12)", backdropFilter:"blur(12px)" }}>
          <p style={sectionLabel}>NEW PLAYER</p>
          <input placeholder="Full name" value={name} onChange={e=>setName(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&submit()} style={{ ...inputStyle, marginBottom:8 }}/>
          <input placeholder="e.g. 07 (optional)" value={jersey}
            onChange={e=>{ const v=e.target.value.replace(/\D/g,"").slice(0,2); setJersey(v); setJerseyErr(v?validateJersey(v):""); }}
            style={{ ...inputStyle, marginBottom:jerseyErr?4:10, width:120, textAlign:"center",
              border:jerseyErr?"1px solid rgba(244,63,94,0.6)":inputStyle.border }}/>
          {jerseyErr && <div style={{ fontSize:11, color:"#f87171", marginBottom:8 }}>{jerseyErr}</div>}
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>setOpen(false)} style={cancelBtn}>Cancel</button>
            <button onClick={submit} style={{ ...primaryBtn, flex:2 }}>Add to Roster</button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div style={{ textAlign:"center", padding:"60px 0", color:"rgba(255,255,255,0.2)" }}>
          <div style={{ fontSize:56, marginBottom:12 }}>⚾</div>
          <p style={{ fontSize:15, fontWeight:600 }}>No players yet</p>
          <p style={{ fontSize:13 }}>Tap "Add" to build your roster</p>
        </div>
      ) : sorted.map(p => {
        const status = getAvailabilityStatus(p, null, tournaments);
        const s = STATUS[status];
        const left = daysUntilEligible(p, null, tournaments);
        return (
          <div key={p.id} onClick={()=>onSelect(p)}
            style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", marginBottom:8,
              background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)",
              borderLeft:`3px solid ${s.color}`, borderRadius:14, cursor:"pointer" }}>
            <div style={{ width:42, height:42, borderRadius:11, background:s.bg, border:`1px solid ${s.ring}`,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontFamily:"'Bebas Neue',cursive", fontSize:16, color:s.color, flexShrink:0 }}>
              {p.jersey?`#${p.jersey}`:p.name[0].toUpperCase()}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, color:"#f8fafc", fontSize:15 }}>{p.name}</div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3 }}>
              <Chip status={status}/>
              {left>0 && <span style={{ fontSize:11, color:"rgba(255,255,255,0.55)", fontWeight:600 }}>Eligible {formatDate(getEligibleDateStr(p, tournaments))}</span>}
              {p.lastPitches>0 && <span style={{ fontSize:11, color:"rgba(255,255,255,0.3)" }}>Last: {p.lastPitches}p on {formatDate(p.lastGameDate)}</span>}
            </div>
            <div style={{ color:"rgba(255,255,255,0.2)" }}>{I.chevron}</div>
          </div>
        );
      })}

      {roster.length>0 && (
        <div style={{ ...card, marginTop:4 }}>
          <p style={sectionLabel}>AVAILABILITY KEY</p>
          <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
            {Object.entries(STATUS).map(([k,v])=>(
              <span key={k} style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:"rgba(255,255,255,0.5)" }}>
                <span style={{ width:7, height:7, borderRadius:"50%", background:v.color }}/>{v.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...card, marginTop:4 }}>
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
  );
}
