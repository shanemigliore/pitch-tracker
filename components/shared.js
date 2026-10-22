// Shared UI: Chip, RadialArc, ContextPicker, ScreenBoundary.
// Babel/JSX component, loaded via <script type="text/babel" src="components/shared.js"></script>.

// ─── Shared UI ───────────────────────────────────────────────────────────────
function Chip({ status, size="sm", label }) {
  const s = STATUS[status] || STATUS.available;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5,
      padding: size==="lg" ? "5px 12px" : "3px 9px", borderRadius:20,
      background:s.bg, border:`1px solid ${s.ring}`, color:s.color,
      fontSize: size==="lg" ? 13 : 11, fontWeight:700, letterSpacing:0.4, flexShrink:0 }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:s.color, flexShrink:0 }}/>
      {label || s.label}
    </span>
  );
}

// ticks: values to mark on the ring (e.g. rest-day steps). guideline: a soft
// limit - dashed track, and it tops out amber instead of red.
function RadialArc({ value, max, size=120, strokeW=9, color="#38bdf8", ticks=[], guideline=false }) {
  const r = (size - strokeW) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const arcColor = pct >= 1 ? (guideline ? "#fbbf24" : "#f43f5e") : pct >= (max-15)/max ? "#fb923c" : color;
  return (
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={guideline?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.06)"}
        strokeWidth={strokeW} strokeDasharray={guideline?"3 3":undefined}/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={arcColor} strokeWidth={strokeW}
        strokeDasharray={circ} strokeDashoffset={circ*(1-pct)}
        strokeLinecap="round" style={{ transition:"stroke-dashoffset 0.3s,stroke 0.3s" }}/>
      {ticks.filter(t=>t>0 && t<max).map((t,i)=>{
        const a = 2 * Math.PI * t / max, c = Math.cos(a), s = Math.sin(a);
        const r0 = r - strokeW/2 - 1, r1 = r + strokeW/2 + 1;
        return <line key={i} x1={cx+r0*c} y1={cy+r0*s} x2={cx+r1*c} y2={cy+r1*s}
          stroke="rgba(255,255,255,0.7)" strokeWidth={1.5}/>;
      })}
    </svg>
  );
}

// ─── Context picker (reused in multiple screens) ──────────────────────────────
// The tournament day isn't picked here - it's derived from gameDate
// (getTourneyDayNumber), so the day a game counts toward can't disagree with
// its date. Callers should block saving while a tournament is selected and
// gameDate falls outside it (getTourneyDayNumber returns null).
function ContextPicker({ context, setContext, tournaments, gameDate }) {
  const date = gameDate || todayStr();
  // Show tournaments that haven't ended as of the game date, plus whichever is
  // currently selected (so editing an old game doesn't hide its tournament).
  const activeTournaments = tournaments.filter(t => {
    if (t.id === context) return true;
    if (!t.startDate) return true; // no start date set — always show
    return date <= getTourneyEndDate(t);
  });
  const selectedTourney = tournaments.find(t=>t.id===context);
  const dayNum = selectedTourney ? getTourneyDayNumber(selectedTourney, date) : null;
  const dayLimit = dayNum ? getTourneyDayLimits(selectedTourney)[dayNum-1] : null;
  return (
    <>
      <div style={{ marginBottom:10 }}>
        <label style={{ ...sectionLabel, display:"block", marginBottom:6 }}>GAME TYPE</label>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button onClick={()=>setContext("regular")} aria-pressed={context==="regular"}
            style={{ flex:1, minWidth:80, padding:"9px 10px", borderRadius:10,
              border:`1px solid ${context==="regular"?"#2563eb":"rgba(255,255,255,0.1)"}`,
              background:context==="regular"?"rgba(37,99,235,0.2)":"rgba(255,255,255,0.04)",
              color:context==="regular"?"#60a5fa":"rgba(255,255,255,0.6)", fontSize:13, fontWeight:600, cursor:"pointer" }}>
            ⚾ Regular Season
          </button>
          {activeTournaments.map(t=>(
            <button key={t.id} onClick={()=>setContext(t.id)} aria-pressed={context===t.id}
              style={{ flex:1, minWidth:80, padding:"9px 10px", borderRadius:10,
                border:`1px solid ${context===t.id?"#f59e0b":"rgba(255,255,255,0.1)"}`,
                background:context===t.id?"rgba(245,158,11,0.15)":"rgba(255,255,255,0.04)",
                color:context===t.id?"#fbbf24":"rgba(255,255,255,0.6)", fontSize:13, fontWeight:600, cursor:"pointer" }}>
              🏆 {t.name}
            </button>
          ))}
          {activeTournaments.length===0 && (
            <div style={{ flex:1, padding:"9px 10px", borderRadius:10, border:"1px solid rgba(255,255,255,0.06)",
              background:"rgba(255,255,255,0.02)", color:"rgba(255,255,255,0.3)", fontSize:12, textAlign:"center" }}>
              No Upcoming Tournaments
            </div>
          )}
        </div>
      </div>
      {context!=="regular" && selectedTourney && (
        <div style={{ marginBottom:10 }}>
          <label style={{ ...sectionLabel, display:"block", marginBottom:6 }}>TOURNAMENT DAY</label>
          {!selectedTourney.startDate ? (
            <div role="alert" style={{ fontSize:12, fontWeight:600, color:"#f87171" }}>
              This tournament has no start date. Set one in Settings → Tournaments before logging games to it.
            </div>
          ) : dayNum ? (
            <div style={{ fontSize:13, fontWeight:700, color:"#fbbf24" }}>
              Day {dayNum} of {getTourneyDays(selectedTourney)} <span style={{ fontWeight:400, color:"rgba(255,255,255,0.4)" }}>· from game date</span>
            </div>
          ) : (
            <div role="alert" style={{ fontSize:12, fontWeight:600, color:"#f87171" }}>
              Game date ({formatDate(date)}) is outside this tournament
              ({formatDate(selectedTourney.startDate)}{getTourneyDays(selectedTourney)>1?` – ${formatDate(getTourneyEndDate(selectedTourney))}`:""}). Change the game date.
            </div>
          )}
          <div style={{ marginTop:5, fontSize:11, color:"rgba(255,255,255,0.35)" }}>
            {dayLimit && <>Day {dayNum} {dayLimit.isHard?"hard limit":"guideline"}: {dayLimit.max}p · </>}
            <strong style={{color:"rgba(255,255,255,0.5)"}}>Tournament limit: {getTourneyMaxTotal(selectedTourney)}p</strong>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Screen error boundary ─────────────────────────────────────────────────────
class ScreenBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error("Screen render error:", error); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding:"20px 16px" }}>
          {this.props.onBack && (
            <button onClick={this.props.onBack}
              style={{ background:"rgba(255,255,255,0.07)", border:"none", borderRadius:10,
                padding:10, color:"rgba(255,255,255,0.7)", cursor:"pointer", display:"flex", marginBottom:16 }}>
              ← Back to Roster
            </button>
          )}
          <div style={{ background:"rgba(244,63,94,0.08)", border:"1px solid rgba(244,63,94,0.25)",
            borderRadius:14, padding:16 }}>
            <div style={{ color:"#f43f5e", fontWeight:700, marginBottom:8 }}>Something went wrong</div>
            <pre style={{ fontSize:11, color:"rgba(255,255,255,0.5)", margin:0, whiteSpace:"pre-wrap",
              wordBreak:"break-all", maxHeight:200, overflowY:"auto" }}>{String(this.state.error)}</pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
