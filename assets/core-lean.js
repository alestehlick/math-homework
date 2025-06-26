/*═══════════════════════════════════════════════════════════════════════
  core-lean.js   v4.0
  ───────────────────────────────────────────────────────────────────────
  • Builds form from window.homeworkData  (raw LaTeX → wraps in \( … \) )
  • First / Last name inputs (required)
  • Cool-down between attempts (localStorage, 120 s default)
  • POSTs URL-encoded  data to Google Apps Script  (same params as old core.js)
  • Parses server reply (SUBMITTED, RETRY_HIGH, etc.)  → alerts user
═══════════════════════════════════════════════════════════════════════*/

/*── CONFIG ───────────────────────────────────────────────────────────*/
const SCRIPT_URL  = "https://script.google.com/macros/s/AKfycbwkLwPoES1_hxHn6pdu2qdGCE3bosqwcZg6z23B6w72iQLDAIMzZZf4ZAFC44aKWTIcNg/exec";
const COOLDOWN_MS = 120_000;
/*──────────────────────────────────────────────────────────────────────*/

if (window.__coreLeanLoaded__) {
  console.warn("Duplicate core-lean.js detected");
} else {
  window.__coreLeanLoaded__ = true;
  document.addEventListener("DOMContentLoaded", () => {
    if (!window.homeworkData) { alert("Error: homeworkData not found"); return; }
    buildForm(window.homeworkData);
  });
}

/*──────────────────────────────────────────────────────────────────────*/
/*  Build static DOM  */
function buildForm(d) {
  const root = document.getElementById("hw-root");
  const wrap = t => `\\(${t}\\)`;

  /* skeleton */
  root.innerHTML = `
    <h1>${d.title}</h1>
    <form id="hwForm">
      <input type="hidden" name="classId"  value="${d.classId}">
      <input type="hidden" name="homeworkId" value="${d.id}">
      <div class="student-info">
        <label>First&nbsp;Name: <input name="firstName" required></label>
        <label>Last&nbsp;Name:&nbsp; <input name="lastName"  required></label>
      </div>
      <div id="qbox"></div>
      <button type="submit">Submit</button>
    </form>`;

  /* questions */
  const qbox = document.getElementById("qbox");
  d.questions.forEach((q, i) => {
    const opts = q.choices.map((txt, j) => {
      const letter = String.fromCharCode(65 + j);      // A-F
      return `<li>
                <label>
                  <input type="radio" name="q${i + 1}" value="${letter}" required>
                  ${wrap(txt)}
                </label>
              </li>`;
    }).join("");
    qbox.insertAdjacentHTML("beforeend", `
      <div class="question">
        <p><strong>Q${i + 1}.</strong> ${wrap(q.latex)}</p>
        <ul class="choices">${opts}</ul>
      </div>`);
  });

  /* typeset math once */
  window.MathJax?.typeset();

  /* hook submit */
  document.getElementById("hwForm")
          .addEventListener("submit", ev => handleSubmit(ev, d));
}

/*──────────────────────────────────────────────────────────────────────*/
/*  Submit handler (same protocol as original core.js)  */
async function handleSubmit(ev, d) {
  ev.preventDefault();
  const f   = ev.target;
  const fn  = f.firstName.value.trim();
  const ln  = f.lastName.value.trim();
  if (!fn || !ln) { alert("Please enter both first and last names."); return; }

  /* cool-down */
  const key  = `last_${d.classId}_${d.id}_${fn}_${ln}`.toLowerCase();
  const now  = Date.now();
  const last = Number(localStorage.getItem(key)) || 0;
  if (now - last < COOLDOWN_MS) {
    alert(`Please wait ${Math.ceil((COOLDOWN_MS - (now - last)) / 1000)} s before retrying.`);
    return;
  }

  /* collect answers */
  const answers = [];
  for (let i = 1; i <= d.questions.length; i++)
    answers.push(f[`q${i}`].value);

  /* build POST body (URL-encoded, same field names as old core.js) */
  const body = new URLSearchParams({
    classId   : d.classId,
    homeworkId: d.id,
    firstName : fn,
    lastName  : ln,
    answers   : JSON.stringify(answers),
    answerKey : JSON.stringify(d.answerKey)
  });

  try {
    const r   = await fetch(SCRIPT_URL, { method: "POST", body });
    const txt = await r.text();
    localStorage.setItem(key, String(now));
    handleReply(txt, d.questions.length);
  } catch (e) {
    alert("Network / script error: " + e);
  }
}

/*──────────────────────────────────────────────────────────────────────*/
/*  Interpret server reply (logic identical to the working core.js)  */
function handleReply(msg, total) {
  if (msg.startsWith("SUBMITTED|")) {
    const [, raw, flag] = msg.split("|");
    const scored = flag === "LATE" ? Math.ceil(raw * 0.85) : raw;
    alert(`${flag === "LATE" ? "Late submission (85 % cap)\n" : ""}Score ${scored}/${total}`);
    return;
  }
  if (msg.startsWith("RETRY_HIGH|")) {
    const [, raw, disp, cap] = msg.split("|");
    alert(cap === "CAP"
      ? `Retry accepted.\nRaw ${raw}/${total} → Capped 85 % → ${disp}/${total}`
      : `Retry accepted.\nScore ${disp}/${total}`);
    return;
  }
  if (msg.startsWith("RETRY_LOW|")) {
    const [, disp, prev] = msg.split("|");
    alert(`Retry recorded.\nRetry ${disp}/${total} < Previous ${prev}/${total}\nHigher score kept.`);
    return;
  }
  if (msg === "ERR|INVALID_NAME")        alert("Name not in roster.");
  else if (msg === "ERR|LIMIT_EXCEEDED") alert("Max 2 attempts reached.");
  else if (msg.startsWith("ERR|"))       alert("Server error:\n" + msg.slice(4));
  else                                   alert("Unexpected reply:\n" + msg);
}
