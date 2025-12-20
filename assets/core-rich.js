/* =========================
   core-rich.js — Geometry HW renderer (improved TikZ handling)
   - stem: HTML (q.stem) OR LaTeX string (q.latex)
   - media:
       (A) TikZ code (raw \begin{tikzpicture}...\end{tikzpicture})
       (B) HTML media (<img>, <svg>, <figure>..., etc)
     NEW: TikZ is rendered INLINE by default (part of the question flow),
          while images/HTML remain on the RIGHT media column.
   - caption: q.mediaCaption (preferred); can also be extracted from <figcaption> for legacy media strings
   ========================= */

(function(){
  "use strict";

  const root = document.getElementById("hw-root");

  function renderFatal(msg){
    if (!root) return;
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
      }
      .q-tikz-inline .tikz-caption{
        margin-top: 8px;
        text-align: center;
        font-size: 0.98rem;
        color: #333;
      }
      /* TikZJax outputs SVG; keep it responsive */
      .q-tikz-inline svg{
        max-width: 100%;
        height: auto;
        display: block;
        margin: 0 auto;
      }
      /* Prevent accidental clipping in some layouts */
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

  // Legacy support: if q.media is HTML containing <script type="text/tikz"> ... </script>,
  // extract its TikZ + (optional) <figcaption>.
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

  // Returns null if not TikZ. Otherwise returns {tikz, caption}.
  function getTikzPayload(q){
    const mediaStr = String(q.media || "").trim();
    if (!mediaStr) return null;

    // Preferred: raw TikZ string
    if (looksLikeRawTikz(mediaStr) && !hasHtmlTags(mediaStr)) {
      return { tikz: mediaStr, caption: String(q.mediaCaption || "").trim() };
    }

    // Back-compat: HTML wrapper containing script[type="text/tikz"]
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

    // zoom
    wrap.style.cursor = "zoom-in";
    wrap.addEventListener("click", () => openModalWith(wrap.cloneNode(true)));

    intoEl.appendChild(wrap);
  }

  /* -------------------------
     HTML media (images/svg/figure) in right column
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

  // student info
  const info = makeEl("div", "student-info");
  info.innerHTML = `
    <label>First Name: <input id="firstName" type="text" autocomplete="given-name"></label>
    <label>Last Name: <input id="lastName" type="text" autocomplete="family-name"></label>
  `;
  root.appendChild(info);

  const form = document.createElement("form");
  form.id = "hwForm";
  form.addEventListener("submit", (e) => e.preventDefault());
  root.appendChild(form);

  data.questions.forEach((q, i) => {
    const n = i + 1;

    const card = makeEl("section", "q-card question");

    const head = makeEl("div", "q-head");
    head.innerHTML = `<strong>Q${n}.</strong>`;
    card.appendChild(head);

    const hasMedia = !!(q.media && String(q.media).trim().length);

    // Detect TikZ (raw OR embedded in HTML)
    const tikzPayload = hasMedia ? getTikzPayload(q) : null;

    // TikZ defaults to inline; allow override per question:
    //    q.mediaInline = false  -> force it to the right column (rare)
    const tikzInline = !!tikzPayload && (q.mediaInline !== false);

    // If TikZ is inline, we should NOT activate "has-media" grid behavior.
    const gridHasRightColumn = hasMedia && !tikzInline;

    const grid = makeEl("div", "q-grid " + (gridHasRightColumn ? "has-media" : "no-media"));
    card.appendChild(grid);

    const left = makeEl("div", "q-left");
    grid.appendChild(left);

    // stem
    const stem = makeEl("div", "q-stem");
    if (q.stem) {
      stem.innerHTML = String(q.stem);
    } else if (q.latex) {
      // keep as inline math (your original behavior)
      stem.innerHTML = `<p>\\(${String(q.latex)}\\)</p>`;
    } else {
      stem.innerHTML = `<p><em>(No prompt provided.)</em></p>`;
    }
    left.appendChild(stem);

    // NEW: TikZ inline block (between stem and choices)
    if (tikzInline && tikzPayload && tikzPayload.tikz) {
      const tikzBlock = document.createElement("div");
      mountTikzInline(tikzBlock, tikzPayload.tikz, tikzPayload.caption);
      left.appendChild(tikzBlock);
    }

    // choices
    const choices = Array.isArray(q.choices) ? q.choices : [];
    const ul = makeEl("ul", "choices");
    choices.forEach((choiceText, idx) => {
      const letter = String.fromCharCode("A".charCodeAt(0) + idx);
      const li = document.createElement("li");

      const id = `q${n}_${letter}`;
      const label = document.createElement("label");

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `q${n}`;
      input.value = letter;
      input.id = id;

      const span = document.createElement("span");
      span.className = "choice-text";
      span.innerHTML = String(choiceText);

      label.appendChild(input);
      label.appendChild(span);

      li.appendChild(label);
      ul.appendChild(li);
    });
    left.appendChild(ul);

    // Right-column media (images / non-TikZ HTML)
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

  // Submit button + quick scoring
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Submit";
  btn.addEventListener("click", () => {
    if (!Array.isArray(data.answerKey)) {
      alert("No answer key provided in homeworkData.");
      return;
    }
    let correct = 0;
    data.questions.forEach((_, i) => {
      const n = i + 1;
      const chosen = form.querySelector(`input[name="q${n}"]:checked`);
      const val = chosen ? chosen.value : null;
      if (val && val === data.answerKey[i]) correct++;
    });
    alert(`Score: ${correct} / ${data.questions.length}`);
  });
  root.appendChild(btn);

  postRender();
})();
