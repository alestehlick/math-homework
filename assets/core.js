/*──────── CONFIG ────────*/
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyhsA52dPct5OeWU_GkWQwSeTYSrfsu8m10X89gtQQaFUe2xrWRysHDk31PgbZG72Q0Tg/exec";
const COOLDOWN_MS = 120_000;  // 2 minutes
/*────────────────────────*/

document.addEventListener("DOMContentLoaded",()=>{
  if(!window.homeworkData){alert("homeworkData missing");return;}
  build(window.homeworkData);
});

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
      <button>Submit</button>
    </form>`;
  const q=document.getElementById("qbox");
  d.questions.forEach((qst,i)=>{
    const opts=qst.choices.map((t,j)=>{
      const l=String.fromCharCode(65+j);
      return `<label><input type="radio" name="q${i+1}" value="${l}" required> ${t}</label>`;
    }).join("");
    q.insertAdjacentHTML("beforeend",
      `<div><p><strong>Q${i+1}:</strong> ${qst.latex}</p>${opts}</div>`);
  });
  MathJax.typeset();
  document.getElementById("hwForm").addEventListener("submit",ev=>submit(ev,d));
}

function calcRawScore(ans,key){
  return ans.reduce((s,a,i)=> s+(a.trim().toUpperCase()===key[i].trim().toUpperCase()?1:0),0);
}

async function submit(ev,d){
  ev.preventDefault();
  const f=ev.target,
        first=f.firstName.value.trim(),
        last =f.lastName.value.trim(),
        lock=`last_${d.classId}_${d.id}_${first}_${last}`.toLowerCase(),
        now=Date.now(),
        lastTime=Number(localStorage.getItem(lock)||0);

  if(now-lastTime < COOLDOWN_MS){
    const secs=Math.ceil((COOLDOWN_MS-(now-lastTime))/1000);
    alert(`Please wait ${secs}s before retrying.`);
    return;
  }

  const ans=[];
  for(let i=1;i<=d.questions.length;i++) ans.push(f[`q${i}`].value);
  const raw=calcRawScore(ans,d.answerKey);

  const body=new URLSearchParams({
    classId:d.classId, homeworkId:d.id,
    firstName:first,  lastName:last,
    answers:JSON.stringify(ans),
    answerKey:JSON.stringify(d.answerKey)
  });

  try{
    const res = await fetch(SCRIPT_URL,{method:"POST",body});
    const txt = await res.text();
    handleReply(txt,d.questions.length,raw);
    if(!txt.startsWith("ERR|")) localStorage.setItem(lock,String(now));
  }catch(e){alert("Network error: "+e);}
}

function handleReply(msg,total,raw){
  if(msg.startsWith("SUBMITTED|")){
    const s=Number(msg.split("|")[1]);
    alert(`First submission ✔\nScore: ${s}/${total}`);
  }else if(msg.startsWith("RETRY|")){
    const s=Number(msg.split("|")[1]);
    if(s<raw){
      alert(`Retry recorded ✔\nRaw score: ${raw}/${total}\nCapped to 85 % ⇒ Final score: ${s}/${total}`);
    }else{
      alert(`Retry recorded ✔\nScore: ${s}/${total}\n(85 % cap not triggered)`);
    }
  }else if(msg==="ERR|INVALID_NAME"){
    alert("Name not in roster.");
  }else if(msg==="ERR|LIMIT_EXCEEDED"){
    alert("Max 2 attempts reached.");
  }else if(msg.startsWith("ERR|")){
    alert("Server error:\n"+msg.slice(4));
  }else{
    alert("Unexpected reply:\n"+msg);
  }
}
