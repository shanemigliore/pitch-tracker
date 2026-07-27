// Shared UI: Chip, PitcherStatusBanner, RadialArc, ContextPicker, ScreenBoundary.
// Babel/JSX component, loaded via <script type="text/babel" src="components/shared.js"></script>.

// ─── Shared UI ───────────────────────────────────────────────────────────────
function Chip({ status, size="sm" }) {
  const s = STATUS[status] || STATUS.available;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5,
      padding: size==="lg" ? "5px 12px" : "3px 9px", borderRadius:20,
      background:s.bg, border:`1px solid ${s.ring}`, color:s.color,
      fontSize: size==="lg" ? 13 : 11, fontWeight:700, letterSpacing:0.4, flexShrink:0 }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:s.color, flexShrink:0 }}/>
      {s.label}
    </span>
  );
}

function PitcherStatusBanner({ pitcher, tournaments }) {
  const status = getAvailabilityStatus(pitcher, null, tournaments);
  const s = STATUS[status];
  const eligStr = getEligibleDateStr(pitcher, tournaments);
  if (status === "available") {
    return (
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
        background:"rgba(74,222,128,0.07)", border:"1px solid rgba(74,222,128,0.25)", borderRadius:12, marginBottom:12 }}>
        <span style={{ fontSize:18 }}>✅</span>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:"#4ade80" }}>Available to pitch today</div>
          {pitcher.lastPitches > 0 && <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>Last game: {pitcher.lastPitches}p on {formatDate(pitcher.lastGameDate)}</div>}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
      background:s.bg, border:`1px solid ${s.ring}`, borderRadius:12, marginBottom:12 }}>
      <span style={{ fontSize:18 }}>{status==="resting" || status==="resting2" ? "🚫" : "⚠️"}</span>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, fontWeight:700, color:s.color }}>
          {`Eligible ${formatDate(eligStr)}`}
        </div>
        <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)" }}>
          {pitcher.lastPitches}p on {formatDate(pitcher.lastGameDate)}
        </div>
      </div>
      <Chip status={status}/>
    </div>
  );
}

function RadialArc({ value, max, size=120, strokeW=9, color="#38bdf8" }) {
  const r = (size - strokeW) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const arcColor = pct >= 1 ? "#f43f5e" : pct >= (max-15)/max ? "#fb923c" : color;
  return (
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeW}/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={arcColor} strokeWidth={strokeW}
        strokeDasharray={circ} strokeDashoffset={circ*(1-pct)}
        strokeLinecap="round" style={{ transition:"stroke-dashoffset 0.3s,stroke 0.3s" }}/>
    </svg>
  );
}

// ─── Context picker (reused in multiple screens) ──────────────────────────────
function ContextPicker({ context, setContext, tourneyDay, setTourneyDay, tournaments, gameDate }) {
  // Only show tournaments that are still active on the selected game date
  const activeTournaments = tournaments.filter(t => {
    if (!t.startDate) return true; // no start date set — always show
    const endDate = addDays(t.startDate, (t.days || 1) - 1);
    return (gameDate || todayStr()) <= endDate;
  });
  const selectedTourney = tournaments.find(t=>t.id===context);
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
            <button key={t.id} onClick={()=>{setContext(t.id); if(setTourneyDay) setTourneyDay(1);}} aria-pressed={context===t.id}
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
      {context!=="regular" && selectedTourney && setTourneyDay && (
        <div style={{ marginBottom:10 }}>
          <label style={{ ...sectionLabel, display:"block", marginBottom:6 }}>TOURNAMENT DAY</label>
          <div style={{ display:"flex", gap:6 }}>
            {Array.from({length:selectedTourney.days},(_,i)=>i+1).map(d=>(
              <button key={d} onClick={()=>setTourneyDay(d)} aria-label={`Tournament day ${d}`} aria-pressed={tourneyDay===d}
                style={{ width:42, height:42, borderRadius:10,
                  border:`1px solid ${tourneyDay===d?"#f59e0b":"rgba(255,255,255,0.1)"}`,
                  background:tourneyDay===d?"rgba(245,158,11,0.2)":"rgba(255,255,255,0.04)",
                  color:tourneyDay===d?"#fbbf24":"rgba(255,255,255,0.5)", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                {d}
              </button>
            ))}
          </div>
          <div style={{ marginTop:5, fontSize:11, color:"rgba(255,255,255,0.35)" }}>
            Day 1 {selectedTourney.day1IsHardLimit?"limit":"guideline"}: {selectedTourney.maxDay1}p · <strong style={{color:"rgba(255,255,255,0.5)"}}>Tournament limit: {selectedTourney.maxTotal}p</strong>
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
