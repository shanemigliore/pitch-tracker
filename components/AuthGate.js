// AuthGate — password + coach-name gate shown before the app until a coach or
// admin signs in (once per device — Firebase persists the session across
// reloads and version bumps) and provides a name for the audit log.
// Babel/JSX component, loaded via <script type="text/babel" src="components/AuthGate.js"></script>.
function AuthGate() {
  const [status, setStatus]     = useState("loading"); // loading | needsPassword | needsName | ready
  const [role, setRole]         = useState(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState("");
  const [nameInput, setNameInput] = useState("");

  useEffect(() => {
    const unsub = window.__fbOnAuthChange(user => {
      if (user) {
        setRole(window.__fbRoleForUser(user));
        setStatus(getCoachName() ? "ready" : "needsName");
      } else {
        setStatus("needsPassword");
      }
    });
    return unsub;
  }, []);

  function submitPassword(e) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    window.__fbSignIn(password).catch(() => {
      setBusy(false);
      setError("Incorrect password.");
    });
  }

  function submitName(e) {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setCoachName(trimmed);
    setStatus("ready");
  }

  function shell(children) {
    return (
      <div style={{ background:"#080c14", minHeight:"100dvh", display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center", gap:16, padding:24,
        fontFamily:"'Barlow',sans-serif", color:"#f8fafc" }}>
        <img src={LOGO_URI} alt="Prime Baseball" style={{ width:64, height:64, borderRadius:"50%" }}/>
        <div style={{ fontSize:20, fontWeight:800, color:"rgba(255,255,255,0.85)",
          fontFamily:"'Bebas Neue',cursive", letterSpacing:2 }}>PRIME PITCHING</div>
        {children}
      </div>
    );
  }

  if (status === "loading") {
    return shell(<div className="spinner" style={{ fontSize:22 }}>⟳</div>);
  }

  if (status === "needsPassword") {
    return shell(
      <form onSubmit={submitPassword} style={{ width:"100%", maxWidth:320 }}>
        <label style={{ ...sectionLabel, display:"block", marginBottom:6 }}>ACCESS PASSWORD</label>
        <input type="password" value={password} autoFocus
          onChange={e=>setPassword(e.target.value)}
          aria-label="Access password"
          style={{ ...inputStyle, marginBottom:10 }}/>
        {error && <div style={{ fontSize:12, color:"#f87171", marginBottom:10 }}>{error}</div>}
        <button type="submit" disabled={!password||busy}
          style={{ ...primaryBtn, width:"100%", opacity:(!password||busy)?0.5:1 }}>
          {busy ? "Checking…" : "Enter"}
        </button>
      </form>
    );
  }

  if (status === "needsName") {
    return shell(
      <form onSubmit={submitName} style={{ width:"100%", maxWidth:320 }}>
        <label style={{ ...sectionLabel, display:"block", marginBottom:6 }}>YOUR NAME</label>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginBottom:10, lineHeight:1.4 }}>
          Shown in the activity log next to changes you make. You'll only need to enter this once on this device.
        </div>
        <input value={nameInput} autoFocus
          onChange={e=>setNameInput(e.target.value)}
          aria-label="Your name"
          style={{ ...inputStyle, marginBottom:10 }}/>
        <button type="submit" disabled={!nameInput.trim()}
          style={{ ...primaryBtn, width:"100%", opacity:!nameInput.trim()?0.5:1 }}>
          Continue
        </button>
      </form>
    );
  }

  return <App role={role}/>;
}
