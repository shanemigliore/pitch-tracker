// Settings — the Settings tab: add pitchers, manage tournaments, activity log.
// A small sub-nav over three sections that used to be their own top-level tabs.
// Babel/JSX component, loaded via <script type="text/babel" src="components/Settings.js"></script>.

// ══════════════════════════════════════════════════════════════════════════════
// ADD PITCHER (Settings sub-section) — ported from the old standalone Roster tab
// ══════════════════════════════════════════════════════════════════════════════
function AddPitcherSection({ roster, onAdd, onDelete }) {
  const [name, setName] = useState("");
  const [jersey, setJersey] = useState("");
  const [jerseyErr, setJerseyErr] = useState("");
  const [confirmDupeName, setConfirmDupeName] = useState(false);
  // "idle" -> "select" (pick who) -> "confirm" (type DELETE) -> back to "idle".
  // Deliberately slower than a single tap+confirm: this is the only place in
  // the app a pitcher can be removed at all (see PitcherDetail.js).
  const [deletePhase, setDeletePhase] = useState("idle");
  const [selectedDeleteId, setSelectedDeleteId] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  function resetDeleteFlow() {
    setDeletePhase("idle"); setSelectedDeleteId(null); setDeleteConfirmText("");
  }

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
        <p style={sectionTitle}>NEW PLAYER</p>
        <input aria-label="Name" placeholder="Name" value={name}
          onChange={e=>{ setName(e.target.value); setConfirmDupeName(false); }}
          onKeyDown={e=>e.key==="Enter"&&submit()} style={{ ...inputStyle, marginBottom:8 }}/>
        <input aria-label="Jersey number" placeholder="Jersey #" value={jersey} inputMode="numeric"
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
          <p style={sectionTitle}>CURRENT ROSTER ({roster.length})</p>
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

      {roster.length>0 && (
        <div style={{ ...card, marginTop:12 }}>
          <p style={{ ...sectionTitle, color:"rgba(244,63,94,0.7)" }}>DANGER ZONE</p>

          {deletePhase==="idle" && (
            <button onClick={()=>setDeletePhase("select")} style={{ width:"100%", background:"transparent",
              border:"1px solid rgba(244,63,94,0.2)", borderRadius:14, padding:12, color:"rgba(244,63,94,0.6)",
              fontSize:14, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              {I.trash} Delete a Player
            </button>
          )}

          {deletePhase==="select" && (() => {
            const selected = roster.find(p=>p.id===selectedDeleteId);
            return (
              <>
                <p style={{ margin:"0 0 10px", fontSize:12, color:"rgba(255,255,255,0.4)" }}>Select a player to remove.</p>
                <div style={{ marginBottom:12 }}>
                  {[...roster].sort((a,b)=>a.name.localeCompare(b.name)).map(p=>{
                    const isActive = p.id===selectedDeleteId;
                    return (
                      <div key={p.id} onClick={()=>setSelectedDeleteId(p.id)}
                        style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 10px", borderRadius:10, marginBottom:4,
                          cursor:"pointer", background:isActive?"rgba(244,63,94,0.1)":"rgba(255,255,255,0.02)",
                          border:`1px solid ${isActive?"rgba(244,63,94,0.4)":"rgba(255,255,255,0.05)"}` }}>
                        <span style={{ fontSize:14, fontWeight:600, color:isActive?"#f87171":"rgba(255,255,255,0.8)" }}>
                          {p.jersey?`#${p.jersey} `:""}{p.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={resetDeleteFlow} style={{ ...cancelBtn, flex:1 }}>Cancel</button>
                  <button onClick={()=>setDeletePhase("confirm")} disabled={!selected}
                    style={{ flex:2, background:"linear-gradient(135deg,#dc2626,#b91c1c)", border:"none",
                      borderRadius:12, padding:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer",
                      opacity:selected?1:0.4 }}>
                    Delete Selected Player
                  </button>
                </div>
              </>
            );
          })()}

          {deletePhase==="confirm" && (() => {
            const selected = roster.find(p=>p.id===selectedDeleteId);
            if (!selected) {
              // Selected player vanished mid-flow (e.g. removed from another
              // device) - don't setState during render, just offer a way out.
              return (
                <div style={{ padding:12, borderRadius:12,
                  background:"rgba(244,63,94,0.08)", border:"1px solid rgba(244,63,94,0.25)" }}>
                  <p style={{ margin:"0 0 10px", fontSize:13, color:"rgba(255,255,255,0.6)" }}>
                    That player is no longer on the roster.
                  </p>
                  <button onClick={resetDeleteFlow} style={{ ...cancelBtn, width:"100%" }}>Back</button>
                </div>
              );
            }
            return (
              <div style={{ padding:12, borderRadius:12,
                background:"rgba(244,63,94,0.08)", border:"1px solid rgba(244,63,94,0.25)" }}>
                <p style={{ margin:"0 0 10px", fontSize:13, color:"#f87171", fontWeight:600 }}>
                  Type DELETE to permanently remove {selected.name} and all their pitch history.
                </p>
                <input value={deleteConfirmText} onChange={e=>setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE" aria-label="Type DELETE to confirm" style={{ ...inputStyle, marginBottom:10 }}/>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={resetDeleteFlow} style={{ ...cancelBtn, flex:1 }}>Cancel</button>
                  <button onClick={()=>{ onDelete(selected.id); resetDeleteFlow(); }} disabled={deleteConfirmText!=="DELETE"}
                    style={{ flex:2, background:"linear-gradient(135deg,#dc2626,#b91c1c)", border:"none",
                      borderRadius:12, padding:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer",
                      opacity:deleteConfirmText!=="DELETE"?0.4:1 }}>
                    Confirm Delete
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ACCOUNT (Settings sub-section) — who's signed in + log out
// ══════════════════════════════════════════════════════════════════════════════
function AccountSection({ role, onLogout }) {
  function handleLogout() {
    if (!confirm("Log out of this device?")) return;
    onLogout();
  }

  return (
    <div style={{ padding:"0 16px 110px" }}>
      <div style={{ ...card, border:"1px solid rgba(255,255,255,0.12)" }}>
        <p style={sectionTitle}>SIGNED IN AS</p>
        <div style={{ fontSize:16, fontWeight:700, color:"#f8fafc", marginBottom:2 }}>{getCoachName() || "—"}</div>
        <div style={{ fontSize:13, color:"rgba(255,255,255,0.4)" }}>{role === "admin" ? "Admin" : "Coach"}</div>
      </div>

      <div style={{ ...card, marginTop:12, border:"1px solid rgba(244,63,94,0.15)" }}>
        <button onClick={handleLogout} style={{ width:"100%", background:"transparent",
          border:"1px solid rgba(244,63,94,0.4)", borderRadius:12, padding:12,
          color:"rgba(220,38,38,0.8)", fontSize:14, fontWeight:700, cursor:"pointer" }}>
          Log Out
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: SETTINGS
// ══════════════════════════════════════════════════════════════════════════════
function Settings({ roster, onAddPlayer, onDeletePlayer, tournaments, onAddTourney, onDeleteTourney, onUpdateTourney,
  auditLog, onUndo, undidIds, onUndid, role, onLogout }) {
  const [section, setSection] = useState("roster");

  const sections = [
    ["roster", "Roster"],
    ["tournaments", "Tournaments"],
    ["activity", "Activity"],
    ["account", "Account"],
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

      {section==="roster" && <AddPitcherSection roster={roster} onAdd={onAddPlayer} onDelete={onDeletePlayer}/>}
      {section==="tournaments" && (
        <TournamentScreen roster={roster} tournaments={tournaments}
          onAddTourney={onAddTourney} onDeleteTourney={onDeleteTourney} onUpdateTourney={onUpdateTourney}/>
      )}
      {section==="activity" && (
        <ActivityScreen auditLog={auditLog} roster={roster} onUndo={onUndo} undidIds={undidIds} onUndid={onUndid}/>
      )}
      {section==="account" && <AccountSection role={role} onLogout={onLogout}/>}
    </div>
  );
}
