document.addEventListener("DOMContentLoaded", () => requireAdminAuth(initComposer));

function initComposer() {
  document.getElementById("btnLogout").addEventListener("click", logoutAdmin);
  registerAnswerSlotBlot();

  const $ = selector => document.querySelector(selector);
  const state = {
    exam: null,
    exams: {},
    activeSection: "listening",   // "listening" | "reading" | "writing"
    activeQuestionId: null,       // which question is expanded in the composer
    stemQuills: new Map(),        // questionId -> Quill (bubble mode, question stem)
    groupLabelQuills: new Map(),  // groupId -> Quill (snow mode, group instructions)
    passageQuills: new Map(),     // partIndex -> Quill (snow mode, reading passage)
    introQuills: new Map(),       // partIndex -> Quill (snow mode, reading intro/timing note)
    task1Quill: null,
    task2Quill: null,
    hasUnsavedChanges: false
  };

  const RICH_TOOLBAR = [
    [{ header: [2, 3, false] }],
    ["bold", "italic", "underline"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["blockquote"],
    ["clean"]
  ];

  wireStaticActions();
  load();

  /* ---------- Loading & exam switching ---------- */
  async function load() {
    state.exams = await getExams();
    const requested = new URLSearchParams(location.search).get("exam");
    const firstId = (requested && state.exams[requested]) ? requested : Object.keys(state.exams)[0];
    populateExamSelect(firstId);
    chooseExam(firstId);
  }

  function populateExamSelect(selectedId) {
    $("#builderExamSelect").innerHTML = Object.values(state.exams)
      .map(exam => `<option value="${escapeAttribute(exam.id)}" ${exam.id === selectedId ? "selected" : ""}>${escapeHtml(exam.name)}</option>`)
      .join("");
  }

  function chooseExam(id) {
    if (state.hasUnsavedChanges && !confirm("Discard unsaved changes for this exam?")) {
      $("#builderExamSelect").value = state.exam.id;
      return;
    }
    flushAllEditors();
    disposeAllQuills();
    state.exam = normalizeExam(state.exams[id]);
    state.activeQuestionId = null;
    state.hasUnsavedChanges = false;
    renderAll();
  }

  function markDirty() {
    state.hasUnsavedChanges = true;
    $("#builderSaveMsg").textContent = "Unsaved changes";
  }

  /* ---------- Data model helpers (kept compatible with scoring/grading/student pages) ---------- */
  function normalizeQuestion(question = {}) {
    question.id = question.id || makeId("q");
    question.type = question.type || "fill";
    question.text = question.text || "";
    if (question.type === "tfng") {
      question.options = ["True", "False", "Not Given"];
      question.answer = ["True", "False", "Not Given"].includes(question.answer) ? question.answer : "";
    } else if (question.type === "mc" || question.type === "multi") {
      question.options = Array.isArray(question.options) ? question.options.map(String) : [];
      while (question.options.length < (question.type === "multi" ? 4 : 3)) question.options.push("");
      question.answer = question.type === "multi" ? (Array.isArray(question.answer) ? question.answer : []) : (question.answer || "");
    } else if (question.type === "label") {
      delete question.options;
      question.answer = "";
    } else {
      // fill
      delete question.options;
      if (!Array.isArray(question.answer)) question.answer = question.answer || "";
      if (Array.isArray(question.blankAnswers)) {
        question.blankAnswers = question.blankAnswers.map(key => Array.isArray(key) ? key.filter(Boolean) : (key || ""));
      }
    }
    return question;
  }

  function normalizePart(part = {}, prefix = "p") {
    part.title = part.title || "";
    part.audio = part.audio || "";
    part.passage = part.passage || "";
    part.intro = part.intro || "";
    part.questions = Array.isArray(part.questions) ? part.questions.map(normalizeQuestion) : [];
    const knownIds = new Set(part.questions.map(question => question.id));
    let groups = Array.isArray(part.questionGroups) ? part.questionGroups : [];
    if (!groups.length) {
      groups = [{ id: makeId(`${prefix}g`), label: "", questionIds: part.questions.map(question => question.id), contentBlocks: [] }];
    }
    const used = new Set();
    groups = groups.map(group => ({
      id: group.id || makeId(`${prefix}g`),
      label: group.label || "",
      contentBlocks: Array.isArray(group.contentBlocks) ? group.contentBlocks : [],
      questionIds: (group.questionIds || []).filter(id => {
        if (!knownIds.has(id) || used.has(id)) return false;
        used.add(id);
        return true;
      })
    }));
    const unassigned = part.questions.map(question => question.id).filter(id => !used.has(id));
    if (unassigned.length) groups[groups.length - 1].questionIds.push(...unassigned);
    part.questionGroups = groups;
    return part;
  }

  function normalizeExam(exam) {
    const value = JSON.parse(JSON.stringify(exam || {}));
    value.id = value.id || makeId("exam");
    value.name = value.name || "Untitled IELTS Exam";
    value.listening = (value.listening || []).map((part, index) => normalizePart(part, `l${index + 1}`));
    value.reading = (value.reading || []).map((part, index) => normalizePart(part, `r${index + 1}`));
    value.writing = value.writing || { task1Prompt: "", task1Image: "", task2Prompt: "" };
    return value;
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function findQuestion(questionId) {
    for (const section of ["listening", "reading"]) {
      for (const part of state.exam[section] || []) {
        const found = (part.questions || []).find(question => question.id === questionId);
        if (found) return { question: found, part, section };
      }
    }
    return null;
  }

  function questionWeightLocal(question) {
    if (!question || question.type === "label") return 0;
    if (question.type === "fill" && Array.isArray(question.blankAnswers) && question.blankAnswers.length) return question.blankAnswers.length;
    if (question.type === "multi") {
      const count = Array.isArray(question.answer) ? question.answer.length : 0;
      return count > 0 ? count : 2;
    }
    return 1;
  }

  function questionNumber(section, partIndex, questionId) {
    let count = 1;
    const parts = state.exam[section] || [];
    for (let p = 0; p < parts.length; p += 1) {
      for (const question of orderedQuestions(parts[p])) {
        if (p === partIndex && question.id === questionId) return count;
        count += questionWeightLocal(question);
      }
    }
    return count;
  }

  function orderedQuestions(part) {
    const byId = new Map((part.questions || []).map(question => [question.id, question]));
    const seen = new Set();
    const ordered = [];
    (part.questionGroups || []).forEach(group => (group.questionIds || []).forEach(id => {
      if (byId.has(id) && !seen.has(id)) {
        ordered.push(byId.get(id));
        seen.add(id);
      }
    }));
    (part.questions || []).forEach(question => {
      if (!seen.has(question.id)) ordered.push(question);
    });
    return ordered;
  }

  function syncQuestionOrder(part) {
    part.questions = orderedQuestions(part);
  }

  function answerErrors(question) {
    if (question.type === "label") return [];
    if (question.type === "fill") {
      const keys = Array.isArray(question.blankAnswers) && question.blankAnswers.length ? question.blankAnswers : [question.answer];
      return keys.every(key => Array.isArray(key) ? key.some(Boolean) : String(key || "").trim()) ? [] : ["Add an accepted answer for every blank."];
    }
    if (question.type === "tfng") return question.answer ? [] : ["Select the correct answer."];
    const options = (question.options || []).filter(option => String(option).trim());
    const errors = [];
    if (options.length < (question.type === "multi" ? 3 : 2)) errors.push("Add more options.");
    if ((question.options || []).some(option => !String(option).trim())) errors.push("Complete or remove blank options.");
    if (question.type === "multi" ? (question.answer || []).length < 2 : !question.answer) errors.push("Select the correct answer(s).");
    return errors;
  }

  function allAnswerErrors() {
    return [...(state.exam.listening || []), ...(state.exam.reading || [])]
      .flatMap(part => (part.questions || []).flatMap(answerErrors));
  }

  function typeLabel(type) {
    return {
      fill: "Fill in the blank", mc: "Multiple choice", multi: "Multiple answer", tfng: "True / False / Not Given",
      label: "Label / text block", notes: "Notes card", table: "Table", optionBank: "Option bank",
      flow: "Flow chart", instructionKey: "Instruction key"
    }[type] || type;
  }

  /* ---------- Rendering ---------- */
  function renderAll() {
    disposeAllQuills();
    $("#examName").value = state.exam.name || "";
    document.querySelectorAll(".builder-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.section === state.activeSection));
    document.querySelectorAll(".builder-pane").forEach(pane => pane.classList.toggle("active", pane.id === `pane-${state.activeSection}`));
    renderSection("listening", $("#listeningPartsList"));
    renderSection("reading", $("#readingPartsList"));
    renderWriting();
    renderInspector();
  }

  function renderSection(section, root) {
    const parts = state.exam[section] || [];
    root.innerHTML = parts.map((part, partIndex) => partMarkup(section, part, partIndex)).join("")
      || `<p class="muted small">No ${section} content yet — use the button below to add one.</p>`;

    parts.forEach((part, partIndex) => {
      if (section === "reading") {
        const introEl = root.querySelector(`[data-intro-editor="${partIndex}"]`);
        if (introEl) mountSnowEditor(introEl, part.intro, html => { part.intro = html; markDirty(); }, "Reading passage introduction or timing note (optional)…", true, state.introQuills, partIndex);
        const passageEl = root.querySelector(`[data-passage-editor="${partIndex}"]`);
        if (passageEl) mountSnowEditor(passageEl, part.passage, html => { part.passage = html; markDirty(); }, "Paste or write the reading passage…", false, state.passageQuills, partIndex);
      }
      (part.questionGroups || []).forEach(group => {
        const labelEl = root.querySelector(`[data-group-label="${group.id}"]`);
        if (labelEl) mountSnowEditor(labelEl, group.label, html => { group.label = html; markDirty(); }, "Questions 1–10 — Complete the notes below. Write ONE WORD for each answer.", true, state.groupLabelQuills, group.id);

        group.questionIds.forEach(questionId => {
          if (state.activeQuestionId !== questionId) return;
          const question = part.questions.find(item => item.id === questionId);
          const stemEl = root.querySelector(`[data-stem-editor="${questionId}"]`);
          if (question && stemEl) mountStemEditor(stemEl, question);
        });
      });
    });
  }

  function partMarkup(section, part, partIndex) {
    const slotCount = (part.questions || []).reduce((sum, question) => sum + questionWeightLocal(question), 0);
    return `<section class="part-card card" data-section="${section}" data-part-index="${partIndex}">
      <div class="part-head">
        <div><strong>${escapeHtml(part.title || `${section === "listening" ? "Part" : "Passage"} ${partIndex + 1}`)}</strong>
        <div class="muted small">${slotCount} numbered question${slotCount === 1 ? "" : "s"}</div></div>
        <div class="toolbar-row">
          <button class="btn btn-ghost btn-sm" type="button" data-action="add-group">+ Group</button>
          <button class="btn btn-danger btn-sm" type="button" data-action="remove-part">Remove</button>
        </div>
      </div>
      <div class="part-body">
        <label class="builder-field-label">Title</label>
        <input class="text-input" data-field="part-title" value="${escapeAttribute(part.title)}">
        ${section === "listening"
          ? `<label class="builder-field-label">MP3 filename/path (place file in assets/audio/)</label>
             <input class="text-input" data-field="part-audio" value="${escapeAttribute(part.audio)}" placeholder="assets/audio/part1.mp3">`
          : `<label class="builder-field-label">Introduction / timing note (optional)</label>
             <div class="rich-editor compact-rich-editor" data-intro-editor="${partIndex}"></div>
             <label class="builder-field-label">Passage text</label>
             <div class="rich-editor passage-rich-editor" data-passage-editor="${partIndex}"></div>`}
        <div class="question-groups-wrap">${(part.questionGroups || []).map(group => groupMarkup(section, part, group, partIndex)).join("")}</div>
      </div>
    </section>`;
  }

  function groupMarkup(section, part, group, partIndex) {
    const consumedByBlocks = contentBlocksConsumedIds(group.contentBlocks);
    const questions = group.questionIds
      .map(id => part.questions.find(question => question.id === id))
      .filter(question => question && !consumedByBlocks.has(question.id));
    const rangeText = questionRangeText(section, partIndex, group);
    return `<section class="question-group-editor-card enhanced-builder-card" data-group-id="${group.id}">
      <div class="group-card-head">
        <div><strong>${escapeHtml(rangeText)}</strong></div>
        <div class="toolbar-row">
          <button class="btn btn-ghost btn-sm" type="button" data-action="remove-group">Remove group</button>
        </div>
      </div>
      <label class="builder-field-label">Group instructions</label>
      <p class="builder-help small muted">Shown once above these questions — e.g. "Complete the notes below. Write ONE WORD AND/OR A NUMBER for each answer."</p>
      <div class="rich-editor question-label-editor" data-group-label="${group.id}"></div>

      <div class="content-blocks-wrap">${(group.contentBlocks || []).map((block, blockIndex) => blockEditorMarkup(part, group, block, blockIndex)).join("")}</div>
      <div class="builder-add-row">
        <button class="btn btn-ghost btn-sm" type="button" data-action="add-block" data-block-type="notes">+ Notes Card</button>
        <button class="btn btn-ghost btn-sm" type="button" data-action="add-block" data-block-type="table">+ Table</button>
        <button class="btn btn-ghost btn-sm" type="button" data-action="add-block" data-block-type="optionBank">+ Option Bank</button>
        <button class="btn btn-ghost btn-sm" type="button" data-action="add-block" data-block-type="flow">+ Flow Chart</button>
        <button class="btn btn-ghost btn-sm" type="button" data-action="add-block" data-block-type="instructionKey">+ T/F/NG Key</button>
      </div>

      <div class="question-list">${questions.map((question, questionIndex) => questionCardMarkup(section, part, group, question, partIndex, questionIndex, questions.length)).join("")}</div>
      <div class="builder-add-row">
        <button class="btn btn-primary btn-sm" type="button" data-action="add-question">+ Add Question</button>
        <button class="btn btn-ghost btn-sm" type="button" data-action="add-label">+ Add Label / Text Block</button>
      </div>
    </section>`;
  }

  function questionRangeText(section, partIndex, group) {
    const part = state.exam[section][partIndex];
    const indexById = new Map((part.questions || []).map((question, index) => [question.id, index]));
    const numbers = [];
    (group.questionIds || []).forEach(id => {
      if (!indexById.has(id)) return;
      const question = part.questions[indexById.get(id)];
      const weight = questionWeightLocal(question);
      if (weight <= 0) return;
      const start = questionNumber(section, partIndex, id);
      for (let offset = 0; offset < weight; offset += 1) numbers.push(start + offset);
    });
    if (!numbers.length) return "No questions yet";
    if (numbers.length === 1) return `Question ${numbers[0]}`;
    const first = numbers[0], last = numbers[numbers.length - 1];
    if (numbers.length === 2 && last === first + 1) return `Questions ${first} and ${last}`;
    return `Questions ${first} - ${last}`;
  }

  function questionCardMarkup(section, part, group, question, partIndex, questionIndex, groupSize) {
    const isActive = state.activeQuestionId === question.id;
    const errors = answerErrors(question);
    const excerpt = stripHtml(question.text) || "Untitled";
    const isLabel = question.type === "label";
    const number = isLabel ? "—" : questionNumber(section, partIndex, question.id);
    return `<article class="question-card ${isActive ? "active" : ""} ${errors.length ? "has-errors" : ""}" data-question-id="${question.id}">
      <div class="question-summary" data-action="toggle-question">
        <span class="question-badge">${number}</span>
        <div class="question-summary-text"><strong>${typeLabel(question.type)}</strong><div class="question-excerpt">${escapeHtml(excerpt)}</div></div>
        ${isLabel ? "" : `<span class="status-pill ${errors.length ? "" : "complete"}">${errors.length ? "Needs answer" : "Complete ✓"}</span>`}
        <div class="row-actions">
          <button class="btn btn-ghost btn-sm row-move" type="button" data-action="move-question-up" ${questionIndex === 0 ? "disabled" : ""} title="Move up">&uarr;</button>
          <button class="btn btn-ghost btn-sm row-move" type="button" data-action="move-question-down" ${questionIndex === groupSize - 1 ? "disabled" : ""} title="Move down">&darr;</button>
        </div>
      </div>
      ${isActive ? questionEditorPanel(section, part, group, question) : ""}
    </article>`;
  }

  function questionEditorPanel(section, part, group, question) {
    const isLabel = question.type === "label";
    return `<div class="question-editor-panel">
      <div class="inline-row">
        <select class="select-input" data-field="question-type" style="width:auto">
          <option value="fill" ${question.type === "fill" ? "selected" : ""}>Fill in the blank</option>
          <option value="mc" ${question.type === "mc" ? "selected" : ""}>Multiple choice (one answer)</option>
          <option value="multi" ${question.type === "multi" ? "selected" : ""}>Multiple answer (select several)</option>
          <option value="tfng" ${question.type === "tfng" ? "selected" : ""}>True / False / Not Given</option>
          <option value="label" ${question.type === "label" ? "selected" : ""}>Label / text block (not scored)</option>
        </select>
        ${questionWeightLocal(question) > 1 ? `<span class="muted small multi-weight-hint">Counts as ${questionWeightLocal(question)} questions in the numbering</span>` : ""}
        <button class="btn btn-primary btn-sm" type="button" data-action="save-question">Save question</button>
        <button class="btn btn-danger btn-sm" type="button" data-action="remove-question" style="margin-left:auto;">Delete</button>
      </div>
      ${isLabel ? "" : `
      <div class="composer-toolbar" data-toolbar-for="${question.id}">
        <button type="button" data-format="bold" title="Bold"><b>B</b></button>
        <button type="button" data-format="italic" title="Italic"><i>I</i></button>
        <button type="button" data-format="underline" title="Underline"><u>U</u></button>
        <button type="button" data-action="insert-blank" title="Insert an inline blank">+ Blank</button>
        <button type="button" data-action="show-symbols" title="Insert a symbol">Symbols</button>
        <button type="button" data-action="preview-question" title="Preview as a student would see it">Preview</button>
      </div>`}
      <label class="builder-field-label">${isLabel ? "Text (not a question — not scored)" : "Question text — use \u201c+ Blank\u201d to embed the answer inline"}</label>
      <div class="rich-editor ${isLabel ? "label-block-editor" : "compact-rich-editor question-stem-editor"}" data-stem-editor="${question.id}"></div>
      ${answerEditorMarkup(question)}
      <div class="preview-panel hidden" data-question-preview></div>
    </div>`;
  }

  function answerEditorMarkup(question) {
    if (question.type === "label") return "";
    if (question.type === "fill") {
      if (Array.isArray(question.blankAnswers) && question.blankAnswers.length > 1) {
        return `<label class="builder-field-label">Accepted answer(s) for each blank</label>
          ${question.blankAnswers.map((key, index) => {
            const answer = Array.isArray(key) ? key.join(" | ") : (key || "");
            return `<div class="option-row"><strong>Blank ${index + 1}</strong><input class="text-input" data-field="blank-answer" data-blank-index="${index}" value="${escapeAttribute(answer)}" placeholder="e.g. 10 | ten"></div>`;
          }).join("")}
          <p class="muted small answer-help">Each inline blank is numbered and scored separately. Use <code>|</code> for accepted alternatives.</p>`;
      }
      const answer = Array.isArray(question.answer) ? question.answer.join(" | ") : (question.answer || "");
      return `<label class="builder-field-label">Accepted answer(s)</label>
        <input class="text-input" data-field="fill-answer" value="${escapeAttribute(answer)}" placeholder="e.g. 10 | ten">
        <p class="muted small answer-help">Separate accepted alternatives with <code>|</code>. If the question text above has an inline blank, this is its answer key.</p>`;
    }
    if (question.type === "tfng") {
      return `<label class="builder-field-label">Correct answer</label>
        <div class="inline-row">${TFNG_OPTIONS.map(option => `<label class="radio-chip"><input type="radio" data-field="single-answer" value="${option}" ${question.answer === option ? "checked" : ""}> ${option}</label>`).join("")}</div>`;
    }
    const isMulti = question.type === "multi";
    return `<label class="builder-field-label">Options — mark the correct ${isMulti ? "answers" : "answer"}</label>
      ${(question.options || []).map((option, index) => `
        <div class="option-row">
          <input type="${isMulti ? "checkbox" : "radio"}" name="correct-${question.id}" data-field="correct-option" data-option-index="${index}" ${isMulti ? ((question.answer || []).includes(option) ? "checked" : "") : (question.answer === option ? "checked" : "")}>
          <input class="text-input" data-field="option-text" data-option-index="${index}" value="${escapeAttribute(option)}" placeholder="Option ${String.fromCharCode(65 + index)}">
          <button class="btn btn-ghost btn-sm" type="button" data-action="remove-option" data-option-index="${index}">✕</button>
        </div>`).join("")}
      <button class="btn btn-ghost btn-sm" type="button" data-action="add-option">+ Option</button>`;
  }

  /* ---------- Content blocks ---------- */
  function blockEditorMarkup(part, group, block, blockIndex) {
    const head = `<div class="block-editor-head">
      <strong>${typeLabel(block.type)}</strong>
      <div class="toolbar-row">
        <button class="btn btn-ghost btn-sm" type="button" data-action="move-block-up" data-block-index="${blockIndex}" ${blockIndex === 0 ? "disabled" : ""}>&uarr;</button>
        <button class="btn btn-ghost btn-sm" type="button" data-action="move-block-down" data-block-index="${blockIndex}" ${blockIndex === (group.contentBlocks.length - 1) ? "disabled" : ""}>&darr;</button>
        <button class="btn btn-danger btn-sm" type="button" data-action="remove-block" data-block-index="${blockIndex}">Remove</button>
      </div></div>`;
    const blanksPanel = blanksPanelMarkup(part, block, blockIndex);

    if (block.type === "notes") {
      return `<div class="block-editor" data-block-index="${blockIndex}">${head}
        <input class="text-input" data-block-field="title" value="${escapeAttribute(block.title || "")}" placeholder="Notes card title (optional)">
        ${(block.sections || []).map((section, sectionIndex) => `
          <div class="notes-section-editor">
            <input class="text-input" data-note-heading="${sectionIndex}" value="${escapeAttribute(section.heading || "")}" placeholder="Sub-heading (optional), e.g. Typical jobs">
            <textarea data-note-rows="${sectionIndex}" rows="3" placeholder="One line per row. Type {{blank}} where an answer belongs.">${escapeHtml((section.rows || []).join("\n"))}</textarea>
            <button class="btn btn-ghost btn-sm" type="button" data-action="remove-note-section" data-section-index="${sectionIndex}">Remove section</button>
          </div>`).join("")}
        <button class="btn btn-ghost btn-sm" type="button" data-action="add-note-section">+ Section</button>
        ${blanksPanel}
      </div>`;
    }
    if (block.type === "table") {
      const cols = Math.max(1, ...(block.rows || []).map(row => row.length));
      return `<div class="block-editor" data-block-index="${blockIndex}">${head}
        <input class="text-input" data-block-field="title" value="${escapeAttribute(block.title || "")}" placeholder="Table title (optional)">
        <label class="inline-row"><input type="checkbox" data-block-field="headerRow" ${block.headerRow ? "checked" : ""}> First row is a header</label>
        <p class="muted small builder-help">Type {{blank}} in any cell where an answer belongs.</p>
        <div class="table-editor-grid">${(block.rows || []).map((row, rowIndex) => `
          <div class="table-editor-row">${Array.from({ length: cols }, (_, colIndex) => `<input class="text-input" data-table-cell="${rowIndex}-${colIndex}" value="${escapeAttribute(row[colIndex] || "")}" placeholder="Cell">`).join("")}</div>`).join("")}
        </div>
        <div class="toolbar-row"><button class="btn btn-ghost btn-sm" type="button" data-action="add-table-row">+ Row</button><button class="btn btn-ghost btn-sm" type="button" data-action="add-table-column">+ Column</button></div>
        ${blanksPanel}
      </div>`;
    }
    if (block.type === "optionBank") {
      return `<div class="block-editor" data-block-index="${blockIndex}">${head}
        <input class="text-input" data-block-field="title" value="${escapeAttribute(block.title || "")}" placeholder="Option bank title (optional)">
        <textarea data-block-field="options" rows="5" placeholder="One option per line — shown as A, B, C…">${escapeHtml((block.options || []).join("\n"))}</textarea>
      </div>`;
    }
    if (block.type === "flow") {
      return `<div class="block-editor" data-block-index="${blockIndex}">${head}
        <input class="text-input" data-block-field="title" value="${escapeAttribute(block.title || "")}" placeholder="Flow chart title (optional)">
        <p class="muted small builder-help">One step per line. Type {{blank}} where an answer belongs.</p>
        <textarea data-block-field="steps" rows="6" placeholder="First step&#10;Step with {{blank}}&#10;Final step">${escapeHtml((block.steps || []).join("\n"))}</textarea>
        ${blanksPanel}
      </div>`;
    }
    if (block.type === "instructionKey") {
      return `<div class="block-editor" data-block-index="${blockIndex}">${head}
        <label class="builder-field-label">Preset</label>
        <select class="select-input" data-block-field="preset">
          <option value="tfng" ${block.preset !== "ynng" ? "selected" : ""}>True / False / Not Given</option>
          <option value="ynng" ${block.preset === "ynng" ? "selected" : ""}>Yes / No / Not Given</option>
        </select>
      </div>`;
    }
    return `<div class="block-editor" data-block-index="${blockIndex}">${head}</div>`;
  }

  // Every {{blank}} placeholder typed into a block's text is auto-matched (in order)
  // to a real backing question, listed here so the teacher can set its answer key.
  function blanksPanelMarkup(part, block, blockIndex) {
    const ids = block.blankQuestionIds || [];
    if (!ids.length) return "";
    return `<div class="block-blanks-panel">
      <label class="builder-field-label">Blanks in this block</label>
      ${ids.map((id, index) => {
        const question = (part.questions || []).find(q => q.id === id);
        const answer = question ? (Array.isArray(question.answer) ? question.answer.join(" | ") : (question.answer || "")) : "";
        return `<div class="block-blank-row">
          <span class="block-blank-index">Blank ${index + 1}</span>
          <input class="text-input" data-block-blank-answer="${blockIndex}:${index}" value="${escapeAttribute(answer)}" placeholder="Accepted answer(s), e.g. 10 | ten">
        </div>`;
      }).join("")}
    </div>`;
  }

  function renderWriting() {
    const writing = state.exam.writing || (state.exam.writing = {});
    if (!state.task1Quill) state.task1Quill = new Quill("#writingTask1Prompt", { theme: "snow", modules: { toolbar: RICH_TOOLBAR } });
    if (!state.task2Quill) state.task2Quill = new Quill("#writingTask2Prompt", { theme: "snow", modules: { toolbar: RICH_TOOLBAR } });
    if (state.task1Quill.root.innerHTML !== (writing.task1Prompt || "")) state.task1Quill.root.innerHTML = writing.task1Prompt || "";
    if (state.task2Quill.root.innerHTML !== (writing.task2Prompt || "")) state.task2Quill.root.innerHTML = writing.task2Prompt || "";
    if (!state.task1Quill.__wired) {
      state.task1Quill.on("text-change", () => { writing.task1Prompt = cleanRichHtml(state.task1Quill.root.innerHTML); markDirty(); });
      state.task1Quill.__wired = true;
    }
    if (!state.task2Quill.__wired) {
      state.task2Quill.on("text-change", () => { writing.task2Prompt = cleanRichHtml(state.task2Quill.root.innerHTML); markDirty(); });
      state.task2Quill.__wired = true;
    }
    $("#writingTask1Image").value = writing.task1Image || "";
  }

  function renderInspector() {
    const parts = [...(state.exam.listening || []), ...(state.exam.reading || [])];
    const total = parts.reduce((sum, part) => sum + (part.questions || []).reduce((a, q) => a + questionWeightLocal(q), 0), 0);
    const incomplete = parts.flatMap(part => part.questions || []).filter(question => answerErrors(question).length).length;
    $("#builderInspector").innerHTML = `
      <h3>Exam health</h3>
      <p><strong>${total}</strong> numbered answer slot${total === 1 ? "" : "s"}</p>
      <p><strong>${incomplete}</strong> question${incomplete === 1 ? "" : "s"} need${incomplete === 1 ? "s" : ""} an answer key</p>
      <hr class="inspector-rule">
      <p class="muted small">Question groups can hold Notes cards, Tables, Option banks, Flow charts, and a T/F/NG key — matching real Cambridge test layouts.</p>`;
  }

  /* ---------- Rich editor mounting ---------- */
  function cleanRichHtml(html) {
    const box = document.createElement("div");
    box.innerHTML = html || "";
    return box.innerHTML === "<p><br></p>" ? "" : box.innerHTML;
  }

  function mountSnowEditor(element, html, onChange, placeholder, compact, quillMap, key) {
    if (quillMap.has(key) && element.dataset.mounted) return;
    element.dataset.mounted = "1";
    const quill = new Quill(element, { theme: "snow", placeholder, modules: { toolbar: compact ? [["bold", "italic", "underline"], [{ list: "ordered" }, { list: "bullet" }], ["clean"]] : RICH_TOOLBAR } });
    quill.root.innerHTML = html || "";
    quill.on("text-change", () => { onChange(cleanRichHtml(quill.root.innerHTML)); });
    quillMap.set(key, quill);
  }

  function mountStemEditor(element, question) {
    if (state.stemQuills.has(question.id)) return;
    const quill = new Quill(element, {
      theme: "bubble",
      placeholder: "Write the question. Use the + Blank button to embed the answer inline.",
      modules: { toolbar: false }
    });
    quill.root.innerHTML = question.text || "";
    quill.on("text-change", debounce(() => {
      question.text = cleanRichHtml(quill.root.innerHTML);
      markDirty();
      const excerptEl = element.closest(".question-card")?.querySelector(".question-excerpt");
      if (excerptEl) excerptEl.textContent = stripHtml(question.text) || "Untitled";
    }, 150));
    state.stemQuills.set(question.id, quill);

    const toolbar = document.querySelector(`[data-toolbar-for="${question.id}"]`);
    if (toolbar) {
      toolbar.querySelectorAll("[data-format]").forEach(button => button.addEventListener("click", () => {
        const format = button.dataset.format;
        const current = quill.getFormat();
        quill.format(format, !current[format]);
      }));
    }
  }

  function debounce(fn, wait) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait || 200); };
  }

  function flushAllEditors() {
    if (!state.exam) return;
    state.stemQuills.forEach((quill, questionId) => {
      const found = findQuestion(questionId);
      if (found) found.question.text = cleanRichHtml(quill.root.innerHTML);
    });
    state.groupLabelQuills.forEach((quill, groupId) => {
      for (const section of ["listening", "reading"]) {
        for (const part of state.exam[section] || []) {
          const group = (part.questionGroups || []).find(item => item.id === groupId);
          if (group) group.label = cleanRichHtml(quill.root.innerHTML);
        }
      }
    });
    state.passageQuills.forEach((quill, partIndex) => {
      if (state.exam.reading[partIndex]) state.exam.reading[partIndex].passage = cleanRichHtml(quill.root.innerHTML);
    });
    state.introQuills.forEach((quill, partIndex) => {
      if (state.exam.reading[partIndex]) state.exam.reading[partIndex].intro = cleanRichHtml(quill.root.innerHTML);
    });
    if (state.task1Quill) state.exam.writing.task1Prompt = cleanRichHtml(state.task1Quill.root.innerHTML);
    if (state.task2Quill) state.exam.writing.task2Prompt = cleanRichHtml(state.task2Quill.root.innerHTML);
  }

  function disposeAllQuills() {
    state.stemQuills.clear();
    state.groupLabelQuills.clear();
    state.passageQuills.clear();
    state.introQuills.clear();
    state.task1Quill = null;
    state.task2Quill = null;
  }

  /* ---------- Interaction ---------- */
  function contextFrom(el) {
    const partEl = el.closest("[data-part-index]");
    const groupEl = el.closest("[data-group-id]");
    const questionEl = el.closest("[data-question-id]");
    const blockEl = el.closest("[data-block-index]");
    const section = partEl ? partEl.dataset.section : null;
    const partIndex = partEl ? Number(partEl.dataset.partIndex) : null;
    const part = section !== null && partIndex !== null ? state.exam[section][partIndex] : null;
    const group = part && groupEl ? (part.questionGroups || []).find(g => g.id === groupEl.dataset.groupId) : null;
    const question = part && questionEl ? (part.questions || []).find(q => q.id === questionEl.dataset.questionId) : null;
    return { section, partIndex, part, group, question, blockEl, blockIndex: blockEl ? Number(blockEl.dataset.blockIndex) : null };
  }

  function wireStaticActions() {
    $("#builderExamSelect").addEventListener("change", event => chooseExam(event.target.value));
    $("#examName").addEventListener("input", event => { state.exam.name = event.target.value; markDirty(); });
    $("#writingTask1Image").addEventListener("input", event => { state.exam.writing.task1Image = event.target.value; markDirty(); });
    document.querySelectorAll(".builder-tab").forEach(tab => tab.addEventListener("click", () => {
      flushAllEditors();
      state.activeSection = tab.dataset.section;
      renderAll();
    }));
    $("#btnAddListeningPart").addEventListener("click", () => addPart("listening"));
    $("#btnAddReadingPassage").addEventListener("click", () => addPart("reading"));
    $("#btnSubmitExam").addEventListener("click", save);
    $("#builderRoot").addEventListener("click", handleClick);
    $("#builderRoot").addEventListener("input", handleInput);
    $("#builderRoot").addEventListener("change", handleInput);
    window.addEventListener("beforeunload", event => { if (state.hasUnsavedChanges) { event.preventDefault(); event.returnValue = ""; } });
  }

  function addPart(section) {
    if (section === "listening" && (state.exam.listening || []).length >= 4) { alert("Maximum 4 listening parts."); return; }
    if (section === "reading" && (state.exam.reading || []).length >= 3) { alert("Maximum 3 reading passages."); return; }
    flushAllEditors();
    const question = normalizeQuestion({ id: makeId("q"), type: "fill", text: "", answer: "" });
    const part = normalizePart({ title: "", audio: "", passage: "", intro: "", questions: [question], questionGroups: [{ id: makeId("g"), label: "", questionIds: [question.id], contentBlocks: [] }] }, section === "listening" ? "l" : "r");
    state.exam[section].push(part);
    state.activeSection = section;
    state.activeQuestionId = question.id;
    markDirty();
    renderAll();
  }

  function handleClick(event) {
    const button = event.target.closest("button, [data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (!action) return;
    const ctx = contextFrom(button);

    if (action === "toggle-question") {
      flushAllEditors();
      const card = button.closest("[data-question-id]");
      const id = card.dataset.questionId;
      state.activeQuestionId = state.activeQuestionId === id ? null : id;
      renderAll();
      return;
    }
    if (action === "remove-part") {
      if (confirm("Remove this part and all of its questions?")) { flushAllEditors(); state.exam[ctx.section].splice(ctx.partIndex, 1); markDirty(); renderAll(); }
      return;
    }
    if (action === "add-group") {
      flushAllEditors();
      ctx.part.questionGroups.push({ id: makeId("g"), label: "", questionIds: [], contentBlocks: [] });
      markDirty(); renderAll();
      return;
    }
    if (action === "remove-group") {
      if (ctx.part.questionGroups.length === 1) { alert("Each part needs at least one question group."); return; }
      if (confirm("Remove this group and its questions?")) {
        flushAllEditors();
        const [removed] = ctx.part.questionGroups.splice(ctx.part.questionGroups.indexOf(ctx.group), 1);
        ctx.part.questions = ctx.part.questions.filter(q => !removed.questionIds.includes(q.id));
        markDirty(); renderAll();
      }
      return;
    }
    if (action === "add-question") {
      flushAllEditors();
      const question = normalizeQuestion({ id: makeId("q"), type: "fill", text: "", answer: "" });
      ctx.part.questions.push(question);
      ctx.group.questionIds.push(question.id);
      state.activeQuestionId = question.id;
      markDirty(); renderAll();
      return;
    }
    if (action === "add-label") {
      flushAllEditors();
      const label = normalizeQuestion({ id: makeId("lbl"), type: "label", text: "" });
      ctx.part.questions.push(label);
      ctx.group.questionIds.push(label.id);
      state.activeQuestionId = label.id;
      markDirty(); renderAll();
      return;
    }
    if (action === "remove-question") {
      if (confirm("Delete this question?")) {
        flushAllEditors();
        removeQuestionEverywhere(ctx.part, ctx.question.id);
        state.activeQuestionId = null;
        markDirty(); renderAll();
      }
      return;
    }
    if (action === "move-question-up" || action === "move-question-down") {
      const position = ctx.group.questionIds.indexOf(ctx.question.id);
      const target = action.endsWith("up") ? position - 1 : position + 1;
      if (target < 0 || target >= ctx.group.questionIds.length) return;
      flushAllEditors();
      [ctx.group.questionIds[position], ctx.group.questionIds[target]] = [ctx.group.questionIds[target], ctx.group.questionIds[position]];
      syncQuestionOrder(ctx.part);
      markDirty(); renderAll();
      return;
    }
    if (action === "save-question") {
      flushAllEditors();
      syncStemBlankAnswers(ctx.question);
      state.activeQuestionId = null;
      markDirty();
      renderAll();
      $("#builderSaveMsg").textContent = "Question changes kept locally — submit the exam to publish.";
      return;
    }
    if (action === "add-option") { flushAllEditors(); ctx.question.options.push(""); markDirty(); renderAll(); return; }
    if (action === "remove-option") {
      flushAllEditors();
      const index = Number(button.dataset.optionIndex);
      const removedValue = ctx.question.options[index];
      ctx.question.options.splice(index, 1);
      if (ctx.question.type === "multi") ctx.question.answer = (ctx.question.answer || []).filter(value => value !== removedValue);
      else if (ctx.question.answer === removedValue) ctx.question.answer = "";
      markDirty(); renderAll();
      return;
    }
    if (action === "insert-blank") { insertBlankIntoStem(ctx.question); return; }
    if (action === "show-symbols") { showSymbolPicker(button, ctx.question); return; }
    if (action === "preview-question") {
      const panel = button.closest(".question-editor-panel").querySelector("[data-question-preview]");
      panel.classList.toggle("hidden");
      if (!panel.classList.contains("hidden")) {
        const number = questionNumber(ctx.section, ctx.partIndex, ctx.question.id);
        panel.innerHTML = renderPreviewQuestion(ctx.question, number);
      }
      return;
    }
    if (action === "add-block") { flushAllEditors(); addContentBlock(ctx.group, button.dataset.blockType); markDirty(); renderAll(); return; }
    if (action === "remove-block") { flushAllEditors(); removeContentBlock(ctx.part, ctx.group, ctx.blockIndex); markDirty(); renderAll(); return; }
    if (action === "move-block-up" || action === "move-block-down") {
      flushAllEditors();
      const i = ctx.blockIndex, j = action.endsWith("up") ? i - 1 : i + 1;
      if (j < 0 || j >= ctx.group.contentBlocks.length) return;
      [ctx.group.contentBlocks[i], ctx.group.contentBlocks[j]] = [ctx.group.contentBlocks[j], ctx.group.contentBlocks[i]];
      markDirty(); renderAll();
      return;
    }
    if (action === "add-note-section") {
      flushAllEditors();
      ctx.group.contentBlocks[ctx.blockIndex].sections.push({ heading: "", rows: [""] });
      markDirty(); renderAll();
      return;
    }
    if (action === "remove-note-section") {
      flushAllEditors();
      ctx.group.contentBlocks[ctx.blockIndex].sections.splice(Number(button.dataset.sectionIndex), 1);
      markDirty(); renderAll();
      return;
    }
    if (action === "add-table-row" || action === "add-table-column") {
      flushAllEditors();
      const block = ctx.group.contentBlocks[ctx.blockIndex];
      const cols = Math.max(1, ...block.rows.map(row => row.length));
      if (action.endsWith("row")) block.rows.push(Array(cols).fill(""));
      else block.rows.forEach(row => row.push(""));
      markDirty(); renderAll();
      return;
    }
  }

  function handleInput(event) {
    const target = event.target;
    const ctx = contextFrom(target);
    if (!ctx.part) return;
    const field = target.dataset.field;

    if (field === "part-title") { ctx.part.title = target.value; markDirty(); return; }
    if (field === "part-audio") { ctx.part.audio = target.value; markDirty(); return; }

    if (field === "question-type" && ctx.question) {
      flushAllEditors();
      const type = target.value;
      ctx.question.type = type;
      delete ctx.question.blankAnswers;
      if (type === "tfng") { ctx.question.options = [...TFNG_OPTIONS]; ctx.question.answer = ""; }
      else if (type === "mc" || type === "multi") { ctx.question.options = ["", "", ""]; if (type === "multi") ctx.question.options.push(""); ctx.question.answer = type === "multi" ? [] : ""; }
      else { delete ctx.question.options; ctx.question.answer = ""; }
      markDirty(); renderAll();
      return;
    }
    if (field === "fill-answer" && ctx.question) {
      const alternatives = target.value.split("|").map(value => value.trim()).filter(Boolean);
      ctx.question.answer = alternatives.length > 1 ? alternatives : (alternatives[0] || "");
      markDirty(); renderInspector();
      return;
    }
    if (field === "blank-answer" && ctx.question) {
      const index = Number(target.dataset.blankIndex);
      const alternatives = target.value.split("|").map(value => value.trim()).filter(Boolean);
      ctx.question.blankAnswers[index] = alternatives.length > 1 ? alternatives : (alternatives[0] || "");
      markDirty(); renderInspector();
      return;
    }
    if (field === "single-answer" && ctx.question) { ctx.question.answer = target.value; markDirty(); renderInspector(); return; }
    if (field === "option-text" && ctx.question) {
      const index = Number(target.dataset.optionIndex);
      const previous = ctx.question.options[index];
      ctx.question.options[index] = target.value;
      if (ctx.question.type === "multi") ctx.question.answer = (ctx.question.answer || []).map(value => value === previous ? target.value : value);
      else if (ctx.question.answer === previous) ctx.question.answer = target.value;
      markDirty();
      return;
    }
    if (field === "correct-option" && ctx.question) {
      const index = Number(target.dataset.optionIndex);
      const value = ctx.question.options[index];
      if (ctx.question.type === "multi") {
        const set = new Set(ctx.question.answer || []);
        target.checked ? set.add(value) : set.delete(value);
        ctx.question.answer = [...set].filter(Boolean);
      } else {
        ctx.question.answer = target.checked ? value : "";
      }
      markDirty(); renderInspector();
      return;
    }

    if (ctx.blockEl && ctx.group) {
      const block = ctx.group.contentBlocks[ctx.blockIndex];
      const blockField = target.dataset.blockField;
      if (blockField === "title") block.title = target.value;
      if (blockField === "headerRow") block.headerRow = target.checked;
      if (blockField === "options") block.options = target.value.split(/\r?\n/);
      if (blockField === "steps") { block.steps = target.value.split(/\r?\n/); syncBlockBlanks(ctx.part, block); }
      if (blockField === "preset") block.preset = target.value;
      if (target.dataset.noteHeading !== undefined) block.sections[Number(target.dataset.noteHeading)].heading = target.value;
      if (target.dataset.noteRows !== undefined) { block.sections[Number(target.dataset.noteRows)].rows = target.value.split(/\r?\n/); syncBlockBlanks(ctx.part, block); }
      if (target.dataset.tableCell) {
        const [rowIndex, colIndex] = target.dataset.tableCell.split("-").map(Number);
        block.rows[rowIndex][colIndex] = target.value;
        syncBlockBlanks(ctx.part, block);
      }
      if (target.dataset.blockBlankAnswer) {
        const [bIndex, blankIndex] = target.dataset.blockBlankAnswer.split(":").map(Number);
        const questionId = ctx.group.contentBlocks[bIndex].blankQuestionIds[blankIndex];
        const question = ctx.part.questions.find(q => q.id === questionId);
        if (question) {
          const alternatives = target.value.split("|").map(v => v.trim()).filter(Boolean);
          question.answer = alternatives.length > 1 ? alternatives : (alternatives[0] || "");
        }
      }
      markDirty();
      if (blockField === "steps" || target.dataset.noteRows !== undefined || target.dataset.tableCell) renderAll();
      else renderInspector();
    }
  }

  function removeQuestionEverywhere(part, questionId) {
    part.questions = part.questions.filter(q => q.id !== questionId);
    (part.questionGroups || []).forEach(group => { group.questionIds = group.questionIds.filter(id => id !== questionId); });
    (part.questionGroups || []).forEach(group => (group.contentBlocks || []).forEach(block => {
      if (block.blankQuestionIds) block.blankQuestionIds = block.blankQuestionIds.filter(id => id !== questionId);
    }));
  }

  function addContentBlock(group, type) {
    const presets = {
      notes: { id: makeId("block"), type, title: "", sections: [{ heading: "", rows: ["Row with {{blank}}"] }], blankQuestionIds: [] },
      table: { id: makeId("block"), type, title: "", headerRow: true, rows: [["Heading 1", "Heading 2"], ["Item", "{{blank}}"]], blankQuestionIds: [] },
      optionBank: { id: makeId("block"), type, title: "", options: ["First option", "Second option", "Third option"] },
      flow: { id: makeId("block"), type, title: "", steps: ["First step", "Step with {{blank}}", "Final step"], blankQuestionIds: [] },
      instructionKey: { id: makeId("block"), type, preset: "tfng" }
    };
    group.contentBlocks.push(presets[type]);
  }

  function removeContentBlock(part, group, blockIndex) {
    const block = group.contentBlocks[blockIndex];
    (block.blankQuestionIds || []).forEach(id => removeQuestionEverywhere(part, id));
    group.contentBlocks.splice(blockIndex, 1);
  }

  // Scans a block's text fields for {{blank}} and already-resolved {{q:<id>}}
  // tokens together, in document order, and reconciles the backing scored
  // questions: a fresh {{blank}} gets a new fill question, an existing {{q:<id>}}
  // keeps its id, and any backing question no longer referenced is removed.
  // This has to treat both token forms as one pass — scanning for only
  // {{blank}} breaks the moment a block mixes freshly-typed and already-
  // resolved tokens, since a resolved token no longer matches {{blank}}.
  function syncBlockBlanks(part, block) {
    const currentGroup = state.exam[state.activeSection].flatMap(p => p.questionGroups || []).find(g => (g.contentBlocks || []).includes(block));
    if (!currentGroup) return;
    const rawText = (() => {
      if (block.type === "notes") return (block.sections || []).flatMap(s => s.rows || []).join("\n");
      if (block.type === "table") return (block.rows || []).flatMap(row => row || []).join("\n");
      if (block.type === "flow") return (block.steps || []).join("\n");
      return "";
    })();

    const tokenPattern = /\{\{blank\}\}|\{\{q:([a-zA-Z0-9_-]+)\}\}/g;
    const foundIds = [];
    let match;
    while ((match = tokenPattern.exec(rawText))) foundIds.push(match[1] || null);
    const newBlankIds = foundIds.map(id => id || makeId("blk"));

    const stillUsed = new Set(newBlankIds);
    (block.blankQuestionIds || []).forEach(oldId => {
      if (!stillUsed.has(oldId)) removeQuestionEverywhere(part, oldId);
    });
    newBlankIds.forEach(id => {
      if (!part.questions.find(q => q.id === id)) {
        const question = normalizeQuestion({ id, type: "fill", text: "", answer: "" });
        part.questions.push(question);
        currentGroup.questionIds.push(question.id);
      }
    });
    block.blankQuestionIds = newBlankIds;

    let cursor = 0;
    const substitute = text => String(text || "").replace(tokenPattern, (wholeMatch, existingId) => {
      const id = existingId || newBlankIds[cursor];
      cursor += 1;
      return `{{q:${id}}}`;
    });
    if (block.type === "notes") (block.sections || []).forEach(section => { section.rows = (section.rows || []).map(substitute); });
    if (block.type === "table") (block.rows || []).forEach(row => { row.forEach((cell, i) => { row[i] = substitute(cell); }); });
    if (block.type === "flow") block.steps = (block.steps || []).map(substitute);
  }

  /* ---------- Inline blanks & symbols for standalone question stems ---------- */
  function insertBlankIntoStem(question) {
    const quill = state.stemQuills.get(question.id);
    if (!quill) return;
    const range = quill.getSelection(true) || { index: Math.max(0, quill.getLength() - 1) };
    quill.insertEmbed(range.index, "answerSlot", { id: makeId("slot"), size: "medium" }, "user");
    quill.insertText(range.index + 1, " ", "user");
    quill.setSelection(range.index + 2, 0, "silent");
    question.text = cleanRichHtml(quill.root.innerHTML);
    syncStemBlankAnswers(question);
    markDirty();
    renderAll();
  }

  function syncStemBlankAnswers(question) {
    if (!question || question.type !== "fill") return;
    const wrap = document.createElement("div");
    wrap.innerHTML = question.text || "";
    const count = wrap.querySelectorAll(".ielts-answer-slot").length;
    if (count <= 1) {
      if (Array.isArray(question.blankAnswers) && question.blankAnswers.length) question.answer = question.blankAnswers[0];
      delete question.blankAnswers;
      return;
    }
    const previous = Array.isArray(question.blankAnswers) ? question.blankAnswers : [question.answer || ""];
    question.blankAnswers = Array.from({ length: count }, (_, index) => previous[index] || "");
    question.answer = question.blankAnswers[0] || "";
  }

  function showSymbolPicker(anchor, question) {
    const symbols = ["£", "$", "€", "%", "°", "×", "÷", "→", "–", "±", "≤", "≥", "²", "³"];
    document.querySelectorAll(".symbol-popover").forEach(el => el.remove());
    const pop = document.createElement("div");
    pop.className = "symbol-popover";
    symbols.forEach(symbol => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = symbol;
      btn.addEventListener("click", () => {
        const quill = state.stemQuills.get(question.id);
        const range = quill && quill.getSelection(true);
        if (quill && range) quill.insertText(range.index, symbol, "user");
        pop.remove();
      });
      pop.appendChild(btn);
    });
    document.body.appendChild(pop);
    const rect = anchor.getBoundingClientRect();
    pop.style.left = `${Math.min(window.innerWidth - pop.offsetWidth - 12, rect.left)}px`;
    pop.style.top = `${rect.bottom + window.scrollY + 6}px`;
    setTimeout(() => document.addEventListener("click", ev => { if (!pop.contains(ev.target) && ev.target !== anchor) pop.remove(); }, { once: true }), 0);
  }

  function renderPreviewQuestion(question, number) {
    if (question.type === "label") return `<div class="exam-label-block exam-rich-content">${question.text || ""}</div>`;
    const html = hasInlineSlot(question.text) ? hydrateInlineSlots(question.text, question, "", true) : question.text;
    let control = "";
    if (question.type === "fill" && !hasInlineSlot(question.text)) control = slotInputHtml(question, `${question.id}-fallback`, "medium", "", true);
    if (question.type === "mc" || question.type === "tfng") control = `<div class="q-options">${(question.options || []).map(option => `<div class="q-option mc-opt"><span class="box"></span>${escapeHtml(option)}</div>`).join("")}</div>`;
    if (question.type === "multi") control = `<div class="q-options">${(question.options || []).map(option => `<div class="q-option multi-opt"><span class="box"></span>${escapeHtml(option)}</div>`).join("")}</div>`;
    return `<div class="question-block"><span class="q-num">${number}.</span>${html}${control}</div>`;
  }

  /* ---------- Save ---------- */
  async function save() {
    flushAllEditors();
    ["listening", "reading"].forEach(section => (state.exam[section] || []).forEach(part => {
      syncQuestionOrder(part);
      (part.questions || []).forEach(syncStemBlankAnswers);
    }));
    const errors = allAnswerErrors();
    if (errors.length && !confirm(`${errors.length} answer-key issue(s) remain. Save anyway?`)) return;
    state.exam.name = $("#examName").value.trim() || "Untitled IELTS Exam";
    state.exam.writing.task1Image = $("#writingTask1Image").value.trim();
    const button = $("#btnSubmitExam");
    button.disabled = true; button.textContent = "Saving...";
    await saveExam(state.exam);
    state.exams[state.exam.id] = state.exam;
    button.disabled = false; button.textContent = "Submit Exam";
    state.hasUnsavedChanges = false;
    const msg = $("#builderSaveMsg");
    msg.textContent = "Exam saved ✓";
    renderInspector();
    setTimeout(() => { msg.textContent = ""; }, 2500);
  }

  function escapeAttribute(value) { return escapeHtml(value); }
}
