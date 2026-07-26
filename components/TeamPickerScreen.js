// TeamPickerScreen — team selection / create / manage (pre-app).
// Babel/JSX component, loaded via <script type="text/babel" src="components/TeamPickerScreen.js"></script>.

// ══════════════════════════════════════════════════════════════════════════════
// TEAM PICKER — Select or create a team
// ══════════════════════════════════════════════════════════════════════════════
function TeamPickerScreen({ onSelect, showManage, onTeamMetaUpdate }) {
  const [teams, setTeams]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(null); // team object being managed
  const [newName, setNewName]   = useState("");
  const [newRules, setNewRules] = useState({ ...DEFAULT_RULES });
  const [saving, setSaving]     = useState(false);
  const [renameName, setRenameName] = useState("");
  const [editRules, setEditRules]   = useState({ ...DEFAULT_RULES });
  const [deletePhase, setDeletePhase] = useState("idle");
  const [deleteText, setDeleteText]   = useState("");
  const [hoveredTeamId, setHoveredTeamId] = useState(null);

  useEffect(() => {
    Promise.all([window.__fbMigrateIfNeeded(), window.__fbCreatePrime12U(), window.__fbCreatePrime10U()]).then(() =>
      window.__fbListTeams().then(list => { setTeams(list); setLoading(false); })
    );
  }, []);

  function refreshTeams() {
    window.__fbListTeams().then(list => setTeams(list));
  }

  function handleCreate() {
    if (!newName.trim() || saving) return;
    const rules = {
      maxPitches: Math.max(1, parseInt(newRules.maxPitches)||55),
      rest1: Math.max(0, parseInt(newRules.rest1)||20),
      rest2: Math.max(0, parseInt(newRules.rest2)||40),
      rest3: Math.max(0, parseInt(newRules.rest3)||60),
    };
    const teamId = newId();
    const meta   = { name: newName.trim(), rules, createdAt: todayStr() };
    setSaving(true);
    window.__fbCreateTeam(teamId, meta).then(() => {
      setSaving(false);
      setCreating(false);
      setNewName("");
      setNewRules({ ...DEFAULT_RULES });
      onSelect(teamId, meta);
    }).catch(() => setSaving(false));
  }

  function handleSaveChanges() {
    if (!renameName.trim() || !managing) return;
    const rules = {
      maxPitches: Math.max(1, parseInt(editRules.maxPitches)||55),
      rest1: Math.max(0, parseInt(editRules.rest1)||20),
      rest2: Math.max(0, parseInt(editRules.rest2)||40),
      rest3: Math.max(0, parseInt(editRules.rest3)||60),
    };
    const updatedMeta = { name: renameName.trim(), rules };
    window.__fbUpdateTeamMeta(managing.id, updatedMeta).then(() => {
      if (onTeamMetaUpdate) onTeamMetaUpdate(managing.id, updatedMeta);
      refreshTeams();
      setManaging(null);
    });
  }

  function handleDelete() {
    if (deleteText !== "DELETE TEAM" || !managing) return;
    window.__fbDeleteTeam(managing.id).then(() => {
      refreshTeams();
      setManaging(null);
      setDeletePhase("idle");
      setDeleteText("");
    });
  }

  const ruleField = (label, key, hint) => (
    <div style={{ marginBottom:10 }}>
      <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>{label}</label>
      <input type="number" min="0" value={newRules[key]}
        onChange={e=>setNewRules(r=>({...r,[key]:e.target.value}))}
        style={{ ...inputStyle, marginBottom:2 }}/>
      {hint && <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)" }}>{hint}</div>}
    </div>
  );

  return (
    <div style={{ background:"#080c14", minHeight:"100vh", padding:"0 16px 40px",
      fontFamily:"'Barlow',sans-serif", color:"#f8fafc",
      backgroundImage:"radial-gradient(ellipse at 20% 0%,rgba(30,58,138,0.25) 0%,transparent 60%)" }}>

      {/* Header */}
      <div style={{ padding:"32px 0 20px", display:"flex", alignItems:"center", gap:14 }}>
        <img src={LOGO_URI} alt="Prime Baseball" style={{ width:52, height:52, borderRadius:"50%", flexShrink:0 }}/>
        <div>
          <div style={{ fontSize:26, fontWeight:900, color:"#f8fafc", fontFamily:"'Bebas Neue',cursive", letterSpacing:2, lineHeight:1 }}>PRIME PITCHING</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginTop:2 }}>
            {showManage ? "Switch or manage teams" : "Select your team to get started"}
          </div>
        </div>
      </div>

      {/* Team list */}
      {loading ? (
        <div style={{ textAlign:"center", padding:"40px 0", color:"rgba(255,255,255,0.3)", fontSize:14 }}>Loading teams…</div>
      ) : (
        <div style={{ ...card, marginBottom:12 }}>
          <p style={sectionLabel}>TEAMS</p>
          {teams.length === 0 && (
            <div style={{ fontSize:13, color:"rgba(255,255,255,0.3)", paddingBottom:4 }}>No teams yet — create one below.</div>
          )}
          {teams.map(t => (
            <div key={t.id}
              onMouseEnter={()=>setHoveredTeamId(t.id)} onMouseLeave={()=>setHoveredTeamId(null)}
              style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 8px", margin:"0 -8px",
                borderRadius:10, borderBottom:"1px solid rgba(255,255,255,0.05)",
                background:hoveredTeamId===t.id?"rgba(255,255,255,0.05)":"transparent",
                transition:"background 0.15s" }}>
              <button onClick={()=>onSelect(t.id, t)}
                style={{ flex:1, textAlign:"left", background:"transparent", border:"none",
                  cursor:"pointer", padding:0 }}>
                <div style={{ fontSize:15, fontWeight:700, color:hoveredTeamId===t.id?"#fff":"#f8fafc" }}>{t.name}</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginTop:2 }}>
                  Max {t.rules?.maxPitches||55}p · Rest: {t.rules?.rest1||20}/{t.rules?.rest2||40}/{t.rules?.rest3||60}
                </div>
              </button>
              <button onClick={()=>{ setManaging(t); setRenameName(t.name); setEditRules(t.rules||{...DEFAULT_RULES}); setDeletePhase("idle"); setDeleteText(""); }}
                style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)",
                  borderRadius:8, padding:"5px 10px", color:"rgba(255,255,255,0.5)", cursor:"pointer", fontSize:12 }}>
                ···
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create new team */}
      {!creating ? (
        <button onClick={()=>setCreating(true)}
          style={{ ...primaryBtn, width:"100%", marginBottom:16 }}>
          + Create New Team
        </button>
      ) : (
        <div style={{ ...card, border:"1px solid rgba(56,189,248,0.2)", marginBottom:16 }}>
          <p style={{ ...sectionLabel, color:"#38bdf8" }}>NEW TEAM</p>
          <div style={{ marginBottom:10 }}>
            <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>TEAM NAME</label>
            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="e.g. Prime 10U"
              style={inputStyle}/>
          </div>
          <p style={{ ...sectionLabel, marginTop:14, marginBottom:10 }}>PITCH COUNT RULES</p>
          {ruleField("Game max pitches", "maxPitches", "Maximum pitches allowed per game")}
          {ruleField("0→1 rest-day breakpoint", "rest1", "Pitches above this require 1 day rest")}
          {ruleField("1→2 rest-day breakpoint", "rest2", "Pitches above this require 2 days rest")}
          {ruleField("2→3 rest-day breakpoint", "rest3", "Pitches above this require 3 days rest")}
          <div style={{ display:"flex", gap:8, marginTop:4 }}>
            <button onClick={()=>{ setCreating(false); setNewName(""); setNewRules({...DEFAULT_RULES}); }} style={cancelBtn}>Cancel</button>
            <button onClick={handleCreate} disabled={!newName.trim()||saving}
              style={{ ...primaryBtn, flex:2, opacity:!newName.trim()||saving?0.5:1 }}>
              {saving ? "Creating…" : "Create Team"}
            </button>
          </div>
        </div>
      )}

      {/* Manage modal */}
      {managing && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:60,
          display:"flex", alignItems:"flex-end", justifyContent:"center" }}
          onClick={e=>{ if(e.target===e.currentTarget){ setManaging(null); setDeletePhase("idle"); setDeleteText(""); } }}>
          <div style={{ width:"100%", maxWidth:430, background:"#0f1623",
            border:"1px solid rgba(255,255,255,0.12)", borderRadius:"20px 20px 0 0",
            padding:"20px 18px 48px", fontFamily:"'Barlow',sans-serif",
            maxHeight:"85vh", overflowY:"auto" }}>

            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
              <div style={{ fontSize:16, fontWeight:800, color:"#f8fafc" }}>{managing.name}</div>
              <button onClick={()=>{ setManaging(null); setDeletePhase("idle"); setDeleteText(""); }}
                style={{ background:"rgba(255,255,255,0.07)", border:"none", borderRadius:8,
                  width:32, height:32, color:"rgba(255,255,255,0.5)", cursor:"pointer" }}>✕</button>
            </div>

            {deletePhase === "idle" && (
              <>
                <div style={{ ...card, border:"1px solid rgba(56,189,248,0.2)", marginBottom:12 }}>
                  <p style={{ ...sectionLabel, color:"#38bdf8" }}>EDIT TEAM</p>
                  <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>TEAM NAME</label>
                  <input value={renameName} onChange={e=>setRenameName(e.target.value)}
                    style={{ ...inputStyle, marginBottom:12 }}/>
                  <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>GAME MAX PITCHES</label>
                  <input type="number" min="1" value={editRules.maxPitches}
                    onChange={e=>setEditRules(r=>({...r,maxPitches:e.target.value}))}
                    style={{ ...inputStyle, marginBottom:4 }}/>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginBottom:10 }}>Maximum pitches allowed per game</div>
                  <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>0→1 REST-DAY BREAKPOINT</label>
                  <input type="number" min="0" value={editRules.rest1}
                    onChange={e=>setEditRules(r=>({...r,rest1:e.target.value}))}
                    style={{ ...inputStyle, marginBottom:4 }}/>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginBottom:10 }}>Pitches above this require 1 day rest</div>
                  <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>1→2 REST-DAY BREAKPOINT</label>
                  <input type="number" min="0" value={editRules.rest2}
                    onChange={e=>setEditRules(r=>({...r,rest2:e.target.value}))}
                    style={{ ...inputStyle, marginBottom:4 }}/>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginBottom:10 }}>Pitches above this require 2 days rest</div>
                  <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>2→3 REST-DAY BREAKPOINT</label>
                  <input type="number" min="0" value={editRules.rest3}
                    onChange={e=>setEditRules(r=>({...r,rest3:e.target.value}))}
                    style={{ ...inputStyle, marginBottom:12 }}/>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginBottom:12 }}>Pitches above this require 3 days rest</div>
                  <button onClick={handleSaveChanges} disabled={!renameName.trim()}
                    style={{ ...primaryBtn, width:"100%", opacity:!renameName.trim()?0.5:1 }}>Save Changes</button>
                </div>
                <div style={{ ...card, border:"1px solid rgba(244,63,94,0.15)" }}>
                  <p style={{ ...sectionLabel, color:"#f43f5e" }}>DANGER ZONE</p>
                  <button onClick={()=>setDeletePhase("confirm")}
                    style={{ background:"transparent", border:"1px solid rgba(220,38,38,0.4)",
                      borderRadius:8, padding:"5px 12px", color:"rgba(220,38,38,0.7)", cursor:"pointer",
                      fontSize:11, fontWeight:600, letterSpacing:0.3 }}>
                    Delete Team
                  </button>
                </div>
              </>
            )}

            {deletePhase === "confirm" && (
              <div style={{ ...card, border:"1px solid rgba(244,63,94,0.3)" }}>
                <p style={{ fontSize:14, color:"#f87171", fontWeight:700, marginBottom:8 }}>
                  Delete "{managing.name}"?
                </p>
                <p style={{ fontSize:13, color:"rgba(255,255,255,0.5)", marginBottom:16, lineHeight:1.5 }}>
                  All roster and game history will be archived. This cannot be undone from the app.
                  Type <strong style={{color:"#f87171"}}>DELETE TEAM</strong> to confirm.
                </p>
                <input value={deleteText} onChange={e=>setDeleteText(e.target.value)}
                  placeholder="DELETE TEAM" style={{ ...inputStyle, marginBottom:10 }}/>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={()=>{ setDeletePhase("idle"); setDeleteText(""); }} style={cancelBtn}>Cancel</button>
                  <button onClick={handleDelete} disabled={deleteText !== "DELETE TEAM"}
                    style={{ ...primaryBtn, flex:2, background:"linear-gradient(135deg,#dc2626,#b91c1c)",
                      opacity:deleteText!=="DELETE TEAM"?0.4:1 }}>
                    Confirm Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
