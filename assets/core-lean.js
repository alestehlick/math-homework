/*  core-lean.js  ─────────────────────────────────────────────────────────
 *  Lightweight renderer for Algebra 1 homework forms.
 *  Expects window.homeworkData with shape:
 *    { title, questions: [ { latex, choices[6] }, … ], answerKey[] }
 *  • Adds \(...\) delimiters around every TeX string.
 *  • Renders a form, checks answers on submit, and shows the score.
 *  • Triggers MathJax after inserting HTML.
 *  (© 2025 – feel free to adapt.)
 *────────────────────────────────────────────────────────────────────────*/

(function () {
  const root = document.getElementById('hw-root');
  const hw   = window.homeworkData;
  if (!root || !hw) return;

  /* — helpers — */
  const $ = (tag, html = '') => {
    const el = document.createElement(tag);
    el.innerHTML = html;
    return el;
  };
  const wrap = tex => `\\(${tex}\\)`;   // inline-math delimiters

  /* — build form — */
  const form = $('form');
  form.appendChild($('h1', hw.title));

  hw.questions.forEach((q, qi) => {
    const qDiv = $('div');                qDiv.className = 'question';
    qDiv.appendChild($('p', `<strong>Q${qi + 1}.</strong> ${wrap(q.latex)}`));

    const ul = $('ul');                   ul.className = 'choices';
    q.choices.forEach((c, ci) => {
      const id   = `q${qi}-${ci}`;
      const li   = $('li');
      li.innerHTML = `
        <label>
          <input type="radio" name="q${qi}" id="${id}"
                 value="${String.fromCharCode(65 + ci)}">
          ${wrap(c)}
        </label>`;
      ul.appendChild(li);
    });

    qDiv.appendChild(ul);
    form.appendChild(qDiv);
  });

  /* submit + feedback */
  const btn = $('button', 'Submit');
  btn.type  = 'button';
  btn.onclick = () => {
    let correct = 0;
    hw.questions.forEach((_, i) => {
      const chosen = form.querySelector(`input[name="q${i}"]:checked`);
      if (chosen && chosen.value === hw.answerKey[i]) correct++;
    });
    alert(`Score: ${correct} / ${hw.questions.length}`);
  };
  form.appendChild(btn);

  /* inject & typeset */
  root.replaceChildren(form);
  if (window.MathJax?.typeset) window.MathJax.typeset();
})();
