document.addEventListener("DOMContentLoaded", async function () {
  ensureExamContentStylesheet();

  const session = getSession();
  if (!session) { window.location.href = "student-login.html"; return; }

  const exams = await getExams();
  const exam = exams[session.examId];
  if (!exam) {
    alert("This exam is no longer available. Please return to the login page and choose another exam.");
    window.location.href = "student-login.html";
    return;
  }

  session.listeningAnswers = session.listeningAnswers || {};
  session.readingAnswers = session.readingAnswers || {};

  const runner = {
    section: null,
    parts: [],
    partIndex: 0,
    timerSeconds: 0,
    timerHandle: null,
    lastPartMediaReady: false,
    visitedReadingParts: new Set()
  };

  document.getElementById("runnerCandidateName").textContent = session.studentName;
  startSection("listening");

  function startSection(section) {
    runner.section = section;
    runner.parts = section === "listening" ? (exam.listening || []) : (exam.reading || []);
    runner.timerSeconds = SECTION_TIMES[section];
    document.getElementById("runnerSectionTag").textContent = section.toUpperCase();

    if (runner.parts.length === 0) {
      submitSection();
      return;
    }

    if (section === "reading") {
      runner.visitedReadingParts = new Set();
      renderReadingInstructions();
    } else {
      renderRunnerPart(0, false);
    }
    startTimer("runnerTimer", submitSection);
  }

  function currentAnswers() {
    const key = runner.section === "listening" ? "listeningAnswers" : "readingAnswers";
    session[key] = session[key] || {};
    return session[key];
  }

  function normalizeAnswer(value) {
    return String(value ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase();
  }

  function questionIsCorrect(question, givenAnswer) {
    if (question.type === "multi") {
      const given = (Array.isArray(givenAnswer) ? givenAnswer : [])
        .map(normalizeAnswer)
        .filter(Boolean)
        .sort();
      const key = (Array.isArray(question.answer) ? question.answer : [])
        .map(normalizeAnswer)
        .filter(Boolean)
        .sort();
      return given.length === key.length && given.every((value, index) => value === key[index]);
    }

    const given = normalizeAnswer(givenAnswer);
    const accepted = Array.isArray(question.answer) ? question.answer : [question.answer];
    return Boolean(given) && accepted.some(answer => normalizeAnswer(answer) === given);
  }

  function scoreExamSection(parts, answers) {
    let total = 0;
    let correct = 0;

    (parts || []).forEach(part => {
      (part.questions || []).forEach(question => {
        total += 1;
        if (questionIsCorrect(question, answers[question.id])) correct += 1;
      });
    });

    return { correct, total };
  }

  function escapeAttribute(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function ensureExamContentStylesheet() {
    if (document.querySelector('link[data-exam-content-editors="1"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/exam-content-editors.css";
    link.dataset.examContentEditors = "1";
    document.head.appendChild(link);
  }

  function hasRichContent(html) {
    const value = String(html || "").trim();
    return Boolean(value && value !== "<p><br></p>");
  }

  function sectionQuestionNumber(partIndex, questionIndex) {
    let count = 0;
    for (let index = 0; index < partIndex; index += 1) {
      count += (runner.parts[index].questions || []).length;
    }
    return count + questionIndex + 1;
  }

  function displayQuestionGroups(part, partIndex) {
    const questions = part.questions || [];
    const byId = new Map(questions.map((question, index) => [question.id, { question, questionIndex: index }]));
    const assigned = new Set();
    const groups = [];

    (Array.isArray(part.questionGroups) ? part.questionGroups : []).forEach(group => {
      const entries = (group.questionIds || [])
        .map(id => byId.get(id))
        .filter(entry => entry && !assigned.has(entry.question.id));
      entries.forEach(entry => assigned.add(entry.question.id));
      groups.push({ label: group.label || "", entries });
    });

    const unassigned = questions
      .map((question, questionIndex) => ({ question, questionIndex }))
      .filter(entry => !assigned.has(entry.question.id));

    if (!groups.length) {
      groups.push({ label: part.questionLabel || part.instructions || "", entries: unassigned });
    } else if (unassigned.length) {
      groups[groups.length - 1].entries.push(...unassigned);
    }

    return groups
      .filter(group => group.entries.length || hasRichContent(group.label))
      .map(group => ({
        label: group.label,
        entries: group.entries.map(entry => ({
          question: entry.question,
          number: sectionQuestionNumber(partIndex, entry.questionIndex)
        }))
      }));
  }

  function formatQuestionRange(entries) {
    const numbers = entries.map(entry => entry.number);
    if (!numbers.length) return "";
    if (numbers.length === 1) return `Question ${numbers[0]}`;
    if (numbers.length === 2 && numbers[1] === numbers[0] + 1) return `Questions ${numbers[0]} and ${numbers[1]}`;
    return `Questions ${numbers[0]} - ${numbers[numbers.length - 1]}`;
  }

  function richLabelIncludesQuestionRange(html) {
    const scratch = document.createElement("div");
    scratch.innerHTML = String(html || "");
    return /\bquestions?\s+\d+/i.test(scratch.textContent || "");
  }

  // Capture the visible controls directly before every navigation or submission.
  // This protects answers even if a browser delays an input/change event while Skip is clicked.
  function syncVisibleAnswers() {
    const pane = document.getElementById("runnerQuestionsPane");
    const part = runner.parts[runner.partIndex];
    if (!pane || !part) return;

    const answers = currentAnswers();
    (part.questions || []).forEach(question => {
      const block = document.getElementById("qblock-" + question.id);
      if (!block) return;

      if (question.type === "fill") {
        const input = block.querySelector(".q-fill-input");
        if (input) answers[question.id] = input.value;
        return;
      }

      const selected = Array.from(block.querySelectorAll(".q-option.selected"))
        .map(option => option.dataset.val);

      if (question.type === "multi") {
        if (selected.length) answers[question.id] = selected;
        else delete answers[question.id];
      } else if (selected.length) {
        answers[question.id] = selected[0];
      } else {
        delete answers[question.id];
      }
    });

    saveSession(session);
  }

  function updateSubmitGate() {
    const btn = document.getElementById("btnSubmitSection");
    const isLastPart = runner.partIndex === runner.parts.length - 1;

    if (runner.section === "listening") {
      btn.disabled = !(isLastPart && runner.lastPartMediaReady);
      btn.title = btn.disabled ? "Finish or skip the final listening part before submitting" : "";
    } else {
      const allPassagesVisited = runner.parts.length > 0 && runner.visitedReadingParts.size >= runner.parts.length;
      btn.disabled = !allPassagesVisited;
      btn.title = allPassagesVisited ? "" : "Visit every reading passage before submitting the section";
    }
  }

  function moveToPart(partIdx) {
    syncVisibleAnswers();
    renderRunnerPart(partIdx, false);
  }

  function renderReadingInstructions() {
    document.getElementById("runnerPartLabel").textContent = `Instructions — ${runner.parts.length} passage${runner.parts.length === 1 ? "" : "s"}`;
    document.getElementById("runnerPassagePane").innerHTML = `
      <section style="max-width:720px;margin:32px auto;padding:28px;border:1px solid var(--border, #d9dee8);border-radius:16px;background:var(--surface, #fff);">
        <div class="section-tag" style="display:inline-block;margin-bottom:12px;">READING</div>
        <h2 style="margin-top:0;">Before you begin</h2>
        <p>This section contains <strong>${runner.parts.length} passage${runner.parts.length === 1 ? "" : "s"}</strong>. Your answers are saved automatically as you work.</p>
        <ul style="line-height:1.75;padding-left:22px;">
          <li>Use the sticky <strong>Previous Passage</strong> and <strong>Next Passage</strong> controls to move between passages.</li>
          <li>Visit every passage before submitting the section.</li>
          <li>Check the numbered question bubbles for unanswered questions.</li>
          <li>After submitting, you cannot return to the Reading section.</li>
        </ul>
        <button type="button" class="btn btn-primary btn-lg" id="btnStartReading">Start Reading</button>
      </section>`;
    document.getElementById("runnerQuestionsPane").innerHTML = `
      <div class="grading-detail-empty" style="padding:36px;text-align:center;">
        <h3>Reading instructions</h3>
        <p class="muted">Select <strong>Start Reading</strong> to open Passage 1.</p>
      </div>`;
    document.getElementById("navBubbles").innerHTML = "";
    updateSubmitGate();
    document.getElementById("btnStartReading").addEventListener("click", () => renderRunnerPart(0, false));
  }


  function renderRunnerPart(partIdx, syncCurrent = true) {
    if (syncCurrent) syncVisibleAnswers();

    const part = runner.parts[partIdx];
    if (!part) return;

    runner.partIndex = partIdx;
    runner.lastPartMediaReady = false;
    if (runner.section === "reading") runner.visitedReadingParts.add(partIdx);
    const isLastPart = partIdx === runner.parts.length - 1;

    document.getElementById("runnerPartLabel").textContent =
      `${runner.section === "listening" ? "Part" : "Passage"} ${partIdx + 1} of ${runner.parts.length} — ${part.title}`;

    const passagePane = document.getElementById("runnerPassagePane");
    if (runner.section === "listening") {
      passagePane.innerHTML = `
        <div class="audio-player-block">
          <h3>${part.title}</h3>
          <p class="muted small">Audio plays once and cannot be paused, rewound, or downloaded. If you want to move on before the audio finishes, make sure you have entered your answers, then use <strong>Skip This Part</strong>.</p>
          <div class="custom-audio-player">
            <button class="btn btn-primary btn-lg" id="audioPlayBtn">&#9654; Play Audio</button>
            <button class="btn btn-ghost btn-sm" id="audioSkipBtn">Skip This Part</button>
            <div class="audio-status" id="audioStatus" style="display:none;"></div>
          </div>
          <audio id="listeningAudioEl" preload="auto" src="${escapeAttribute(part.audio || "")}" style="display:none;" controlslist="nodownload noplaybackrate noremoteplayback" disableremoteplayback></audio>
          <div id="nextPartWrap" style="display:none;margin-top:18px;">
            ${isLastPart
              ? `<p class="muted small">This was the final Listening part. Use <strong>Submit Section</strong> above when you're ready to move on to Reading.</p>`
              : `<button class="btn btn-primary" id="btnNextPart">Next Part &rarr;</button>`}
          </div>
        </div>`;
      wireAudioPlayer(part);
    } else {
      const navigationButtons = `
        ${partIdx > 0 ? `<button type="button" class="btn btn-ghost btn-sm" data-reading-prev>&larr; Previous Passage</button>` : `<span></span>`}
        <strong style="align-self:center;">Passage ${partIdx + 1} of ${runner.parts.length}</strong>
        ${!isLastPart ? `<button type="button" class="btn btn-primary btn-sm" data-reading-next>Next Passage &rarr;</button>` : `<span class="muted small" style="align-self:center;">Final passage</span>`}`;

      passagePane.innerHTML = `
        <div class="passage-nav" style="position:sticky;top:0;z-index:3;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;margin:-1px -1px 20px;padding:12px;background:rgba(255,255,255,.96);border:1px solid var(--border, #d9dee8);border-radius:10px;box-shadow:0 5px 16px rgba(20,35,65,.08);">
          ${navigationButtons}
        </div>
        ${hasRichContent(part.intro) ? `<div class="reading-passage-intro exam-rich-content">${part.intro}</div>` : ""}
        <h3>${part.title}</h3>
        <div class="reading-passage-body exam-rich-content">${part.passage || ""}</div>
        <div class="passage-nav" style="margin-top:24px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;padding-top:16px;border-top:1px solid var(--border, #d9dee8);">
          ${navigationButtons}
        </div>`;

      passagePane.querySelectorAll("[data-reading-prev]").forEach(button => button.addEventListener("click", () => moveToPart(partIdx - 1)));
      passagePane.querySelectorAll("[data-reading-next]").forEach(button => button.addEventListener("click", () => moveToPart(partIdx + 1)));
    }

    const qPane = document.getElementById("runnerQuestionsPane");
    qPane.innerHTML = "";
    displayQuestionGroups(part, partIdx).forEach(group => {
      const section = document.createElement("section");
      section.className = "exam-question-group";
      const range = formatQuestionRange(group.entries);
      const showAutomaticRange = range && !richLabelIncludesQuestionRange(group.label);
      if (showAutomaticRange || hasRichContent(group.label)) {
        const label = document.createElement("div");
        label.className = "exam-question-group-label";
        label.innerHTML = `
          ${showAutomaticRange ? `<div class="exam-question-range">${range}</div>` : ""}
          ${hasRichContent(group.label) ? `<div class="exam-rich-content">${group.label}</div>` : ""}`;
        section.appendChild(label);
      }
      group.entries.forEach(entry => section.appendChild(renderQuestionBlock(entry.question, entry.number)));
      qPane.appendChild(section);
    });
    renderNavBubbles(part.questions || [], partIdx);
    updateSubmitGate();
  }

  function wireAudioPlayer(part) {
    const audioEl = document.getElementById("listeningAudioEl");
    const playBtn = document.getElementById("audioPlayBtn");
    const skipBtn = document.getElementById("audioSkipBtn");
    const statusEl = document.getElementById("audioStatus");
    const nextWrap = document.getElementById("nextPartWrap");

    audioEl.addEventListener("contextmenu", event => event.preventDefault());

    let lastAllowedTime = 0;
    audioEl.addEventListener("timeupdate", () => { lastAllowedTime = audioEl.currentTime; });
    audioEl.addEventListener("seeking", () => {
      if (Math.abs(audioEl.currentTime - lastAllowedTime) > 0.75) audioEl.currentTime = lastAllowedTime;
    });

    function onMediaReady() {
      runner.lastPartMediaReady = true;
      nextWrap.style.display = "block";
      updateSubmitGate();
    }

    playBtn.addEventListener("click", () => {
      audioEl.play().catch(() => {
        statusEl.style.display = "block";
        statusEl.textContent = "Couldn't start audio automatically — check your browser's autoplay setting.";
      });
      playBtn.style.display = "none";
      statusEl.style.display = "block";
      statusEl.textContent = "▶ Playing…";
    });

    skipBtn.addEventListener("click", () => {
      syncVisibleAnswers();
      if (!confirm("Skip this listening part? You won't be able to come back to it once you move on.")) return;
      audioEl.pause();
      playBtn.style.display = "none";
      skipBtn.style.display = "none";
      statusEl.style.display = "block";
      statusEl.textContent = "⏭ Your answers (if any) have been saved, and this part was skipped.";
      onMediaReady();
    });

    audioEl.addEventListener("ended", () => {
      syncVisibleAnswers();
      statusEl.textContent = "✓ Finished playing";
      skipBtn.style.display = "none";
      onMediaReady();
    });

    audioEl.addEventListener("error", () => {
      syncVisibleAnswers();
      statusEl.style.display = "block";
      statusEl.textContent = `⚠ Audio file not found at ${part.audio || "the configured path"}.`;
      playBtn.style.display = "none";
      skipBtn.style.display = "none";
      onMediaReady();
    });

    const nextBtn = document.getElementById("btnNextPart");
    if (nextBtn) nextBtn.addEventListener("click", () => moveToPart(runner.partIndex + 1));
  }

  function renderQuestionBlock(question, questionNumber) {
    const answers = currentAnswers();
    const block = document.createElement("div");
    block.className = "question-block";
    block.id = "qblock-" + question.id;

    let inner = `<div><span class="q-num">${questionNumber}.</span>${question.text || ""}${question.type === "multi" ? `<span class="q-hint">(select ${(question.answer || []).length || 2})</span>` : ""}</div>`;

    if (question.type === "mc" || question.type === "tfng") {
      const selected = answers[question.id];
      inner += `<div class="q-options">`;
      (question.options || []).forEach(option => {
        const isSelected = selected === option ? "selected" : "";
        inner += `<div class="q-option mc-opt ${isSelected}" data-qid="${escapeAttribute(question.id)}" data-val="${escapeAttribute(option)}"><span class="box"></span>${option}</div>`;
      });
      inner += `</div>`;
    } else if (question.type === "multi") {
      const selectedAnswers = Array.isArray(answers[question.id]) ? answers[question.id] : [];
      inner += `<div class="q-options">`;
      (question.options || []).forEach(option => {
        const isSelected = selectedAnswers.includes(option) ? "selected" : "";
        inner += `<div class="q-option multi-opt ${isSelected}" data-qid="${escapeAttribute(question.id)}" data-val="${escapeAttribute(option)}" data-multi="1"><span class="box"></span>${option}</div>`;
      });
      inner += `</div>`;
    } else if (question.type === "fill") {
      const value = answers[question.id] || "";
      inner += `<input type="text" class="q-fill-input" data-qid="${escapeAttribute(question.id)}" value="${escapeAttribute(value)}" placeholder="Your answer" autocomplete="off">`;
    }

    block.innerHTML = inner;
    return block;
  }

  document.getElementById("runnerQuestionsPane").addEventListener("click", event => {
    const option = event.target.closest(".q-option");
    if (!option) return;

    const answers = currentAnswers();
    if (option.dataset.multi) {
      const selected = Array.isArray(answers[option.dataset.qid]) ? [...answers[option.dataset.qid]] : [];
      const index = selected.indexOf(option.dataset.val);
      if (index >= 0) selected.splice(index, 1);
      else selected.push(option.dataset.val);
      answers[option.dataset.qid] = selected;
      option.classList.toggle("selected", selected.includes(option.dataset.val));
    } else {
      answers[option.dataset.qid] = option.dataset.val;
      document.querySelectorAll(".q-option").forEach(element => {
        if (element.dataset.qid === option.dataset.qid) element.classList.remove("selected");
      });
      option.classList.add("selected");
    }

    saveSession(session);
    updateNavBubbles();
  });

  document.getElementById("runnerQuestionsPane").addEventListener("input", event => {
    if (!event.target.classList.contains("q-fill-input")) return;
    currentAnswers()[event.target.dataset.qid] = event.target.value;
    saveSession(session);
    updateNavBubbles();
  });

  function renderNavBubbles(questions, partIndex = runner.partIndex) {
    const wrap = document.getElementById("navBubbles");
    wrap.innerHTML = "";
    const answers = currentAnswers();

    questions.forEach((question, index) => {
      const questionNumber = sectionQuestionNumber(partIndex, index);
      const value = answers[question.id];
      const hasAnswer = Array.isArray(value) ? value.length > 0 : normalizeAnswer(value).length > 0;
      const bubble = document.createElement("div");
      bubble.className = "nav-bubble" + (hasAnswer ? " answered" : "");
      bubble.textContent = questionNumber;
      bubble.title = "Jump to question " + questionNumber;
      bubble.addEventListener("click", () => document.getElementById("qblock-" + question.id).scrollIntoView({ behavior: "smooth", block: "center" }));
      wrap.appendChild(bubble);
    });
  }

  function updateNavBubbles() {
    const part = runner.parts[runner.partIndex];
    if (part) renderNavBubbles(part.questions || [], runner.partIndex);
  }

  document.getElementById("btnSubmitSection").addEventListener("click", () => {
    syncVisibleAnswers();
    if (confirm("Submit this section? You cannot return to it once submitted.")) submitSection();
  });

  function submitSection() {
    syncVisibleAnswers();
    clearTimer();

    if (runner.section === "listening") {
      session.listeningScore = scoreExamSection(exam.listening || [], session.listeningAnswers || {});
      session.scoringVersion = 2;
      saveSession(session);
      startSection("reading");
    } else {
      session.readingScore = scoreExamSection(exam.reading || [], session.readingAnswers || {});
      session.scoringVersion = 2;
      saveSession(session);
      window.location.href = "student-writing.html";
    }
  }

  function startTimer(displayId, onExpire) {
    clearTimer();
    const element = document.getElementById(displayId);

    const tick = () => {
      const minutes = Math.floor(runner.timerSeconds / 60).toString().padStart(2, "0");
      const seconds = (runner.timerSeconds % 60).toString().padStart(2, "0");
      element.textContent = `${minutes}:${seconds}`;
      element.classList.toggle("urgent", runner.timerSeconds <= 300);

      if (runner.timerSeconds <= 0) {
        clearTimer();
        onExpire();
        return;
      }
      runner.timerSeconds -= 1;
    };

    tick();
    runner.timerHandle = setInterval(tick, 1000);
  }

  function clearTimer() {
    if (runner.timerHandle) clearInterval(runner.timerHandle);
    runner.timerHandle = null;
  }
});
