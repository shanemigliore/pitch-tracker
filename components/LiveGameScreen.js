// LiveGameScreen — the Live tab: running pitch counts for the game in progress,
// shared live across every coach's device (/teams/{teamId}/liveGame), with
// "Log complete game" turning it into the same entries GameLogScreen writes.
// Not pitch-by-pitch - just each pitcher's running total and who's left the game.
// Babel/JSX component, loaded via <script type="text/babel" src="components/LiveGameScreen.js"></script>.

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: LIVE GAME
// ══════════════════════════════════════════════════════════════════════════════
function LiveGameScreen({ roster, tournaments, liveGame, onStart, onUpdate, onComplete, onDiscard }) {
  // Setup form (only used before a game exists)
  const [setupDate, setSetupDate] = useState(todayStr());
  const [setupContext, setSetupContext] = useState("regular");
  const [setupOpponent, setSetupOpponent] = useState("");
  const [starting, setStarting] = useState(false);
  // Uncommitted text while a field has focus, so a remote update can't yank
  // the value out from under the coach mid-typing. Committed on blur/Enter.
  const [countDrafts, setCountDrafts] = useState({});
  const [opponentDraft, setOpponentDraft] = useState(null);
  const [opponentErr, setOpponentErr] = useState(false);
  const [completeErr, setCompleteErr] = useState("");
  const [warnViolations, setWarnViolations] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [saved, setSaved] = useState(null);
  const [slowComplete, setSlowComplete] = useState(false);
  // { gameId, newId, prevIds } - lets the coach reverse an auto "left game" from a mistap
  const [undoSwap, setUndoSwap] = useState(null);

  // A claim only resolves once the server confirms it, so offline it just
  // waits - say so instead of looking frozen.
  useEffect(() => {
    if (!completing) { setSlowComplete(false); return; }
    const t = setTimeout(() => setSlowComplete(true), 3000);
    return () => clearTimeout(t);
  }, [completing]);

  useEffect(() => {
    if (!undoSwap) return;
    const t = setTimeout(() => setUndoSwap(null), 10000);
    return () => clearTimeout(t);
  }, [undoSwap]);

  // Reset per-game UI state whenever the game itself changes (finished here,
  // or finished/discarded/replaced on another device).
  const gameId = liveGame ? liveGame.id : null;
  useEffect(() => {
    setCountDrafts({}); setOpponentDraft(null); setOpponentErr(false);
    setCompleteErr(""); setWarnViolations(false); setUndoSwap(null);
  }, [gameId]);

  const recentOpponents = (()=>{
    const latest = new Map();
    roster.forEach(p => (p.history||[]).forEach(h => {
      if (!h.opponent) return;
      const prev = latest.get(h.opponent);
      if (!prev || h.date > prev) latest.set(h.opponent, h.date);
    }));
    return [...latest.entries()].sort((a,b)=>(b[1]||"").localeCompare(a[1]||"")).map(([name])=>name).slice(0,6);
  })();

  function opponentChips(current, onPick) {
    if (recentOpponents.length === 0) return null;
    return (
      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:8 }}>
        {recentOpponents.map(name=>(
          <button key={name} type="button" onClick={()=>onPick(name)} aria-label={`Set opponent to ${name}`}
            style={{ padding:"5px 10px", borderRadius:14,
              border:`1px solid ${current===name?"#38bdf8":"rgba(255,255,255,0.1)"}`,
              background:current===name?"rgba(56,189,248,0.18)":"rgba(255,255,255,0.04)",
              color:current===name?"#38bdf8":"rgba(255,255,255,0.6)", fontSize:12, fontWeight:600, cursor:"pointer" }}>
            {name}
          </button>
        ))}
      </div>
    );
  }

  const header = (
    <div style={{ padding:"16px 0 14px" }}>
      <h2 style={{ margin:0, fontSize:24, fontWeight:800, color:"#f8fafc", fontFamily:"'Bebas Neue',cursive", letterSpacing:2 }}>LIVE GAME</h2>
      <p style={{ margin:0, fontSize:12, color:"rgba(255,255,255,0.4)" }}>Running pitch counts — shared with every coach</p>
    </div>
  );

  // ── Just logged ───────────────────────────────────────────────────────────
  if (saved && !liveGame) {
    return (
      <div style={{ padding:"0 16px 110px" }}>
        {header}
        <div style={{ textAlign:"center", padding:"50px 20px", background:"rgba(74,222,128,0.07)",
          border:"1px solid rgba(74,222,128,0.25)", borderRadius:20, marginBottom:16 }}>
          <div style={{ fontSize:48, marginBottom:8 }}>✅</div>
          <div style={{ color:"#4ade80", fontSize:18, fontWeight:700 }}>Game Logged!</div>
          <div style={{ color:"rgba(255,255,255,0.4)", fontSize:13, marginTop:4, marginBottom:20 }}>
            {saved.count} pitcher{saved.count!==1?"s":""} logged{saved.opponent?` vs ${saved.opponent}`:""}
          </div>
          <button onClick={()=>{ setSaved(null); setSetupDate(todayStr()); setSetupOpponent(""); }}
            style={{ ...primaryBtn, padding:"11px 22px", margin:"0 auto" }}>
            {I.plus} Start Another Game
          </button>
        </div>
      </div>
    );
  }

  // ── No game yet: setup ────────────────────────────────────────────────────
  if (!liveGame) {
    const setupTourney = tournaments.find(t=>t.id===setupContext);
    const setupOutside = setupContext!=="regular" && !!setupTourney && !getTourneyDayNumber(setupTourney, setupDate);
    function start() {
      if (starting || setupOutside) return;
      setStarting(true);
      Promise.resolve(onStart({ date:setupDate, context:setupContext, opponent:sanitizeOpponent(setupOpponent) }))
        .catch(err => alert(`Couldn't start the game: ${err && err.message ? err.message : err}`))
        .finally(() => setStarting(false));
    }
    return (
      <div style={{ padding:"0 16px 110px" }}>
        {header}
        <div style={card}>
          <p style={sectionTitle}>NEW GAME</p>
          <ContextPicker context={setupContext} setContext={setSetupContext} tournaments={tournaments} gameDate={setupDate}/>
          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>GAME DATE</label>
          <input type="date" value={setupDate} onChange={e=>setSetupDate(e.target.value || todayStr())} aria-label="Game date"
            style={{ ...inputStyle, marginBottom:10 }}/>
          <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>OPPONENT</label>
          <input placeholder="Team name (can add later)" value={setupOpponent} maxLength={LIVE_OPPONENT_MAX} aria-label="Opponent"
            onChange={e=>setSetupOpponent(e.target.value)} style={inputStyle}/>
          {opponentChips(setupOpponent, setSetupOpponent)}
        </div>
        <button onClick={start} disabled={starting || setupOutside}
          style={{ ...primaryBtn, width:"100%", padding:14, opacity:(starting||setupOutside)?0.5:1,
            background:"linear-gradient(135deg,#dc2626,#b91c1c)", boxShadow:"0 4px 20px rgba(220,38,38,0.35)" }}>
          {starting ? "Starting…" : "● Start Live Game"}
        </button>
        <p style={{ fontSize:11, color:"rgba(255,255,255,0.35)", textAlign:"center", marginTop:10 }}>
          Every coach on this team sees and can update the same game.
        </p>
      </div>
    );
  }

  // ── Game in progress ──────────────────────────────────────────────────────
  const tourney = liveGame.context!=="regular" ? tournaments.find(t=>t.id===liveGame.context) : null;
  const dateOutsideTourney = liveGame.context!=="regular" && (!tourney || !getTourneyDayNumber(tourney, liveGame.date));
  const isStale = liveGame.date < todayStr();
  const opponentValue = opponentDraft !== null ? opponentDraft : liveGame.opponent;

  const rosterById = new Map(roster.map(p=>[p.id, p]));
  const budgets = new Map(roster.map(p=>[p.id, getLivePitcherBudget(p, liveGame, tournaments)]));
  const inGameIds = getLiveGamePitcherIds(liveGame).filter(id=>rosterById.has(id));
  const activeIds = inGameIds.filter(id=>liveGame.pitchers[id].status==="active");
  const notInGame = roster.filter(p=>!liveGame.pitchers[p.id]);
  const available = notInGame.filter(p=>budgets.get(p.id).eligible)
    .sort((a,b)=>(budgets.get(b.id).pitchesLeft - budgets.get(a.id).pitchesLeft) || a.name.localeCompare(b.name));
  const unavailable = notInGame.filter(p=>!budgets.get(p.id).eligible).sort((a,b)=>a.name.localeCompare(b.name));
  const gameTotal = inGameIds.reduce((s,id)=>s+liveGame.pitchers[id].pitches, 0);

  function commitOpponent() {
    if (opponentDraft === null) return;
    const v = sanitizeOpponent(opponentDraft);
    setOpponentDraft(null);
    if (v !== liveGame.opponent) onUpdate({ opponent:v });
  }
  function setCount(id, v) { setCompleteErr(""); onUpdate({ [`pitchers/${id}/pitches`]: sanitizeLiveCount(v) }); }
  function bump(id, delta) {
    setCompleteErr("");
    const cur = liveGame.pitchers[id].pitches;
    if (delta < 0 && cur + delta < 0) { if (cur > 0) setCount(id, 0); return; }
    if (delta > 0 && cur + delta > LIVE_MAX_COUNT) return;
    onUpdate({ [`pitchers/${id}/pitches`]: window.__fbLiveIncrement ? window.__fbLiveIncrement(delta) : cur + delta });
  }
  function commitCount(id) {
    if (countDrafts[id] === undefined) return;
    const v = countDrafts[id];
    setCountDrafts(d => { const n = { ...d }; delete n[id]; return n; });
    if (sanitizeLiveCount(v) !== liveGame.pitchers[id].pitches) setCount(id, v);
  }
  // Bringing in a new pitcher takes out whoever is pitching - once replaced,
  // they can't come back in this game.
  function addPitcher(p) {
    const now = Date.now();
    const order = inGameIds.reduce((m,id)=>Math.max(m, liveGame.pitchers[id].order), 0) + 1;
    const patch = { [`pitchers/${p.id}`]: { pitches:0, status:"active", order, enteredAt:now } };
    activeIds.forEach(id => { patch[`pitchers/${id}/status`] = "left"; patch[`pitchers/${id}/leftAt`] = now; });
    onUpdate(patch);
    setCompleteErr("");
    setUndoSwap(activeIds.length ? { gameId:liveGame.id, newId:p.id, prevIds:activeIds } : null);
  }
  function undoAdd() {
    if (!undoSwap || undoSwap.gameId !== liveGame.id) return;
    const patch = { [`pitchers/${undoSwap.newId}`]: null };
    undoSwap.prevIds.forEach(id => { patch[`pitchers/${id}/status`] = "active"; patch[`pitchers/${id}/leftAt`] = null; });
    onUpdate(patch);
    setUndoSwap(null);
  }
  function markLeft(id) {
    onUpdate({ [`pitchers/${id}/status`]:"left", [`pitchers/${id}/leftAt`]:Date.now() });
    setUndoSwap(null);
  }
  function putBackIn(p) {
    if (!confirm(`Put ${p.name} back in?\n\nA pitcher who leaves the game can't return to pitch in it. Only do this to fix a mistake.`)) return;
    onUpdate({ [`pitchers/${p.id}/status`]:"active", [`pitchers/${p.id}/leftAt`]:null });
  }
  function removeFromGame(p) {
    if (!confirm(`Remove ${p.name} from this game? Their ${liveGame.pitchers[p.id].pitches} pitches won't be logged.`)) return;
    onUpdate({ [`pitchers/${p.id}`]: null });
    setUndoSwap(null);
  }

  const toLog = inGameIds.filter(id=>liveGame.pitchers[id].pitches>0).map(id=>rosterById.get(id));
  function getViolations() {
    return toLog.map(p=>({ p, check:getGameLogCheck(p, { context:liveGame.context, tourney, date:liveGame.date,
      count:liveGame.pitchers[p.id].pitches, tournaments }) }))
      .filter(v=>v.check && v.check.level==="violation");
  }

  function handleComplete(confirmed) {
    if (completing || dateOutsideTourney) return;
    const opp = sanitizeOpponent(opponentValue);
    if (!opp) { setOpponentErr(true); return; }
    if (toLog.length === 0) { setCompleteErr("No pitches entered yet — add a pitch count before logging."); return; }
    if (!confirmed && getViolations().length > 0) { setWarnViolations(true); return; }
    setWarnViolations(false);
    // Make sure the server has the opponent being shown before the game is
    // claimed - writes from one client land in order, so the claim sees it.
    if (opponentDraft !== null) commitOpponent();
    setCompleting(true);
    Promise.resolve(onComplete(liveGame.id))
      .then(result => {
        if (result) setSaved(result);
        else alert("This game was already logged or discarded on another device.");
      })
      .catch(err => alert(`Couldn't log the game: ${err && err.message ? err.message : err}\n\nNothing was lost — the live game is still here.`))
      .finally(() => setCompleting(false));
  }
  function handleDiscard() {
    if (!confirm("Discard this live game? Its pitch counts will not be logged.")) return;
    Promise.resolve(onDiscard(liveGame.id))
      .catch(err => alert(`Couldn't discard the game: ${err && err.message ? err.message : err}`));
  }

  function restText(b) {
    const r = b.rest;
    const now = r.restDays===0 ? "No rest" : `${r.restDays}d rest`;
    const next = r.nextAt ? ` · ${r.nextRestDays}d at ${r.nextAt}p${b.restAfterTourney?" total":""}` : "";
    return `${now}${b.restAfterTourney?" after tourney":""}${next}`;
  }
  function leftColor(n) { return n<0 ? "#f43f5e" : n<=10 ? "#fb923c" : "#4ade80"; }

  return (
    <div style={{ padding:"0 16px 110px" }}>
      {header}

      {isStale && (
        <div role="alert" style={{ ...card, border:"1px solid rgba(251,191,36,0.4)", background:"rgba(251,191,36,0.07)" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#fbbf24", marginBottom:4 }}>Unfinished game from {formatDate(liveGame.date)}</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.55)" }}>Log it (it keeps its original date) or discard it before starting today's game.</div>
        </div>
      )}

      <div style={card}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
          <span className="live-dot" style={{ width:8, height:8, borderRadius:"50%", background:"#ef4444", flexShrink:0 }}/>
          <p style={{ ...sectionTitle, margin:0, flex:1 }}>GAME IN PROGRESS</p>
          <span style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>{gameTotal}p total</span>
        </div>
        {liveGame.startedBy && <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginTop:-6, marginBottom:10 }}>Started by {liveGame.startedBy}</div>}
        <ContextPicker context={liveGame.context} setContext={c=>onUpdate({ context:c })} tournaments={tournaments} gameDate={liveGame.date}/>
        <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>GAME DATE</label>
        <input type="date" value={liveGame.date} aria-label="Game date"
          onChange={e=>{ if (isIsoDate(e.target.value)) onUpdate({ date:e.target.value }); }}
          style={{ ...inputStyle, marginBottom:10 }}/>
        <label style={{ ...sectionLabel, display:"block", marginBottom:4 }}>OPPONENT *</label>
        <input placeholder="Team name" value={opponentValue} maxLength={LIVE_OPPONENT_MAX} aria-label="Opponent"
          onFocus={()=>setOpponentDraft(liveGame.opponent)}
          onChange={e=>{ setOpponentDraft(e.target.value); if (e.target.value.trim()) setOpponentErr(false); }}
          onBlur={commitOpponent}
          onKeyDown={e=>{ if (e.key==="Enter") e.target.blur(); }}
          style={{ ...inputStyle, border:opponentErr?"1px solid rgba(244,63,94,0.6)":inputStyle.border }}/>
        {opponentErr && <div style={{ fontSize:11, color:"#f87171", marginTop:4 }}>Opponent is required to log the game</div>}
        {opponentChips(opponentValue, name=>{ setOpponentDraft(null); setOpponentErr(false); onUpdate({ opponent:name }); })}
      </div>

      <div style={card}>
        <p style={sectionTitle}>IN THE GAME</p>
        {inGameIds.length===0 && (
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}>No one yet — pick your starting pitcher below.</div>
        )}
        {inGameIds.map(id=>{
          const p = rosterById.get(id), b = budgets.get(id), e = liveGame.pitchers[id];
          const isActive = e.status==="active";
          const warn = !b.eligible ? b.reason : null;
          return (
            <div key={id} style={{ marginBottom:8, padding:"10px 12px", borderRadius:12,
              background:isActive?"rgba(56,189,248,0.06)":"rgba(255,255,255,0.02)",
              border:`1px solid ${isActive?"rgba(56,189,248,0.3)":"rgba(255,255,255,0.07)"}`,
              opacity:isActive?1:0.75 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                <div style={{ position:"relative", width:52, height:52, flexShrink:0 }}>
                  <RadialArc value={b.arcValue} max={Math.max(1,b.arcMax)} size={52} strokeW={5}/>
                  <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
                    fontFamily:"'Bebas Neue',cursive", fontSize:13, color:"#38bdf8" }}>
                    {p.jersey?`#${p.jersey}`:p.name[0]}
                  </div>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:14, fontWeight:700, color:"#f8fafc", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</span>
                    <span style={{ fontSize:9, fontWeight:800, letterSpacing:0.8, padding:"2px 6px", borderRadius:6, flexShrink:0,
                      background:isActive?"rgba(239,68,68,0.18)":"rgba(255,255,255,0.08)", color:isActive?"#f87171":"rgba(255,255,255,0.45)" }}>
                      {isActive?"PITCHING":"LEFT GAME"}
                    </span>
                  </div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", marginTop:2 }}>{restText(b)}</div>
                  {b.priorToday>0 && <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)" }}>Includes {b.priorToday}p already logged today</div>}
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontSize:26, lineHeight:1, fontWeight:800, fontFamily:"'Bebas Neue',cursive", color:leftColor(b.pitchesLeft) }}>
                    {b.pitchesLeft<0 ? `+${-b.pitchesLeft}` : b.pitchesLeft}
                  </div>
                  <div style={{ fontSize:9, fontWeight:700, color:leftColor(b.pitchesLeft) }}>{b.pitchesLeft<0?"OVER":b.leftLabel.toUpperCase()}</div>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <button type="button" onClick={()=>bump(id,-1)} aria-label={`Subtract 1 pitch for ${p.name}`}
                  style={{ flex:1, padding:"9px 0", borderRadius:8, background:"rgba(255,255,255,0.05)",
                    border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.6)", fontSize:13, fontWeight:700, cursor:"pointer" }}>−1</button>
                <input type="number" inputMode="numeric" min="0" max={LIVE_MAX_COUNT} aria-label={`${p.name} pitch count`}
                  value={countDrafts[id] !== undefined ? countDrafts[id] : String(e.pitches)}
                  onFocus={ev=>{ setCountDrafts(d=>({ ...d, [id]:String(e.pitches) })); ev.target.select(); }}
                  onChange={ev=>setCountDrafts(d=>({ ...d, [id]:ev.target.value }))}
                  onBlur={()=>commitCount(id)}
                  onKeyDown={ev=>{ if (ev.key==="Enter") ev.target.blur(); }}
                  style={{ ...inputStyle, width:64, flexShrink:0, textAlign:"center", fontSize:20, fontWeight:800,
                    fontFamily:"'Bebas Neue',cursive", padding:"4px 6px" }}/>
                {[1,5].map(d=>(
                  <button key={d} type="button" onClick={()=>bump(id,d)} aria-label={`Add ${d} pitch${d!==1?"es":""} for ${p.name}`}
                    style={{ flex:1, padding:"9px 0", borderRadius:8, background:"rgba(37,99,235,0.15)",
                      border:"1px solid rgba(37,99,235,0.3)", color:"#60a5fa", fontSize:13, fontWeight:700, cursor:"pointer" }}>+{d}</button>
                ))}
              </div>
              {b.pitchesLeft<0 && (
                <div style={{ marginTop:6, fontSize:11, fontWeight:600, color:"#f87171" }}>⚠ Over the limit — allowed only to finish a batter</div>
              )}
              {b.note && <div style={{ marginTop:6, fontSize:11, fontWeight:600, color:"rgba(251,191,36,0.75)" }}>ⓘ {b.note}</div>}
              {warn && <div style={{ marginTop:6, fontSize:11, fontWeight:600, color:"#fb923c" }}>⚠ {warn}</div>}
              <div style={{ display:"flex", gap:8, marginTop:8 }}>
                {isActive ? (
                  <button type="button" onClick={()=>markLeft(id)}
                    style={{ ...cancelBtn, padding:"7px 10px", fontSize:12 }}>Left game</button>
                ) : (
                  <button type="button" onClick={()=>putBackIn(p)}
                    style={{ ...cancelBtn, padding:"7px 10px", fontSize:12 }}>Put back in…</button>
                )}
                <button type="button" onClick={()=>removeFromGame(p)} aria-label={`Remove ${p.name} from this game`}
                  style={{ background:"none", border:"none", color:"rgba(255,255,255,0.35)", cursor:"pointer", fontSize:12, padding:"7px 6px" }}>
                  Remove
                </button>
              </div>
            </div>
          );
        })}
        {undoSwap && undoSwap.gameId===liveGame.id && (
          <div role="status" style={{ display:"flex", alignItems:"center", gap:8, marginTop:6, padding:"8px 10px", borderRadius:10,
            background:"rgba(56,189,248,0.08)", border:"1px solid rgba(56,189,248,0.25)", fontSize:12, color:"rgba(255,255,255,0.7)" }}>
            <span style={{ flex:1 }}>
              {undoSwap.prevIds.map(id=>rosterById.get(id)?.name).filter(Boolean).join(", ")} marked as left game
            </span>
            <button type="button" onClick={undoAdd}
              style={{ background:"none", border:"none", color:"#38bdf8", fontWeight:700, fontSize:12, cursor:"pointer" }}>Undo</button>
          </div>
        )}
      </div>

      <div style={card}>
        <p style={sectionTitle}>{inGameIds.length===0?"STARTING PITCHER":"AVAILABLE TO PITCH"}</p>
        {activeIds.length>0 && available.length>0 && (
          <p style={{ margin:"-4px 0 10px", fontSize:11, color:"rgba(255,255,255,0.4)" }}>Bringing someone in marks the current pitcher as left.</p>
        )}
        {available.length===0 ? (
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}>{dateOutsideTourney ? "Fix the game date or type above to see who's available." : "No one else is available."}</div>
        ) : (
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {available.map(p=>{
              const b = budgets.get(p.id);
              return (
                <button key={p.id} type="button" onClick={()=>addPitcher(p)} aria-label={`Bring in ${p.name}, ${b.pitchesLeft} pitches ${b.leftLabel}`}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:20,
                    border:"1px solid rgba(74,222,128,0.25)", background:"rgba(74,222,128,0.06)",
                    color:"rgba(255,255,255,0.8)", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                  {p.jersey?`#${p.jersey} `:""}{p.name}
                  <span style={{ fontSize:11, fontWeight:700, color:leftColor(b.pitchesLeft) }}>{b.pitchesLeft}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {unavailable.length>0 && (
        <div style={card}>
          <p style={sectionTitle}>NOT AVAILABLE</p>
          {unavailable.map(p=>(
            <div key={p.id} style={{ display:"flex", gap:8, fontSize:12, padding:"4px 0", color:"rgba(255,255,255,0.45)" }}>
              <span style={{ fontWeight:700, color:"rgba(255,255,255,0.6)", flexShrink:0 }}>{p.jersey?`#${p.jersey} `:""}{p.name}</span>
              <span style={{ flex:1, textAlign:"right" }}>{budgets.get(p.id).reason}</span>
            </div>
          ))}
        </div>
      )}

      {warnViolations && (()=>{
        const violations = getViolations();
        return (
          <div style={{ ...card, border:"1px solid rgba(251,146,60,0.4)", background:"rgba(251,146,60,0.07)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              {I.warning}
              <span style={{ fontSize:14, fontWeight:700, color:"#fb923c" }}>
                {violations.length} pitcher{violations.length!==1?"s":""} would violate a limit
              </span>
            </div>
            {violations.map(({p,check})=>(
              <div key={p.id} style={{ fontSize:12, color:"rgba(255,255,255,0.65)", marginBottom:3 }}>
                {p.jersey?`#${p.jersey} `:""}{p.name} — {check.message}
              </div>
            ))}
            <div style={{ display:"flex", gap:8, marginTop:12 }}>
              <button onClick={()=>setWarnViolations(false)} style={{ ...cancelBtn, flex:1 }}>Go Back</button>
              <button onClick={()=>handleComplete(true)}
                style={{ flex:2, background:"linear-gradient(135deg,#ea580c,#c2410c)", border:"none",
                  borderRadius:12, padding:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                Log Anyway
              </button>
            </div>
          </div>
        );
      })()}

      {completeErr && <div role="alert" style={{ fontSize:12, color:"#f87171", marginBottom:8 }}>{completeErr}</div>}
      {!warnViolations && (
        <button onClick={()=>handleComplete(false)} disabled={completing || dateOutsideTourney}
          style={{ ...primaryBtn, width:"100%", padding:14, opacity:(completing||dateOutsideTourney)?0.5:1,
            background:"linear-gradient(135deg,#16a34a,#15803d)", boxShadow:"0 4px 20px rgba(22,163,74,0.4)" }}>
          {completing ? (slowComplete ? "Logging… waiting for connection" : "Logging…") : <>{I.check} Log Complete Game{toLog.length?` — ${toLog.length} pitcher${toLog.length!==1?"s":""}`:""}</>}
        </button>
      )}
      <button onClick={handleDiscard} disabled={completing}
        style={{ display:"block", margin:"14px auto 0", background:"none", border:"none", color:"rgba(244,63,94,0.7)",
          fontSize:12, fontWeight:600, cursor:"pointer" }}>
        Discard game
      </button>
    </div>
  );
}
