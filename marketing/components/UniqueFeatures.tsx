"use client";

import { useEffect, useState } from "react";

/**
 * "Seven things only schedU does" — every card opens a small INTERACTIVE
 * demo of that exact mechanic (not a screenshot, not a video). Each demo
 * mirrors the real product behavior it claims: cross-timetable clash
 * detection, grade-naming adaptation + directory auto-link, staggered
 * breaks, view transposition, AND/OR combination logic, the live Pulse,
 * and the substitution / fair-duty flow.
 */

const FEATURES = [
  { icon: "🔀", key: "clash", title: "Cross-timetable clash detection", desc: "The same faculty member double-booked across two entirely separate timetables — caught instantly, not just within one schedule." },
  { icon: "🔗", key: "naming", title: "Directory auto-link, any naming convention", desc: "Name your levels “KG1”, “Grade 1”, “Year 7”, or “Class-I” — schedU adapts and groups them. Type a faculty or room name that already exists and it links automatically: one record, reused everywhere." },
  { icon: "🍱", key: "breaks", title: "Per-grade staggered breaks", desc: "Nursery breaks after P3, Class VI after P5, Class XI after P6 — every grade's break lands at its own real time, automatically." },
  { icon: "🔁", key: "transpose", title: "Transpose any view instantly", desc: "Flip Class, Faculty, Venue, or Subject views between periods-as-columns and days-as-columns with one click." },
  { icon: "🧩", key: "andor", title: "True AND / OR combination engine", desc: "AND runs subjects in genuine parallel across sections, streams, and blocks. OR competes for a single slot based on real period need — never a fake simultaneous split." },
  { icon: "🛟", key: "sub", title: "Live mode with substitutions & fair duty assignments", desc: "A board that follows the clock on every view. Drag ahead to any upcoming period, mark a faculty member absent, and get ranked cover scored on real workload — assign in one click, with a fairness note on every pick." },
];

export function UniqueFeatures() {
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const feature = FEATURES.find((f) => f.key === open);

  return (
    <div className="uf-wrap">
      <div className="uf-grid">
        {FEATURES.map((f) => (
          <button key={f.key} className="uf-card" onClick={() => setOpen(f.key)}>
            <div className="uf-icon">{f.icon}</div>
            <h3 className="uf-title">{f.title}</h3>
            <p className="uf-desc">{f.desc}</p>
            <span className="uf-try">▶ try it</span>
          </button>
        ))}
      </div>

      {feature && (
        <div className="uf-overlay" onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div className="uf-modal" role="dialog" aria-modal="true" aria-label={feature.title}>
            <div className="uf-modal-head">
              <span className="uf-icon" style={{ fontSize: 22, margin: 0 }}>{feature.icon}</span>
              <b>{feature.title}</b>
              <button className="uf-close" onClick={() => setOpen(null)} aria-label="Close">✕</button>
            </div>
            <div className="uf-modal-body">
              {open === "clash" && <DemoClash />}
              {open === "naming" && <DemoNaming />}
              {open === "breaks" && <DemoBreaks />}
              {open === "transpose" && <DemoTranspose />}
              {open === "andor" && <DemoAndOr />}
              {open === "sub" && <DemoSub />}
            </div>
            <div className="uf-modal-foot">Illustrative data — the mechanic is the real one.</div>
          </div>
        </div>
      )}

      <style>{CSS}</style>
    </div>
  );
}

