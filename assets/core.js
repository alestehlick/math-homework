/*──────────────────────────────────────────────
  core.js – shared front-end for EVERY homework
  multiple classes · A–F choices · 2-min cooldown
──────────────────────────────────────────────*/
const SCRIPT_URL  = "https://script.google.com/macros/s/AKfycbxEZcOVfSqT38z3iRpagIdToqlh0C9ik1wAtQKTxBlznA_YC_zJQJCcgbGb-yV9_SlbUA/exec";
const COOLDOWN_MS = 120_000;                             // 2 min

document.addEventListener("DOMContentLoaded", () => {
  if (!window.homeworkData) { alert("homeworkData missing"); return; }
  buildForm(window.homeworkData);
});

function buildForm(d){
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

  d.questions.forEach((q,i)=>{
    const opts = q.choices.map((txt,j)=>{
      const letter = String.fromCharCode(65+j);          // A–F
      return `<label><input type="radio" name="q${i+1}" value="${letter}" required> ${txt}</label>`;
    }).join("");
    qbox.insertAdjacentHTML("beforeend",`
      <div class="question">
        <p><strong>Question ${i+1}:</strong> ${q.latex}</p>${opts}
      </div>`);
  });
  MathJax.typeset();
  document.getElementById("hwForm").addEventListener("submit",ev=>submit(ev,d));
}

async function submit(ev,d){
  ev.preventDefault();
  const f = ev.target;
  const first = f.firstName.value.trim(), last = f.lastName.value.trim();
  const lockKey = `last_${d.classId}_${d.id}_${first}_${last}`.toLowerCase();
  const lastT = +localStorage.getItem(lockKey)||0, now=Date.now();
  if (now-lastT < COOLDOWN_MS){
    const s=Math.ceil((COOLDOWN_MS-(now-lastT))/1000);
    alert(`Please wait ${s}s before retrying.`); return;
  }

  const answers=[];
  for(let i=1;i<=d.questions.length;i++) answers.push(f[`q${i}`].value);

  const fd=new FormData();
  fd.append("classId",d.classId);
  fd.append("homeworkId",d.id);
  fd.append("firstName",first);
  fd.append("lastName",last);
  fd.append("answers",JSON.stringify(answers));
  fd.append("answerKey",JSON.stringify(d.answerKey));

  try{
    const r=await fetch(SCRIPT_URL,{method:"POST",body:fd});
    const t=await r.text();
    handleReply(t,d.questions.length);
    if(!t.startsWith("ERR|") && !t.startsWith("<")) localStorage.setItem(lockKey,String(now));
  }catch(e){ alert("Network/script error: "+e); }
}

function handleReply(msg,total){
  if(msg.startsWith("SUBMITTED|")){
    alert(`First submission ✔\nScore: ${msg.split("|")[1]}/${total}\nYou may retry once (85 % cap).`);
  }else if(msg.startsWith("SUBMITTED_LATE|")){
    alert(`Late submission (85 % cap).\nScore: ${msg.split("|")[1]}/${total}`);
  }else if(msg.startsWith("RETRY|")){
    alert(`Retry recorded ✔\nScore (cap): ${msg.split("|")[1]}/${total}`);
  }else if(msg==="ERR|INVALID_NAME"){
    alert("Name not in roster.");
  }else if(msg==="ERR|LIMIT_EXCEEDED"){
    alert("You already submitted twice.");
  }else if(msg.startsWith("ERR|")){
    alert("Submission error: "+msg);
  }else{
    alert("Unexpected reply:\n"+msg);
  }
}
