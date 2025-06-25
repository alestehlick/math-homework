/*────────  CONFIG  ────────*/
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxYZ9z9_eHHW-JhcAQAZTHTgp3ZXPo2kvs0X3sh6vOOtmTG92A4ZSTRXBsDQJV0pUBfMw/exec";
const COOLDOWN_MS = 120_000;   // 2 minutes
/*──────────────────────────*/

document.addEventListener("DOMContentLoaded", () => {
  if(!window.homeworkData){alert("homeworkData missing");return;}
  buildForm(window.homeworkData);
});

function buildForm(d){
  const root=document.getElementById("hw-root");
  root.innerHTML=`
    <h1>${d.title}</h1>
    <form id="hwForm">
      <input type="hidden" name="classId"    value="${d.classId}">
      <input type="hidden" name="homeworkId" value="${d.id}">
      <label>First Name <input required name="firstName"></label>
      <label>Last  Name <input required name="lastName" ></label>
      <div id="qbox"></div>
      <button class="submit-btn" type="submit">Submit</button>
    </form>`;
  const qbox=document.getElementById("qbox");

  d.questions.forEach((q,i)=>{
    const opts=q.choices.map((txt,j)=>{
      const letter=String.fromCharCode(65+j);
      return `<label><input type="radio" name="q${i+1}" value="${letter}" required> ${txt}</label>`;
    }).join("");
    qbox.insertAdjacentHTML("beforeend",`
      <div class="question"><p><strong>Question ${i+1}:</strong> ${q.latex}</p>${opts}</div>`);
  });
  MathJax.typeset();
  document.getElementById("hwForm").addEventListener("submit",ev=>submit(ev,d));
}

async function submit(ev,d){
  ev.preventDefault();
  const f=ev.target, first=f.firstName.value.trim(), last=f.lastName.value.trim();
  const lock=`last_${d.classId}_${d.id}_${first}_${last}`.toLowerCase();
  if(Date.now()-(localStorage.getItem(lock)||0) < COOLDOWN_MS){
    alert("Please wait before retrying.");return;
  }
  const ans=[]; for(let i=1;i<=d.questions.length;i++) ans.push(f[`q${i}`].value);

  const body=new URLSearchParams({
    classId:d.classId, homeworkId:d.id,
    firstName:first, lastName:last,
    answers:JSON.stringify(ans),
    answerKey:JSON.stringify(d.answerKey)
  });

  try{
    const r=await fetch(SCRIPT_URL,{method:"POST",body});
    const t=await r.text(); handleReply(t,d.questions.length);
    if(!t.startsWith("ERR|")) localStorage.setItem(lock,Date.now());
  }catch(err){alert("Network error: "+err);}
}

function handleReply(msg,total){
  if(msg.startsWith("SUBMITTED|")){
    alert(`First submission ✔\nScore ${msg.split("|")[1]}/${total}`);
  }else if(msg.startsWith("RETRY|")){
    alert(`Retry ✔ (85 % cap)\nScore ${msg.split("|")[1]}/${total}`);
  }else if(msg==="ERR|INVALID_NAME"){
    alert("Name not in roster.");
  }else if(msg==="ERR|LIMIT_EXCEEDED"){
    alert("Max 2 attempts reached.");
  }else if(msg.startsWith("ERR|")){
    alert("Server error: "+msg.slice(4));
  }else{
    alert("Unexpected reply:\n"+msg);
  }
}
