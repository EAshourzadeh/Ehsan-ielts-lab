/* Shared utilities for EHSAN IELTS Lab v4A. */
const SS_SESSION = "ielts_current_session";
const LOCAL_EXAMS = "ielts_local_exams_v4a";
const LOCAL_RESULTS = "ielts_local_results_v4a";
const SECTION_TIMES = { listening: 30 * 60, reading: 60 * 60, writingTask1: 20 * 60, writingTask2: 40 * 60 };
const TFNG_OPTIONS = ["True", "False", "Not Given"];

const BAND_TABLE = [[39,9],[37,8.5],[35,8],[33,7.5],[30,7],[27,6.5],[23,6],[19,5.5],[15,5],[13,4.5],[10,4],[8,3.5],[6,3],[4,2.5],[0,2]];
function rawToBand(correct){ for(const [min,band] of BAND_TABLE){ if(correct>=min) return band; } return 2; }
function uid(prefix="id"){ return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }
function clone(value){ return JSON.parse(JSON.stringify(value)); }
function escapeHtml(value){ return String(value??"").replace(/[&<>"']/g, ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch])); }
function stripHtml(value){ const node=document.createElement("div"); node.innerHTML=String(value||""); return (node.textContent||"").trim(); }
function debounce(fn, wait=250){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args),wait); }; }
function getSession(){ try{return JSON.parse(sessionStorage.getItem(SS_SESSION)||"null");}catch{return null;} }
function saveSession(value){ sessionStorage.setItem(SS_SESSION,JSON.stringify(value)); }
function clearSession(){ sessionStorage.removeItem(SS_SESSION); }

function sampleExam(){
  const q1={id:"lq1",type:"fill",text:'<p>The hotel dining room has a view of the <span class="ielts-answer-slot" data-slot-id="slot-lq1" data-slot-size="medium" data-slot-label="Answer blank"></span>.</p>',answer:"lake"};
  const q2={id:"lq2",type:"fill",text:'<p>The cost is £ <span class="ielts-answer-slot" data-slot-id="slot-lq2" data-slot-size="short" data-slot-label="Answer blank"></span> including one disk.</p>',answer:"45"};
  const q3={id:"lq3",type:"mc",text:"<p>Which facility is available in the evening?</p>",options:["Library","Swimming pool","Cafeteria"],answer:"Library"};
  return {
    id:"sample-exam-1",name:"IELTS Composer Demonstration",status:"draft",updatedAt:new Date().toISOString(),
    listening:[{title:"Part 1 — Hotel booking",audio:"",questions:[q1,q2,q3],questionGroups:[{
      id:"lg1",label:"<p><strong>Questions 1–3</strong></p><p>Complete the notes below.</p><p>Write <strong>ONE WORD AND/OR A NUMBER</strong> for each answer.</p>",questionIds:[q1.id,q2.id,q3.id],
      contentBlocks:[{id:"block-notes",type:"notes",title:"Hotel information",sections:[{heading:"Rooms",rows:["Dining room overlooks [[blank:medium]]","Breakfast begins at 7:00"]},{heading:"Cost",rows:["Price is £ [[blank:short]] including one disk"]}]}]
    }]}],
    reading:[{title:"Passage 1 — Sustainable campuses",intro:"<p>You should spend about 20 minutes on Questions 1–3.</p>",passage:"<h2>Sustainable campuses</h2><p>Universities are reducing energy use through better building design and student-led projects.</p>",questions:[
      {id:"rq1",type:"tfng",text:"<p>Every university has already reached net-zero emissions.</p>",options:TFNG_OPTIONS,answer:"False"},
      {id:"rq2",type:"mc",text:"<p>What is one method mentioned?</p>",options:["Better building design","Longer holidays","More parking"],answer:"Better building design"}
    ],questionGroups:[{id:"rg1",label:"<p><strong>Questions 1–2</strong></p>",questionIds:["rq1","rq2"],contentBlocks:[{id:"tfng-key",type:"instructionKey",preset:"tfng"}]}]}],
    writing:{task1Prompt:"<p>The chart below shows changes in household internet access.</p>",task1Image:"",task2Prompt:"<p>Some people believe community service should be compulsory in schools. Discuss both views and give your opinion.</p>"}
  };
}

