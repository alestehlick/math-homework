/*  core-lean.js  –  v2.0  (adds First / Last Name fields)
 *  -------------------------------------------------------
 *  • Builds the form from window.homeworkData
 *  • Inserts First-Name / Last-Name boxes at the top
 *  • On submit:  ▸ checks name fields are not blank
 *                ▸ scores the quiz
 *                ▸ (optional) POSTs JSON to your Google Apps Script
 *  -------------------------------------------------------------- */

(function () {
  const root = document.getElementById('hw-root');
  const hw   = window.homeworkData;
  if (!root || !hw) return;

  /* util */
  const $ = (tag, html='') => { const e = document.createElement(tag); e.innerHTML = html; return e; };
  const wrap = t => `\\(${t}\\)`;

  /* build form */
  const form = $('form');

  /* ---- 1. Title ---- */
  form.appendChild($('h1', hw.title));

  /* ---- 2. Student-info section ---- */
  const info = $('div'); info.className = 'student-info';
  info.innerHTML = `
    <label>First&nbsp;Name: <input type="text" name="firstName" required></label>
    <label>Last&nbsp;Name:&nbsp; <input type="text" name="lastName"  required></label>
  `;
  form.appendChild(info);

  /* ---- 3. Questions ---- */
  hw.questions.forEach((q, qi) => {
    const box = $('div'); box.className = 'question';
    box.appendChild($('p', `<strong>Q${qi+1}.</strong> ${wrap(q.latex)}`));

    const ul = $('ul'); ul.className = 'choices';
    q.choices.forEach((c, ci) => {
      const id = `q${qi}-${ci}`;
      ul.appendChild($('li', `
        <label>
          <input type="radio" name="q${qi}" id="${id}"
                 value="${String.fromCharCode(65+ci)}">
          ${wrap(c)}
        </label>`));
    });
    box.appendChild(ul);
    form.appendChild(box);
  });

  /* ---- 4. Submit ---- */
  const btn = $('button','Submit');
  btn.type  = 'button';
  btn.onclick = async () => {
    /* validate name fields */
    const fName = form.firstName.value.trim();
    const lName = form.lastName.value.trim();
    if (!fName || !lName) { alert('Please enter both first and last names.'); return; }

    /* score */
    let correct = 0;
    hw.questions.forEach((_, i) => {
      const sel = form.querySelector(`input[name="q${i}"]:checked`);
      if (sel && sel.value === hw.answerKey[i]) correct++;
    });

    /* optional: send to Google Apps Script */
    /* -------------------------------------
       const scriptURL = 'YOUR_SCRIPT_URL';
       await fetch(scriptURL, {
         method:'POST',
         body:JSON.stringify({
           hwId     : hw.id,
           firstName: fName,
           lastName : lName,
           score    : correct
         }),
         headers:{'Content-Type':'application/json'}
       });
       ------------------------------------- */

    alert(`Hi ${fName}!  Your score: ${correct} / ${hw.questions.length}`);
  };
  form.appendChild(btn);

  /* ---- 5. Mount & typeset ---- */
  root.replaceChildren(form);
  window.MathJax?.typeset();
})();
