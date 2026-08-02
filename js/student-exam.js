document.addEventListener("DOMContentLoaded", async function () {
  ensureExamContentStylesheet();

  const session = getSession();
  if (!session) { window.location.href = "student-login.html"; return; }
  const examGuard = createExamGuard();

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
    timerStarted: false,
    advanceHandle: null,
    lastPartMediaReady: false,
    visitedReadingParts: new Set()
  };

  const LISTENING_VOLUME_KEYS = {
    volume: "ehsanListeningVolume",
    muted: "ehsanListeningMuted",
    lastNonZero: "ehsanListeningLastNonZeroVolume"
  };
  const DEFAULT_LISTENING_VOLUME = 0.75;

  document.getElementById("runnerCandidateName").textContent = session.studentName;
  const questionsPane = document.getElementById("runnerQuestionsPane");
  ["copy", "cut", "paste", "contextmenu"].forEach(eventName => {
    questionsPane.addEventListener(eventName, event => {
      if (event.target.closest("input, textarea")) event.preventDefault();
    });
  });
  startSection("listening");

  function startSection(section) {
    clearTimeout(runner.advanceHandle);
    runner.advanceHandle = null;
    document.getElementById("runnerQuestionsPane").classList.remove("part-locked");
    runner.section = section;
    runner.parts = section === "listening" ? (exam.listening || []) : (exam.reading || []);
    runner.timerSeconds = SECTION_TIMES[section];
    runner.timerStarted = false;
    document.getElementById("runnerSectionTag").textContent = section.toUpperCase();
    const examBody = document.querySelector(".exam-body");
    examBody.classList.toggle("listening-workspace", section === "listening");
    examBody.classList.toggle("reading-workspace", section === "reading");

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
    updateTimerDisplay();
  }

  function ensureSectionTimerStarted() {
    if (runner.timerStarted) return;
    runner.timerStarted = true;
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

  function escapeAttribute(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function readStoredListeningNumber(key, fallback) {
    try {
      const rawValue = localStorage.getItem(key);
      if (rawValue === null || rawValue.trim() === "") return fallback;
      const value = Number(rawValue);
      return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function readStoredListeningMuted() {
    try {
      return localStorage.getItem(LISTENING_VOLUME_KEYS.muted) === "true";
    } catch (error) {
      return false;
    }
  }

  function storeListeningPreference(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (error) {
      // Storage can be unavailable in private/restricted browser contexts.
    }
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

  function questionWeight(question) {
    if (!question || question.type === "label") return 0;
    if (question.type === "fill" && Array.isArray(question.blankAnswers) && question.blankAnswers.length) return question.blankAnswers.length;
    if (question.type === "multi") {
      const count = Array.isArray(question.answer) ? question.answer.length : 0;
      return count > 0 ? count : 2;
    }
    return 1;
  }

  function currentQuestionById(questionId) {
    const part = runner.parts[runner.partIndex];
    return part && (part.questions || []).find(question => question.id === questionId);
  }

  function sectionQuestionNumber(partIndex, questionIndex) {
    let count = 0;
    for (let index = 0; index < partIndex; index += 1) {
      count += (runner.parts[index].questions || []).reduce((sum, question) => sum + questionWeight(question), 0);
    }
    const currentQuestions = runner.parts[partIndex].questions || [];
    for (let index = 0; index < questionIndex; index += 1) {
      count += questionWeight(currentQuestions[index]);
    }
    return count + 1;
  }

  function displayQuestionGroups(part, partIndex) {
    const questions = part.questions || [];
    const byId = new Map(questions.map((question, index) => [question.id, { question, questionIndex: index }]));
    const assigned = new Set();
    const groups = [];

    (Array.isArray(part.questionGroups) ? part.questionGroups : []).forEach(group => {
      const consumedByBlocks = contentBlocksConsumedIds(group.contentBlocks);
      const entries = (group.questionIds || [])
        .map(id => byId.get(id))
        .filter(entry => entry && !assigned.has(entry.question.id) && !consumedByBlocks.has(entry.question.id));
      entries.forEach(entry => assigned.add(entry.question.id));
      consumedByBlocks.forEach(id => assigned.add(id)); // still numbered/scored, just not rendered standalone
      groups.push({ label: group.label || "", contentBlocks: group.contentBlocks || [], entries });
    });

    const unassigned = questions
      .map((question, questionIndex) => ({ question, questionIndex }))
      .filter(entry => !assigned.has(entry.question.id));

    if (!groups.length) {
      groups.push({ label: part.questionLabel || part.instructions || "", contentBlocks: [], entries: unassigned });
    } else if (unassigned.length) {
      groups[groups.length - 1].entries.push(...unassigned);
    }

    return groups
      .filter(group => group.entries.length || hasRichContent(group.label) || (group.contentBlocks || []).length)
      .map(group => ({
        label: group.label,
        contentBlocks: group.contentBlocks || [],
        entries: group.entries.map(entry => {
          const weight = questionWeight(entry.question);
          const start = sectionQuestionNumber(partIndex, entry.questionIndex);
          return {
            question: entry.question,
            number: start,
            endNumber: weight > 1 ? start + weight - 1 : start
          };
        })
      }));
  }

  function formatQuestionRange(entries) {
    const numbers = [];
    entries.forEach(entry => {
      const weight = questionWeight(entry.question);
      if (weight <= 0) return; // labels contribute no question numbers
      for (let offset = 0; offset < weight; offset += 1) numbers.push(entry.number + offset);
    });
    if (!numbers.length) return "";
    if (numbers.length === 1) return `Question ${numbers[0]}`;
    const first = numbers[0];
    const last = numbers[numbers.length - 1];
    if (numbers.length === 2 && last === first + 1) return `Questions ${first} and ${last}`;
    return `Questions ${first} - ${last}`;
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

    // Sweep every inline answer input in the pane once — this covers both a
    // standalone question with an embedded blank and a content-block blank,
    // neither of which necessarily sits inside a "qblock-<id>" element.
    pane.querySelectorAll(".ielts-inline-answer").forEach(input => {
      if (!input.dataset.questionId) return;
      if (input.dataset.blankIndex !== undefined) {
        const values = Array.isArray(answers[input.dataset.questionId]) ? answers[input.dataset.questionId] : [];
        values[Number(input.dataset.blankIndex)] = input.value;
        answers[input.dataset.questionId] = values;
      } else {
        answers[input.dataset.questionId] = input.value;
      }
    });
    pane.querySelectorAll(".ielts-matching-select").forEach(select => {
      if (!select.dataset.questionId) return;
      if (select.value) answers[select.dataset.questionId] = select.value;
      else delete answers[select.dataset.questionId];
    });
    pane.querySelectorAll(".ielts-map-choice:checked").forEach(input => {
      if (input.dataset.questionId) answers[input.dataset.questionId] = input.value;
    });
    pane.querySelectorAll(".ielts-option-bank-select").forEach(select => {
      if (!select.dataset.questionId) return;
      if (select.value) answers[select.dataset.questionId] = select.value;
      else delete answers[select.dataset.questionId];
    });

    (part.questions || []).forEach(question => {
      const block = document.getElementById("qblock-" + question.id);
      if (!block) return;

      const matchingSelect = block.querySelector(".ielts-matching-select");
      if (matchingSelect) {
        if (matchingSelect.value) answers[question.id] = matchingSelect.value;
        else delete answers[question.id];
        return;
      }

      const mapChoice = block.querySelector(".ielts-map-choice:checked");
      if (block.querySelector(".ielts-map-choice")) {
        if (mapChoice) answers[question.id] = mapChoice.value;
        else delete answers[question.id];
        return;
      }

      const optionBankSelect = block.querySelector(".ielts-option-bank-select");
      if (optionBankSelect) {
        if (optionBankSelect.value) answers[question.id] = optionBankSelect.value;
        else delete answers[question.id];
        return;
      }

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
    clearTimeout(runner.advanceHandle);
    runner.advanceHandle = null;
    const audio = document.getElementById("listeningAudioEl");
    if (audio) audio.pause();
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
    document.getElementById("btnStartReading").addEventListener("click", () => {
      ensureSectionTimerStarted();
      renderRunnerPart(0, false);
    });
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
    const qPane = document.getElementById("runnerQuestionsPane");
    passagePane.scrollTop = 0;
    qPane.scrollTop = 0;
    qPane.classList.remove("part-locked");
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    if (runner.section === "listening") {
      passagePane.innerHTML = `
        <div class="audio-player-block listening-audio-bar">
          <div class="listening-audio-intro">
            <h3>${part.title}</h3>
            <p class="muted small">Audio starts automatically, plays once, and cannot be paused, rewound, or downloaded.</p>
          </div>
          <div class="audio-status-wrap" aria-live="polite">
            <span class="audio-status" id="audioStatus">Starting audio&hellip;</span>
          </div>
          <div class="audio-progress" id="audioProgress" hidden>
            <div class="audio-progress-meta"><span>Part progress</span><strong id="audioRemaining">Loading duration&hellip;</strong></div>
            <div class="audio-progress-track"><div class="audio-progress-fill" id="audioProgressFill"></div></div>
          </div>
          <div class="listening-volume-control">
            <label for="listeningVolume">Volume</label>
            <input type="range" id="listeningVolume" min="0" max="100" step="1" aria-label="Listening audio volume">
            <output id="listeningVolumeValue" for="listeningVolume">75%</output>
            <button type="button" class="btn btn-ghost btn-sm audio-mute-btn" id="audioMuteBtn" aria-pressed="false">Mute</button>
          </div>
          <div class="custom-audio-player audio-actions">
            <button class="btn btn-ghost" id="audioSkipBtn">Skip This Part</button>
          </div>
          <audio id="listeningAudioEl" preload="auto" autoplay src="${escapeAttribute(part.audio || "")}" style="display:none;" controlslist="nodownload noplaybackrate noremoteplayback" disableremoteplayback></audio>
          <div id="nextPartWrap" class="next-part-wrap" hidden>
            ${isLastPart
              ? `<button class="btn btn-primary btn-lg" id="btnNextPart">Continue to Reading &rarr;</button>`
              : `<button class="btn btn-primary btn-lg" id="btnNextPart">Next Part &rarr;</button>`}
            <p class="muted small">Moving on automatically in a moment…</p>
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

    qPane.innerHTML = "";
    const questionNumbersById = new Map((part.questions || []).map((question, questionIndex) => [
      question.id,
      sectionQuestionNumber(partIdx, questionIndex)
    ]));
    const questionsById = new Map((part.questions || []).map(question => [question.id, question]));
    displayQuestionGroups(part, partIdx).forEach((group, groupIndex) => {
      const section = document.createElement("details");
      const hasWideContent = (group.contentBlocks || []).some(block =>
        ["form", "matching", "mapLabelling", "table", "optionBank", "flow"].includes(block.type)
      );
      section.className = "exam-question-group" + (hasWideContent ? " listening-group-wide" : "");
      section.open = true;
      const range = formatQuestionRange(group.entries);
      const summary = document.createElement("summary");
      summary.className = "exam-question-group-summary";
      summary.innerHTML = `<span>${range || `Question group ${groupIndex + 1}`}</span><small>Collapse / expand</small>`;
      section.appendChild(summary);
      const groupBody = document.createElement("div");
      groupBody.className = "exam-question-group-body";
      const showAutomaticRange = range && !richLabelIncludesQuestionRange(group.label);
      if (showAutomaticRange || hasRichContent(group.label)) {
        const label = document.createElement("div");
        label.className = "exam-question-group-label";
        label.innerHTML = `
          ${showAutomaticRange ? `<div class="exam-question-range">${range}</div>` : ""}
          ${hasRichContent(group.label) ? `<div class="exam-rich-content">${group.label}</div>` : ""}`;
        groupBody.appendChild(label);
      }
      if ((group.contentBlocks || []).length) {
        const answersById = currentAnswers();
        const optionBank = group.contentBlocks.find(block => block.type === "optionBank") || null;
        const renderContext = { questionsById, optionBank };
        group.contentBlocks.forEach(block => {
          const wrap = document.createElement("div");
          wrap.innerHTML = renderContentBlock(block, answersById, false, questionNumbersById, renderContext);
          if (wrap.firstElementChild) groupBody.appendChild(wrap.firstElementChild);
        });
      }
      group.entries.forEach(entry => groupBody.appendChild(renderQuestionBlock(entry.question, entry.number, entry.endNumber)));
      section.appendChild(groupBody);
      qPane.appendChild(section);
    });
    updateOptionBankUsage();
    renderNavBubbles(part.questions || [], partIdx);
    updateSubmitGate();
  }

  function wireAudioPlayer(part) {
    const audioEl = document.getElementById("listeningAudioEl");
    const skipBtn = document.getElementById("audioSkipBtn");
    const muteBtn = document.getElementById("audioMuteBtn");
    const volumeInput = document.getElementById("listeningVolume");
    const volumeValue = document.getElementById("listeningVolumeValue");
    const statusEl = document.getElementById("audioStatus");
    const nextWrap = document.getElementById("nextPartWrap");
    const progressEl = document.getElementById("audioProgress");
    const progressFill = document.getElementById("audioProgressFill");
    const remainingEl = document.getElementById("audioRemaining");
    const activePartIndex = runner.partIndex;

    let preferredVolume = readStoredListeningNumber(LISTENING_VOLUME_KEYS.volume, DEFAULT_LISTENING_VOLUME);
    let previousNonZeroVolume = readStoredListeningNumber(
      LISTENING_VOLUME_KEYS.lastNonZero,
      preferredVolume > 0 ? preferredVolume : DEFAULT_LISTENING_VOLUME
    );
    let muted = readStoredListeningMuted() || preferredVolume === 0;

    function updateVolumeControls() {
      const percent = Math.round(preferredVolume * 100);
      volumeInput.value = String(percent);
      volumeInput.setAttribute("aria-valuetext", muted ? `${percent}% volume, muted` : `${percent}% volume`);
      volumeValue.value = muted ? `${percent}% (muted)` : `${percent}%`;
      volumeValue.textContent = volumeValue.value;
      muteBtn.textContent = muted ? "Unmute" : "Mute";
      muteBtn.setAttribute("aria-pressed", String(muted));
      muteBtn.setAttribute("aria-label", muted ? "Unmute listening audio" : "Mute listening audio");
    }

    function applyVolume() {
      audioEl.volume = preferredVolume;
      audioEl.muted = muted;
      updateVolumeControls();
    }

    function persistVolume() {
      storeListeningPreference(LISTENING_VOLUME_KEYS.volume, preferredVolume);
      storeListeningPreference(LISTENING_VOLUME_KEYS.muted, muted);
      storeListeningPreference(LISTENING_VOLUME_KEYS.lastNonZero, previousNonZeroVolume);
    }

    applyVolume();

    volumeInput.addEventListener("input", () => {
      const nextVolume = Math.min(100, Math.max(0, Number(volumeInput.value))) / 100;
      preferredVolume = Number.isFinite(nextVolume) ? nextVolume : DEFAULT_LISTENING_VOLUME;
      if (preferredVolume > 0) {
        previousNonZeroVolume = preferredVolume;
        muted = false;
      } else {
        muted = true;
      }
      applyVolume();
      persistVolume();
    });

    muteBtn.addEventListener("click", () => {
      if (muted) {
        if (preferredVolume === 0) preferredVolume = previousNonZeroVolume || DEFAULT_LISTENING_VOLUME;
        muted = false;
      } else {
        if (preferredVolume > 0) previousNonZeroVolume = preferredVolume;
        muted = true;
      }
      applyVolume();
      persistVolume();
    });

    audioEl.addEventListener("contextmenu", event => event.preventDefault());
    audioEl.playbackRate = 1;
    audioEl.addEventListener("ratechange", () => {
      if (audioEl.playbackRate !== 1) audioEl.playbackRate = 1;
    });

    let lastAllowedTime = 0;
    audioEl.addEventListener("timeupdate", () => {
      lastAllowedTime = audioEl.currentTime;
      updateAudioProgress();
    });
    audioEl.addEventListener("seeking", () => {
      if (Math.abs(audioEl.currentTime - lastAllowedTime) > 0.75) audioEl.currentTime = lastAllowedTime;
    });

    function formatDuration(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) return "Loading duration…";
      const total = Math.ceil(seconds);
      const minutes = Math.floor(total / 60).toString().padStart(2, "0");
      const remainder = (total % 60).toString().padStart(2, "0");
      return `${minutes}:${remainder} remaining`;
    }

    function updateAudioProgress() {
      const duration = audioEl.duration;
      const current = audioEl.currentTime;
      progressEl.hidden = false;
      remainingEl.textContent = formatDuration(Math.max(0, duration - current));
      progressFill.style.width = Number.isFinite(duration) && duration > 0
        ? `${Math.min(100, (current / duration) * 100)}%`
        : "0%";
    }

    function lockCurrentPart() {
      const questions = document.getElementById("runnerQuestionsPane");
      questions.classList.add("part-locked");
      questions.querySelectorAll("input, textarea, select, button").forEach(control => { control.disabled = true; });
      questions.querySelectorAll(".q-option").forEach(option => {
        option.setAttribute("aria-disabled", "true");
        option.style.pointerEvents = "none";
      });
    }

    function advanceFromCompletedPart() {
      clearTimeout(runner.advanceHandle);
      runner.advanceHandle = null;
      if (runner.section !== "listening" || runner.partIndex !== activePartIndex) return;
      if (activePartIndex === runner.parts.length - 1) submitSection();
      else moveToPart(activePartIndex + 1);
    }

    audioEl.addEventListener("loadedmetadata", updateAudioProgress);

    function onMediaReady() {
      runner.lastPartMediaReady = true;
      lockCurrentPart();
      nextWrap.hidden = false;
      updateSubmitGate();
      clearTimeout(runner.advanceHandle);
      runner.advanceHandle = setTimeout(advanceFromCompletedPart, 2600);
    }

    let autoplayAttempted = false;
    let removeAutoplayFallback = () => {};

    function startListeningAudio() {
      if (autoplayAttempted || audioEl.ended) return;
      autoplayAttempted = true;
      ensureSectionTimerStarted();
      statusEl.textContent = "Playing...";
      progressEl.hidden = false;
      audioEl.play()
        .then(() => removeAutoplayFallback())
        .catch(() => {
          autoplayAttempted = false;
          statusEl.textContent = "Autoplay is blocked. The recording will start with your next answer or keyboard action.";
        });
    }

    function startAfterAllowedInteraction(event) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("#audioSkipBtn, #audioMuteBtn, #listeningVolume, #btnSubmitSection")) return;
      startListeningAudio();
      if (autoplayAttempted) removeAutoplayFallback();
    }

    removeAutoplayFallback = () => {
      document.removeEventListener("pointerdown", startAfterAllowedInteraction, true);
      document.removeEventListener("keydown", startAfterAllowedInteraction, true);
    };
    document.addEventListener("pointerdown", startAfterAllowedInteraction, true);
    document.addEventListener("keydown", startAfterAllowedInteraction, true);
    startListeningAudio();

    skipBtn.addEventListener("click", () => {
      syncVisibleAnswers();
      if (!confirm("Skip this listening part? You won't be able to come back to it once you move on.")) return;
      ensureSectionTimerStarted();
      removeAutoplayFallback();
      audioEl.pause();
      skipBtn.style.display = "none";
      statusEl.textContent = "⏭ Your answers (if any) have been saved, and this part was skipped.";
      onMediaReady();
    });

    audioEl.addEventListener("ended", () => {
      removeAutoplayFallback();
      syncVisibleAnswers();
      statusEl.textContent = "✓ Finished playing";
      updateAudioProgress();
      skipBtn.style.display = "none";
      onMediaReady();
    });

    audioEl.addEventListener("error", () => {
      removeAutoplayFallback();
      syncVisibleAnswers();
      ensureSectionTimerStarted();
      statusEl.textContent = `⚠ Audio file not found at ${part.audio || "the configured path"}.`;
      skipBtn.style.display = "none";
      onMediaReady();
    });

    const nextBtn = document.getElementById("btnNextPart");
    if (nextBtn) nextBtn.addEventListener("click", advanceFromCompletedPart);
  }

  function renderQuestionBlock(question, questionNumber, endNumber) {
    if (question.type === "label") {
      const block = document.createElement("div");
      block.className = "exam-label-block exam-rich-content";
      block.innerHTML = question.text || "";
      return block;
    }

    const answers = currentAnswers();
    const block = document.createElement("div");
    block.className = "question-block";
    block.id = "qblock-" + question.id;

    const numberLabel = (endNumber && endNumber !== questionNumber)
      ? (endNumber === questionNumber + 1 ? `${questionNumber} and ${endNumber}` : `${questionNumber}–${endNumber}`)
      : questionNumber;
    const multiLimit = question.type === "multi" ? questionWeight(question) : 0;
    const savedMultiAnswers = question.type === "multi" && Array.isArray(answers[question.id])
      ? answers[question.id].filter(value => (question.options || []).includes(value)).slice(0, multiLimit)
      : [];
    if (question.type === "multi" && JSON.stringify(savedMultiAnswers) !== JSON.stringify(answers[question.id] || [])) {
      answers[question.id] = savedMultiAnswers;
    }
    const stemHasInlineSlot = question.type === "fill" && hasInlineSlot(question.text);
    const stemHtml = stemHasInlineSlot ? hydrateInlineSlots(question.text, question, answers[question.id] || "", false) : (question.text || "");
    let inner = `<div><span class="q-num">${numberLabel}.</span>${stemHtml}${question.type === "multi" ? `<span class="q-hint" data-multi-hint="${escapeAttribute(question.id)}">(select exactly ${multiLimit}; ${savedMultiAnswers.length} selected)</span>` : ""}</div>`;

    if (question.type === "mc" || question.type === "tfng") {
      const selected = answers[question.id];
      inner += `<div class="q-options">`;
      (question.options || []).forEach(option => {
        const isSelected = selected === option ? "selected" : "";
        inner += `<div class="q-option mc-opt ${isSelected}" data-qid="${escapeAttribute(question.id)}" data-val="${escapeAttribute(option)}"><span class="box"></span>${option}</div>`;
      });
      inner += `</div>`;
    } else if (question.type === "multi") {
      const selectedAnswers = savedMultiAnswers;
      inner += `<div class="q-options">`;
      (question.options || []).forEach(option => {
        const isSelected = selectedAnswers.includes(option) ? "selected" : "";
        inner += `<div class="q-option multi-opt ${isSelected}" data-qid="${escapeAttribute(question.id)}" data-val="${escapeAttribute(option)}" data-multi="1" data-multi-limit="${multiLimit}"><span class="box"></span>${option}</div>`;
      });
      inner += `</div>`;
    } else if (question.type === "fill" && !stemHasInlineSlot) {
      const value = answers[question.id] || "";
      inner += `<input type="text" class="q-fill-input" data-qid="${escapeAttribute(question.id)}" value="${escapeAttribute(value)}" placeholder="Your answer" autocomplete="off">`;
    }

    block.innerHTML = inner;
    return block;
  }

  document.getElementById("runnerQuestionsPane").addEventListener("click", event => {
    if (document.getElementById("runnerQuestionsPane").classList.contains("part-locked")) return;
    const option = event.target.closest(".q-option");
    if (!option) return;

    const answers = currentAnswers();
    if (option.dataset.multi) {
      const question = currentQuestionById(option.dataset.qid);
      const limit = question ? questionWeight(question) : Number(option.dataset.multiLimit || 2);
      const selected = Array.isArray(answers[option.dataset.qid]) ? [...answers[option.dataset.qid]] : [];
      const index = selected.indexOf(option.dataset.val);
      const hint = document.querySelector(`[data-multi-hint="${option.dataset.qid}"]`);

      if (index >= 0) {
        selected.splice(index, 1);
      } else if (selected.length >= limit) {
        if (hint) {
          hint.textContent = `(select exactly ${limit}; remove one before choosing another)`;
          hint.classList.add("limit-reached");
          setTimeout(() => {
            hint.textContent = `(select exactly ${limit}; ${selected.length} selected)`;
            hint.classList.remove("limit-reached");
          }, 1600);
        }
        return;
      } else {
        selected.push(option.dataset.val);
      }

      answers[option.dataset.qid] = selected;
      option.classList.toggle("selected", selected.includes(option.dataset.val));
      if (hint) {
        hint.textContent = `(select exactly ${limit}; ${selected.length} selected)`;
        hint.classList.toggle("selection-complete", selected.length === limit);
      }
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
    const target = event.target;
    if (target.classList.contains("q-fill-input")) {
      currentAnswers()[target.dataset.qid] = target.value;
    } else if (target.classList.contains("ielts-inline-answer")) {
      if (target.dataset.blankIndex !== undefined) {
        const values = Array.isArray(currentAnswers()[target.dataset.questionId]) ? currentAnswers()[target.dataset.questionId] : [];
        values[Number(target.dataset.blankIndex)] = target.value;
        currentAnswers()[target.dataset.questionId] = values;
      } else {
        currentAnswers()[target.dataset.questionId] = target.value;
      }
    } else if (target.classList.contains("ielts-matching-select")) {
      if (target.value) currentAnswers()[target.dataset.questionId] = target.value;
      else delete currentAnswers()[target.dataset.questionId];
    } else if (target.classList.contains("ielts-map-choice")) {
      if (target.checked) currentAnswers()[target.dataset.questionId] = target.value;
    } else if (target.classList.contains("ielts-option-bank-select")) {
      if (target.value) currentAnswers()[target.dataset.questionId] = target.value;
      else delete currentAnswers()[target.dataset.questionId];
      updateOptionBankUsage();
    } else {
      return;
    }
    saveSession(session);
    updateNavBubbles();
  });

  document.getElementById("runnerQuestionsPane").addEventListener("change", event => {
    const target = event.target;
    if (target.classList.contains("ielts-matching-select")) {
      if (target.value) currentAnswers()[target.dataset.questionId] = target.value;
      else delete currentAnswers()[target.dataset.questionId];
    } else if (target.classList.contains("ielts-map-choice")) {
      if (target.checked) currentAnswers()[target.dataset.questionId] = target.value;
    } else if (target.classList.contains("ielts-option-bank-select")) {
      if (target.value) currentAnswers()[target.dataset.questionId] = target.value;
      else delete currentAnswers()[target.dataset.questionId];
      updateOptionBankUsage();
    } else {
      return;
    }
    saveSession(session);
    updateNavBubbles();
  });

  function updateOptionBankUsage() {
    const pane = document.getElementById("runnerQuestionsPane");
    const answers = currentAnswers();
    let restoredDuplicateCleared = false;

    pane.querySelectorAll(".option-bank[data-option-bank-id]").forEach(bankElement => {
      const bankId = bankElement.dataset.optionBankId;
      const allowReuse = bankElement.dataset.allowReuse === "true";
      const selects = Array.from(pane.querySelectorAll(".ielts-option-bank-select"))
        .filter(select => select.dataset.optionBankId === bankId);

      if (!allowReuse) {
        const claimed = new Set();
        selects.forEach(select => {
          if (!select.value) return;
          if (claimed.has(select.value)) {
            select.value = "";
            delete answers[select.dataset.questionId];
            restoredDuplicateCleared = true;
          } else {
            claimed.add(select.value);
          }
        });
      }

      const usedCounts = new Map();
      selects.forEach(select => {
        if (select.value) usedCounts.set(select.value, (usedCounts.get(select.value) || 0) + 1);
      });
      bankElement.querySelectorAll("[data-bank-option]").forEach(optionElement => {
        optionElement.classList.toggle("is-used", usedCounts.has(optionElement.dataset.bankOption));
      });
      selects.forEach(select => {
        Array.from(select.options).forEach(option => {
          if (!option.value) return;
          option.disabled = !allowReuse && usedCounts.has(option.value) && select.value !== option.value;
        });
      });
    });

    if (restoredDuplicateCleared) saveSession(session);
  }

  function renderNavBubbles(questions, partIndex = runner.partIndex) {
    const wrap = document.getElementById("navBubbles");
    wrap.innerHTML = "";
    const answers = currentAnswers();

    questions.forEach((question, index) => {
      if (question.type === "label") return; // instructional text — not a scored question, no nav bubble
      const weight = questionWeight(question);
      const startNumber = sectionQuestionNumber(partIndex, index);
      const endNumber = weight > 1 ? startNumber + weight - 1 : startNumber;
      const value = answers[question.id];
      const hasAnswer = Array.isArray(value) ? value.length > 0 : normalizeAnswer(value).length > 0;
      const bubble = document.createElement("div");
      bubble.className = "nav-bubble" + (hasAnswer ? " answered" : "") + (weight > 1 ? " nav-bubble-wide" : "");
      bubble.textContent = endNumber !== startNumber ? `${startNumber}-${endNumber}` : startNumber;
      bubble.title = "Jump to question " + (endNumber !== startNumber ? `${startNumber} and ${endNumber}` : startNumber);
      bubble.addEventListener("click", () => document.getElementById("qblock-" + question.id)?.scrollIntoView({ behavior: "smooth", block: "center" }));
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
    clearTimeout(runner.advanceHandle);
    runner.advanceHandle = null;
    const audio = document.getElementById("listeningAudioEl");
    if (audio) audio.pause();
    clearTimer();

    if (runner.section === "listening") {
      session.listeningScore = scoreSection(exam.listening || [], session.listeningAnswers || {});
      session.scoringVersion = 3;
      saveSession(session);
      startSection("reading");
    } else {
      session.readingScore = scoreSection(exam.reading || [], session.readingAnswers || {});
      session.scoringVersion = 3;
      saveSession(session);
      examGuard.release();
      window.location.href = "student-writing.html";
    }
  }

  function startTimer(displayId, onExpire) {
    clearTimer();

    const tick = () => {
      updateTimerDisplay();

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

  function updateTimerDisplay() {
    const element = document.getElementById("runnerTimer");
    const minutes = Math.floor(runner.timerSeconds / 60).toString().padStart(2, "0");
    const seconds = (runner.timerSeconds % 60).toString().padStart(2, "0");
    element.textContent = `${minutes}:${seconds}`;
    element.classList.toggle("urgent", runner.timerStarted && runner.timerSeconds <= 300);
  }

  function clearTimer() {
    if (runner.timerHandle) clearInterval(runner.timerHandle);
    runner.timerHandle = null;
  }
});
