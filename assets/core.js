/*  core.js – shared engine for EVERY homework page  */

const COOLDOWN_MS = 120_000;             // 2-minute lockout
const SCRIPT_URL  = "https://script.google.com/macros/s/AKfycbxRgH1sy5k_qgRzeHv48N2y2GG6Kpn4Qel1d6ASofzmPzCtV-04UupmIVlAc6WlfLrHcw/exec";

/* Wait until homework-specific data has loaded (hw_*_data.js sets window.homeworkData) */
document.addEventListener("DOMContentLoaded", () => {
  if (!window.homeworkData) {
    alert("Homework data not loaded! Check the *_data.js import.");
    return;
  }
  buildForm(window.homeworkData);
});

function buildForm(d) {
  /* d = {id,title,questions:[{latex,choices:["A","B",…]}]} */
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

  d.questions.forEach((q,i) => {
    qbox.insertAdjacentHTML("beforeend",
      `<div class="question">
         <p><strong>Question ${i+1}:</strong> ${q.latex}</p>
         ${q.choices.map(c =>
           `<label><input type="radio" name="q${i+1}" value="${c}" required> ${c}</label>`
         ).join("")}
       </div>`);
  });
  MathJax.typeset();
  document.getElementById("hwForm").addEventListener("submit", ev => submitForm(ev,d));
}

async function submitForm(ev,d){
  ev.preventDefault();
  const f=ev.target, first=f.firstName.value.trim(), last=f.lastName.value.trim();
  const key=`${d.id}_${first}_${last}`.toLowerCase(), lastT=+localStorage.getItem(key)||0;
  if(Date.now()-lastT < COOLDOWN_MS){
    const s=Math.ceil((COOLDOWN_MS-(Date.now()-lastT))/1000);
    return alert(`Please wait ${s} s before retrying.`);
  }
  const answers=[];
  for(let i=1;i<=d.questions.length;i++){ answers.push(f[`q${i}`].value); }

  const payload=new FormData();
  payload.append("homeworkId", d.id);
  payload.append("firstName", first);
  payload.append("lastName",  last);
  payload.append("answers",   JSON.stringify(answers));

  try{
    const r=await fetch(SCRIPT_URL,{method:"POST",body:payload});
    const t=await r.text();   handleReply(t,d.questions.length);
    if(!t.startsWith("ERR|") && !t.startsWith("<")) localStorage.setItem(key,Date.now());
  }catch(e){alert("Network / script error: "+e);}
}

function handleReply(msg,total){
  if(msg.startsWith("SUBMITTED|")){
    const [,s]=msg.split("|"); alert(`First submission ✔\nScore ${s}/${total}\nOne retry allowed (85 % cap).`);
  }else if(msg.startsWith("SUBMITTED_LATE|")){
    const [,s]=msg.split("|"); alert(`Late submission → 85 % cap.\nScore ${s}/${total}\nOne retry allowed.`);
  }else if(msg.startsWith("RETRY|")){
    const [,s]=msg.split("|"); alert(`Retry recorded ✔\nScore (cap): ${s}/${total}\nNo more attempts.`);
  }else if(msg==="ERR|INVALID_NAME"){
    alert("Name not found in roster.");
  }else if(msg==="ERR|LIMIT_EXCEEDED"){
    alert("You already submitted twice.");
  }else{
    alert("Unexpected: "+msg);
  }
}
