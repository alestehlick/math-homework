/*═══════════════════════════════════════════════════════════════════════
  core.js   v4.1  (TikZ-safe, drop-in for v4.0)
  ───────────────────────────────────────────────────────────────────────
  • Same API as before; adds robust TikZ handling:
      - Optional #media slot if d.graphics is present
      - Auto-wrap raw TikZ into <script type="text/tikz">
      - Sanitizer for common scope-bracket typos
      - Tries processing via TikZJax whether it loads early or late
═══════════════════════════════════════════════════════════════════════*/

/*── CONFIG ───────────────────────────────────────────────────────────*/
const SCRIPT_URL  = "https://script.google.com/macros/s/AKfycbwkLwPoES1_hxHn6pdu2qdGCE3bosqwcZg6z23B6w72iQLDAIMzZZf4ZAFC44aKWTIcNg/exec";
const COOLDOWN_MS = 120_000;
/*─────────────────────────────────────────────────────────────────────*/

if (window.__coreLoaded__) {
  console.warn("Duplicate core.js detected");
} else {
  window.__coreLoaded__ = true;
  document.addEventListener("DOMContentLoaded", () => {
    if (!window.homeworkData) { alert("Error: homeworkData not found."); return; }
    buildForm(window.homeworkData);
  });
}

/*─────────────────────────────────────────────────────────────────────*/
/* TikZ helpers */
function sanitizeTikz(src){
  if (!src) return src;
  return src
    // common bracket/angle-bracket variants
    .replaceAll("\\begin{scope]", "\\begin{scope}")
    .replaceAll("\\end{scope]", "\\end{scope}")
    .replace(/<\s*begin\{scope\}\s*>?/gi, "\\begin{scope}")
    .replace(/<\s*\/\s*end\{scope\}\s*>?/gi, "\\end{scope}")
    .replace(/<\s*\/\s*begin\{scope\}\s*>?/gi, "\\end{scope}");
}
function looksLikeTikz(src){
  return typeof src === "string" && /\\begin\{tikzpicture\}/.test(src);
}
function mountTikzInto(el, src){
  // If it already contains a TikZJax script or an <svg>/<img>, just insert it.
  if (/<script[^>]+type=["']text\/tikz["']/.test(src) || /<(svg|img)\b/i.test(src)) {
    el.innerHTML = src;
  } else {
    const fixed = sanitizeTikz(src);
    el.innerHTML = `<script type="text/tikz">\n${fixed}\n</script>`;
  }
  // Try processing now; if tikzjax loads later, try again on window load.
  if (window.tikzjax?.process) {
    try { window.tikzjax.process(); } catch {}
  } else {
    window.addEventListener("load", () => {
      try { window.tikzjax?.process?.(); } catch {}
    }, { once:true });
  }
}

/*─────────────────────────────────────────────────────────────────────*/
/* Build DOM (keeps previous structure/field names) */
function buildForm(d){
  const root = document.getElementById("hw-root");
  const wrap = t => `\\(${t}\\)`;

  root.innerHTML = `
    <h1>${d.title ?? "Homework"}</h1>
    <form id="hwForm">
      <input type="hidden" name="classId"   value="${d.classId}">
      <input type="hidden" name="homeworkId" value="${d.id}">
      <div class="student-info">
        <label>First&nbsp;Name: <input name="firstName" required></label>
        <label>Last&nbsp;Name:&nbsp; <input name="lastName"  required></label>
      </div>
      ${d.graphics ? `<div id="media" style="text-align:center;margin:1rem 0;"></div>` : ``}
      <div id="qbox"></div>
      <button type="submit">Submit</button>
    </form>`;

  /* graphics (optional) */
  if (d.graphics){
    const media = document.getElementById("media");
    if (looksLikeTikz(d.graphics)){
      mountTikzInto(media, d.graphics);
    } else {
      media.innerHTML = d.graphics; // <img>/<svg>/custom HTML
    }
  }

  /* questions */
  const qbox = document.getElementById("qbox");
  (d.questions || []).forEach((q,i) => {
    const opts = (q.choices || []).map((txt,j) => {
      const letter = String.fromCharCode(65 + j); // A-F
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

  /* typeset math (once) */
  if (window.MathJax?.typeset) { try { MathJax.typeset(); } catch {} }

  /* submit handler */
  document.getElementById("hwForm")
          .addEventListener("submit", ev => handleSubmit(ev, d));
}

/*─────────────────────────────────────────────────────────────────────*/
/* Submit & server reply (unchanged logic) */
async function handleSubmit(ev, d){
  ev.preventDefault();
  const f   = ev.target;
  const fn  = f.firstName.value.trim();
  const ln  = f.lastName.value.trim();
  if (!fn || !ln) { alert("Please enter both first and last names."); return; }

  // cooldown
  const key  = `last_${d.classId}_${d.id}_${fn}_${ln}`.toLowerCase();
  const now  = Date.now();
  const last = Number(localStorage.getItem(key)) || 0;
  if (now - last < COOLDOWN_MS){
    alert(`Please wait ${Math.ceil((COOLDOWN_MS - (now - last))/1000)} s before retrying.`);
    return;
  }

  // collect answers
  const answers = [];
  for (let i = 1; i <= d.questions.length; i++) answers.push(f[`q${i}`].value);

  // build POST body
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

function handleReply(msg, total){
  if (msg.startsWith("SUBMITTED|")){
    const [, raw, flag] = msg.split("|");
    const scored = flag === "LATE" ? Math.ceil(raw * 0.85) : raw;
    alert(`${flag === "LATE" ? "Late submission (85 % cap)\n" : ""}Score ${scored}/${total}`);
    return;
  }
  if (msg.startsWith("RETRY_HIGH|")){
    const [, raw, disp, cap] = msg.split("|");
    alert(cap === "CAP"
      ? `Retry accepted.\nRaw ${raw}/${total} → Capped 85 % → ${disp}/${total}`
      : `Retry accepted.\nScore ${disp}/${total}`);
    return;
  }
  if (msg.startsWith("RETRY_LOW|")){
    const [, disp, prev] = msg.split("|");
    alert(`Retry recorded.\nRetry ${disp}/${total} < Previous ${prev}/${total}\nHigher score kept.`);
    return;
  }
  if (msg === "ERR|INVALID_NAME")        alert("Name not in roster.");
  else if (msg === "ERR|LIMIT_EXCEEDED") alert("Max 2 attempts reached.");
  else if (msg.startsWith("ERR|"))       alert("Server error:\n" + msg.slice(4));
  else                                   alert("Unexpected reply:\n" + msg);
}
