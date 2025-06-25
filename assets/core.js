/*──────────────────────────────────────────────
  core.js – universal engine (letter grading)
──────────────────────────────────────────────*/
const SCRIPT_URL  = "https://script.google.com/macros/s/AKfycbwknU1boP4shJWKJETLmi7d_080IHy-OUhHvzM7nm7S5W8wjb30vdPT7Ca0OLfYm2R4dw/exec"; // <-- your /exec
const COOLDOWN_MS = 120_000;                                                 // 2-minute lockout

document.addEventListener("DOMContentLoaded", () => {
  if (!window.homeworkData) { alert("No homeworkData found!"); return; }
  buildForm(window.homeworkData);
});

function buildForm(d){
  /* d = {id, title, questions:[{latex, choices[], correct:"C"}]} */
  const root = document.getElementById("hw-root");
  root.innerHTML = `
    <h1>${d.title}</h1>
    <form id="hwForm">
      <input type="hidden" name="homeworkId" value="${d.id}">
      <label>First Name <input required name="firstName"></label>
      <label>Last Name  <input required name="lastName" ></label>
      <div id="qbox"></div>
      <button class="submit-btn" type="submit">Submit</button>
    </form>`;
  const qbox = document.getElementById("qbox");
  const answerKey = [];                                      // auto-built key

  d.questions.forEach((q,i)=>{
    const opts = q.choices.map((txt,j)=>{
      const letter = String.fromCharCode(65+j);              // A–F
      if (letter === q.correct) answerKey.push(letter);      // build key
      return `<label><input type="radio" name="q${i+1}" value="${letter}" required> ${txt}</label>`;
    }).join("");
    qbox.insertAdjacentHTML("beforeend",
      `<div class="question">
         <p><strong>Question ${i+1}:</strong> ${q.latex}</p>${opts}
       </div>`);
  });

  MathJax.typeset();

  document.getElementById("hwForm").addEventListener("submit",ev=>{
    ev.preventDefault();
    submit(ev.target, d.id, answerKey);
  });
}

async function submit(form, hwId, answerKey){
  const first=form.firstName.value.trim(), last=form.lastName.value.trim();
  const lockKey = `${hwId}_${first}_${last}`.toLowerCase();
  const lastT = +localStorage.getItem(lockKey)||0;
  if (Date.now() - lastT < COOLDOWN_MS){
    const s=Math.ceil((COOLDOWN_MS-(Date.now()-lastT))/1000);
    return alert(`Please wait ${s}s before retrying.`);
  }

  const answers=[];
  for(let i=1;i<=answerKey.length;i++) answers.push(form[`q${i}`].value);

  const fd=new FormData();
  fd.append("homeworkId", hwId);
  fd.append("firstName", first);
  fd.append("lastName",  last);
  fd.append("answers",   JSON.stringify(answers));
  fd.append("answerKey", JSON.stringify(answerKey));

  try{
    const r=await fetch(SCRIPT_URL,{method:"POST",body:fd});
    const t=await r.text(); handleReply(t,answerKey.length);
    if(!t.startsWith("ERR|") && !t.startsWith("<")) localStorage.setItem(lockKey,Date.now());
  }catch(e){ alert("Network / script error: "+e); }
}

function handleReply(msg,total){
  if(msg.startsWith("SUBMITTED|")){
    alert(`First submission ✔\nScore ${msg.split("|")[1]}/${total}\nYou may retry once (cap 85%).`);
  }else if(msg.startsWith("SUBMITTED_LATE|")){
    alert(`Late submission → 85% cap.\nScore ${msg.split("|")[1]}/${total}`);
  }else if(msg.startsWith("RETRY|")){
    alert(`Retry recorded ✔\nScore (cap): ${msg.split("|")[1]}/${total}`);
  }else if(msg==="ERR|INVALID_NAME"){
    alert("Name not in roster.");
  }else if(msg==="ERR|LIMIT_EXCEEDED"){
    alert("You already submitted twice.");
  }else{
    alert("Unexpected: "+msg);
  }
}
