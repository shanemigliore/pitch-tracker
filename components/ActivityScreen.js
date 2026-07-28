// ActivityScreen — audit log with undo capability.
// Babel/JSX component, loaded via <script type="text/babel" src="components/ActivityScreen.js"></script>.

// ── Activity Screen ───────────────────────────────────────────────────────────

function ActivityScreen({ auditLog, roster, onUndo, undidIds, onUndid }) {
  const [undoError, setUndoError] = useState(null);

  useEffect(() => {
    if (!undoError) return;
    const t = setTimeout(() => setUndoError(null), 3500);
    return () => clearTimeout(t);
  }, [undoError]);

  function formatTs(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const diffMins = Math.floor((Date.now() - ts) / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString([], { month:"short", day:"numeric" }) + " " + d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
  }

  const actionMeta = {
    LOG_GAME:       { label:"Game Logged",    color:"#4ade80" },
    DELETE_GAME:    { label:"Game Deleted",   color:"#f43f5e" },
    EDIT_GAME:      { label:"Game Edited",    color:"#fbbf24" },
    ADD_PITCHER:    { label:"Pitcher Added",  color:"#4ade80" },
    DELETE_PITCHER: { label:"Pitcher Deleted",color:"#f43f5e" },
    EDIT_PITCHER:   { label:"Pitcher Edited", color:"#fbbf24" },
    ADD_TOURNEY:    { label:"Tourney Added",  color:"#4ade80" },
    DELETE_TOURNEY: { label:"Tourney Deleted",color:"#f43f5e" },
    EDIT_TOURNEY:   { label:"Tourney Edited", color:"#fbbf24" },
    UNDO:           { label:"Undone",         color:"#fbbf24" },
  };

  // Per subject, only the most-recent non-undone entry can be undone.
  // auditLog is already reverse-chronological (newest first).
  const canUndoSet = new Set();
  const seenSubjects = new Set();
  for (const entry of auditLog) {
    if (!entry.undoData) continue;
    const key = getSubjectKey(entry.undoData);
    if (!key || seenSubjects.has(key)) continue;
    if (!undidIds.has(entry.id)) {
      canUndoSet.add(entry.id);
      seenSubjects.add(key);
    }
    // Undone entries don't block the subject — the next older entry becomes undoable
  }

  function handleUndo(entry) {
    const ok = onUndo(entry);
    if (ok) {
      onUndid(entry.id);
    } else {
      setUndoError("Can't undo — that item no longer exists.");
    }
  }

  const myDeviceId = getDeviceId();

  // Build display list: group LOG_GAME entries that share a sharedGameId into one card.
  const displayItems = [];
  const seenSharedIds = new Set();
  for (const entry of auditLog) {
    if (entry.action === "LOG_GAME" && entry.sharedGameId) {
      if (seenSharedIds.has(entry.sharedGameId)) continue;
      seenSharedIds.add(entry.sharedGameId);
      const group = auditLog.filter(e => e.action === "LOG_GAME" && e.sharedGameId === entry.sharedGameId);
      displayItems.push({ kind:"logGame", entries: group, gameInfo: entry.gameInfo, ts: entry.ts, device: entry.device, deviceId: entry.deviceId });
    } else if (entry.action === "LOG_GAME" && entry.gameInfo) {
      displayItems.push({ kind:"logGame", entries:[entry], gameInfo: entry.gameInfo, ts: entry.ts, device: entry.device, deviceId: entry.deviceId });
    } else {
      displayItems.push({ kind:"other", entry });
    }
  }

  function renderUndoBtn(entry) {
    if (!canUndoSet.has(entry.id)) return null;
    return (
      <button onClick={() => handleUndo(entry)}
        style={{ flexShrink:0, minWidth:52, height:30,
          background:"rgba(251,191,36,0.12)", border:"1px solid rgba(251,191,36,0.3)",
          borderRadius:8, padding:"0 10px", color:"#fbbf24", fontSize:11, fontWeight:700,
          cursor:"pointer", letterSpacing:0.3 }}>
        UNDO
      </button>
    );
  }

  return (
    <div style={{ padding:"16px 16px 120px" }}>
      {undoError && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10,
          marginBottom:12, padding:"10px 12px", borderRadius:12,
          background:"rgba(244,63,94,0.1)", border:"1px solid rgba(244,63,94,0.3)" }}>
          <span style={{ fontSize:13, color:"#f87171", fontWeight:600 }}>{undoError}</span>
          <button onClick={()=>setUndoError(null)} aria-label="Dismiss"
            style={{ background:"none", border:"none", color:"rgba(255,255,255,0.4)", cursor:"pointer", flexShrink:0, display:"flex" }}>
            {I.xmark}
          </button>
        </div>
      )}
      <p style={sectionLabel}>RECENT ACTIVITY</p>
      {auditLog.length === 0 ? (
        <div style={{ textAlign:"center", padding:"40px 0", color:"rgba(255,255,255,0.3)", fontSize:14 }}>
          No activity recorded yet
        </div>
      ) : displayItems.map((item, idx) => {
        if (item.kind === "logGame") {
          const gi = item.gameInfo || {};
          const isMyDevice = item.deviceId === myDeviceId;
          const gameContext = gi.isTournament
            ? `${gi.tournamentName || "Tournament"}${gi.tourneyDay ? ` · Day ${gi.tourneyDay}` : ""}`
            : "Regular Season";
          return (
            <div key={item.entries[0].id} style={{ ...card, marginBottom:10 }}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:"#4ade80", flexShrink:0, marginTop:5 }}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                    <span style={{ fontSize:12, fontWeight:700, color:"#4ade80", letterSpacing:0.3 }}>Game Logged</span>
                    <span style={{ fontSize:10, color: isMyDevice ? "rgba(56,189,248,0.6)" : "rgba(255,255,255,0.3)", fontWeight:600, wordBreak:"break-word" }}>
                      {item.device || "Another device"}{isMyDevice ? " (this device)" : ""}
                    </span>
                  </div>
                  <div style={{ fontSize:13, color:"rgba(255,255,255,0.6)", marginTop:3 }}>
                    {formatDate(gi.date)}{gi.opponent ? ` · vs ${gi.opponent}` : ""} · {gameContext}
                  </div>
                  {item.entries.map(e => {
                    const didUndo = undidIds.has(e.id);
                    return (
                      <div key={e.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                        marginTop:6, paddingTop:6, borderTop:"1px solid rgba(255,255,255,0.06)",
                        opacity: didUndo ? 0.45 : 1, transition:"opacity 0.3s" }}>
                        <div>
                          <span style={{ fontSize:14, fontWeight:700, color:"#f8fafc" }}>
                            {e.pitcherName || e.detail}
                          </span>
                          <span style={{ fontSize:13, color:"rgba(255,255,255,0.55)", marginLeft:6 }}>
                            {e.pitches != null ? `${e.pitches}p` : ""}
                          </span>
                          {didUndo && <span style={{ fontSize:11, color:"#fbbf24", marginLeft:8, fontWeight:700 }}>↩ Undone</span>}
                          {e._failed && <span title="This never made it to Firebase - other devices won't see it" style={{ fontSize:10, color:"#a855f7", marginLeft:8, fontWeight:700 }}>⚠ Not synced</span>}
                        </div>
                        {renderUndoBtn(e)}
                      </div>
                    );
                  })}
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.3)", marginTop:6 }}>{formatTs(item.ts)}</div>
                </div>
              </div>
            </div>
          );
        }

        const { entry } = item;
        const meta = actionMeta[entry.action] || { label: entry.action, color:"rgba(255,255,255,0.5)" };
        const didUndo = undidIds.has(entry.id);
        const canUndo = canUndoSet.has(entry.id);
        const isMyDevice = entry.deviceId === myDeviceId;
        return (
          <div key={entry.id} style={{ ...card, marginBottom:10, opacity: didUndo ? 0.4 : 1, transition:"opacity 0.3s" }}>
            <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:meta.color, flexShrink:0, marginTop:5 }}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                  <span style={{ fontSize:12, fontWeight:700, color:meta.color, letterSpacing:0.3 }}>{meta.label}</span>
                  {entry._failed && <span title="This never made it to Firebase - other devices won't see it" style={{ fontSize:10, color:"#a855f7", fontWeight:700 }}>⚠ Not synced</span>}
                  <span style={{ fontSize:10, color: isMyDevice ? "rgba(56,189,248,0.6)" : "rgba(255,255,255,0.3)", fontWeight:600, wordBreak:"break-word" }}>
                    {entry.device || "Another device"}{isMyDevice ? " (this device)" : ""}
                  </span>
                </div>
                <div style={{ fontSize:13, color:"rgba(255,255,255,0.75)", marginTop:2, lineHeight:1.4 }}>
                  {entry.detail}
                </div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.3)", marginTop:3 }}>{formatTs(entry.ts)}</div>
                {didUndo && <div style={{ fontSize:11, color:"#fbbf24", marginTop:2, fontWeight:700 }}>↩ Undone</div>}
              </div>
              {canUndo && renderUndoBtn(entry)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
