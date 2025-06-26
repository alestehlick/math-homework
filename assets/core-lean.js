/* ----------------------------------------------------------------------
 *  core-lean.js  –  super-light renderer for the new raw-LaTeX format
 * -------------------------------------------------------------------- */
(function () {
  const root   = document.getElementById('hw-root');
  const data   = window.homeworkData;

  if (!root || !data) return;

  /* —————  helpers ————— */
  const wrap = tex => `\\(${tex}\\)`;          // add inline TeX delimiters
  const el   = (tag, html) => {
    const e = document.createElement(tag);
    if (html) e.innerHTML = html;
    return e;
  };

  /* —————  build the form ————— */
  const form  = el('form');
  form.appendChild(el('h1', data.title));

  data.questions.forEach((q, qi) => {
    const qBox = el('div');  qBox.className = 'question';

    /* Question text */
    qBox.appendChild(el('p', `<strong>Q${qi+1}.</strong> ${wrap(q.latex)}`));

    /* Choices */
    const ul = el('ul');  ul.className = 'choices';

    q.choices.forEach((c, ci) => {
      const li   = el('li');
      const id   = `q${qi}-c${ci}`;

      li.innerHTML = `
        <label>
          <input type="radio" name="q${qi}" value="${String.fromCharCode(65+ci)}" id="${id}">
          ${wrap(c)}
        </label>`;
      ul.appendChild(li);
    });

    qBox.appendChild(ul);
    form.appendChild(qBox);
  });

  /* Submit */
  form.appendChild(el('button', 'Submit'));
  root.innerHTML = '';        // clear "Loading…"
  root.appendChild(form);

  /* Trigger MathJax after DOM insertion */
  if (window.MathJax?.typeset) window.MathJax.typeset();
})();
