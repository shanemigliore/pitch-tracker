// TeamPickerScreen — team selection / create / manage (pre-app).
// Babel/JSX component, loaded via <script type="text/babel" src="components/TeamPickerScreen.js"></script>.

// ══════════════════════════════════════════════════════════════════════════════
// TEAM PICKER — Select or create a team
// ══════════════════════════════════════════════════════════════════════════════
function TeamPickerScreen({ onSelect, showManage, onTeamMetaUpdate }) {
  const TERM_OPTIONS = ["Winter", "Spring", "Summer", "Fall"];
  const NEW_SEASON = "__NEW__";

  const [teams, setTeams]       = useState([]);
  const [seasons, setSeasons]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(null); // team object being managed
  const [newName, setNewName]   = useState("");
  const [newRules, setNewRules] = useState({ ...DEFAULT_RULES });
  const [newSeasonId, setNewSeasonId]     = useState("");
  const [newSeasonTerm, setNewSeasonTerm] = useState("Spring");
  const [newSeasonYear, setNewSeasonYear] = useState(new Date().getFullYear());
  const [cloneEnabled, setCloneEnabled]   = useState(false);
  const [cloneSourceId, setCloneSourceId] = useState("");
  const [saving, setSaving]     = useState(false);
  const [createError, setCreateError] = useState("");
  const [renameName, setRenameName] = useState("");
  const [editRules, setEditRules]   = useState({ ...DEFAULT_RULES });
  const [editSeasonId, setEditSeasonId]     = useState("");
  const [editSeasonTerm, setEditSeasonTerm] = useState("Spring");
  const [editSeasonYear, setEditSeasonYear] = useState(new Date().getFullYear());
  const [editSaving, setEditSaving] = useState(false);
  const [deletePhase, setDeletePhase] = useState("idle");
  const [deleteText, setDeleteText]   = useState("");
  const [hoveredTeamId, setHoveredTeamId] = useState(null);

  useEffect(() => {
    Promise.all([
      window.__fbMigrateIfNeeded(),
      window.__fbCreatePrime12U(),
      window.__fbCreatePrime10U(),
    ]).then(() => window.__fbMigrateSeasonIfNeeded()) // runs after the seeds so it sees their teamsMeta writes
      .then(() => Promise.all([window.__fbListTeams(), window.__fbListSeasons()]))
      .then(([teamList, seasonList]) => {
        setTeams(teamList);
        setSeasons(seasonList);
        const sorted = [...seasonList].sort(compareSeasonsDesc);
        setNewSeasonId(sorted[0]?.id || NEW_SEASON);
        setLoading(false);
      });
  }, []);

  function refreshAll() {
    Promise.all([window.__fbListTeams(), window.__fbListSeasons()]).then(([teamList, seasonList]) => {
      setTeams(teamList);
      setSeasons(seasonList);
    });
  }

  function resolveSeasonId(selectedId, term, year) {
    if (selectedId === NEW_SEASON) {
      const y = Math.max(2000, parseInt(year) || new Date().getFullYear());
      return window.__fbCreateSeason(term, y);
    }
    return Promise.resolve(selectedId);
  }

  function resetCreateForm() {
    setNewName("");
    setNewRules({ ...DEFAULT_RULES });
    setCloneEnabled(false);
    setCloneSourceId("");
    setCreateError("");
    const sorted = [...seasons].sort(compareSeasonsDesc);
    setNewSeasonId(sorted[0]?.id || NEW_SEASON);
    setNewSeasonTerm("Spring");
    setNewSeasonYear(new Date().getFullYear());
  }

  function handleCreate() {
    if (!newName.trim() || saving || !newSeasonId) return;
    if (cloneEnabled && !cloneSourceId) return;
    const rules = {
      maxPitches: Math.max(1, parseInt(newRules.maxPitches)||55),
      rest1: Math.max(0, parseInt(newRules.rest1)||20),
      rest2: Math.max(0, parseInt(newRules.rest2)||40),
      rest3: Math.max(0, parseInt(newRules.rest3)||60),
    };
    const teamId = newId();
    setSaving(true);
    setCreateError("");
    // Team creation isn't a single atomic write (season lookup/create, then the
    // team, then optionally the cloned roster) - once __fbCreateTeam succeeds
    // the team is real and shouldn't be silently abandoned on a later failure
    // (that would both orphan it and let a form retry mint a duplicate via a
    // fresh newId()). So a failure before team creation keeps the form open
    // for retry; a failure after it still hands off to the created team, just
    // with a heads-up that the roster clone didn't make it.
    let teamCreated = false;
    resolveSeasonId(newSeasonId, newSeasonTerm, newSeasonYear)
      .catch(() => { throw new Error("Couldn't save the season — please try again."); })
      .then(seasonId => {
        const meta = { name: newName.trim(), rules, createdAt: todayStr(), seasonId };
        return window.__fbCreateTeam(teamId, meta)
          .catch(() => { throw new Error("Couldn't create the team — please try again."); })
          .then(() => { teamCreated = true; return meta; });
      })
      .then(meta => {
        if (!cloneEnabled || !cloneSourceId) return meta;
        return window.__fbGetRoster(cloneSourceId)
          .catch(() => { throw new Error(`"${meta.name}" was created, but the roster couldn't be read to clone — add pitchers manually from the Roster tab.`); })
          .then(sourceRoster => {
            const cloned = {};
            (sourceRoster || []).forEach(p => {
              const id = newId();
              cloned[id] = { id, name: p.name, jersey: p.jersey, lastPitches: 0, lastGameDate: "", history: [] };
            });
            if (Object.keys(cloned).length === 0) return meta;
            return window.__fbSet("roster", cloned, teamId)
              .catch(() => { throw new Error(`"${meta.name}" was created, but the cloned roster couldn't be saved — add pitchers manually from the Roster tab.`); })
              .then(() => meta);
          });
      })
      .then(meta => {
        setSaving(false);
        setCreating(false);
        resetCreateForm();
        onSelect(teamId, meta);
      })
      .catch(err => {
        setSaving(false);
        if (teamCreated) {
          // The team itself exists in Firebase - drop the user into it rather
          // than leaving it stranded off-screen with the form still open.
          alert(err.message);
          setCreating(false);
          resetCreateForm();
          onSelect(teamId, { name: newName.trim(), rules, createdAt: todayStr() });
        } else {
          setCreateError(err.message || "Something went wrong creating the team — please try again.");
        }
      });
  }

  function openManage(t) {
    setManaging(t);
    setRenameName(t.name);
    setEditRules(t.rules || { ...DEFAULT_RULES });
    const sorted = [...seasons].sort(compareSeasonsDesc);
    setEditSeasonId(t.seasonId || sorted[0]?.id || NEW_SEASON);
    setEditSeasonTerm("Spring");
    setEditSeasonYear(new Date().getFullYear());
    setDeletePhase("idle");
    setDeleteText("");
  }

  function handleSaveChanges() {
    if (!renameName.trim() || !managing || !editSeasonId || editSaving) return;
    const rules = {
      maxPitches: Math.max(1, parseInt(editRules.maxPitches)||55),
      rest1: Math.max(0, parseInt(editRules.rest1)||20),
      rest2: Math.max(0, parseInt(editRules.rest2)||40),
      rest3: Math.max(0, parseInt(editRules.rest3)||60),
    };
    setEditSaving(true);
    resolveSeasonId(editSeasonId, editSeasonTerm, editSeasonYear)
      .then(seasonId => {
        const updatedMeta = { name: renameName.trim(), rules, seasonId };
        return window.__fbUpdateTeamMeta(managing.id, updatedMeta).then(() => updatedMeta);
      })
      .then(updatedMeta => {
        if (onTeamMetaUpdate) onTeamMetaUpdate(managing.id, updatedMeta);
        setEditSaving(false);
        refreshAll();
        setManaging(null);
      })
      .catch(() => setEditSaving(false));
  }

  function handleDelete() {
    if (deleteText !== "DELETE TEAM" || !managing) return;
    window.__fbDeleteTeam(managing.id).then(() => {
      refreshAll();
      setManaging(null);
      setDeletePhase("idle");
      setDeleteText("");
    });
  }

  function startCloneFromManaged() {
    if (!managing) return;
    setNewName(managing.name);
    setNewRules(managing.rules || { ...DEFAULT_RULES });
    setCloneEnabled(true);
    setCloneSourceId(managing.id);
    const sorted = [...seasons].sort(compareSeasonsDesc);
    setNewSeasonId(sorted[0]?.id || NEW_SEASON);
    setNewSeasonTerm("Spring");
    setNewSeasonYear(new Date().getFullYear());
    setManaging(null);
    setDeletePhase("idle");
    setDeleteText("");
    setCreating(true);
  }

  const ruleField = (rules, setRules, label, key, hint) => (
    <div style={{ marginBottom:10 }}>
      <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>{label}</label>
      <input type="number" min="0" value={rules[key]} aria-label={label}
        onChange={e=>setRules(r=>({...r,[key]:e.target.value}))}
        style={{ ...inputStyle, marginBottom:2 }}/>
      {hint && <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)" }}>{hint}</div>}
    </div>
  );

  // Shared "pick a season, or spin up a new one inline" control used by both
  // the create-team form and the edit-team modal.
  const seasonField = (label, seasonId, onSeasonId, term, onTerm, year, onYear) => {
    const sorted = [...seasons].sort(compareSeasonsDesc);
    return (
      <div style={{ marginBottom:10 }}>
        <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>{label}</label>
        <select value={seasonId} onChange={e=>onSeasonId(e.target.value)} aria-label={label}
          style={{ ...inputStyle, marginBottom: seasonId===NEW_SEASON ? 8 : 2 }}>
          <option value="" disabled>Select a season…</option>
          {sorted.map(s => <option key={s.id} value={s.id}>{getSeasonName(s)}</option>)}
          <option value={NEW_SEASON}>+ New Season</option>
        </select>
        {seasonId === NEW_SEASON && (
          <div style={{ display:"flex", gap:8 }}>
            <select value={term} onChange={e=>onTerm(e.target.value)} aria-label="New season term"
              style={{ ...inputStyle, flex:1 }}>
              {TERM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="number" value={year} onChange={e=>onYear(e.target.value)} aria-label="New season year"
              style={{ ...inputStyle, flex:1 }}/>
          </div>
        )}
      </div>
    );
  };

  const cloneRosterField = () => {
    const seasonNameById = {};
    seasons.forEach(s => { seasonNameById[s.id] = getSeasonName(s); });
    return (
      <div style={{ marginBottom:10 }}>
        <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13,
          color:"rgba(255,255,255,0.7)", cursor:"pointer", marginBottom: cloneEnabled?8:0 }}>
          <input type="checkbox" checked={cloneEnabled} onChange={e=>setCloneEnabled(e.target.checked)}/>
          Clone roster from an existing team
        </label>
        {cloneEnabled && (
          <select value={cloneSourceId} onChange={e=>setCloneSourceId(e.target.value)} aria-label="Clone roster from"
            style={inputStyle}>
            <option value="" disabled>Select a team…</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}{seasonNameById[t.seasonId] ? " — " + seasonNameById[t.seasonId] : ""}
              </option>
            ))}
          </select>
        )}
      </div>
    );
  };

  // Group teams under their season header, newest season first; teams whose
  // season is missing/unknown fall into a trailing "Unassigned" group.
  const seasonsSorted = [...seasons].sort(compareSeasonsDesc);
  const knownSeasonIds = new Set(seasonsSorted.map(s => s.id));
  const groupedTeams = [];
  seasonsSorted.forEach(s => {
    const inSeason = teams.filter(t => t.seasonId === s.id).sort((a,b)=>a.name.localeCompare(b.name));
    if (inSeason.length) groupedTeams.push({ key:s.id, label:getSeasonName(s), teams:inSeason });
  });
  const orphanTeams = teams.filter(t => !t.seasonId || !knownSeasonIds.has(t.seasonId))
    .sort((a,b)=>a.name.localeCompare(b.name));
  if (orphanTeams.length) groupedTeams.push({ key:"__unassigned__", label:"Unassigned", teams:orphanTeams });

  const teamRow = (t) => (
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
      <button onClick={()=>openManage(t)}
        aria-label={`Manage ${t.name}`}
        style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)",
          borderRadius:8, padding:"5px 10px", color:"rgba(255,255,255,0.5)", cursor:"pointer", fontSize:12 }}>
        ···
      </button>
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

      {/* Team list, grouped by season */}
      {loading ? (
        <div style={{ textAlign:"center", padding:"40px 0", color:"rgba(255,255,255,0.3)", fontSize:14 }}>Loading teams…</div>
      ) : teams.length === 0 ? (
        <div style={{ ...card, marginBottom:12 }}>
          <p style={sectionLabel}>TEAMS</p>
          <div style={{ fontSize:13, color:"rgba(255,255,255,0.3)", paddingBottom:4 }}>No teams yet — create one below.</div>
        </div>
      ) : (
        groupedTeams.map(group => (
          <div key={group.key} style={{ ...card, marginBottom:12 }}>
            <p style={sectionLabel}>{group.label.toUpperCase()}</p>
            {group.teams.map(teamRow)}
          </div>
        ))
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
            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="e.g. Prime 10U" aria-label="Team name"
              style={inputStyle}/>
          </div>
          {seasonField("SEASON", newSeasonId, setNewSeasonId, newSeasonTerm, setNewSeasonTerm, newSeasonYear, setNewSeasonYear)}
          {cloneRosterField()}
          <p style={{ ...sectionLabel, marginTop:14, marginBottom:10 }}>PITCH COUNT RULES</p>
          {ruleField(newRules, setNewRules, "Game max pitches", "maxPitches", "Maximum pitches allowed per game")}
          {ruleField(newRules, setNewRules, "0→1 rest-day breakpoint", "rest1", "Pitches above this require 1 day rest")}
          {ruleField(newRules, setNewRules, "1→2 rest-day breakpoint", "rest2", "Pitches above this require 2 days rest")}
          {ruleField(newRules, setNewRules, "2→3 rest-day breakpoint", "rest3", "Pitches above this require 3 days rest")}
          {createError && (
            <div style={{ fontSize:12, color:"#f87171", marginBottom:10, lineHeight:1.4 }}>{createError}</div>
          )}
          <div style={{ display:"flex", gap:8, marginTop:4 }}>
            <button onClick={()=>{ setCreating(false); resetCreateForm(); }} style={cancelBtn}>Cancel</button>
            <button onClick={handleCreate}
              disabled={!newName.trim()||saving||!newSeasonId||(cloneEnabled&&!cloneSourceId)}
              style={{ ...primaryBtn, flex:2, opacity:(!newName.trim()||saving||!newSeasonId||(cloneEnabled&&!cloneSourceId))?0.5:1 }}>
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
                aria-label="Close"
                style={{ background:"rgba(255,255,255,0.07)", border:"none", borderRadius:8,
                  width:32, height:32, color:"rgba(255,255,255,0.5)", cursor:"pointer" }}>✕</button>
            </div>

            {deletePhase === "idle" && (
              <>
                <div style={{ ...card, border:"1px solid rgba(56,189,248,0.2)", marginBottom:12 }}>
                  <p style={{ ...sectionLabel, color:"#38bdf8" }}>EDIT TEAM</p>
                  <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>TEAM NAME</label>
                  <input value={renameName} onChange={e=>setRenameName(e.target.value)} aria-label="Team name"
                    style={{ ...inputStyle, marginBottom:12 }}/>
                  {seasonField("SEASON", editSeasonId, setEditSeasonId, editSeasonTerm, setEditSeasonTerm, editSeasonYear, setEditSeasonYear)}
                  <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>GAME MAX PITCHES</label>
                  <input type="number" min="1" value={editRules.maxPitches} aria-label="Game max pitches"
                    onChange={e=>setEditRules(r=>({...r,maxPitches:e.target.value}))}
                    style={{ ...inputStyle, marginBottom:4 }}/>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginBottom:10 }}>Maximum pitches allowed per game</div>
                  <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>0→1 REST-DAY BREAKPOINT</label>
                  <input type="number" min="0" value={editRules.rest1} aria-label="0 to 1 rest-day breakpoint"
                    onChange={e=>setEditRules(r=>({...r,rest1:e.target.value}))}
                    style={{ ...inputStyle, marginBottom:4 }}/>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginBottom:10 }}>Pitches above this require 1 day rest</div>
                  <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>1→2 REST-DAY BREAKPOINT</label>
                  <input type="number" min="0" value={editRules.rest2} aria-label="1 to 2 rest-day breakpoint"
                    onChange={e=>setEditRules(r=>({...r,rest2:e.target.value}))}
                    style={{ ...inputStyle, marginBottom:4 }}/>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginBottom:10 }}>Pitches above this require 2 days rest</div>
                  <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>2→3 REST-DAY BREAKPOINT</label>
                  <input type="number" min="0" value={editRules.rest3} aria-label="2 to 3 rest-day breakpoint"
                    onChange={e=>setEditRules(r=>({...r,rest3:e.target.value}))}
                    style={{ ...inputStyle, marginBottom:12 }}/>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginBottom:12 }}>Pitches above this require 3 days rest</div>
                  <button onClick={handleSaveChanges} disabled={!renameName.trim()||!editSeasonId||editSaving}
                    style={{ ...primaryBtn, width:"100%", opacity:(!renameName.trim()||!editSeasonId||editSaving)?0.5:1 }}>
                    {editSaving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
                <div style={{ ...card, border:"1px solid rgba(255,255,255,0.08)" }}>
                  <p style={sectionLabel}>DUPLICATE</p>
                  <p style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginBottom:10, lineHeight:1.4 }}>
                    Start a new team with this roster — for example, carrying this team into next season.
                    Stats and game history start fresh; only the pitcher names/jerseys copy over.
                  </p>
                  <button onClick={startCloneFromManaged}
                    style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.15)",
                      borderRadius:8, padding:"8px 14px", color:"#f8fafc", cursor:"pointer", fontSize:12, fontWeight:600 }}>
                    Clone Roster to New Team
                  </button>
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
                  placeholder="DELETE TEAM" aria-label="Type DELETE TEAM to confirm" style={{ ...inputStyle, marginBottom:10 }}/>
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
