/* /math-homework/assets/core-lean.js  —  v2.1 */
(function () {
  const root = document.getElementById('hw-root');
  const hw   = window.homeworkData;
  if (!root || !hw) return;

  const $ = (tag, html = '') => { const e = document.createElement(tag); e.innerHTML = html; return e; };
  const wrap = t => `\\(${t}\\)`;

  /* build form */
  const form = $('form');
  form.appendChild($('h1', hw.title));

  /* name fields */
  form.appendChild($('div', `
    <label>First&nbsp;Name: <input type="text" name="firstName" required></label>
    <label>Last&nbsp;Name:&nbsp; <input type="text" name="lastName"  required></label>
  `).classList.add('student-info') || form.lastChild);

  /* questions */
  hw.questions.forEach((q, qi) => {
    const box = $('div'); box.className = 'question';
    box.appendChild($('p', `<strong>Q${qi+1}.</strong> ${wrap(q.latex)}`));

    const ul = $('ul'); ul.className = 'choices';
    q.choices.forEach((c, ci) => {
      ul.appendChild($('li', `
        <label><input type="radio" name="q${qi}" value="${String.fromCharCode(65+ci)}"> ${wrap(c)}</label>
      `));
    });
    box.appendChild(ul); form.appendChild(box);
  });

  /* submit */
  const btn = $('button', 'Submit'); btn.type = 'button';
  btn.onclick = async () => {
    const fn = form.firstName.value.trim(), ln = form.lastName.value.trim();
    if (!fn || !ln) return alert('Enter first and last names.');

    let correct = 0, answers = [], wrong = [];
    hw.questions.forEach((_, i) => {
      const sel = form.querySelector(`input[name="q${i}"]:checked`);
      answers[i] = sel ? sel.value : '';
      if (answers[i] === hw.answerKey[i]) correct++; else wrong.push(i+1);
    });

    /* send to backend */
    const scriptURL = 'YOUR_SCRIPT_WEB_APP_URL';
    try {
      await fetch(scriptURL, {
        method : 'POST',
        headers: { 'Content-Type':'application/json' },
        body   : JSON.stringify({
          hwId       : hw.id,
          firstName  : fn,
          lastName   : ln,
          answers,
          score      : correct,
          wrong,
          submittedAt: Date.now()
        })
      });
    } catch(e){ console.error(e); }

    alert(`${fn}, you scored ${correct}/${hw.questions.length}.`);
  };
  form.appendChild(btn);

  root.replaceChildren(form);
  window.MathJax?.typeset();
})();