// ── 1 · Cross-timetable clash ────────────────────────────────────────────
function DemoClash() {
  const [booked, setBooked] = useState(false);
  return (
    <div>
      <p className="uf-p">Two <b>separately published</b> timetables. Book J. Abraham into both at the same period:</p>
      <div className="uf-two-col">
        {["I-V TT", "VI-X TT"].map((tt, i) => (
          <div key={tt} className="uf-mini-card">
            <div className="uf-mini-title">{tt}</div>
            <div className="uf-mini-grid">
              {["P1", "P2", "P3"].map((p, pi) => (
                <div key={p} className={`uf-cell ${booked && pi === 1 ? "uf-cell-clash" : ""}`}>
                  <b>{p}</b>
                  {pi === 1 ? <span>{booked ? "J. Abraham ⚠" : i === 0 ? "J. Abraham" : "— free —"}</span> : <span>{["M. Esther", "", "D. Samuel"][pi]}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button className="uf-btn" onClick={() => setBooked((b) => !b)}>{booked ? "Undo" : "Book J. Abraham in VI-X TT · P2"}</button>
      {booked && <div className="uf-alert">⚠ Cross-timetable clash — J. Abraham is already teaching in <b>I-V TT</b> at P2. Caught the moment you typed it, across two separate schedules.</div>}
    </div>
  );
}

// ── 2 · Naming convention + directory auto-link ──────────────────────────
function parseLevel(v: string): string | null {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (/^(kg|pp|nur)/.test(s)) return "Pre-Primary group";
  if (/^(grade|class|std|year|form)[\s-]*([1-5])$/.test(s) || /^[iv]{1,3}$/.test(s)) return "Primary group";
  if (/^(grade|class|std|year|form)[\s-]*([6-9]|1[0-2])$/.test(s) || /^(vi|vii|viii|ix|x|xi|xii)$/.test(s)) return "Secondary group";
  return "Custom level — kept exactly as typed";
}
function DemoNaming() {
  const [level, setLevel] = useState("");
  const [fac, setFac] = useState("");
  const parsed = parseLevel(level);
  const linked = "j. abraham".startsWith(fac.trim().toLowerCase()) && fac.trim().length >= 3;
  return (
    <div>
      <p className="uf-p">Type a level in <b>your</b> convention — “KG1”, “Grade 1”, “Year 7”, “Class-I”, anything:</p>
      <input className="uf-input" placeholder="e.g. KG1 or Year 7" value={level} onChange={(e) => setLevel(e.target.value)} />
      {parsed && <div className="uf-ok">✓ Understood — grouped under <b>{parsed}</b>, spacing tidied, sections auto-built.</div>}
      <p className="uf-p" style={{ marginTop: 14 }}>Now start typing a faculty name that already exists (try “J. A…”):</p>
      <input className="uf-input" placeholder="e.g. J. Abraham" value={fac} onChange={(e) => setFac(e.target.value)} />
      {linked && <div className="uf-ok">🔗 Linked to the existing directory record <b>J. Abraham</b> — one person, reused across every schedule. No duplicates, ever.</div>}
    </div>
  );
}

// ── 3 · Staggered breaks ─────────────────────────────────────────────────
function DemoBreaks() {
  const [smart, setSmart] = useState(false);
  const rows = smart
    ? [["11:00", "LUNCH", "P4", "P4"], ["11:40", "P4", "LUNCH", "P5"], ["12:20", "P5", "P5", "LUNCH"]]
    : [["11:00", "LUNCH", "LUNCH", "LUNCH"], ["11:40", "P4", "P4", "P4"], ["12:20", "P5", "P5", "P5"]];
  return (
    <div>
      <div className="uf-seg">
        <button className={!smart ? "is-on" : ""} onClick={() => setSmart(false)}>🕐 Single lunch</button>
        <button className={smart ? "is-on" : ""} onClick={() => setSmart(true)}>🧠 Smart (staggered)</button>
      </div>
      <div className="uf-bell">
        <div className="uf-bell-row uf-bell-head"><span /><span>I–V</span><span>VI–VIII</span><span>IX–X</span></div>
        {rows.map((r, i) => (
          <div key={i} className="uf-bell-row">
            <span className="uf-mono">{r[0]}</span>
            {r.slice(1).map((c, j) => <span key={j} className={c === "LUNCH" ? "uf-lunch" : "uf-period"}>{c}</span>)}
          </div>
        ))}
      </div>
      <p className="uf-p" style={{ marginTop: 10 }}>{smart ? "Each age band eats at its own time — the canteen serves one group at a time, and the generator plans every period around it automatically." : "One shared slot — now flip to Smart and watch each grade get its own lunch, automatically."}</p>
    </div>
  );
}

// ── 4 · Transpose ────────────────────────────────────────────────────────
function DemoTranspose() {
  const [flipped, setFlipped] = useState(false);
  const days = ["Mon", "Tue", "Wed"];
  const periods = ["P1", "P2", "P3"];
  const cell = (d: number, p: number) => ["Maths", "Science", "English", "French", "History", "Art", "Music", "Maths", "Science"][d * 3 + p];
  const cols = flipped ? days : periods;
  const rowsL = flipped ? periods : days;
  return (
    <div>
      <button className="uf-btn" onClick={() => setFlipped((f) => !f)}>⇄ Transpose</button>
      <div className="uf-bell" style={{ marginTop: 10 }}>
        <div className="uf-bell-row uf-bell-head"><span />{cols.map((c) => <span key={c}>{c}</span>)}</div>
        {rowsL.map((r, ri) => (
          <div key={r} className="uf-bell-row">
            <span className="uf-mono">{r}</span>
            {cols.map((_, ci) => <span key={ci} className="uf-period">{flipped ? cell(ci, ri) : cell(ri, ci)}</span>)}
          </div>
        ))}
      </div>
      <p className="uf-p" style={{ marginTop: 10 }}>{flipped ? "Periods down the side, days across the top." : "Days down the side, periods across the top."} One click, any view — Class, Faculty, Venue, or Subject.</p>
    </div>
  );
}

// ── 5 · AND / OR ─────────────────────────────────────────────────────────
function DemoAndOr() {
  const [mode, setMode] = useState<"and" | "or">("and");
  const [week, setWeek] = useState(0);
  return (
    <div>
      <div className="uf-seg">
        <button className={mode === "and" ? "is-on" : ""} onClick={() => setMode("and")}>AND — parallel</button>
        <button className={mode === "or" ? "is-on" : ""} onClick={() => setMode("or")}>OR — one at a time</button>
      </div>
      {mode === "and" ? (
        <div>
          <div className="uf-lane" style={{ background: "#EDE9FF" }}>Physics · J. Abraham · Lab-1 <i>Cross-section</i></div>
          <div className="uf-lane" style={{ background: "#DBEAFE" }}>Chemistry · M. Esther · Lab-2 <i>Cross-stream</i></div>
          <div className="uf-lane" style={{ background: "#DCFCE7" }}>Economics · D. Samuel · R-12 <i>Cross-block</i></div>
          <p className="uf-p">All three run in the <b>same slot</b>, across sections, streams, and blocks — genuine parallel, not a visual trick.</p>
        </div>
      ) : (
        <div>
          <div className="uf-lane" style={{ background: week % 2 === 0 ? "#EDE9FF" : "#DBEAFE", borderLeft: `3px solid ${week % 2 === 0 ? "#7C6FE0" : "#3B82F6"}` }}>
            <b>{week % 2 === 0 ? "Physics" : "Chemistry"}</b> holds the slot — {week % 2 === 0 ? "needs 2 more periods this week" : "Physics is caught up, Chemistry takes it"}
          </div>
          <button className="uf-btn" onClick={() => setWeek((w) => w + 1)}>Advance a week →</button>
          <p className="uf-p">One slot, one subject at a time — whichever genuinely needs it more. Never both at once.</p>
        </div>
      )}
    </div>
  );
}

// ── 6 · Live mode: substitutions & fair duty ─────────────────────────────
function DemoSub() {
  const [step, setStep] = useState(0);
  return (
    <div>
      <div className="uf-mini-card" style={{ marginBottom: 10 }}>
        <div className="uf-mini-title">Upcoming · P4 · X-B French</div>
        <div className="uf-cell" style={{ textAlign: "left" }}>
          <span>{step < 2 ? "R. Naomi" : <><s>R. Naomi</s> → T. Moses <b style={{ color: "#059669" }}>(sub) ✓</b></>}</span>
        </div>
      </div>
      {step === 0 && <button className="uf-btn" onClick={() => setStep(1)}>⚑ Mark R. Naomi absent for P4</button>}
      {step === 1 && (
        <div className="uf-subpanel">
          <b>Ranked cover — scored on real workload:</b>
          <button className="uf-cand is-top" onClick={() => setStep(2)}>① T. Moses · free at P4 · 1 duty today · light week ✓ — <u>assign</u></button>
          <div className="uf-cand">② E. Ruth · free at P4 · 4 today</div>
        </div>
      )}
      {step === 2 && <div className="uf-ok">✓ Assigned. Fairness note: this is T. Moses&rsquo;s <b>first extra duty this week</b> — the lightest-loaded eligible pick. <button className="uf-reset" onClick={() => setStep(0)}>reset</button></div>}
      {step === 0 && <p className="uf-p">You plan cover <b>ahead of time</b> — mark the absence for an upcoming period and schedU ranks who can take it, fairly.</p>}
    </div>
  );
}

// ── styles ───────────────────────────────────────────────────────────────
const CSS = `
.uf-wrap { width: 100%; max-width: 1040px; font-family: 'Plus Jakarta Sans', sans-serif; }
.uf-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
.uf-card { text-align: left; border: 1px solid #E8E4FF; background: #FAFAFE; border-radius: 12px; padding: 24px; cursor: pointer; font-family: inherit; transition: transform .15s, box-shadow .15s, border-color .15s; position: relative; }
.uf-card:hover { transform: translateY(-3px); box-shadow: 0 14px 40px rgba(124,111,224,0.16); border-color: #C4B5FD; }
.uf-icon { font-size: 26px; line-height: 1; margin-bottom: 12px; }
.uf-title { font-size: 14.5px; font-weight: 700; color: #13111E; margin-bottom: 8px; }
.uf-desc { font-size: 13px; line-height: 1.65; color: #4B5275; }
.uf-try { position: absolute; top: 18px; right: 18px; font-size: 10.5px; font-weight: 800; color: #7C6FE0; opacity: 0; transition: opacity .15s; }
.uf-card:hover .uf-try { opacity: 1; }
.uf-overlay { position: fixed; inset: 0; z-index: 100; background: rgba(19,17,30,0.5); display: flex; align-items: center; justify-content: center; padding: 18px; }
.uf-modal { width: min(520px, 100%); max-height: 86vh; overflow-y: auto; background: #fff; border-radius: 16px; box-shadow: 0 30px 90px rgba(0,0,0,0.3); }
.uf-modal-head { display: flex; align-items: center; gap: 10px; padding: 16px 18px 12px; border-bottom: 1px solid #F2F0FB; font-size: 15px; color: #13111E; position: sticky; top: 0; background: #fff; }
.uf-close { margin-left: auto; border: none; background: #F4F2FE; color: #6B7280; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; font-size: 13px; }
.uf-modal-body { padding: 16px 18px; }
.uf-modal-foot { padding: 10px 18px 14px; font-size: 10.5px; color: #8B87AD; border-top: 1px solid #F2F0FB; }
.uf-p { font-size: 13px; color: #4B5275; line-height: 1.6; margin: 8px 0; }
.uf-btn { display: inline-block; margin-top: 6px; padding: 9px 16px; border-radius: 9px; border: none; background: #7C6FE0; color: #fff; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; }
.uf-input { width: 100%; border: 1.5px solid #D1D5DB; border-radius: 9px; padding: 10px 13px; font-size: 14px; font-family: inherit; color: #13111E; outline: none; }
.uf-input:focus { border-color: #7C6FE0; box-shadow: 0 0 0 3px rgba(124,111,224,0.12); }
.uf-ok { margin-top: 8px; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 9px; padding: 9px 12px; font-size: 12.5px; color: #166534; line-height: 1.5; }
.uf-alert { margin-top: 10px; background: #FEF2F2; border: 1.5px solid #FCA5A5; border-radius: 9px; padding: 10px 13px; font-size: 12.5px; color: #B91C1C; line-height: 1.5; }
.uf-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0; }
.uf-mini-card { border: 1px solid #E8E4FF; border-radius: 10px; padding: 10px 12px; background: #FAFAFE; }
.uf-mini-title { font-size: 11px; font-weight: 800; color: #5B52A8; margin-bottom: 7px; text-transform: uppercase; letter-spacing: 0.04em; }
.uf-mini-grid { display: flex; flex-direction: column; gap: 5px; }
.uf-cell { display: flex; justify-content: space-between; gap: 8px; background: #fff; border: 1px solid #EFEDF9; border-radius: 7px; padding: 6px 9px; font-size: 12px; color: #374151; }
.uf-cell b { color: #8B87AD; font-size: 11px; }
.uf-cell-clash { background: #FEF2F2; border-color: #FCA5A5; }
.uf-cell-clash span { color: #B91C1C; font-weight: 700; }
.uf-seg { display: inline-flex; gap: 3px; padding: 3px; background: #F1EEFB; border-radius: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.uf-seg button { padding: 7px 13px; border-radius: 8px; border: none; background: transparent; font-size: 12px; font-weight: 700; color: #8B87AD; cursor: pointer; font-family: inherit; }
.uf-seg button.is-on { background: #fff; color: #7C6FE0; box-shadow: 0 1px 4px rgba(124,111,224,0.18); }
.uf-bell { border: 1px solid #E8E4FF; border-radius: 10px; padding: 8px 10px; background: #fff; }
.uf-bell-row { display: grid; grid-template-columns: 56px repeat(3, 1fr); gap: 4px; padding: 2px 0; }
.uf-bell-head span { font-size: 10px; font-weight: 700; color: #8B87AD; text-transform: uppercase; text-align: center; }
.uf-mono { font-family: 'DM Mono', monospace; font-size: 11px; color: #9CA3AF; align-self: center; }
.uf-period { font-size: 11px; color: #13111E; background: #F4F2FE; border-radius: 6px; padding: 5px; text-align: center; }
.uf-lunch { font-size: 10.5px; font-weight: 700; color: #D97706; background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 6px; padding: 5px; text-align: center; }
.uf-lane { border-radius: 9px; padding: 9px 13px; font-size: 12.5px; color: #13111E; font-weight: 600; margin-bottom: 7px; }
.uf-lane i { display: block; font-style: normal; font-size: 9.5px; font-weight: 800; text-transform: uppercase; color: #7C6FE0; margin-top: 3px; }
.uf-subpanel { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: #374151; }
.uf-cand { text-align: left; font-size: 12px; padding: 8px 11px; border-radius: 8px; border: 1px solid #F0EEFA; color: #4B5275; background: #fff; font-family: inherit; }
.uf-cand.is-top { border-color: #A7F3D0; background: #F0FDF9; cursor: pointer; color: #13111E; font-weight: 600; }
.uf-reset { margin-left: 6px; font-size: 11px; color: #7C6FE0; background: none; border: none; cursor: pointer; text-decoration: underline; font-family: inherit; }
@media (max-width: 560px) { .uf-two-col { grid-template-columns: 1fr; } }
`;