function normalizeQuestion(q={}){
  q.id=q.id||uid("q"); q.type=q.type||"fill"; q.text=q.text||"";
  if(q.type==="tfng"){ q.options=[...TFNG_OPTIONS]; q.answer=TFNG_OPTIONS.includes(q.answer)?q.answer:""; }
  if(q.type==="mc"||q.type==="multi"){
    q.options=Array.isArray(q.options)?q.options.map(String):String(q.options||"").split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean);
    const min=q.type==="multi"?4:3; while(q.options.length<min) q.options.push("");
    if(q.type==="multi") q.answer=Array.isArray(q.answer)?q.answer:[]; else q.answer=String(q.answer||"");
  }
  if(q.type==="fill" && Array.isArray(q.answer)) q.answer=q.answer.filter(Boolean);
  return q;
}
function normalizePart(part={},prefix="p"){
  part.title=part.title||""; part.questions=Array.isArray(part.questions)?part.questions.map(normalizeQuestion):[];
  const ids=new Set(part.questions.map(q=>q.id));
  let groups=Array.isArray(part.questionGroups)?part.questionGroups:[];
  if(!groups.length) groups=[{id:uid(`${prefix}g`),label:part.questionLabel||part.instructions||"",questionIds:part.questions.map(q=>q.id),contentBlocks:[]}];
  const used=new Set();
  groups=groups.map(g=>({id:g.id||uid(`${prefix}g`),label:g.label||"",questionIds:(g.questionIds||[]).filter(id=>ids.has(id)&&!used.has(id)&&(used.add(id),true)),contentBlocks:Array.isArray(g.contentBlocks)?g.contentBlocks:[]}));
  const unassigned=part.questions.map(q=>q.id).filter(id=>!used.has(id)); groups[groups.length-1].questionIds.push(...unassigned);
  part.questionGroups=groups; delete part.questionLabel; delete part.instructions; return part;
}
function normalizeExam(exam){
  const value=clone(exam||sampleExam()); value.id=value.id||uid("exam"); value.name=value.name||"Untitled IELTS Exam";
  value.listening=(value.listening||[]).map((p,i)=>normalizePart(p,`l${i+1}`)); value.reading=(value.reading||[]).map((p,i)=>normalizePart(p,`r${i+1}`)); value.writing=value.writing||{};
  return value;
}

