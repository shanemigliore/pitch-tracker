// Shared status config, icon set, and style tokens used across every screen/component.
// Contains JSX (icons), so this loads as a Babel-transformed script, not plain JS.
// Wrapped in an IIFE so these top-level names don't collide with index.html's
// destructuring of the same names from window.UIConstants (classic <script>
// tags share one global lexical environment, so an unwrapped top-level
// `const STATUS` here + `const { STATUS } = window.UIConstants` there would
// throw "Identifier 'STATUS' has already been declared").
(function () {

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS = {
  available: { label:"Ready",    color:"#4ade80", bg:"rgba(74,222,128,0.12)",  ring:"rgba(74,222,128,0.35)" },
  tomorrow:  { label:"Tomorrow", color:"#fbbf24", bg:"rgba(251,191,36,0.12)",  ring:"rgba(251,191,36,0.35)" },
  soon:      { label:"1 Day",    color:"#fbbf24", bg:"rgba(251,191,36,0.12)",  ring:"rgba(251,191,36,0.35)" },
  resting2:  { label:"2 Days",   color:"#fb923c", bg:"rgba(251,146,60,0.12)",  ring:"rgba(251,146,60,0.35)"  },
  resting:   { label:"Resting",  color:"#f43f5e", bg:"rgba(244,63,94,0.12)",   ring:"rgba(244,63,94,0.35)"  },
};

// ─── Icons ────────────────────────────────────────────────────────────────────
const I = {
  roster:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  gamelog:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
  eligibility:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>,
  tournament: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22"><path d="M6 9H3V4h3m15 5h3V4h-3M6 4h12v7a6 6 0 01-12 0V4zM12 17v3M8 20h8"/></svg>,
  history:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>,
  back:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>,
  plus:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M12 5v14M5 12h14"/></svg>,
  trash:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>,
  warning:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  chevron:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M9 18l6-6-6-6"/></svg>,
  check:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><path d="M20 6L9 17l-5-5"/></svg>,
  edit:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  filter:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  download:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  upload:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  xmark:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  activity:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  settings:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82A1.65 1.65 0 003 13.09H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
};

// ─── Shared styles ────────────────────────────────────────────────────────────
const inputStyle = {
  // fontSize must stay >=16 — iOS Safari auto-zooms the page on focus for any
  // text input rendered smaller than that, which is what causes the page to
  // "jump/zoom" when the keyboard opens.
  display:"block", width:"100%", maxWidth:"100%", padding:"10px 13px", borderRadius:10, fontSize:16,
  background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)",
  color:"#f8fafc", outline:"none", boxSizing:"border-box", marginBottom:0,
  WebkitAppearance:"none", appearance:"none",
};
const primaryBtn = {
  display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"11px 18px",
  background:"linear-gradient(135deg,#1d4ed8,#2563eb)", border:"none",
  borderRadius:12, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer",
  boxShadow:"0 3px 14px rgba(37,99,235,0.4)",
};
const cancelBtn = {
  flex:1, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)",
  borderRadius:12, padding:10, color:"rgba(255,255,255,0.6)", fontSize:14, cursor:"pointer",
};
const card = {
  background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)",
  borderRadius:16, padding:14, marginBottom:12, overflow:"hidden",
};
const sectionLabel = {
  margin:"0 0 8px", fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", letterSpacing:1.5,
};
// Bigger box/section title — same look as the season-group header on the team
// picker screen (bold, bright, roomier letter-spacing). Used for the `<p>` that
// introduces a whole card/section; individual field labels above inputs stay
// on the smaller, dimmer `sectionLabel`.
const sectionTitle = {
  margin:"0 0 10px", fontSize:15, fontWeight:800, color:"#f8fafc", letterSpacing:0.5,
};

window.UIConstants = { STATUS, I, inputStyle, primaryBtn, cancelBtn, card, sectionLabel, sectionTitle };

})();
