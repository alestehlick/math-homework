/*──────────────────────────────────────────────
  core.js – shared front-end for EVERY homework
  • multiple classes  (classId)
  • 6-option multiple choice, graded by letter
  • 2-minute cooldown per student
  • sends: classId, homeworkId, answers[], answerKey[]
──────────────────────────────────────────────*/

/* 1️⃣  YOUR Google-Apps-Script Web-App URL (must end '/exec') */
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwYZ0AB1vEn1CL8ygqxPksw9Iy6Sj-4SjDaZ7iKI3HK8hLarOW1x1Vl6lxVlW17CRn6pg/exec";

/* 2️⃣  Cool-down between submissions (ms) */
const COOLDOWN_MS = 120_000;     // 2 minutes

/* ─────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  if (!window.homeworkData) {
    alert("Error: homeworkData object not found.");
    return;
  }
  buildForm(window.homeworkData);
});

/* ─────────────────────────────────────────── */
function buildForm(d) {
  /* d = {classId,id,title,questions:[{latex,choices[]}],answerKey:["A",…]} */

  const root = document.getElementById("hw-root");
  root.innerHTML = `
    <h1>${d.title}</h1>
    <form id="hwForm">
      <input type="hidden" name="classId"    value="${d.classId}">
      <input type="hidden" name="homeworkId" value="${d.id}">
      <label>First Name <input required name="firstName"></label>
      <label>Last Name  <input required name="lastName" ></label>
      <div id="qbox"></div>
      <button class="submit-btn" type="submit">Submit</button>
    </form>`;

  const qbox = document.getElementById("qbox");

  /* build each question – radio value = letter A–F */
  d.questions.forEach((q, idx) => {
    const opts = q.choices.map((txt, j) => {
      const letter = String.fromCharCode(65 + j);   // 65 → 'A'
      return `<label><input type="radio" name="q${idx + 1}"
                             value="${letter}" required> ${txt}</label>`;
    }).join("");
    qbox.insertAdjacentHTML("beforeend", `
      <div class="question">
        <p><strong>Question ${idx + 1}:</strong> ${q.latex}</p>
        ${opts}
      </div>`);
  });

  MathJax.typeset();                                 // render LaTeX
  document.getElementById("hwForm")
          .addEventListener("submit", ev => handleSubmit(ev, d));
}

/* ─────────────────────────────────────────── */
async function handleSubmit(ev, d) {
  ev.preventDefault();
  const f       = ev.target;
  const first   = f.firstName.value.trim();
  const last    = f.lastName.value.trim();
  const hwId    = d.id;
  const classId = d.classId;

  /* 2-minute lockout key */
  const lockKey  = `last_${classId}_${hwId}_${first}_${last}`.toLowerCase();
  const lastTime = Number(localStorage.getItem(lockKey) || 0);
  const now      = Date.now();
  if (now - lastTime < COOLDOWN_MS) {
    const secs = Math.ceil((COOLDOWN_MS - (now - lastTime)) / 1000);
    alert(`Please wait ${secs}s before retrying.`);
    return;
  }

  /* collect answers (letters) */
  const answers = [];
  for (let i = 1; i <= d.questions.length; i++) {
    answers.push(f[`q${i}`].value);
  }

  /* prepare payload */
  const fd = new FormData();
  fd.append("classId",    classId);
  fd.append("homeworkId", hwId);
  fd.append("firstName",  first);
  fd.append("lastName",   last);
  fd.append("answers",    JSON.stringify(answers));
  fd.append("answerKey",  JSON.stringify(d.answerKey));  // letters only

  try {
    const res  = await fetch(SCRIPT_URL, { method: "POST", body: fd });
    const text = await res.text();
    handleReply(text, d.questions.length);
    /* record successful timestamp */
    if (!text.startsWith("ERR|") && !text.startsWith("<"))
      localStorage.setItem(lockKey, String(now));
  } catch (err) {
    alert("Network / script error: " + err);
  }
}

/* ─────────────────────────────────────────── */
function handleReply(msg, total) {
  if (msg.startsWith("SUBMITTED|")) {
    const [, s] = msg.split("|");
    alert(`First submission ✔\nScore: ${s}/${total}\nYou may retry once (85 % cap).`);
  } else if (msg.startsWith("SUBMITTED_LATE|")) {
    const [, s] = msg.split("|");
    alert(`Late submission (85 % cap).\nScore: ${s}/${total}\nOne retry left.`);
  } else if (msg.startsWith("RETRY|")) {
    const [, s] = msg.split("|");
    alert(`Retry recorded ✔\nScore (cap): ${s}/${total}\nNo more attempts.`);
  } else if (msg === "ERR|INVALID_NAME") {
    alert("Name not in roster – submission rejected.");
  } else if (msg === "ERR|LIMIT_EXCEEDED") {
    alert("You have already submitted twice.");
  } else if (msg.startsWith("ERR|")) {
    alert("Submission error: " + msg);
  } else {
    alert("Unexpected reply:\n" + msg);
  }
}
