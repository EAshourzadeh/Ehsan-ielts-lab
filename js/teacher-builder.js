document.addEventListener("DOMContentLoaded", function () {
  requireAdminAuth(() => {
    document.getElementById("btnLogout").addEventListener("click", logoutAdmin);

    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get("exam");

    let workingExam = null; // in-memory copy; only written to Firestore on Submit
    let hasUnsavedChanges = false;
    function markDirty() { hasUnsavedChanges = true; }

    async function populateExamSelect() {
      const sel = document.getElementById("builderExamSelect");
      sel.innerHTML = `<option>Loading…</option>`;
      const exams = await getExams();
      sel.innerHTML = "";
      Object.values(exams).forEach(ex => {
        const opt = document.createElement("option");
        opt.value = ex.id; opt.textContent = ex.name;
        sel.appendChild(opt);
      });
      const startId = (requestedId && exams[requestedId]) ? requestedId : sel.value;
      sel.value = startId;
      loadExam(exams[startId]);
    }
    document.getElementById("builderExamSelect").addEventListener("change", async (e) => {
      if (hasUnsavedChanges && !confirm("Discard unsaved changes for this exam?")) {
        e.target.value = workingExam.id; return;
      }
      const exams = await getExams();
      loadExam(exams[e.target.value]);
    });

    function loadExam(exam) {
      if (!exam) return;
      workingExam = JSON.parse(JSON.stringify(exam)); // deep clone — edits stay local until Submit
      hasUnsavedChanges = false;
      renderListeningBuilder();
      renderReadingBuilder();
      document.getElementById("writingTask1Prompt").value = workingExam.writing.task1Prompt || "";
      document.getElementById("writingTask1Image").value = workingExam.writing.task1Image || "";
      document.getElementById("writingTask2Prompt").value = workingExam.writing.task2Prompt || "";
    }

    document.querySelectorAll(".builder-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".builder-tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".builder-tab-pane").forEach(p => p.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById(tab.dataset.btab).classList.add("active");
      });
    });

    /* ---------- Listening ---------- */
    function renderListeningBuilder() {
      const wrap = document.getElementById("listeningPartsList");
      wrap.innerHTML = "";
      workingExam.listening.forEach((part, pIdx) => {
        const card = document.createElement("div");
        card.className = "builder-part-card";
        card.innerHTML = `
          <div class="builder-part-head">
            <input type="text" class="text-input" style="width:auto;flex:1;margin-right:10px;" value="${part.title}" data-lp-title="${pIdx}">
            <button class="btn btn-danger btn-sm" data-lp-del="${pIdx}">Remove Part</button>
          </div>
          <label style="font-size:0.85rem;font-weight:600;">MP3 filename/path (place file in assets/audio/)</label>
          <input type="text" class="text-input" value="${part.audio}" data-lp-audio="${pIdx}" placeholder="assets/audio/part1.mp3">
          <div data-lp-questions="${pIdx}"></div>
          <button class="btn btn-ghost btn-sm" data-lp-addq="${pIdx}">+ Add Question</button>`;
        wrap.appendChild(card);
        renderQuestionEditors(card.querySelector(`[data-lp-questions="${pIdx}"]`), part.questions);
      });
      wrap.querySelectorAll("[data-lp-title]").forEach(inp => inp.addEventListener("input", e => { workingExam.listening[+e.target.dataset.lpTitle].title = e.target.value; markDirty(); }));
      wrap.querySelectorAll("[data-lp-audio]").forEach(inp => inp.addEventListener("input", e => { workingExam.listening[+e.target.dataset.lpAudio].audio = e.target.value; markDirty(); }));
      wrap.querySelectorAll("[data-lp-del]").forEach(btn => btn.addEventListener("click", e => { workingExam.listening.splice(+e.target.dataset.lpDel, 1); markDirty(); renderListeningBuilder(); }));
      wrap.querySelectorAll("[data-lp-addq]").forEach(btn => btn.addEventListener("click", e => {
        workingExam.listening[+e.target.dataset.lpAddq].questions.push({ id: "l" + Date.now(), type: "fill", text: "", answer: "" });
        markDirty(); renderListeningBuilder();
      }));
    }
    document.getElementById("btnAddListeningPart").addEventListener("click", () => {
      if (workingExam.listening.length >= 4) { alert("Maximum 4 listening parts."); return; }
      workingExam.listening.push({ title: `Part ${workingExam.listening.length + 1}`, audio: "", questions: [] });
      markDirty(); renderListeningBuilder();
    });

    /* ---------- Reading ---------- */
    function renderReadingBuilder() {
      const wrap = document.getElementById("readingPassagesList");
      wrap.innerHTML = "";
      workingExam.reading.forEach((part, pIdx) => {
        const card = document.createElement("div");
        card.className = "builder-part-card";
        card.innerHTML = `
          <div class="builder-part-head">
            <input type="text" class="text-input" style="width:auto;flex:1;margin-right:10px;" value="${part.title}" data-rp-title="${pIdx}">
            <button class="btn btn-danger btn-sm" data-rp-del="${pIdx}">Remove Passage</button>
          </div>
          <label style="font-size:0.85rem;font-weight:600;">Passage text</label>
          <textarea class="text-input textarea-input" rows="6" data-rp-passage="${pIdx}">${part.passage}</textarea>
          <div data-rp-questions="${pIdx}"></div>
          <button class="btn btn-ghost btn-sm" data-rp-addq="${pIdx}">+ Add Question</button>`;
        wrap.appendChild(card);
        renderQuestionEditors(card.querySelector(`[data-rp-questions="${pIdx}"]`), part.questions);
      });
      wrap.querySelectorAll("[data-rp-title]").forEach(inp => inp.addEventListener("input", e => { workingExam.reading[+e.target.dataset.rpTitle].title = e.target.value; markDirty(); }));
      wrap.querySelectorAll("[data-rp-passage]").forEach(ta => ta.addEventListener("input", e => { workingExam.reading[+e.target.dataset.rpPassage].passage = e.target.value; markDirty(); }));
      wrap.querySelectorAll("[data-rp-del]").forEach(btn => btn.addEventListener("click", e => { workingExam.reading.splice(+e.target.dataset.rpDel, 1); markDirty(); renderReadingBuilder(); }));
      wrap.querySelectorAll("[data-rp-addq]").forEach(btn => btn.addEventListener("click", e => {
        workingExam.reading[+e.target.dataset.rpAddq].questions.push({ id: "r" + Date.now(), type: "fill", text: "", answer: "" });
        markDirty(); renderReadingBuilder();
      }));
    }
    document.getElementById("btnAddReadingPassage").addEventListener("click", () => {
      if (workingExam.reading.length >= 3) { alert("Maximum 3 reading passages."); return; }
      workingExam.reading.push({ title: `Passage ${workingExam.reading.length + 1}`, passage: "", questions: [] });
      markDirty(); renderReadingBuilder();
    });

    /* ---------- Shared question editor: fill / multiple choice / multiple answer / true-false-not given ---------- */
    function renderQuestionEditors(container, questions) {
      container.innerHTML = "";
      questions.forEach((q, qIdx) => {
        const isMc = q.type === "mc";
        const isMulti = q.type === "multi";
        const optsVal = Array.isArray(q.options) ? q.options.join(", ") : "";
        const ansVal = Array.isArray(q.answer) ? q.answer.join(", ") : (q.answer || "");
        const row = document.createElement("div");
        row.className = "builder-question-row";
        row.innerHTML = `
          <div>
            <select data-q-type="${qIdx}" style="margin-bottom:6px;">
              <option value="fill" ${q.type === "fill" ? "selected" : ""}>Fill in the blank</option>
              <option value="mc" ${isMc ? "selected" : ""}>Multiple choice (one answer)</option>
              <option value="multi" ${isMulti ? "selected" : ""}>Multiple answer (select several)</option>
              <option value="tfng" ${q.type === "tfng" ? "selected" : ""}>True / False / Not Given</option>
            </select>
            <input type="text" class="text-input" placeholder="Question text" value="${q.text}" data-q-text="${qIdx}">
            ${(isMc || isMulti) ? `<input type="text" class="text-input" placeholder="Options, comma-separated" value="${optsVal}" data-q-opts="${qIdx}">` : ""}
            <input type="text" class="text-input" placeholder="${isMulti ? "Correct answers, comma-separated (e.g. Option A, Option C)" : "Correct answer"}" value="${ansVal}" data-q-ans="${qIdx}">
          </div>
          <button class="btn btn-danger btn-sm" data-q-del="${qIdx}">✕</button>`;
        container.appendChild(row);
      });

      container.querySelectorAll("[data-q-type]").forEach(sel => sel.addEventListener("change", e => {
        const q = questions[+e.target.dataset.qType];
        q.type = e.target.value;
        if (q.type === "tfng") { q.options = ["True", "False", "Not Given"]; q.answer = ""; }
        else if (q.type === "mc") { q.options = q.options || []; q.answer = ""; }
        else if (q.type === "multi") { q.options = q.options || []; q.answer = []; }
        else { delete q.options; q.answer = ""; }
        markDirty(); renderQuestionEditors(container, questions);
      }));
      container.querySelectorAll("[data-q-text]").forEach(inp => inp.addEventListener("input", e => { questions[+e.target.dataset.qText].text = e.target.value; markDirty(); }));
      container.querySelectorAll("[data-q-opts]").forEach(inp => inp.addEventListener("input", e => {
        questions[+e.target.dataset.qOpts].options = e.target.value.split(",").map(s => s.trim()).filter(Boolean); markDirty();
      }));
      container.querySelectorAll("[data-q-ans]").forEach(inp => inp.addEventListener("input", e => {
        const q = questions[+e.target.dataset.qAns];
        if (q.type === "multi") q.answer = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
        else q.answer = e.target.value;
        markDirty();
      }));
      container.querySelectorAll("[data-q-del]").forEach(btn => btn.addEventListener("click", e => {
        questions.splice(+e.target.dataset.qDel, 1); markDirty(); renderQuestionEditors(container, questions);
      }));
    }

    /* ---------- Writing tab (folded into the same Submit) ---------- */
    ["writingTask1Prompt", "writingTask1Image", "writingTask2Prompt"].forEach(id => {
      document.getElementById(id).addEventListener("input", markDirty);
    });

    /* ---------- Submit ---------- */
    document.getElementById("btnSubmitExam").addEventListener("click", async () => {
      workingExam.writing = {
        task1Prompt: document.getElementById("writingTask1Prompt").value,
        task1Image: document.getElementById("writingTask1Image").value,
        task2Prompt: document.getElementById("writingTask2Prompt").value
      };
      const btn = document.getElementById("btnSubmitExam");
      btn.disabled = true; btn.textContent = "Saving...";
      await saveExam(workingExam);
      btn.disabled = false; btn.textContent = "Submit Exam";
      hasUnsavedChanges = false;
      const msg = document.getElementById("builderSaveMsg");
      msg.textContent = "Exam saved ✓";
      setTimeout(() => { msg.textContent = ""; }, 2500);
    });

    window.addEventListener("beforeunload", (e) => {
      if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = ""; }
    });

    populateExamSelect();
  });
});