function localRead(key,fallback){ try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback));}catch{return fallback;} }
function localWrite(key,value){ localStorage.setItem(key,JSON.stringify(value)); }
async function getExams(){
  if(db){ try{ const snap=await db.collection("exams").get(); if(!snap.empty){const out={};snap.forEach(doc=>out[doc.id]=normalizeExam(doc.data()));return out;} const seeded=sampleExam(); await db.collection("exams").doc(seeded.id).set(seeded); return {[seeded.id]:seeded}; }catch(err){ console.warn("Firestore unavailable; using local demo storage.",err); } }
  const saved=localRead(LOCAL_EXAMS,{}); if(!Object.keys(saved).length){const s=sampleExam();saved[s.id]=s;localWrite(LOCAL_EXAMS,saved);} return saved;
}
async function getExam(id){ const all=await getExams(); return all[id]?normalizeExam(all[id]):null; }
async function saveExam(exam){ const value=normalizeExam(exam); value.updatedAt=new Date().toISOString(); if(db){ try{await db.collection("exams").doc(value.id).set(value);return value;}catch(err){console.warn("Saved locally because Firestore write failed.",err);} } const all=localRead(LOCAL_EXAMS,{});all[value.id]=value;localWrite(LOCAL_EXAMS,all);return value; }
async function deleteExam(id){ if(db){try{await db.collection("exams").doc(id).delete();return;}catch(err){console.warn(err);}} const all=localRead(LOCAL_EXAMS,{});delete all[id];localWrite(LOCAL_EXAMS,all); }
async function createResult(data){ const id=data.id||uid("result"); const value={...data,id}; if(db){try{await db.collection("results").doc(id).set(value);return value;}catch(err){console.warn(err);}} const all=localRead(LOCAL_RESULTS,{});all[id]=value;localWrite(LOCAL_RESULTS,all);return value; }
async function updateResult(id,patch){ if(db){try{await db.collection("results").doc(id).update(patch);return;}catch(err){console.warn(err);}} const all=localRead(LOCAL_RESULTS,{});all[id]={...(all[id]||{}),...patch};localWrite(LOCAL_RESULTS,all); }
async function getResults(){ if(db){try{const snap=await db.collection("results").orderBy("submittedAt","desc").get();const out={};snap.forEach(doc=>out[doc.id]=doc.data());return out;}catch(err){console.warn(err);}} return localRead(LOCAL_RESULTS,{}); }
function requireAdminAuth(onReady){ if(!auth){onReady?.({uid:"local-admin",email:"local@demo"});return;} auth.onAuthStateChanged(user=>{ if(user)onReady?.(user); else location.href="teacher-login.html"; }); }
function logoutAdmin(){ if(auth)auth.signOut().finally(()=>location.href="index.html"); else location.href="index.html"; }

function questionWeight(q){ if(!q||q.type==="label")return 0; if(q.type==="multi")return Math.max(2,Array.isArray(q.answer)?q.answer.length:0); return 1; }
function scoreSection(parts,answers){ let total=0,correct=0; (parts||[]).forEach(p=>(p.questions||[]).forEach(q=>{const w=questionWeight(q);total+=w;if(!w)return;const given=answers[q.id];if(q.type==="multi"){const key=Array.isArray(q.answer)?q.answer:[];const selected=Array.isArray(given)?given:[];correct+=Math.min(w,selected.filter(v=>key.includes(v)).length);}else{const normalized=String(given||"").trim().toLowerCase();const accepted=Array.isArray(q.answer)?q.answer:[q.answer];if(normalized&&accepted.some(a=>String(a||"").trim().toLowerCase()===normalized))correct++;}}));return{total,correct}; }

