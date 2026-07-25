document.addEventListener("DOMContentLoaded",async()=>{
  const session=getSession(); if(!session?.examId){location.href="student-login.html";return;}
  const exam=await getExam(session.examId); if(!exam){alert("This exam is no longer available.");location.href="student-login.html";return;}
  session.answers=session.answers||{};session.section=session.section||"listening";session.partIndex=Number.isInteger(session.partIndex)?session.partIndex:0;
  document.getElementById("runnerCandidateName").textContent=session.studentName||"Candidate";
  const root=document.getElementById("runnerQuestionsPane"),passage=document.getElementById("runnerPassagePane"),partLabel=document.getElementById("runnerPartLabel"),tag=document.getElementById("runnerSectionTag"),nav=document.getElementById("navBubbles");
  let seconds=session.remaining?.[session.section]??SECTION_TIMES[session.section]??3600;
  const timer=setInterval(()=>{seconds=Math.max(0,seconds-1);session.remaining=session.remaining||{};session.remaining[session.section]=seconds;saveSession(session);drawTimer();if(seconds===0)submitSection();},1000);drawTimer();render();

  function render(){
    const section=session.section;const parts=exam[section]||[];if(!parts.length){advance();return;}session.partIndex=Math.min(session.partIndex,parts.length-1);const part=parts[session.partIndex];tag.textContent=section.toUpperCase();partLabel.textContent=`${section==="listening"?"Part":"Passage"} ${session.partIndex+1}`;
    passage.innerHTML=section==="reading"?`<div class="student-group">${part.intro||""}</div><article>${part.passage||"<p>No passage text.</p>"}</article>`:`<div class="student-group"><h2>${escapeHtml(part.title||`Listening Part ${session.partIndex+1}`)}</h2>${part.audio?`<audio controls controlsList="nodownload" style="width:100%"><source src="${escapeHtml(part.audio)}"></audio>`:"<p class='muted'>Audio will appear here when the teacher adds a file path.</p>"}</div>`;
    let number=numberAtPart(section,session.partIndex);root.innerHTML=(part.questionGroups||[]).map(group=>{let html=`<section class="student-group"><div class="student-group-label">${group.label||""}</div>${(group.contentBlocks||[]).map(b=>renderContentBlock(b,{disabled:false})).join("")}`;for(const id of group.questionIds||[]){const q=part.questions.find(x=>x.id===id);if(!q)continue;html+=renderQuestion(q,number);number+=questionWeight(q);}return html+"</section>";}).join("");
    restoreChoices();wireInputs();renderNav();
  }
  function wireInputs(){
    root.querySelectorAll(".ielts-inline-answer").forEach(input=>input.addEventListener("input",()=>{session.answers[input.dataset.questionId]=input.value;saveSession(session);renderNav();}));
    root.querySelectorAll('input[type="radio"][data-question-id]').forEach(input=>input.addEventListener("change",()=>{session.answers[input.dataset.questionId]=input.value;saveSession(session);renderNav();}));
    root.querySelectorAll('input[type="checkbox"][data-question-id]').forEach(input=>input.addEventListener("change",()=>{const id=input.dataset.questionId;const set=new Set(Array.isArray(session.answers[id])?session.answers[id]:[]);input.checked?set.add(input.value):set.delete(input.value);session.answers[id]=[...set];saveSession(session);renderNav();}));
  }
  function restoreChoices(){
    root.querySelectorAll('input[type="radio"][data-question-id]').forEach(i=>i.checked=session.answers[i.dataset.questionId]===i.value);
    root.querySelectorAll('input[type="checkbox"][data-question-id]').forEach(i=>i.checked=(session.answers[i.dataset.questionId]||[]).includes(i.value));
  }
  function renderNav(){
    const part=(exam[session.section]||[])[session.partIndex];let n=numberAtPart(session.section,session.partIndex);nav.innerHTML=(part.questions||[]).filter(q=>questionWeight(q)>0).map(q=>{const answer=session.answers[q.id];const done=Array.isArray(answer)?answer.length>0:String(answer||"").trim().length>0;const start=n;n+=questionWeight(q);return `<button class="nav-bubble ${done?"answered":""}" data-qid="${q.id}" title="Question ${start}">${start}</button>`;}).join("");nav.querySelectorAll("button").forEach(b=>b.onclick=()=>root.querySelector(`[data-question-id="${CSS.escape(b.dataset.qid)}"]`)?.scrollIntoView({behavior:"smooth",block:"center"}));
  }
  function numberAtPart(section,index){let n=1;(exam[section]||[]).slice(0,index).forEach(p=>(p.questions||[]).forEach(q=>n+=questionWeight(q)));return n;}
  function drawTimer(){document.getElementById("runnerTimer").textContent=`${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;}
  async function submitSection(){
    const parts=exam[session.section]||[];
    if(session.partIndex<parts.length-1){session.partIndex++;saveSession(session);render();return;}
    if(!confirm(`Submit the ${session.section} section? You cannot return after continuing.`))return;
    advance();
  }
  async function advance(){
    if(session.section==="listening"){session.section="reading";session.partIndex=0;seconds=session.remaining?.reading??SECTION_TIMES.reading;saveSession(session);render();drawTimer();return;}
    clearInterval(timer);session.section="writingTask1";session.partIndex=0;saveSession(session);location.href="student-writing.html";
  }
  document.getElementById("btnSubmitSection").addEventListener("click",submitSection);
});
