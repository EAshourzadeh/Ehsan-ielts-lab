document.addEventListener("DOMContentLoaded", function () {
  const session = getSession();
  if (!session) { window.location.href = "student-login.html"; return; }

  let runner = { section: null, parts: [], partIndex: 0, timerSeconds: 0, timerHandle: null };

  document.getElementById("runnerCandidateName").textContent = session.studentName;
  startSection("listening");

  function startSection(section) {
    const exam = getExams()[session.examId];
    runner.section = section;
    runner.parts = section === "listening" ? exam.listening : exam.reading;
    runner.timerSeconds = SECTION_TIMES[section];
    document.getElementById("runnerSectionTag").textContent = section.toUpperCase();
    renderRunnerPart(0);
    startTimer("runnerTimer", () => submitSection());
  }

  function currentAnswers() { return runner.section === "listening" ? session.listeningAnswers : session.readingAnswers; }

  function renderRunnerPart(partIdx) {
    const part = runner.parts[partIdx];
    runner.partIndex = partIdx;
    document.getElementById("runnerPartLabel").textContent = part.title;

    const passagePane = document.getElementById("runnerPassagePane");
    if (runner.section === "listening") {
      passagePane.innerHTML = `
        <div class="audio-player-block">
          <h3>${part.title}</h3>
          <p class="muted small">Audio plays once. Answer as you listen.</p>
          <audio controls src="${part.audio}" onerror="this.insertAdjacentHTML('afterend','<div class=audio-missing-note>&#9888; Audio file not found at ${part.audio} — add it to assets/audio/ in the repo.</div>')"></audio>
        </div>`;
    } else {
      passagePane.innerHTML = `<h3>${part.title}</h3><p>${part.passage}</p>`;
    }

    const qPane = document.getElementById("runnerQuestionsPane");
    qPane.innerHTML = "";
    part.questions.forEach((q, i) => qPane.appendChild(renderQuestionBlock(q, i)));
    renderNavBubbles(part.questions);

    // If this is the last part, change "Submit Section" behavior stays the same button (submits whole section)
  }

  function renderQuestionBlock(q, i) {
    const answers = currentAnswers();
    const block = document.createElement("div");
    block.className = "question-block";
    block.id = "qblock-" + q.id;
    let inner = `<div><span class="q-num">${i + 1}.</span>${q.text}${q.type === "multi" ? `<span class="q-hint">(select ${(q.answer || []).length || 2})</span>` : ""}</div>`;

    if (q.type === "mc" || q.type === "tfng") {
      const selected = answers[q.id];
      inner += `<div class="q-options">`;
      q.options.forEach(opt => {
        const sel = selected === opt ? "selected" : "";
        inner += `<div class="q-option mc-opt ${sel}" data-qid="${q.id}" data-val="${opt}"><span class="box"></span>${opt}</div>`;
      });
      inner += `</div>`;
    } else if (q.type === "multi") {
      const selectedArr = Array.isArray(answers[q.id]) ? answers[q.id] : [];
      inner += `<div class="q-options">`;
      (q.options || []).forEach(opt => {
        const sel = selectedArr.includes(opt) ? "selected" : "";
        inner += `<div class="q-option multi-opt ${sel}" data-qid="${q.id}" data-val="${opt}" data-multi="1"><span class="box"></span>${opt}</div>`;
      });
      inner += `</div>`;
    } else if (q.type === "fill") {
      const val = answers[q.id] || "";
      inner += `<input type="text" class="q-fill-input" data-qid="${q.id}" value="${val}" placeholder="Your answer">`;
    }
    block.innerHTML = inner;
    return block;
  }

  document.getElementById("runnerQuestionsPane").addEventListener("click", (e) => {
    const opt = e.target.closest(".q-option");
    if (!opt) return;
    const answers = currentAnswers();
    if (opt.dataset.multi) {
      const arr = Array.isArray(answers[opt.dataset.qid]) ? answers[opt.dataset.qid] : [];
      const idx = arr.indexOf(opt.dataset.val);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(opt.dataset.val);
      answers[opt.dataset.qid] = arr;
      opt.classList.toggle("selected", arr.includes(opt.dataset.val));
    } else {
      answers[opt.dataset.qid] = opt.dataset.val;
      document.querySelectorAll(`.q-option[data-qid="${opt.dataset.qid}"]`).forEach(el => el.classList.remove("selected"));
      opt.classList.add("selected");
    }
    saveSession(session);
    updateNavBubbles();
  });
  document.getElementById("runnerQuestionsPane").addEventListener("input", (e) => {
    if (!e.target.classList.contains("q-fill-input")) return;
    currentAnswers()[e.target.dataset.qid] = e.target.value;
    saveSession(session);
    updateNavBubbles();
  });

  function renderNavBubbles(questions) {
    const wrap = document.getElementById("navBubbles");
    wrap.innerHTML = "";
    const answers = currentAnswers();
    questions.forEach((q, i) => {
      const has = Array.isArray(answers[q.id]) ? answers[q.id].length > 0 : !!answers[q.id];
      const b = document.createElement("div");
      b.className = "nav-bubble" + (has ? " answered" : "");
      b.textContent = i + 1;
      b.title = "Jump to question " + (i + 1);
      b.addEventListener("click", () => document.getElementById("qblock-" + q.id).scrollIntoView({ behavior: "smooth", block: "center" }));
      wrap.appendChild(b);
    });
  }
  function updateNavBubbles() { renderNavBubbles(runner.parts[runner.partIndex].questions); }

  document.getElementById("btnSubmitSection").addEventListener("click", () => {
    if (confirm("Submit this section? You cannot return to it once submitted.")) submitSection();
  });

  function submitSection() {
    clearTimer();
    if (runner.section === "listening") {
      session.listeningScore = scoreSection(getExams()[session.examId].listening, session.listeningAnswers);
      saveSession(session);
      startSection("reading");
    } else {
      session.readingScore = scoreSection(getExams()[session.examId].reading, session.readingAnswers);
      saveSession(session);
      window.location.href = "student-writing.html";
    }
  }

  function startTimer(displayId, onExpire) {
    clearTimer();
    const el = document.getElementById(displayId);
    const tick = () => {
      const m = Math.floor(runner.timerSeconds / 60).toString().padStart(2, "0");
      const s = (runner.timerSeconds % 60).toString().padStart(2, "0");
      el.textContent = `${m}:${s}`;
      el.classList.toggle("urgent", runner.timerSeconds <= 300);
      if (runner.timerSeconds <= 0) { clearTimer(); onExpire(); return; }
      runner.timerSeconds--;
    };
    tick();
    runner.timerHandle = setInterval(tick, 1000);
  }
  function clearTimer() { if (runner.timerHandle) clearInterval(runner.timerHandle); runner.timerHandle = null; }
});
