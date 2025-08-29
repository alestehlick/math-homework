/*══════════════════════════════════════════════════════════════════════
  core.js   v4.2  (TikZ-safe, drop-in)
  - Auto-wraps raw TikZ (String.raw) into <script type="text/tikz">
  - Sanitizes common typos and removes placeholder lines with '?'
  - Calls tikzjax.process() when/if it becomes available
══════════════════════════════════════════════════════════════════════*/

const SCRIPT_URL  = "https://script.google.com/macros/s/AKfycbxdQDBkxlNLvGqY4Ic4Due-DZhX3UPhFkOTpq0YBbf-a7wwKQFq9edJnEFdfSVw25UOeg/exec";
const COOLDOWN_MS = 120_000;

if (window.__coreLoaded__) {
  console.warn("Duplicate core.js detected");
} else {
  window.__coreLoaded__ = true;
  document.addEventListener("DOMContentLoaded", () => {
    if (!window.homeworkData) { alert("Error: homeworkData not found."); return; }
    buildForm(window.homeworkData);
  });
}

/* ---------------------- TikZ helpers ---------------------- */
function sanitizeTikz(src){
  if (!src) return src;
  let s = String(src);

  // Common scope copy/paste typos
  s = s
    .replaceAll("\\begin{scope]", "\\begin{scope}")
    .replaceAll("\\end{scope]", "\\end{scope}")
    .replace(/<\s*begin\{scope\}\s*>?/gi, "\\begin{scope}")
    .replace(/<\s*\/\s*end\{scope\}\s*>?/gi, "\\end{scope}")
    .replace(/<\s*\/\s*begin\{scope\}\s*>?/gi, "\\end{scope}");

  // Mis-closed tikzpicture (e.g. \end{tikzpicture> )
  s = s.replace(/\\end\{tikzpicture\}>/g, "\\end{tikzpicture}");

  // Strip obviously broken placeholder lines (contain a bare '?')
  s = s.replace(/^.*\?.*$/gm, "");

  return s.trim();
}

function looksLikeTikz(src){
  return typeof src === "string" && /\\begin\{tikzpicture\}[\s\S]*\\end\{tikzpicture\}/.test(src);
}

function whenTikzjaxReady(cb){
  if (window.tikzjax?.process) { try { cb(); } catch {} return; }
  const t0 = Date.now();
  const id = setInterval(() => {
    if (window.tikzjax?.process) {
      clearInterval(id);
      try { cb(); } catch {}
    } else if (Date.now() - t0 > 8000) {
      clearInterval(id);
      // Give up quietly; user will just see raw MathJax but no TikZ
    }
  }, 120);
  // Also try once at load, in case tikzjax is deferred
  window.addEventListener("load", () => {
    if (window.tikzjax?.process) { try { cb(); } catch {} }
  }, { once:true });
}

function mountTikzInto(el, src){
  const fixed = sanitizeTikz(src);
  // If author already provided a <script type="text/tikz"> or an SVG/IMG, use as-is
  if (/<script[^>]+type=["']text\/tikz["']/.test(fixed) || /<(svg|img)\b/i.test(fixed)) {
    el.innerHTML = fixed;
  } else {
    el.innerHTML = `<script type="text/tikz" data-origin="core">\n${fixed}\n</script>`;
  }
  whenTikzjaxReady(() => { try { window.tikzjax.process(); } catch {} });
}

/* ------------------------- Build UI ------------------------- */
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

  // optional graphics
  if (d.graphics){
    const media = document.getElementById("media");
    const g = String(d.graphics);
    if (looksLikeTikz(g)){
      mountTikzInto(media, g);
    } else {
      media.innerHTML = g;
      // If someone dumped raw TikZ into the DOM elsewhere, hide it to avoid confusion
      hideAccidentalRawTikz();
    }
  }

  // questions
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

  // typeset math
  if (window.MathJax?.typeset) { try { MathJax.typeset(); } catch {} }

  // submit
  document.getElementById("hwForm")
          .addEventListener("submit", ev => handleSubmit(ev, d));
}

function hideAccidentalRawTikz(){
  const node = Array.from(document.querySelectorAll("pre,code,div"))
    .find(el => typeof el.textContent === "string" &&
                el.textContent.includes("\\begin{tikzpicture}"));
  if (node) node.style.display = "none";
}

/* ------------------- Submit + server reply ------------------- */
async function handleSubmit(ev, d){
  ev.preventDefault();
  const f   = ev.target;
  const fn  = f.firstName.value.trim();
  const ln  = f.lastName.value.trim();
  if (!fn || !ln) { alert("Please enter both first and last names."); return; }

  const key  = `last_${d.classId}_${d.id}_${fn}_${ln}`.toLowerCase();
  const now  = Date.now();
  const last = Number(localStorage.getItem(key)) || 0;
  if (now - last < COOLDOWN_MS){
    alert(`Please wait ${Math.ceil((COOLDOWN_MS - (now - last))/1000)} s before retrying.`);
    return;
  }

  const answers = [];
  for (let i = 1; i <= d.questions.length; i++) answers.push(f[`q${i}`].value);

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
