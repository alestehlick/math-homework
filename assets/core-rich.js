/* =========================
   core-rich.js — Geometry HW renderer
   - supports stem (HTML) or latex (LaTeX string)
   - supports media as:
       (A) raw TikZ code: contains \begin{tikzpicture}...\end{tikzpicture}
           -> we create <script type="text/tikz"> in the DOM (safe)
       (B) HTML media: <img>, <svg>, <figure>... etc
   - caption is supported via q.mediaCaption (always preserved)
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

  function looksLikeTikz(s){
    const t = String(s || "");
    return /\\begin\{tikzpicture\}[\s\S]*\\end\{tikzpicture\}/.test(t);
  }

  function makeEl(tag, cls, html){
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html !== undefined) el.innerHTML = html;
    return el;
  }

  // --- modal for media zoom (simple + reliable) ---
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
        max-width:min(960px, 96vw);
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

    // If TikZ was inside, ask tikzjax to (re)process in modal
    processTikz();
    typesetMath();
  }

  // --- TikZ mounting (DOM-based, safe) ---
  function mountTikzInto(container, tikzCode, caption){
    container.innerHTML = "";

    const fig = document.createElement("figure");

    const scr = document.createElement("script");
    scr.type = "text/tikz";
    // IMPORTANT: set textContent so no HTML parsing issues
    scr.textContent = String(tikzCode || "");
    fig.appendChild(scr);

    if (caption) {
      const cap = document.createElement("figcaption");
      cap.textContent = caption;
      fig.appendChild(cap);
    }

    // click-to-zoom
    fig.style.cursor = "zoom-in";
    fig.addEventListener("click", () => {
      openModalWith(fig.cloneNode(true));
    });

    container.appendChild(fig);
  }

  function normalizeHtmlMedia(container, html, caption){
    container.innerHTML = String(html || "");

    // If author gave a caption string, ensure it's visible even if HTML lacks figcaption
    if (caption) {
      const existingFigcaption = container.querySelector("figcaption");
      if (!existingFigcaption) {
        const fig = container.querySelector("figure");
        if (fig) {
          const cap = document.createElement("figcaption");
          cap.textContent = caption;
          fig.appendChild(cap);
        } else {
          // wrap first img/svg in a figure
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

    // click-to-zoom if we have a figure now
    const fig = container.querySelector("figure");
    if (fig) {
      fig.style.cursor = "zoom-in";
      fig.addEventListener("click", () => openModalWith(fig.cloneNode(true)));
    }
  }

  // --- MathJax + TikZJax hooks ---
  function typesetMath(){
    if (window.MathJax && typeof window.MathJax.typesetPromise === "function") {
      return window.MathJax.typesetPromise().catch(()=>{});
    }
    return Promise.resolve();
  }

  function processTikz(){
    // TikZJax v1 usually exposes window.tikzjax.process()
    if (window.tikzjax && typeof window.tikzjax.process === "function") {
      try { window.tikzjax.process(); } catch(_) {}
    }
  }

  // call after render, and again after load (in case libs load later)
  function postRender(){
    processTikz();
    typesetMath();

    window.addEventListener("load", () => {
      processTikz();
      typesetMath();
    });
  }

  // --- main render ---
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
    const grid = makeEl("div", "q-grid " + (hasMedia ? "has-media" : "no-media"));
    card.appendChild(grid);

    const left = makeEl("div", "q-left");
    grid.appendChild(left);

    // stem
    const stem = makeEl("div", "q-stem");
    if (q.stem) {
      stem.innerHTML = String(q.stem);
    } else if (q.latex) {
      // render latex as inline math
      stem.innerHTML = `<p>\\(${String(q.latex)}\\)</p>`;
    } else {
      stem.innerHTML = `<p><em>(No prompt provided.)</em></p>`;
    }
    left.appendChild(stem);

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

    // media column
    if (hasMedia) {
      const right = makeEl("div", "q-media");
      grid.appendChild(right);

      const mWrap = document.createElement("div");
      mWrap.id = `media_${n}`;
      right.appendChild(mWrap);

      const caption = q.mediaCaption ? String(q.mediaCaption) : "";

      // IMPORTANT:
      // - if media is raw TikZ code (not HTML), mountTikzInto
      // - else treat as HTML and preserve wrapper/caption
      const mediaStr = String(q.media);

      if (looksLikeTikz(mediaStr) && !hasHtmlTags(mediaStr)) {
        mountTikzInto(mWrap, mediaStr, caption);
      } else {
        normalizeHtmlMedia(mWrap, mediaStr, caption);
      }
    }

    form.appendChild(card);
  });

  // submit button + scoring (optional)
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