function slotInputHtml(question,slotId,size="medium",disabled=false){
  const value=(getSession()?.answers||{})[question.id]||"";
  return `<input class="ielts-inline-answer size-${escapeHtml(size)}" data-question-id="${escapeHtml(question.id)}" data-slot-id="${escapeHtml(slotId)}" value="${escapeHtml(value)}" aria-label="Answer for ${escapeHtml(question.id)}" ${disabled?"disabled":""}>`;
}
function hydrateInlineSlots(html,question,disabled=false){
  const wrap=document.createElement("div");wrap.innerHTML=String(html||"");
  wrap.querySelectorAll(".ielts-answer-slot").forEach((slot,index)=>{const id=slot.dataset.slotId||`${question.id}-${index+1}`;const size=slot.dataset.slotSize||"medium";slot.outerHTML=slotInputHtml(question,id,size,disabled);});
  return wrap.innerHTML;
}
function templateTextToHtml(text,question={id:"preview"},disabled=true){
  const escaped=escapeHtml(text).replace(/\[\[blank:(short|medium|long)\]\]/g,(_,size)=>slotInputHtml(question,uid("slot"),size,disabled));
  return escaped;
}
function renderInstructionKey(block){
  const rows=block.preset==="ynng"?[["YES","agrees with the writer"],["NO","contradicts the writer"],["NOT GIVEN","there is no information"]]:[["TRUE","agrees with the information"],["FALSE","contradicts the information"],["NOT GIVEN","there is no information"]];
  return `<section class="ielts-block instruction-key"><div>${rows.map(([a,b])=>`<p><strong>${a}</strong><span>${b}</span></p>`).join("")}</div></section>`;
}
function renderContentBlock(block,{disabled=true}={}){
  if(!block)return"";
  if(block.type==="notes") return `<section class="ielts-block notes-card"><h3>${escapeHtml(block.title||"Notes")}</h3>${(block.sections||[]).map(s=>`<div class="notes-section"><h4>${escapeHtml(s.heading||"")}</h4><ul>${(s.rows||[]).map(row=>`<li>${templateTextToHtml(row,{id:block.id||"notes"},disabled)}</li>`).join("")}</ul></div>`).join("")}</section>`;
  if(block.type==="optionBank") return `<section class="ielts-block option-bank"><h3>${escapeHtml(block.title||"Options")}</h3><div class="option-bank-grid">${(block.options||[]).map((o,i)=>`<p><strong>${String.fromCharCode(65+i)}</strong><span>${escapeHtml(o)}</span></p>`).join("")}</div></section>`;
  if(block.type==="table") return `<section class="ielts-block table-block">${block.title?`<h3>${escapeHtml(block.title)}</h3>`:""}<div class="table-scroll"><table><tbody>${(block.rows||[]).map((row,r)=>`<tr>${(row||[]).map(cell=>`${r===0&&block.headerRow?"<th>":"<td>"}${templateTextToHtml(cell,{id:block.id||"table"},disabled)}${r===0&&block.headerRow?"</th>":"</td>"}`).join("")}</tr>`).join("")}</tbody></table></div></section>`;
  if(block.type==="flow") return `<section class="ielts-block flow-block">${block.title?`<h3>${escapeHtml(block.title)}</h3>`:""}<div class="flow-list">${(block.steps||[]).map((s,i)=>`<div class="flow-step">${templateTextToHtml(s,{id:block.id||"flow"},disabled)}</div>${i<(block.steps||[]).length-1?'<div class="flow-arrow" aria-hidden="true">↓</div>':""}`).join("")}</div></section>`;
  if(block.type==="instructionKey") return renderInstructionKey(block);
  if(block.type==="image") return `<figure class="ielts-block image-block"><img src="${escapeHtml(block.src||"")}" alt="${escapeHtml(block.alt||"")}">${block.caption?`<figcaption>${escapeHtml(block.caption)}</figcaption>`:""}</figure>`;
  if(block.type==="text") return `<section class="ielts-block text-block">${block.html||""}</section>`;
  return"";
}
function renderQuestion(question,number,{preview=false}={}){
  if(question.type==="label") return `<div class="student-label">${question.text||""}</div>`;
  const html=hydrateInlineSlots(question.text,question,preview); const hasInline=/ielts-inline-answer/.test(html);
  let control="";
  if(question.type==="fill"&&!hasInline) control=slotInputHtml(question,`${question.id}-fallback`,question.blankSize||"medium",preview);
  if(question.type==="mc"||question.type==="tfng") control=`<div class="choice-list">${(question.options||[]).map(o=>`<label><input type="radio" name="${escapeHtml(question.id)}" value="${escapeHtml(o)}" data-question-id="${escapeHtml(question.id)}" ${preview?"disabled":""}><span>${escapeHtml(o)}</span></label>`).join("")}</div>`;
  if(question.type==="multi") control=`<div class="choice-list">${(question.options||[]).map(o=>`<label><input type="checkbox" value="${escapeHtml(o)}" data-question-id="${escapeHtml(question.id)}" ${preview?"disabled":""}><span>${escapeHtml(o)}</span></label>`).join("")}</div>`;
  return `<article class="student-question" data-question-id="${escapeHtml(question.id)}"><div class="question-number">${number}</div><div class="question-content"><div class="question-stem">${html}</div>${control}</div></article>`;
}
