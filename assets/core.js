/*──────── CONFIG ────────*/
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbNEW_ID/exec"; // ← paste NEW /exec link
const COOLDOWN_MS = 120_000;                                                // 2 minutes
/*────────────────────────*/

document.addEventListener("DOMContentLoaded",()=>{
  if(!window.homeworkData){alert("homeworkData missing");return;}
  build(window.homeworkData);
});

/* Build static form */
function build(d){
  const root=document.getElementById("hw-root");
  root.innerHTML=`
    <h1>${d.title}</h1>
    <form id="f">
      <input type="hidden" name="classId" value="${d.classId}">
      <input type="hidden" name="homeworkId" value="${d.id}">
      <label>First <input name="firstName" required></label>
      <label>Last  <input name="lastName"  required></label>
      <div id="qbox"></div>
      <button type="submit">Submit</button>
    </form>`;

  const box=document.getElementById("qbox");
  d.questions.forEach((q,i)=>{
    const opts=q.choices.map((t,j)=>{
      const l=String.fromCharCode(65+j);
      return `<li><label><input type="radio" name="q${i+1}" value="${l}" required> ${t}</label></li>`;
    }).join("");
    box.insertAdjacentHTML("beforeend",
      `<div class="question">
         <p><strong>Q${i+1}.</strong> ${q.latex}</p>
         <ul class="choices">${opts}</ul>
       </div>`);
  });
  MathJax.typeset();
  document.getElementById("f").addEventListener("submit",ev=>submit(ev,d));
}

/* Submit handler */
async function submit(ev,d){
  ev.preventDefault();
  const f=ev.target,
        first=f.firstName.value.trim(),
        last =f.lastName.value.trim(),
        lock=`last_${d.classId}_${d.id}_${first}_${last}`.toLowerCase(),
        now=Date.now(),
        lastT=Number(localStorage.getItem(lock)||0);

  if(now-lastT<COOLDOWN_MS){
    alert(`Please wait ${Math.ceil((COOLDOWN_MS-(now-lastT))/1000)} s before retrying.`);
    return;
  }

  const ans=[]; for(let i=1;i<=d.questions.length;i++) ans.push(f[`q${i}`].value);

  const body=new URLSearchParams({
    classId:d.classId, homeworkId:d.id,
    firstName:first,  lastName:last,
    answers:JSON.stringify(ans),
    answerKey:JSON.stringify(d.answerKey)
  });

  try{
    const r=await fetch(SCRIPT_URL,{method:"POST",body});
    const txt=await r.text();
    localStorage.setItem(lock,String(now));
    handle(txt,d.questions.length);
  }catch(e){alert("Network error: "+e);}
}

/* Display messages based on server reply */
function handle(m,t){
  if(m.startsWith("SUBMITTED|")){
    const [,raw,flag]=m.split("|");
    if(flag==="LATE")
      alert(`Submitted after due date (85 % cap)\nScore ${Math.ceil(raw*0.85)}/${t}`);
    else
      alert(`First submission ✔\nScore ${raw}/${t}`);
    return;
  }

  if(m.startsWith("RETRY_HIGH|")){
    const [,raw,disp,cap]=m.split("|");
    if(cap==="CAP")
      alert(`Retry ✔\nRaw ${raw}/${t}\nCapped 85 % → ${disp}/${t}`);
    else
      alert(`Retry ✔\nScore ${disp}/${t}`);
    return;
  }

  if(m.startsWith("RETRY_LOW|")){
    const [,disp,prev]=m.split("|");
    alert(`Retry recorded ✔\nRetry ${disp}/${t} < Previous ${prev}/${t}\nHigher score kept.`);
    return;
  }

  if(m==="ERR|INVALID_NAME")        alert("Name not in roster.");
  else if(m==="ERR|LIMIT_EXCEEDED") alert("Max 2 attempts reached.");
  else if(m.startsWith("ERR|"))     alert("Server error:\n"+m.slice(4));
  else alert("Unexpected reply:\n"+m);
}
