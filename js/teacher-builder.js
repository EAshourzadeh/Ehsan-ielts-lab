document.addEventListener("DOMContentLoaded",()=>requireAdminAuth(initBuilder));

function initBuilder(){
  document.getElementById("btnLogout")?.addEventListener("click",logoutAdmin);
  const state={exam:null,exams:{},activeSection:"listening",activeQuestion:null,quills:new Map(),dirty:false};
  const $=s=>document.querySelector(s); const select=$("#builderExamSelect");

  registerAnswerSlotBlot();
  wireStaticActions();
  load();

  async function load(){
    state.exams=await getExams();
    const requested=new URLSearchParams(location.search).get("exam");
    const first=requested&&state.exams[requested]?requested:Object.keys(state.exams)[0];
    populateExamSelect(first); await chooseExam(first);
  }
  function populateExamSelect(selected){
    select.innerHTML=Object.values(state.exams).map(e=>`<option value="${escapeHtml(e.id)}" ${e.id===selected?"selected":""}>${escapeHtml(e.name)}</option>`).join("");
  }
  async function chooseExam(id){ flushEditors(); state.exam=normalizeExam(state.exams[id]||sampleExam()); state.activeQuestion=null; state.quills.clear(); renderAll(); state.dirty=false; }
  function markDirty(){state.dirty=true;$("#builderSaveMsg").textContent="Unsaved changes";}
  function sectionParts(){return state.exam[state.activeSection]||[];}
  function renderAll(){
    $("#examName").value=state.exam.name||"";
    document.querySelectorAll(".builder-tab").forEach(b=>b.classList.toggle("active",b.dataset.section===state.activeSection));
    document.querySelectorAll(".builder-pane").forEach(p=>p.classList.toggle("active",p.id===`pane-${state.activeSection}`));
    renderSection("listening",$("#listeningPartsList")); renderSection("reading",$("#readingPartsList")); renderWriting(); renderInspector();
  }
  function renderSection(section,root){
    const parts=state.exam[section]||[]; root.innerHTML=parts.map((part,pi)=>partMarkup(section,part,pi)).join("")||`<div class="card" style="padding:1rem"><p class="muted">No ${section} content yet.</p></div>`;
    parts.forEach((part,pi)=>{
      const passage=root.querySelector(`[data-passage-editor="${section}-${pi}"]`); if(passage) mountRichQuill(passage,part.passage||"",html=>part.passage=html,"Paste or write the reading passage…");
      const intro=root.querySelector(`[data-intro-editor="${section}-${pi}"]`); if(intro) mountRichQuill(intro,part.intro||"",html=>part.intro=html,"Reading passage introduction…",true);
      (part.questionGroups||[]).forEach((group,gi)=>{
        const label=root.querySelector(`[data-group-label="${section}-${pi}-${gi}"]`); if(label) mountRichQuill(label,group.label||"",html=>group.label=html,"Questions 1–10…",true);
        group.questionIds.forEach(qid=>{const q=part.questions.find(item=>item.id===qid); const target=root.querySelector(`[data-composer="${qid}"]`); if(q&&target&&state.activeQuestion===qid) mountQuestionQuill(target,q);});
      });
    });
  }
  function partMarkup(section,part,pi){
    return `<section class="part-card card" data-section="${section}" data-part-index="${pi}">
      <div class="part-head"><div><strong>${escapeHtml(part.title||`${section==="listening"?"Part":"Passage"} ${pi+1}`)}</strong><div class="small muted">${(part.questions||[]).reduce((s,q)=>s+questionWeight(q),0)} numbered slots</div></div><div class="toolbar-row"><button class="btn btn-sm" data-action="add-group">+ Group</button><button class="btn btn-sm btn-danger" data-action="remove-part">Remove</button></div></div>
      <div class="part-body stack">
        <div class="field"><label>Title</label><input class="text-input" data-field="part-title" value="${escapeHtml(part.title||"")}"></div>
        ${section==="listening"?`<div class="field"><label>Audio path or URL</label><input class="text-input" data-field="part-audio" value="${escapeHtml(part.audio||"")}" placeholder="assets/audio/part1.mp3"></div>`:`<div class="field"><label>Introduction</label><div class="composer-shell group-label-editor" data-intro-editor="${section}-${pi}"></div></div><div class="field"><label>Passage</label><div class="composer-shell" data-passage-editor="${section}-${pi}"></div></div>`}
        <div>${(part.questionGroups||[]).map((g,gi)=>groupMarkup(section,part,g,pi,gi)).join("")}</div>
      </div></section>`;
  }
  function groupMarkup(section,part,group,pi,gi){
    const questions=group.questionIds.map(id=>part.questions.find(q=>q.id===id)).filter(Boolean);
    return `<section class="group-card" data-group-index="${gi}">
      <div class="group-head"><div><strong>Question group ${gi+1}</strong><span class="small muted"> · ${questions.length} items</span></div><div class="toolbar-row"><button class="btn btn-sm" data-action="preview-group">Student preview</button><button class="btn btn-sm btn-danger" data-action="remove-group">Remove</button></div></div>
      <div class="group-body">
        <label>Group instructions</label><div class="composer-shell group-label-editor" data-group-label="${section}-${pi}-${gi}"></div>
        <div class="inline" style="margin-top:.8rem"><button class="btn btn-sm" data-action="add-block">+ Add IELTS Block</button><span class="small muted">Notes, table, option bank, flow chart, or TFNG key</span></div>
        <div class="group-blocks">${(group.contentBlocks||[]).map((b,bi)=>blockEditorMarkup(b,bi)).join("")}</div>
        <div class="question-list">${questions.map((q,qi)=>questionMarkup(part,q,pi,gi,qi)).join("")}</div>
        <button class="btn btn-sm btn-primary" data-action="add-question">+ Add question</button>
        <div class="preview-panel hidden" data-group-preview></div>
      </div></section>`;
  }
  function questionMarkup(part,q,pi,gi,qi){
    const number=questionNumber(state.activeSection,pi,q.id); const active=state.activeQuestion===q.id; const errors=answerErrors(q); const excerpt=stripHtml(q.text)||"Untitled question";
    return `<article class="question-card ${active?"active":""} ${errors.length?"has-errors":""}" data-question-id="${q.id}">
      <div class="question-summary" data-action="toggle-question"><span class="question-badge">${number}</span><div class="question-summary-text"><strong>${typeLabel(q.type)}</strong><div class="question-excerpt">${escapeHtml(excerpt)}</div></div><span class="status-pill ${errors.length?"":"complete"}">${errors.length?"Needs answer":"Complete ✓"}</span></div>
      <div class="question-editor-panel">
        <div class="inline"><label>Type</label><select class="select-input" data-field="question-type" style="width:auto"><option value="fill" ${q.type==="fill"?"selected":""}>Fill in the blank</option><option value="mc" ${q.type==="mc"?"selected":""}>Multiple choice</option><option value="multi" ${q.type==="multi"?"selected":""}>Choose multiple</option><option value="tfng" ${q.type==="tfng"?"selected":""}>True / False / Not Given</option><option value="label" ${q.type==="label"?"selected":""}>Unnumbered label</option></select><button class="btn btn-sm btn-danger" data-action="remove-question">Delete</button></div>
        <div class="composer-actions" data-actions-for="${q.id}"><button data-format="bold"><b>B</b></button><button data-format="italic"><i>I</i></button><button data-format="underline"><u>U</u></button><button data-format="script" data-value="super">x²</button><button data-action="insert-blank">+ Blank</button><button data-action="symbols">Symbols</button><button data-action="insert-menu">Insert ▾</button><button data-action="preview-question">Preview</button></div>
        <div class="composer-shell" data-composer="${q.id}"></div>
        ${answerEditorMarkup(q)}
        <div class="preview-panel hidden" data-question-preview></div>
      </div></article>`;
  }
  function answerEditorMarkup(q){
    if(q.type==="label")return"";
    if(q.type==="fill"){const answer=Array.isArray(q.answer)?q.answer.join(" | "):q.answer||"";return `<div class="answer-editor"><label>Accepted answer(s)</label><input class="text-input" data-field="fill-answer" value="${escapeHtml(answer)}" placeholder="lake | the lake"><div class="small muted">Separate accepted alternatives with |. Existing questions without an inline token still show a fallback answer field.</div></div>`;}
    if(q.type==="tfng")return `<div class="answer-editor"><label>Correct answer</label><div class="inline">${TFNG_OPTIONS.map(o=>`<label><input type="radio" data-field="single-answer" value="${o}" ${q.answer===o?"checked":""}> ${o}</label>`).join("")}</div></div>`;
    return `<div class="answer-editor"><label>Options and answer key</label>${(q.options||[]).map((o,i)=>`<div class="option-row"><input type="${q.type==="multi"?"checkbox":"radio"}" name="correct-${q.id}" data-field="correct-option" data-option-index="${i}" ${isCorrect(q,o)?"checked":""}><input class="text-input" data-field="option-text" data-option-index="${i}" value="${escapeHtml(o)}" placeholder="Option ${String.fromCharCode(65+i)}"><button class="btn btn-sm" data-action="remove-option" data-option-index="${i}">×</button></div>`).join("")}<button class="btn btn-sm" data-action="add-option">+ Option</button><div class="answer-feedback ${answerErrors(q).length?"":"complete"}">${answerErrors(q).length?answerErrors(q).map(escapeHtml).join(" · "):"✓ Answer key complete"}</div></div>`;
  }
  function blockEditorMarkup(block,bi){
    const head=`<div class="block-editor-head"><strong>${typeLabel(block.type)}</strong><div class="inline"><button class="btn btn-sm" data-action="move-block-up" data-block-index="${bi}">↑</button><button class="btn btn-sm" data-action="move-block-down" data-block-index="${bi}">↓</button><button class="btn btn-sm btn-danger" data-action="remove-block" data-block-index="${bi}">Remove</button></div></div>`;
    if(block.type==="notes")return `<div class="block-editor" data-block-index="${bi}">${head}<div class="block-fields"><input class="text-input" data-block-field="title" value="${escapeHtml(block.title||"")}" placeholder="Notes card title">${(block.sections||[]).map((s,si)=>`<div class="card" style="padding:.7rem"><input class="text-input" data-note-heading="${si}" value="${escapeHtml(s.heading||"")}" placeholder="Section heading"><textarea data-note-rows="${si}" rows="3" placeholder="One row per line. Use [[blank:medium]]">${escapeHtml((s.rows||[]).join("\n"))}</textarea><button class="btn btn-sm btn-danger" data-action="remove-note-section" data-section-index="${si}">Remove section</button></div>`).join("")}<button class="btn btn-sm" data-action="add-note-section">+ Section</button></div></div>`;
    if(block.type==="optionBank")return `<div class="block-editor" data-block-index="${bi}">${head}<div class="block-fields"><input class="text-input" data-block-field="title" value="${escapeHtml(block.title||"")}" placeholder="Option-bank title"><textarea data-block-field="options" rows="5" placeholder="One option per line">${escapeHtml((block.options||[]).join("\n"))}</textarea></div></div>`;
    if(block.type==="flow")return `<div class="block-editor" data-block-index="${bi}">${head}<div class="block-fields"><input class="text-input" data-block-field="title" value="${escapeHtml(block.title||"")}" placeholder="Flow-chart title"><textarea data-block-field="steps" rows="6" placeholder="One step per line; use [[blank:medium]]">${escapeHtml((block.steps||[]).join("\n"))}</textarea></div></div>`;
    if(block.type==="table"){const cols=Math.max(1,...(block.rows||[]).map(r=>r.length));return `<div class="block-editor" data-block-index="${bi}">${head}<div class="block-fields"><input class="text-input" data-block-field="title" value="${escapeHtml(block.title||"")}" placeholder="Table title"><label><input type="checkbox" data-block-field="headerRow" ${block.headerRow?"checked":""}> Header row</label><div class="table-editor-grid">${(block.rows||[]).map((row,ri)=>`<div class="table-editor-row">${Array.from({length:cols},(_,ci)=>`<input class="text-input" data-table-cell="${ri}-${ci}" value="${escapeHtml(row[ci]||"")}" placeholder="Cell">`).join("")}</div>`).join("")}</div><div class="inline"><button class="btn btn-sm" data-action="add-table-row">+ Row</button><button class="btn btn-sm" data-action="add-table-column">+ Column</button></div></div></div>`;}
    if(block.type==="instructionKey")return `<div class="block-editor" data-block-index="${bi}">${head}<label>Preset <select class="select-input" data-block-field="preset"><option value="tfng" ${block.preset!=="ynng"?"selected":""}>True / False / Not Given</option><option value="ynng" ${block.preset==="ynng"?"selected":""}>Yes / No / Not Given</option></select></label></div>`;
    return `<div class="block-editor" data-block-index="${bi}">${head}</div>`;
  }
  function renderWriting(){
    const w=state.exam.writing||(state.exam.writing={}); const t1=$("#writingTask1Prompt"),t2=$("#writingTask2Prompt");
    if(t1&&!t1.dataset.mounted) mountRichQuill(t1,w.task1Prompt||"",html=>w.task1Prompt=html,"Task 1 prompt…");
    else if(t1?.__quillMeta){ t1.__quillMeta.set=html=>w.task1Prompt=html; t1.__quillMeta.quill.root.innerHTML=w.task1Prompt||""; }
    if(t2&&!t2.dataset.mounted) mountRichQuill(t2,w.task2Prompt||"",html=>w.task2Prompt=html,"Task 2 prompt…");
    else if(t2?.__quillMeta){ t2.__quillMeta.set=html=>w.task2Prompt=html; t2.__quillMeta.quill.root.innerHTML=w.task2Prompt||""; }
    $("#writingTask1Image").value=w.task1Image||"";
  }
  function renderInspector(){
    const box=$("#builderInspector"); if(!state.exam){box.innerHTML="";return;} const parts=[...(state.exam.listening||[]),...(state.exam.reading||[])]; const total=parts.reduce((s,p)=>s+(p.questions||[]).reduce((a,q)=>a+questionWeight(q),0),0); const incomplete=parts.flatMap(p=>p.questions||[]).filter(q=>answerErrors(q).length).length;
    box.innerHTML=`<h3 style="margin-top:0">Exam health</h3><p><strong>${total}</strong> numbered answer slots</p><p><strong>${incomplete}</strong> questions need answer-key attention</p><hr style="border:0;border-top:1px solid var(--line)"><p class="small muted">New layouts are stored in <code>group.contentBlocks</code>. Existing <code>group.label</code> and question data remain supported.</p><button class="btn btn-primary" data-action="save" style="width:100%">Save exam</button>`;
  }

  function wireStaticActions(){
    select.addEventListener("change",()=>chooseExam(select.value));
    $("#examName").addEventListener("input",e=>{state.exam.name=e.target.value;markDirty();});
    $("#writingTask1Image").addEventListener("input",e=>{state.exam.writing.task1Image=e.target.value;markDirty();});
    document.querySelectorAll(".builder-tab").forEach(btn=>btn.addEventListener("click",()=>{flushEditors();state.activeSection=btn.dataset.section;renderAll();}));
    $("#btnAddListeningPart").addEventListener("click",()=>addPart("listening")); $("#btnAddReadingPassage").addEventListener("click",()=>addPart("reading"));
    $("#btnSubmitExam").addEventListener("click",save); $("#builderInspector").addEventListener("click",e=>{if(e.target.closest('[data-action="save"]'))save();});
    $("#builderRoot").addEventListener("click",handleClick); $("#builderRoot").addEventListener("input",handleInput); $("#builderRoot").addEventListener("change",handleInput);
    window.addEventListener("beforeunload",e=>{if(state.dirty){e.preventDefault();e.returnValue="";}});
  }
  function contextFrom(el){const partEl=el.closest("[data-part-index]");const groupEl=el.closest("[data-group-index]");const qEl=el.closest("[data-question-id]");const section=partEl?.dataset.section;const pi=Number(partEl?.dataset.partIndex);const gi=Number(groupEl?.dataset.groupIndex);const part=state.exam?.[section]?.[pi];const group=part?.questionGroups?.[gi];const question=qEl?part?.questions?.find(q=>q.id===qEl.dataset.questionId):null;return{section,pi,gi,part,group,question,qEl,groupEl,partEl};}
  function handleClick(e){
    const button=e.target.closest("button,[data-action]"); if(!button)return; const action=button.dataset.action; const format=button.dataset.format; if(!action&&!format)return; const c=contextFrom(button);
    if(format&&c.question){const q=state.quills.get(c.question.id);if(q){const current=q.getFormat();q.format(format,button.dataset.value||!current[format]);}return;}
    if(action==="toggle-question"){flushEditors();state.activeQuestion=state.activeQuestion===c.question.id?null:c.question.id;renderAll();return;}
    if(action==="remove-part"){if(confirm("Remove this part and all of its questions?")){state.exam[c.section].splice(c.pi,1);markDirty();renderAll();}return;}
    if(action==="add-group"){c.part.questionGroups.push({id:uid("group"),label:"",questionIds:[],contentBlocks:[]});markDirty();renderAll();return;}
    if(action==="remove-group"){if(c.part.questionGroups.length===1)return alert("Each part needs at least one question group."); if(confirm("Remove this group? Its questions will move to the previous group.")){const removed=c.part.questionGroups.splice(c.gi,1)[0];c.part.questionGroups[Math.max(0,c.gi-1)].questionIds.push(...removed.questionIds);markDirty();renderAll();}return;}
    if(action==="add-question"){const q=normalizeQuestion({id:uid("q"),type:"fill",text:"",answer:""});c.part.questions.push(q);c.group.questionIds.push(q.id);state.activeQuestion=q.id;markDirty();renderAll();return;}
    if(action==="remove-question"){if(confirm("Delete this question?")){c.part.questions=c.part.questions.filter(q=>q.id!==c.question.id);c.part.questionGroups.forEach(g=>g.questionIds=g.questionIds.filter(id=>id!==c.question.id));state.activeQuestion=null;markDirty();renderAll();}return;}
    if(action==="add-option"){c.question.options.push("");markDirty();renderAll();return;}
    if(action==="remove-option"){const i=Number(button.dataset.optionIndex);const old=c.question.options[i];c.question.options.splice(i,1);if(c.question.type==="multi")c.question.answer=(c.question.answer||[]).filter(a=>a!==old);else if(c.question.answer===old)c.question.answer="";markDirty();renderAll();return;}
    if(action==="insert-blank"){showBlankMenu(button,c.question);return;} if(action==="symbols"){showSymbols(button,c.question);return;} if(action==="insert-menu"){showInsertMenu(button,c.question);return;}
    if(action==="preview-question"){const panel=c.qEl.querySelector("[data-question-preview]");panel.classList.toggle("hidden");panel.innerHTML=renderQuestion(c.question,questionNumber(c.section,c.pi,c.question.id),{preview:true});return;}
    if(action==="preview-group"){const panel=c.groupEl.querySelector("[data-group-preview]");panel.classList.toggle("hidden");panel.innerHTML=groupPreview(c);return;}
    if(action==="add-block"){showBlockMenu(button,c);return;}
    if(action==="remove-block"){c.group.contentBlocks.splice(Number(button.dataset.blockIndex),1);markDirty();renderAll();return;}
    if(action==="move-block-up"||action==="move-block-down"){const i=Number(button.dataset.blockIndex),j=action.endsWith("up")?i-1:i+1;if(j>=0&&j<c.group.contentBlocks.length){[c.group.contentBlocks[i],c.group.contentBlocks[j]]=[c.group.contentBlocks[j],c.group.contentBlocks[i]];markDirty();renderAll();}return;}
    if(action==="add-note-section"){const b=c.group.contentBlocks[Number(button.closest("[data-block-index]").dataset.blockIndex)];b.sections.push({heading:"",rows:[""]});markDirty();renderAll();return;}
    if(action==="remove-note-section"){const b=c.group.contentBlocks[Number(button.closest("[data-block-index]").dataset.blockIndex)];b.sections.splice(Number(button.dataset.sectionIndex),1);markDirty();renderAll();return;}
    if(action==="add-table-row"||action==="add-table-column"){const b=c.group.contentBlocks[Number(button.closest("[data-block-index]").dataset.blockIndex)];const cols=Math.max(1,...b.rows.map(r=>r.length));if(action.endsWith("row"))b.rows.push(Array(cols).fill(""));else b.rows.forEach(r=>r.push(""));markDirty();renderAll();return;}
  }
  function handleInput(e){
    const c=contextFrom(e.target); if(!c.part)return; const f=e.target.dataset.field;
    if(f==="part-title")c.part.title=e.target.value;if(f==="part-audio")c.part.audio=e.target.value;
    if(f==="question-type"){const type=e.target.value;c.question.type=type;if(type==="tfng"){c.question.options=[...TFNG_OPTIONS];c.question.answer="";}else if(type==="mc"||type==="multi"){c.question.options=["","",""];if(type==="multi")c.question.options.push("");c.question.answer=type==="multi"?[]:"";}else{delete c.question.options;c.question.answer="";}markDirty();renderAll();return;}
    if(f==="fill-answer")c.question.answer=e.target.value.split("|").map(s=>s.trim()).filter(Boolean); if(f==="single-answer")c.question.answer=e.target.value;
    if(f==="option-text"){const i=Number(e.target.dataset.optionIndex),old=c.question.options[i];c.question.options[i]=e.target.value;if(c.question.type==="multi")c.question.answer=(c.question.answer||[]).map(a=>a===old?e.target.value:a);else if(c.question.answer===old)c.question.answer=e.target.value;}
    if(f==="correct-option"){const i=Number(e.target.dataset.optionIndex),value=c.question.options[i];if(c.question.type==="multi"){const set=new Set(c.question.answer||[]);e.target.checked?set.add(value):set.delete(value);c.question.answer=[...set].filter(Boolean);}else c.question.answer=e.target.checked?value:"";}
    const blockEl=e.target.closest("[data-block-index]"); if(blockEl&&c.group){const b=c.group.contentBlocks[Number(blockEl.dataset.blockIndex)],bf=e.target.dataset.blockField;if(bf){if(["options","steps"].includes(bf))b[bf]=e.target.value.split(/\r?\n/);else if(bf==="headerRow")b[bf]=e.target.checked;else b[bf]=e.target.value;}if(e.target.dataset.noteHeading!==undefined)b.sections[Number(e.target.dataset.noteHeading)].heading=e.target.value;if(e.target.dataset.noteRows!==undefined)b.sections[Number(e.target.dataset.noteRows)].rows=e.target.value.split(/\r?\n/);if(e.target.dataset.tableCell){const[ri,ci]=e.target.dataset.tableCell.split("-").map(Number);b.rows[ri][ci]=e.target.value;}}
    markDirty();renderInspector();
  }
  function addPart(section){const q=normalizeQuestion({id:uid("q"),type:"fill",text:"",answer:""});const p=normalizePart({title:"",audio:"",passage:"",intro:"",questions:[q],questionGroups:[{id:uid("group"),label:"",questionIds:[q.id],contentBlocks:[]}]});state.exam[section].push(p);state.activeSection=section;state.activeQuestion=q.id;markDirty();renderAll();}
  async function save(){flushEditors();const errors=allAnswerErrors();if(errors.length&&!confirm(`${errors.length} answer-key issue(s) remain. Save the draft anyway?`))return;state.exam.name=$("#examName").value.trim()||"Untitled IELTS Exam";state.exam.writing.task1Image=$("#writingTask1Image").value.trim();const saved=await saveExam(state.exam);state.exams[saved.id]=saved;state.exam=saved;populateExamSelect(saved.id);state.dirty=false;$("#builderSaveMsg").textContent="Saved ✓";renderInspector();setTimeout(()=>$("#builderSaveMsg").textContent="",1800);}
  function flushEditors(){state.quills.forEach((q,id)=>{const found=findQuestion(id);if(found)found.text=cleanHtml(q.root.innerHTML);});state.quills.clear();document.querySelectorAll("[data-quill-key]").forEach(el=>{const meta=el.__quillMeta;if(meta)meta.set(cleanHtml(meta.quill.root.innerHTML));});}
  function findQuestion(id){for(const s of["listening","reading"])for(const p of state.exam[s]||[]){const q=(p.questions||[]).find(x=>x.id===id);if(q)return q;}return null;}
  function mountRichQuill(el,html,set,placeholder,compact=false){if(el.dataset.mounted)return;el.dataset.mounted="1";const quill=new Quill(el,{theme:"snow",placeholder,modules:{toolbar:compact?[["bold","italic","underline"],[{list:"ordered"},{list:"bullet"}],["clean"]]:[[{header:[2,3,false]}],["bold","italic","underline"],[{script:"sub"},{script:"super"}],[{list:"ordered"},{list:"bullet"}],["blockquote","link","image"],["clean"]],clipboard:{matchVisual:false}}});quill.root.innerHTML=html||"";installPasteCleaner(quill);quill.on("text-change",debounce(()=>{el.__quillMeta?.set(cleanHtml(quill.root.innerHTML));markDirty();},200));el.__quillMeta={quill,set};el.dataset.quillKey=uid("rich");}
  function mountQuestionQuill(el,question){if(state.quills.has(question.id))return;const quill=new Quill(el,{theme:"bubble",placeholder:"Write the student-facing question. Type /blank for an inline answer.",formats:["bold","italic","underline","script","link","list","answerSlot"],modules:{toolbar:false,clipboard:{matchVisual:false},keyboard:{bindings:{slash:{key:"/",handler(range){setTimeout(()=>maybeSlashMenu(quill,question,range.index),0);return true;}}}}}});quill.root.innerHTML=question.text||"";installPasteCleaner(quill);quill.on("text-change",debounce(()=>{question.text=cleanHtml(quill.root.innerHTML);markDirty();const summary=el.closest(".question-card")?.querySelector(".question-excerpt");if(summary)summary.textContent=stripHtml(question.text)||"Untitled question";},180));state.quills.set(question.id,quill);}
  function installPasteCleaner(quill){quill.clipboard.addMatcher(Node.ELEMENT_NODE,(node,delta)=>{delta.ops=(delta.ops||[]).map(op=>{if(op.attributes){const keep={};["bold","italic","underline","list","script","link","header","blockquote","image"].forEach(k=>{if(op.attributes[k]!==undefined)keep[k]=op.attributes[k];});op.attributes=keep;}return op;});return delta;});quill.root.addEventListener("paste",()=>showToast("Formatting cleaned from pasted content"));}
  function cleanHtml(html){const box=document.createElement("div");box.innerHTML=html||"";box.querySelectorAll("script,style,iframe,video").forEach(n=>n.remove());box.querySelectorAll("*").forEach(n=>{[...n.attributes].forEach(a=>{if(!["href","src","alt","class","data-list","target","rel","data-slot-id","data-slot-size","data-slot-label"].includes(a.name))n.removeAttribute(a.name);});if(n.hasAttribute("class")&&!n.classList.contains("ielts-answer-slot")&&![...n.classList].every(c=>c.startsWith("ql-")))n.removeAttribute("class");});return box.innerHTML==="<p><br></p>"?"":box.innerHTML;}
  function insertBlank(question,size){const quill=state.quills.get(question.id);if(!quill)return;const range=quill.getSelection(true)||{index:Math.max(0,quill.getLength()-1)};quill.insertEmbed(range.index,"answerSlot",{id:uid("slot"),size,label:"Answer blank"},"user");quill.insertText(range.index+1," ","user");quill.setSelection(range.index+2,0,"silent");}
  function showBlankMenu(anchor,q){popover(anchor,[...["short","medium","long"].map(size=>({label:`${size[0].toUpperCase()+size.slice(1)} blank`,run:()=>insertBlank(q,size)}))]);}
  function showSymbols(anchor,q){const symbols=["£","$","€","%","°","×","÷","→","–","±","≤","≥","²","³"];popover(anchor,symbols.map(s=>({label:s,run:()=>{const quill=state.quills.get(q.id);const r=quill?.getSelection(true);if(quill&&r)quill.insertText(r.index,s,"user");}})),"symbol-popover");}
  function showInsertMenu(anchor,q){popover(anchor,[{label:"Answer blank",run:()=>insertBlank(q,"medium")},{label:"Bullet list",run:()=>state.quills.get(q.id)?.format("list","bullet")},{label:"Numbered list",run:()=>state.quills.get(q.id)?.format("list","ordered")},{label:"Link",run:()=>{const url=prompt("Link URL");if(url)state.quills.get(q.id)?.format("link",url);}},{label:"Clear formatting",run:()=>{const quill=state.quills.get(q.id),r=quill?.getSelection();if(quill&&r)quill.removeFormat(r.index,r.length,"user");}}]);}
  function maybeSlashMenu(quill,q,index){const text=quill.getText(Math.max(0,index-12),12);const match=text.match(/\/(blank|symbols)$/);if(!match)return;const start=index-match[0].length;quill.deleteText(start,match[0].length,"silent");if(match[1]==="blank")insertBlank(q,"medium");else showToast("Use the Symbols button to insert a character.");}
  function showBlockMenu(anchor,c){popover(anchor,[{label:"Notes card",run:()=>addBlock(c,"notes")},{label:"Table",run:()=>addBlock(c,"table")},{label:"Option bank",run:()=>addBlock(c,"optionBank")},{label:"Flow chart",run:()=>addBlock(c,"flow")},{label:"TFNG instruction key",run:()=>addBlock(c,"instructionKey")}]);}
  function addBlock(c,type){const presets={notes:{id:uid("block"),type,title:"Notes",sections:[{heading:"Heading",rows:["Add a note with [[blank:medium]]"]}]},table:{id:uid("block"),type,title:"Table",headerRow:true,rows:[["Heading 1","Heading 2"],["Item","[[blank:medium]]"]]},optionBank:{id:uid("block"),type,title:"Options",options:["First option","Second option","Third option"]},flow:{id:uid("block"),type,title:"Process",steps:["First step","Step with [[blank:medium]]","Final step"]},instructionKey:{id:uid("block"),type,preset:"tfng"}};c.group.contentBlocks.push(presets[type]);markDirty();renderAll();}
  function popover(anchor,items,className="insert-popover"){document.querySelectorAll(".symbol-popover,.insert-popover").forEach(n=>n.remove());const pop=document.createElement("div");pop.className=className;items.forEach(item=>{const b=document.createElement("button");b.textContent=item.label;b.onclick=()=>{item.run();pop.remove();};pop.appendChild(b);});document.body.appendChild(pop);const r=anchor.getBoundingClientRect();pop.style.left=`${Math.min(innerWidth-pop.offsetWidth-12,r.left)}px`;pop.style.top=`${r.bottom+scrollY+6}px`;setTimeout(()=>document.addEventListener("click",ev=>{if(!pop.contains(ev.target)&&ev.target!==anchor)pop.remove();},{once:true}),0);}
  function groupPreview(c){let n=questionNumber(c.section,c.pi,c.group.questionIds[0]);return `<div class="student-group"><div class="student-group-label">${c.group.label||""}</div>${(c.group.contentBlocks||[]).map(b=>renderContentBlock(b,{disabled:true})).join("")}${c.group.questionIds.map(id=>{const q=c.part.questions.find(x=>x.id===id);if(!q)return"";const html=renderQuestion(q,n,{preview:true});n+=questionWeight(q);return html;}).join("")}</div>`;}
  function questionNumber(section,pi,qid){let n=1;const parts=state.exam[section]||[];for(let p=0;p<parts.length;p++){for(const q of parts[p].questions||[]){if(p===pi&&q.id===qid)return n;n+=questionWeight(q);}}return n;}
  function typeLabel(type){return({fill:"Fill in the blank",mc:"Multiple choice",multi:"Choose multiple",tfng:"True / False / Not Given",label:"Instruction label",notes:"Notes card",optionBank:"Option bank",table:"Table",flow:"Flow chart",instructionKey:"Instruction key"})[type]||type;}
  function isCorrect(q,o){return q.type==="multi"?(q.answer||[]).includes(o):q.answer===o;}
  function answerErrors(q){if(q.type==="label")return[];if(q.type==="fill")return(Array.isArray(q.answer)?q.answer.length:String(q.answer||"").trim())?[]:["Add an accepted answer."];if(q.type==="tfng")return TFNG_OPTIONS.includes(q.answer)?[]:["Select the correct answer."];const options=(q.options||[]).filter(o=>String(o).trim());const errors=[];if(options.length<(q.type==="multi"?3:2))errors.push("Add enough options.");if((q.options||[]).some(o=>!String(o).trim()))errors.push("Complete or remove blank options.");if(q.type==="multi"?(q.answer||[]).length<2:!q.answer)errors.push("Select the correct answer.");return errors;}
  function allAnswerErrors(){return[...(state.exam.listening||[]),...(state.exam.reading||[])].flatMap(p=>(p.questions||[]).flatMap(q=>answerErrors(q)));}
  function showToast(text){const t=document.createElement("div");t.className="paste-toast";t.textContent=text;document.body.appendChild(t);setTimeout(()=>t.remove(),1800);}
}

function registerAnswerSlotBlot(){
  if(typeof Quill==="undefined"||Quill.imports?.formats?.answerSlot)return;
  const Embed=Quill.import("blots/embed");
  class AnswerSlotBlot extends Embed{
    static create(value={}){const node=super.create();node.setAttribute("contenteditable","false");node.dataset.slotId=value.id||uid("slot");node.dataset.slotSize=value.size||"medium";node.dataset.slotLabel=value.label||"Answer blank";node.textContent=value.label||"Answer blank";return node;}
    static value(node){return{id:node.dataset.slotId,size:node.dataset.slotSize,label:node.dataset.slotLabel};}
  }
  AnswerSlotBlot.blotName="answerSlot";AnswerSlotBlot.tagName="SPAN";AnswerSlotBlot.className="ielts-answer-slot";Quill.register(AnswerSlotBlot,true);
}
