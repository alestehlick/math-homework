/*──────── CONFIG ────────*/
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwkLwPoES1_hxHn6pdu2qdGCE3bosqwcZg6z23B6w72iQLDAIMzZZf4ZAFC44aKWTIcNg/exec"; // ⚠️ paste fresh /exec
const COOLDOWN_MS = 120_000;
/*────────────────────────*/

/* safety: warn if core.js missing or double-loaded */
if (window.__coreLoaded__) {
  console.warn("Duplicate core.js detected");
} else {
  window.__coreLoaded__ = true;
  document.addEventListener("DOMContentLoaded", ()=>{
    if (!window.homeworkData){
      alert("Error: homeworkData not found."); return;
    }
    build(window.homeworkData);
  });
}

/* build static form */
function build(d){
  const root=document.getElementById("hw-root");
  root.innerHTML=`
    <h1>${d.title}</h1>
    <form id="hwForm">
      <input type="hidden" name="classId" value="${d.classId}">
      <input type="hidden" name="homeworkId" value="${d.id}">
      <label>First <input name="firstName" required></label>
      <label>Last  <input name="lastName"  required></label>
      <div id="qbox"></div>
      <button type="submit">Submit</button>
    </form>`;

  const qbox=document.getElementById("qbox");
  d.questions.forEach((q,i)=>{
    const opts=q.choices.map((t,j)=>{
      const l=String.fromCharCode(65+j);
      return `<li><label><input type="radio" name="q${i+1}" value="${l}" required> ${t}</label></li>`;
    }).join("");
    qbox.insertAdjacentHTML("beforeend",`
      <div class="question">
        <p><strong>Q${i+1}.</strong> ${q.latex}</p>
        <ul class="choices">${opts}</ul>
      </div>`);
  });

  MathJax.typeset();
  document.getElementById("hwForm").addEventListener("submit",ev=>handleSubmit(ev,d));
}

/* submit */
async function handleSubmit(ev,d){
  ev.preventDefault();
  const f=ev.target,
        first=f.firstName.value.trim(),
        last =f.lastName.value.trim(),
        lock=`last_${d.classId}_${d.id}_${first}_${last}`.toLowerCase(),
        now = Date.now(),
        ago = now - (Number(localStorage.getItem(lock))||0);

  if (ago < COOLDOWN_MS){
    alert(`Please wait ${Math.ceil((COOLDOWN_MS-ago)/1000)} s before retrying.`);
    return;
  }

  const ans=[];
  for(let i=1;i<=d.questions.length;i++) ans.push(f[`q${i}`].value);

  const body=new URLSearchParams({
    classId:d.classId, homeworkId:d.id,
    firstName:first,  lastName:last,
    answers:JSON.stringify(ans),
    answerKey:JSON.stringify(d.answerKey)
  });

  try{
    const res = await fetch(SCRIPT_URL,{method:"POST",body});
    const txt = await res.text();
    localStorage.setItem(lock,String(now));
    handleReply(txt,d.questions.length);
  }catch(e){
    alert("Network / script error: "+e);
  }
}

/* interpret server reply */
function handleReply(m,t){
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
