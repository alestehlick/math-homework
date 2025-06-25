/*──────────────────────────────────────────────
  core.js – shared engine for EVERY homework
──────────────────────────────────────────────*/
const SCRIPT_URL  = "https://script.google.com/macros/s/REPLACE_WITH_/exec"; // <- YOUR /exec URL
const COOLDOWN_MS = 120_000;   // 2 minutes

document.addEventListener("DOMContentLoaded",()=>{
  if(!window.homeworkData){alert("Homework data missing!");return;}
  buildForm(window.homeworkData);
});

function buildForm(d){
  const root=document.getElementById("hw-root");
  root.innerHTML=`
     <h1>${d.title}</h1>
     <form id="hwForm">
       <input type="hidden" name="homeworkId" value="${d.id}">
       <label>First Name <input required name="firstName"></label>
       <label>Last  Name <input required name="lastName" ></label>
       <div id="qbox"></div>
       <button class="submit-btn" type="submit">Submit</button>
     </form>`;
  const qbox=document.getElementById("qbox");

  d.questions.forEach((q,i)=>{
    const opts=q.choices.map((txt,j)=>{
      const letter=String.fromCharCode(65+j);      // 65 = “A”
      return `<label><input type="radio" name="q${i+1}" value="${letter}" required> ${txt}</label>`;
    }).join("");
    qbox.insertAdjacentHTML("beforeend",`
       <div class="question">
         <p><strong>Question ${i+1}:</strong> ${q.latex}</p>${opts}
       </div>`);
  });
  MathJax.typeset();

  document.getElementById("hwForm")
          .addEventListener("submit",ev=>submit(ev,d));
}

async function submit(ev,d){
  ev.preventDefault();
  const f=ev.target, first=f.firstName.value.trim(), last=f.lastName.value.trim();
  const keyLS=`${d.id}_${first}_${last}`.toLowerCase();
  if(Date.now()-(+localStorage.getItem(keyLS)||0) < COOLDOWN_MS){
    const s=Math.ceil((COOLDOWN_MS-(Date.now()-localStorage.getItem(keyLS)))/1000);
    return alert(`Please wait ${s}s before retrying.`);
  }
  /* collect answers as letters */
  const answers=[];
  for(let i=1;i<=d.questions.length;i++) answers.push(f[`q${i}`].value);

  const fd=new FormData();
  fd.append("homeworkId", d.id);
  fd.append("firstName",  first);
  fd.append("lastName",   last);
  fd.append("answers",    JSON.stringify(answers));
  fd.append("answerKey",  JSON.stringify(d.answerKey));  // letters only

  try{
    const r=await fetch(SCRIPT_URL,{method:"POST",body:fd});
    const t=await r.text();
    handleReply(t,d.questions.length);
    if(!t.startsWith("ERR|") && !t.startsWith("<")) localStorage.setItem(keyLS,Date.now());
  }catch(e){alert("Network / script error: "+e);}
}

function handleReply(msg,total){
  if(msg.startsWith("SUBMITTED|")){
    alert(`First submission ✔\nScore ${msg.split("|")[1]}/${total}\nYou may retry once (85 % cap).`);
  }else if(msg.startsWith("SUBMITTED_LATE|")){
    alert(`Late submission → 85 % cap.\nScore ${msg.split("|")[1]}/${total}`);
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
