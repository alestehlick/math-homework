/*──────── CONFIG ────────*/
const SCRIPT_URL  = "https://script.google.com/macros/s/AKfycbwkLwPoES1_hxHn6pdu2qdGCE3bosqwcZg6z23B6w72iQLDAIMzZZf4ZAFC44aKWTIcNg/exec";
const COOLDOWN_MS = 120_000;
/*────────────────────────*/

if (window.__coreLoaded__) {
  console.warn("Duplicate core-lean.js detected");
} else {
  window.__coreLoaded__ = true;
  document.addEventListener("DOMContentLoaded", () => {
    if (!window.homeworkData){
      alert("Error: homeworkData not found."); return;
    }
    build(window.homeworkData);
  });
}

/*──────── BUILD ────────*/
function build(d){
  const root = document.getElementById("hw-root");
  root.innerHTML = `
    <style>
      #media      { text-align:center; margin: 1rem 0; }
      #media script[type="text/tikz"]{ display:inline-block; }
      form#hwForm { max-width:680px; margin:auto; }
      ul.choices  { list-style:none; padding-left:0; }
      .question   { margin:1.2rem 0; }
    </style>

    <h1>${d.title}</h1>

    <form id="hwForm">
      <input type="hidden" name="classId"  value="${d.classId}">
      <input type="hidden" name="homeworkId" value="${d.id}">

      <label>First <input name="firstName" required></label>
      <label>Last  <input name="lastName"  required></label>

      <div id="media"></div>
      <div id="qbox"></div>

      <button type="submit">Submit</button>
    </form>`;

  /* graphics slot ------------------------------------------------------ */
  if (d.graphics){
    const media = document.getElementById("media");
    if (/\\begin\{tikzpicture\}/.test(d.graphics)){
      media.innerHTML = `<script type="text/tikz">\n${d.graphics}\n</script>`;
    } else {
      media.innerHTML = d.graphics;          /* raw HTML / <img> / <svg> */
    }
  }

  /* questions ---------------------------------------------------------- */
  const qbox = document.getElementById("qbox");
  d.questions.forEach( (q,i) => {
    const opts = q.choices.map( (t,j) => {
      const l = String.fromCharCode(65+j);                /* A … F */
      const body = `\\(${t}\\)`;                          /* wrap choice */
      return `<li><label><input type="radio" name="q${i+1}" value="${l}" required> ${body}</label></li>`;
    }).join("");

    const prompt = `\\(${q.latex}\\)`;                    /* wrap prompt */

    qbox.insertAdjacentHTML("beforeend",`
      <div class="question">
        <p><strong>Q${i+1}.</strong> ${prompt}</p>
        <ul class="choices">${opts}</ul>
      </div>`);
  });

  /* render ------------------------------------------------------------- */
  if (window.MathJax?.typeset) MathJax.typeset();
  if (window.tikzjax)          tikzjax.process();

  document.getElementById("hwForm")
          .addEventListener("submit", ev => handleSubmit(ev,d));
}

/*──────── SUBMIT (unchanged) ────────*/
async function handleSubmit(ev,d){
  ev.preventDefault();
  const f     = ev.target,
        first = f.firstName.value.trim(),
        last  = f.lastName.value.trim(),
        lock  = `last_${d.classId}_${d.id}_${first}_${last}`.toLowerCase(),
        now   = Date.now(),
        ago   = now - (Number(localStorage.getItem(lock))||0);

  if (ago < COOLDOWN_MS){
    alert(`Please wait ${Math.ceil((COOLDOWN_MS-ago)/1000)} s before retrying.`);
    return;
  }

  const ans=[];
  for (let i=1;i<=d.questions.length;i++) ans.push(f[`q${i}`].value);

  const body = new URLSearchParams({
    classId   : d.classId,
    homeworkId: d.id,
    firstName : first,
    lastName  : last,
    answers   : JSON.stringify(ans),
    answerKey : JSON.stringify(d.answerKey)
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

/*──────── HANDLE SERVER REPLY (unchanged) ────────*/
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
  else                              alert("Unexpected reply:\n"+m);
}
