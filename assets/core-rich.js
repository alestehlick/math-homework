/*═══════════════════════════════════════════════════════════════════════
  core-rich.js  v1.0  (Textbook layout + MathJax/TikZ-safe)
  ───────────────────────────────────────────────────────────────────────
  Authoring model (new homeworks):
    d.questions[i] = {
      stem   : "<p>HTML prose with math like \\(x^2\\)</p>",   // required
      media  : "<img ...>" | raw TikZ | "<svg...>",           // optional
      choices: ["54", "\\frac{a}{2}", "<span>None</span>", ...],
      choiceWrap: true|false   // optional, default true
    }

  Key improvements:
    • Stems are real HTML (paragraphs, lists, tables, etc.)
    • Per-question media (side-by-side layout, responsive)
    • MathJax typeset done correctly after DOM insertion
    • Auto-wrap choices into \( ... \) ONLY when appropriate
    • TikZ auto-wrap into <script type="text/tikz"> when detected
═══════════════════════════════════════════════════════════════════════*/

const SCRIPT_URL  = "https://script.google.com/macros/s/AKfycbw2Y_ZP_gexERkUJF3geWuU-ivVlvc-1lYZatzo-mh4HNjo3gnmZDMUoHuIkJmmxIudLA/exec";
const COOLDOWN_MS = 120_000;

if (window.__coreRichLoaded__) {
  console.warn("Duplicate core-rich.js detected");
} else {
  window.__coreRichLoaded__ = true;

  // Optional authoring helpers (use in your homeworkData if you like):
  //   stem: `Use ${m("V=Bh")} ... ${dm("\\frac12bh")}`
  window.m  = s => `\\(${s}\\)`;
  window.dm = s => `\\[${s}\\]`;

  document.addEventListener("DOMContentLoaded", () => {
    if (!window.homeworkData) { alert("Error: homeworkData not found."); return; }
    buildForm(window.homeworkData);
  });
}

/*──────────────────────────────────────────────────────────────────────*/
/*  MathJax: typeset dynamic DOM correctly  */
async function typesetMath(root) {
  const MJ = window.MathJax;
  if (!MJ) return;

  // Wait until MathJax is actually ready (v3)
  try {
    if (MJ.startup?.promise) await MJ.startup.promise;
  } catch {}

  try {
    if (MJ.typesetPromise) await MJ.typesetPromise([root]);
    else if (MJ.typeset) MJ.typeset([root]);
  } catch (e) {
    console.warn("MathJax typeset error:", e);
  }
}

/*──────────────────────────────────────────────────────────────────────*/
/*  TikZ helpers  */
function sanitizeTikz(src) {
  if (!src) return src;
  return String(src)
    .replaceAll("\\begin{scope]", "\\begin{scope}")
    .replaceAll("\\end{scope]", "\\end{scope}")
    .replace(/<\s*begin\{scope\}\s*>/gi, "\\begin{scope}")
    .replace(/<\s*\/\s*end\{scope\}\s*>/gi, "\\end{scope}")
    .replace(/<\s*\/\s*begin\{scope\}\s*>/gi, "\\end{scope}")
    .replace(/\\end\{tikzpicture\}>/g, "\\end{tikzpicture}")
    .replace(/^.*\?.*$/gm, "")
    .trim();
}

function looksLikeTikz(src) {
  return typeof src === "string" &&
         /\\begin\{tikzpicture\}[\s\S]*\\end\{tikzpicture\}/.test(src);
}

function whenTikzjaxReady(cb) {
  if (window.tikzjax?.process) { try { cb(); } catch {} return; }
  const t0 = Date.now();
  const id = setInterval(() => {
    if (window.tikzjax?.process) {
      clearInterval(id);
      try { cb(); } catch {}
    } else if (Date.now() - t0 > 8000) {
      clearInterval(id);
    }
  }, 120);
  window.addEventListener("load", () => {
    if (window.tikzjax?.process) { try { cb(); } catch {} }
  }, { once:true });
}

