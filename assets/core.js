/*──────── CONFIG ────────*/
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwOv_kfoxPx9i6MnADYSKaPi56ycO6GXwdYhoe4HMrgHaaX8lenoGPNtAN2mBPsDOx2cw/exec";
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
    q.insertAdjacentHTML("beforeend",`<div><p><strong>Q${i+1}:</strong> ${qst.latex}</p>${opts}</div>`);
  });
  MathJax.typeset();
  document.getElementById("f").addEventListener("submit",ev=>submit(ev,d));
}

async function submit(ev,d){
  ev.preventDefault();
  const f=ev.target, first=f.firstName.value.trim(), last=f.lastName.value.trim();
  const lock=`last_${d.classId}_${d.id}_${first}_${last}`.toLowerCase();
  const now=Date.now(), lastT=Number(localStorage.getItem(lock)||0);
  if(now-lastT<COOLDOWN_MS){
    const sec=Math.ceil((COOLDOWN_MS-(now-lastT))/1000);
    alert(`Please wait ${sec}s before retrying.`); return;
  }
  const ans=[]; for(let i=1;i<=d.questions.length;i++) ans.push(f[`q${i}`].value);

  const body=new URLSearchParams({
    classId:d.classId, homeworkId:d.id,
    firstName:first,  lastName:last,
    answers:JSON.stringify(ans),
    answerKey:JSON.stringify(d.answerKey)
  });

  try{
    const res=await fetch(SCRIPT_URL,{method:"POST",body});
    const txt=await res.text();
    handle(txt,d.questions.length);
    if(!txt.startsWith("ERR|")) localStorage.setItem(lock,String(now));
  }catch(e){alert("Network error: "+e);}
}

function handle(msg,total){
  if(msg.startsWith("FIRST|")){
    const [,raw] = msg.split("|");
    alert(`First submission ✔\nScore ${raw}/${total}`);
    return;
  }
  if(msg.startsWith("RETRY_HIGH|")){
    const [,raw,capped,official]=msg.split("|").map(Number);
    if(capped<raw)
      alert(`Retry ✔\nRaw ${raw}/${total}\nCapped 85 % → ${capped}/${total}`);
    else
      alert(`Retry ✔\nScore ${capped}/${total}\n(85 % cap not triggered)`);
    return;
  }
  if(msg.startsWith("RETRY_LOW|")){
    const [,capped,prev]=msg.split("|").map(Number);
    alert(`Retry recorded ✔\nYour retry score ${capped}/${total} is lower than your previous ${prev}/${total}.\nPrevious score kept.`);
    return;
  }
  if(msg==="ERR|INVALID_NAME")    alert("Name not in roster.");
  else if(msg==="ERR|LIMIT_EXCEEDED") alert("Max 2 attempts reached.");
  else if(msg.startsWith("ERR|"))  alert("Server error:\n"+msg.slice(4));
  else alert("Unexpected reply:\n"+msg);
}
