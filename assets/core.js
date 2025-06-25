/*──────── CONFIG ────────*/
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyhsA52dPct5OeWU_GkWQwSeTYSrfsu8m10X89gtQQaFUe2xrWRysHDk31PgbZG72Q0Tg/exec";
const COOLDOWN_MS = 120_000;
/*────────────────────────*/

document.addEventListener("DOMContentLoaded",()=>{
  if(!window.homeworkData){alert("homeworkData missing");return;}
  build(window.homeworkData);
});

function build(d){
  const root=document.getElementById("hw-root");
  root.innerHTML=`
    <h1>${d.title}</h1>
    <form id="f">
      <input type="hidden" name="classId" value="${d.classId}">
      <input type="hidden" name="homeworkId" value="${d.id}">
      <label>First <input name="firstName" required></label>
      <label>Last  <input name="lastName"  required></label>
      <div id="q"></div><button>Submit</button>
    </form>`;
  const q=document.getElementById("q");
  d.questions.forEach((qst,i)=>{
    const opts=qst.choices.map((t,j)=>{
      const l=String.fromCharCode(65+j);
      return `<label><input type="radio" name="q${i+1}" value="${l}" required> ${t}</label>`;
    }).join("");
    q.insertAdjacentHTML("beforeend",
      `<div><p><strong>Q${i+1}:</strong> ${qst.latex}</p>${opts}</div>`);
  });
  MathJax.typeset();
  document.getElementById("f").addEventListener("submit",ev=>submit(ev,d));
}

async function submit(ev,d){
  ev.preventDefault();
  const f=ev.target, first=f.firstName.value.trim(), last=f.lastName.value.trim();
  const lock=`last_${d.classId}_${d.id}_${first}_${last}`.toLowerCase();
  if(Date.now()-(localStorage.getItem(lock)||0)<COOLDOWN_MS){
    alert("Wait before retrying"); return;
  }
  const ans=[], len=d.questions.length;
  for(let i=1;i<=len;i++) ans.push(f[`q${i}`].value);

  const body=new URLSearchParams({
    classId:d.classId, homeworkId:d.id,
    firstName:first,  lastName:last,
    answers:JSON.stringify(ans),
    answerKey:JSON.stringify(d.answerKey)
  });

  try{
    const res=await fetch(SCRIPT_URL,{method:"POST",body});
    const txt=await res.text();
    handle(txt,len); if(!txt.startsWith("ERR|")) localStorage.setItem(lock,Date.now());
  }catch(e){alert("Network error: "+e);}
}

function handle(m,t){
  if(m.startsWith("SUBMITTED|")) alert(`Submitted ✔\nScore ${m.split("|")[1]}/${t}`);
  else if(m.startsWith("RETRY|")) alert(`Retry ✔ (85 % cap)\nScore ${m.split("|")[1]}/${t}`);
  else if(m==="ERR|INVALID_NAME") alert("Name not in roster.");
  else if(m==="ERR|LIMIT_EXCEEDED") alert("Max 2 attempts reached.");
  else if(m.startsWith("ERR|")) alert("Server error:\n"+m.slice(4));
  else alert("Unexpected reply:\n"+m);
}