function mountTikzInto(el, src) {
  const fixed = sanitizeTikz(src);
  if (/<script[^>]+type=["']text\/tikz["']/.test(fixed) || /<(svg|img)\b/i.test(fixed)) {
    el.innerHTML = fixed;
  } else {
    el.innerHTML = `<script type="text/tikz" data-origin="core-rich">\n${fixed}\n</script>`;
  }
  whenTikzjaxReady(() => { try { window.tikzjax.process(); } catch {} });
}

/*──────────────────────────────────────────────────────────────────────*/
/*  Choice wrapping rules (prevents the “red \(” disaster)  */
function hasHtmlTags(s) {
  return /<[^>]+>/.test(s);
}
function hasExplicitMathDelims(s) {
  return /\\\(|\\\)|\\\[|\\\]/.test(s);
}
function wrapChoiceIfNeeded(txt, doWrap) {
  const s = String(txt);

  if (!doWrap) return s;                 // teacher opted out
  if (hasHtmlTags(s)) return s;          // HTML choice → do not wrap
  if (hasExplicitMathDelims(s)) return s; // already has \( \) or \[ \]
  return `\\(${s}\\)`;                   // auto-wrap as math
}

/*──────────────────────────────────────────────────────────────────────*/
/*  Build static DOM  */
async function buildForm(d) {
  const root = document.getElementById("hw-root");
  if (!root) { alert("Error: #hw-root not found."); return; }

  root.innerHTML = `
    <h1>${escapeHtml(d.title ?? "Homework")}</h1>
    <form id="hwForm">
      <input type="hidden" name="classId"    value="${escapeAttr(d.classId ?? "")}">
      <input type="hidden" name="homeworkId" value="${escapeAttr(d.id ?? "")}">
      <div class="student-info">
        <label>First&nbsp;Name: <input name="firstName" required></label>
        <label>Last&nbsp;Name:&nbsp; <input name="lastName"  required></label>
      </div>
      ${d.graphics ? `<div id="media" class="global-media"></div>` : ``}
      <div id="qbox"></div>
      <button type="submit">Submit</button>
    </form>`;

  // optional global graphics (if you still want it sometimes)
  if (d.graphics) {
    const media = document.getElementById("media");
    const g = String(d.graphics);
    if (looksLikeTikz(g)) mountTikzInto(media, g);
    else media.innerHTML = g;
  }

  const qbox = document.getElementById("qbox");
  const questions = d.questions || [];

  questions.forEach((q, i) => {
    const n = i + 1;
    const stem = (q?.stem ?? "").toString();
    const media = (q?.media ?? "").toString().trim();
    const choiceWrap = (q?.choiceWrap ?? true);

    const hasMedia = media.length > 0;

    qbox.insertAdjacentHTML("beforeend", `
      <div class="question q-card">
        <div class="q-head"><strong>Q${n}.</strong></div>
        <div class="q-grid ${hasMedia ? "has-media" : "no-media"}">
          <div class="q-stem" id="stem_${n}"></div>
          ${hasMedia ? `<div class="q-media" id="media_${n}"></div>` : ``}
        </div>
        <ul class="choices" id="choices_${n}"></ul>
      </div>
    `);

    // stem (HTML)
    const stemEl = document.getElementById(`stem_${n}`);
    stemEl.innerHTML = stem;

    // media (HTML/img/svg or raw TikZ)
    if (hasMedia) {
      const mEl = document.getElementById(`media_${n}`);
      if (looksLikeTikz(media)) mountTikzInto(mEl, media);
      else mEl.innerHTML = media;
    }

    // choices
    const cEl = document.getElementById(`choices_${n}`);
    const choices = q?.choices || [];
    cEl.innerHTML = choices.map((txt, j) => {
      const letter = String.fromCharCode(65 + j); // A-F
      const body = wrapChoiceIfNeeded(txt, choiceWrap);
      return `
        <li>
          <label>
            <input type="radio" name="q${n}" value="${letter}" required>
            <span class="choice-text">${body}</span>
          </label>
        </li>`;
    }).join("");
  });

  // Typeset everything we just injected
  await typesetMath(root);

  // Hook submit (same behavior as your current core)
  document.getElementById("hwForm")
          .addEventListener("submit", ev => handleSubmit(ev, d));
}

/*──────────────────────────────────────────────────────────────────────*/
/*  Submit handler (same logic as yours)  */
async function handleSubmit(ev, d) {
  ev.preventDefault();
  const f   = ev.target;
  const fn  = f.firstName.value.trim();
  const ln  = f.lastName.value.trim();
  if (!fn || !ln) { alert("Please enter both first and last names."); return; }

  const key  = `last_${d.classId}_${d.id}_${fn}_${ln}`.toLowerCase();
  const now  = Date.now();
  const last = Number(localStorage.getItem(key)) || 0;
  if (now - last < COOLDOWN_MS) {
    alert(`Please wait ${Math.ceil((COOLDOWN_MS - (now - last)) / 1000)} s before retrying.`);
    return;
  }

  const answers = [];
  for (let i = 1; i <= d.questions.length; i++)
    answers.push(f[`q${i}`].value);

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
/*  Interpret server reply (same as yours)  */
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

/*──────────────────────────────────────────────────────────────────────*/
/*  Tiny safety helpers for title/id injection  */
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function escapeAttr(s){
  // enough for attributes in your use-case
  return escapeHtml(s).replace(/`/g, "&#96;");
}
