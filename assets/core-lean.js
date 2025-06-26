/*  core-lean.js  ────────────────────────────────────────────────────────
 *  v3.0  (adds First/Last name fields + full payload to Apps Script)
 *
 *  • Builds the quiz form from window.homeworkData
 *  • Student must enter First Name & Last Name (required)
 *  • Collects answers, wrong‐question list, timestamp
 *  • Sends everything to your Google Apps Script
 *  • Shows an alert with the raw score
 *  • Leaves all late-cap / email / resubmission logic
 *    to the server (already implemented on your side)
 *──────────────────────────────────────────────────────────────────────*/
(function () {
  const root = document.getElementById('hw-root');
  const hw   = window.homeworkData;
  if (!root || !hw) return;

  /* helpers */
  const $ = (tag, html='') => { const e = document.createElement(tag); e.innerHTML = html; return e; };
  const wrap = tex => `\\(${tex}\\)`;   // add inline-math delimiters

  /* build form */
  const form = $('form');
  form.appendChild($('h1', hw.title));

  /* 1 ─ Student info (names) */
  form.appendChild($('div', `
    <label>First Name: <input type="text" name="firstName" required></label>
    <label>Last Name:&nbsp; <input type="text" name="lastName"  required></label>
  `)).classList.add('student-info');

  /* 2 ─ Questions */
  hw.questions.forEach((q, qi) => {
    const box = $('div'); box.className = 'question';
    box.appendChild($('p', `<strong>Q${qi+1}.</strong> ${wrap(q.latex)}`));

    const ul = $('ul'); ul.className = 'choices';
    q.choices.forEach((c, ci) => {
      ul.appendChild($('li', `
        <label>
          <input type="radio" name="q${qi}" value="${String.fromCharCode(65+ci)}">
          ${wrap(c)}
        </label>
      `));
    });
    box.appendChild(ul);
    form.appendChild(box);
  });

  /* 3 ─ Submit */
  const btn = $('button', 'Submit'); btn.type = 'button';
  btn.onclick = async () => {
    /* validate names */
    const fn = form.firstName.value.trim(),
          ln = form.lastName.value.trim();
    if (!fn || !ln) { alert('Please enter first and last names.'); return; }

    /* score & collect answers */
    let correct = 0, answers = [], wrong = [];
    hw.questions.forEach((_, i) => {
      const sel = form.querySelector(`input[name="q${i}"]:checked`);
      answers[i] = sel ? sel.value : '';
      if (answers[i] === hw.answerKey[i]) correct++;
      else wrong.push(i + 1);                         // 1-based
    });

    /* POST to Apps Script */
    try {
      await fetch('https://script.google.com/macros/s/AKfycbwkLwPoES1_hxHn6pdu2qdGCE3bosqwcZg6z23B6w72iQLDAIMzZZf4ZAFC44aKWTIcNg/exec', {
        method : 'POST',
        headers: { 'Content-Type':'application/json' },
        body   : JSON.stringify({
          hwId        : hw.id,
          classId     : hw.classId,
          firstName   : fn,
          lastName    : ln,
          answers,                      // ["C","A",…]
          score       : correct,
          wrong,                        // [3,7,11]  (empty if 100 %)
          submittedAt : Date.now()      // ms UTC
        })
      });
    } catch (err) { console.error(err); }

    alert(`${fn}, you scored ${correct} / ${hw.questions.length}.`);
  };
  form.appendChild(btn);

  /* insert form & typeset math */
  root.replaceChildren(form);
  window.MathJax?.typeset();
})();
