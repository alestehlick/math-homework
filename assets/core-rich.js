/* =========================
   core-rich.js — Geometry HW renderer (UPDATED to submit to Apps Script)
   - Renders stem (HTML via q.stem) OR LaTeX string (q.latex)
   - media:
       (A) TikZ code (raw \begin{tikzpicture}...\end{tikzpicture})
       (B) HTML media (<img>, <svg>, <figure>..., etc)
     TikZ defaults INLINE (between stem and choices); HTML media stays in right column.
   - SUBMISSION:
       Posts URL-encoded params exactly like core.js:
         classId, homeworkId, firstName, lastName, answers(JSON), answerKey(JSON)
       Includes cooldown localStorage key (2 minutes) like core.js.
   ========================= */

(function(){
  "use strict";

  // MUST match core.js exactly
  const SCRIPT_URL  = "https://script.google.com/macros/s/AKfycbw2Y_ZP_gexERkUJF3geWuU-ivVlvc-1lYZatzo-mh4HNjo3gnmZDMUoHuIkJmmxIudLA/exec";
  const COOLDOWN_MS = 120_000;

  const root = document.getElementById("hw-root");
  if (!root) return;

  function renderFatal(msg){
    root.innerHTML = `
      <div style="padding:1rem;border:1px solid #c66;border-radius:10px;background:#fff0f0;">
        <strong>Render error:</strong> ${escapeHtml(msg)}
      </div>`;
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#39;");
  }

  function hasHtmlTags(s){
    return /<\/?[a-z][\s\S]*>/i.test(String(s || ""));
  }

  function looksLikeRawTikz(s){
    const t = String(s || "");
    return /\\begin\{tikzpicture\}[\s\S]*\\end\{tikzpicture\}/.test(t);
  }

  function makeEl(tag, cls, html){
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html !== undefined) el.innerHTML = html;
    return el;
  }

  /* -------------------------
     Styling for inline TikZ
     ------------------------- */
  function injectInlineTikzStyles(){
    if (document.getElementById("coreRichInlineTikzStyles")) return;
    const style = document.createElement("style");
    style.id = "coreRichInlineTikzStyles";
    style.textContent = `
      .q-tikz-inline{
        margin: 10px 0 12px;
        overflow: visible;
        width: 100%;
        display: block;
      }
      .q-tikz-inline svg{
        max-width: 100%;
        height: auto;
        display: block;
        margin: 0 auto;
      }
      .q-tikz-inline .tikz-caption{
        margin-top: 8px;
        width: 100%;
        display: block;
        text-align: center !important;
        font-size: 0.98rem;
        color: #333;
        line-height: 1.25;
      }
      .q-left, .q-stem{ overflow: visible; }
    `;
    document.head.appendChild(style);
  }

  /* -------------------------
     Modal for zoom
     ------------------------- */
  function ensureModal(){
    let modal = document.getElementById("mediaModal");
    if (modal) return modal;

    const style = document.createElement("style");
    style.textContent = `
      #mediaModal{
        position:fixed; inset:0;
        background:rgba(0,0,0,.55);
        display:none;
        align-items:center;
        justify-content:center;
        padding:24px;
        z-index:9999;
      }
      #mediaModal .panel{
        background:#fff;
        border-radius:14px;
        max-width:min(1000px, 96vw);
        max-height:92vh;
        overflow:auto;
        padding:18px;
        box-shadow:0 10px 30px rgba(0,0,0,.25);
      }
      #mediaModal .panel figure{ margin:0; }
      #mediaModal .panel figcaption{
        margin-top:10px;
        text-align:center;
        font-size:1rem;
        color:#333;
      }
      #mediaModal .close{
        position:sticky;
        top:0;
        float:right;
        border:none;
        background:#eee;
        border-radius:10px;
        padding:6px 10px;
        cursor:pointer;
        margin-bottom:10px;
      }
    `;
    document.head.appendChild(style);

    modal = document.createElement("div");
    modal.id = "mediaModal";
    modal.innerHTML = `<div class="panel">
      <button class="close" type="button">Close</button>
      <div class="content"></div>
    </div>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.style.display = "none";
    });
    modal.querySelector(".close").addEventListener("click", () => {
      modal.style.display = "none";
    });

    return modal;
  }

  function openModalWith(node){
    const modal = ensureModal();
    const content = modal.querySelector(".content");
    content.innerHTML = "";
    content.appendChild(node);
    modal.style.display = "flex";
    processTikz();
    typesetMath();
  }

  /* -------------------------
     TikZ extraction + mounting
     ------------------------- */
  function extractTikzFromHtml(html){
    try{
      const tpl = document.createElement("template");
      tpl.innerHTML = String(html || "");

      const scr = tpl.content.querySelector('script[type="text/tikz"]');
      if (!scr) return null;

      const cap = tpl.content.querySelector("figcaption");
      return {
        tikz: (scr.textContent || "").trim(),
        caption: cap ? (cap.textContent || "").trim() : ""
      };
    } catch(_) {
      return null;
    }
  }

  function getTikzPayload(q){
    const mediaStr = String(q.media || "").trim();
    if (!mediaStr) return null;

    if (looksLikeRawTikz(mediaStr) && !hasHtmlTags(mediaStr)) {
      return { tikz: mediaStr, caption: String(q.mediaCaption || "").trim() };
    }

    const extracted = extractTikzFromHtml(mediaStr);
    if (extracted && extracted.tikz) {
      const cap = String(q.mediaCaption || "").trim() || extracted.caption || "";
      return { tikz: extracted.tikz, caption: cap };
    }

    return null;
  }

  function mountTikzInline(intoEl, tikzCode, caption){
    intoEl.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "q-tikz-inline";

    const scr = document.createElement("script");
    scr.type = "text/tikz";
    scr.textContent = String(tikzCode || "");
    wrap.appendChild(scr);

    if (caption) {
      const cap = document.createElement("div");
      cap.className = "tikz-caption";
      cap.textContent = caption;
      wrap.appendChild(cap);
    }

    wrap.style.cursor = "zoom-in";
    wrap.addEventListener("click", () => openModalWith(wrap.cloneNode(true)));

    intoEl.appendChild(wrap);
  }

  /* -------------------------
     HTML media in right column
     ------------------------- */
  function normalizeHtmlMedia(container, html, caption){
    container.innerHTML = String(html || "");

    if (caption) {
      const existingFigcaption = container.querySelector("figcaption");
      if (!existingFigcaption) {
        const fig = container.querySelector("figure");
        if (fig) {
          const cap = document.createElement("figcaption");
          cap.textContent = caption;
          fig.appendChild(cap);
        } else {
          const node = container.querySelector("img, svg");
          if (node) {
            const fig2 = document.createElement("figure");
            fig2.appendChild(node);
            const cap2 = document.createElement("figcaption");
            cap2.textContent = caption;
            fig2.appendChild(cap2);
            container.innerHTML = "";
            container.appendChild(fig2);
          }
        }
      }
    }

    const fig = container.querySelector("figure");
    if (fig) {
      fig.style.cursor = "zoom-in";
      fig.addEventListener("click", () => openModalWith(fig.cloneNode(true)));
    }
  }

  /* -------------------------
     MathJax + TikZJax hooks
     ------------------------- */
  function typesetMath(){
    if (window.MathJax && typeof window.MathJax.typesetPromise === "function") {
      return window.MathJax.typesetPromise().catch(()=>{});
    }
    if (window.MathJax && typeof window.MathJax.typeset === "function") {
      try { window.MathJax.typeset(); } catch(_) {}
    }
    return Promise.resolve();
  }

  function processTikz(){
    if (window.tikzjax && typeof window.tikzjax.process === "function") {
      try { window.tikzjax.process(); } catch(_) {}
    }
  }

  function postRender(){
    processTikz();
    typesetMath();
    window.addEventListener("load", () => {
      processTikz();
      typesetMath();
    });
  }

  /* -------------------------
     Reply handler (matches your Apps Script)
     ------------------------- */
  function handleReply(msg, total){
    if (msg.startsWith("SUBMITTED|")){
      const [, rawStr, flag] = msg.split("|");
      const raw = Number(rawStr);

      const capLimit = Math.ceil(total * 0.85);
      const scored = (flag === "LATE") ? Math.min(raw, capLimit) : raw;

      alert(`${flag === "LATE" ? "Late submission (85% cap)\n" : ""}Score ${scored}/${total}`);
      return;
    }
    if (msg.startsWith("RETRY_HIGH|")){
      const [, raw, disp, cap] = msg.split("|");
      alert(cap === "CAP"
        ? `Retry accepted.\nRaw ${raw}/${total} → Capped 85% → ${disp}/${total}`
        : `Retry accepted.\nScore ${disp}/${total}`);
      return;
    }
    if (msg.startsWith("RETRY_LOW|")){
      const [, disp, prev] = msg.split("|");
      alert(`Retry recorded.\nRetry ${disp}/${total} < Previous ${prev}/${total}\nHigher score kept.`);
      return;
    }

    if (msg === "COOLDOWN")                 alert("Please wait before submitting again.");
    else if (msg === "ERR|INVALID_NAME")    alert("Name not in roster.");
    else if (msg === "ERR|LIMIT_EXCEEDED")  alert("Max 2 attempts reached.");
    else if (msg.startsWith("ERR|"))        alert("Server error:\n" + msg.slice(4));
    else                                    alert("Unexpected reply:\n" + msg);
  }

  /* -------------------------
     Submit handler (same protocol as core.js)
     ------------------------- */
  async function handleSubmit(ev, data, form){
    ev.preventDefault();

    if (!data || !Array.isArray(data.questions) || !Array.isArray(data.answerKey)) {
      alert("Invalid homeworkData (missing questions or answerKey).");
      return;
    }

    const fn = (document.getElementById("firstName")?.value || "").trim();
    const ln = (document.getElementById("lastName")?.value  || "").trim();
    if (!fn || !ln) { alert("Please enter both first and last names."); return; }

    const totalQ = data.questions.length;
    const totalK = data.answerKey.length;
    if (totalQ !== totalK) {
      alert(`Setup error: questions.length (${totalQ}) != answerKey.length (${totalK}).`);
      return;
    }

    // fixed-length answers array (must match answerKey length)
    const answers = [];
    for (let i = 1; i <= totalQ; i++){
      const chosen = form.querySelector(`input[name="q${i}"]:checked`);
      answers.push(chosen ? chosen.value : "");
    }

    if (answers.some(a => !a)) {
      alert("Please answer every question before submitting.");
      return;
    }

    const key  = `last_${data.classId}_${data.id}_${fn}_${ln}`.toLowerCase();
    const now  = Date.now();
    const last = Number(localStorage.getItem(key)) || 0;
    if (now - last < COOLDOWN_MS){
      alert(`Please wait ${Math.ceil((COOLDOWN_MS - (now - last))/1000)} s before retrying.`);
      return;
    }

    const body = new URLSearchParams({
      classId   : String(data.classId || "").trim(),
      homeworkId: String(data.id || "").trim(),
      firstName : fn,
      lastName  : ln,
      answers   : JSON.stringify(answers),
      answerKey : JSON.stringify(data.answerKey)
    });

    const submitBtn = document.getElementById("submitBtn");
    if (submitBtn) submitBtn.disabled = true;

    try{
      const r = await fetch(SCRIPT_URL, { method:"POST", body });

      // If Apps Script ever returns a non-2xx, still try to read text for diagnostics
      const txt = await r.text().catch(() => "");
      if (!r.ok && !txt) {
        throw new Error(`HTTP ${r.status}`);
      }

      localStorage.setItem(key, String(now));
      handleReply(txt || `ERR|HTTP_${r.status}`, totalQ);
    } catch (e){
      alert("Failed to fetch / network error: " + e);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  /* -------------------------
     Main render
     ------------------------- */
  injectInlineTikzStyles();

  const data = window.homeworkData;
  if (!data || !Array.isArray(data.questions)) {
    renderFatal("homeworkData not found or invalid. Make sure window.homeworkData is defined BEFORE core-rich.js loads.");
    return;
  }

  root.innerHTML = "";

  const title = makeEl("h1", "", escapeHtml(data.title || data.id || "Homework"));
  root.appendChild(title);

  const info = makeEl("div", "student-info");
  info.innerHTML = `
    <label>First Name: <input id="firstName" type="text" autocomplete="given-name" required></label>
    <label>Last Name: <input id="lastName" type="text" autocomplete="family-name" required></label>
  `;
  root.appendChild(info);

  const form = document.createElement("form");
  form.id = "hwForm";
  form.addEventListener("submit", (e) => handleSubmit(e, data, form));
  root.appendChild(form);

  data.questions.forEach((q, i) => {
    const n = i + 1;

    const card = makeEl("section", "q-card question");

    const head = makeEl("div", "q-head");
    head.innerHTML = `<strong>Q${n}.</strong>`;
    card.appendChild(head);

    const hasMedia = !!(q.media && String(q.media).trim().length);
    const tikzPayload = hasMedia ? getTikzPayload(q) : null;
    const tikzInline = !!tikzPayload && (q.mediaInline !== false);
    const gridHasRightColumn = hasMedia && !tikzInline;

    const grid = makeEl("div", "q-grid " + (gridHasRightColumn ? "has-media" : "no-media"));
    card.appendChild(grid);

    const left = makeEl("div", "q-left");
    grid.appendChild(left);

    const stem = makeEl("div", "q-stem");
    if (q.stem) {
      stem.innerHTML = String(q.stem);
    } else if (q.latex) {
      stem.innerHTML = `<p>\\(${String(q.latex)}\\)</p>`;
    } else {
      stem.innerHTML = `<p><em>(No prompt provided.)</em></p>`;
    }
    left.appendChild(stem);

    if (tikzInline && tikzPayload && tikzPayload.tikz) {
      const tikzBlock = document.createElement("div");
      mountTikzInline(tikzBlock, tikzPayload.tikz, tikzPayload.caption);
      left.appendChild(tikzBlock);
    }

    const choices = Array.isArray(q.choices) ? q.choices : [];
    const ul = makeEl("ul", "choices");
    choices.forEach((choiceText, idx) => {
      const letter = String.fromCharCode("A".charCodeAt(0) + idx);
      const li = document.createElement("li");

      const label = document.createElement("label");

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `q${n}`;
      input.value = letter;

      // Make the radio group required (set on one radio in the group)
      if (idx === 0) input.required = true;

      const span = document.createElement("span");
      span.className = "choice-text";
      span.innerHTML = String(choiceText);

      label.appendChild(input);
      label.appendChild(span);

      li.appendChild(label);
      ul.appendChild(li);
    });
    left.appendChild(ul);

    if (gridHasRightColumn) {
      const right = makeEl("div", "q-media");
      grid.appendChild(right);

      const mWrap = document.createElement("div");
      mWrap.id = `media_${n}`;
      right.appendChild(mWrap);

      const caption = q.mediaCaption ? String(q.mediaCaption) : "";
      normalizeHtmlMedia(mWrap, String(q.media), caption);
    }

    form.appendChild(card);
  });

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.id = "submitBtn";
  submit.textContent = "Submit";
  form.appendChild(submit);

  postRender();
})();
