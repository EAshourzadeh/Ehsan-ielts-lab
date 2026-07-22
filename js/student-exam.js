document.addEventListener("DOMContentLoaded", async function () {
  const session = getSession();
  if (!session) { window.location.href = "student-login.html"; return; }

  const exams = await getExams();
  const exam = exams[session.examId];

  let runner = { section: null, parts: [], partIndex: 0, timerSeconds: 0, timerHandle: null, lastPartMediaReady: false };

  document.getElementById("runnerCandidateName").textContent = session.studentName;
  startSection("listening");

  function startSection(section) {
    runner.section = section;
    runner.parts = section === "listening" ? exam.listening : exam.reading;
    runner.timerSeconds = SECTION_TIMES[section];
    document.getElementById("runnerSectionTag").textContent = section.toUpperCase();
    renderRunnerPart(0);
    startTimer("runnerTimer", () => submitSection());
  }

  function currentAnswers() { return runner.section === "listening" ? session.listeningAnswers : session.readingAnswers; }

  function updateSubmitGate() {
    const btn = document.getElementById("btnSubmitSection");
    const isLastPart = runner.partIndex === runner.parts.length - 1;
    if (runner.section === "listening") {
      btn.disabled = !(isLastPart && runner.lastPartMediaReady);
      btn.title = btn.disabled ? "Finish listening to the final part before submitting" : "";
    } else {
      btn.disabled = false; // Reading has no audio-order constraint — free navigation
      btn.title = "";
    }
  }

  function renderRunnerPart(partIdx) {
    const part = runner.parts[partIdx];
    runner.partIndex = partIdx;
    runner.lastPartMediaReady = false;
    const isLastPart = partIdx === runner.parts.length - 1;
    document.getElementById("runnerPartLabel").textContent =
      `${runner.section === "listening" ? "Part" : "Passage"} ${partIdx + 1} of ${runner.parts.length} — ${part.title}`;

    const passagePane = document.getElementById("runnerPassagePane");
    if (runner.section === "listening") {
      passagePane.innerHTML = `
        <div class="audio-player-block">
          <h3>${part.title}</h3>
          <p class="muted small">Audio plays once. You cannot pause, rewind, skip ahead, or download it.</p>
          <div class="custom-audio-player">
            <button class="btn btn-primary btn-lg" id="audioPlayBtn">&#9654; Play Audio</button>
            <div class="audio-status" id="audioStatus" style="display:none;"></div>
          </div>
          <audio id="listeningAudioEl" preload="auto" src="${part.audio}" style="display:none;" controlslist="nodownload noplaybackrate noremoteplayback" disableremoteplayback></audio>
          <div id="nextPartWrap" style="display:none;margin-top:18px;">
            ${isLastPart
              ? `<p class="muted small">This was the final Listening part. Use <strong>Submit Section</strong> above when you're ready to move on to Reading.</p>`
              : `<button class="btn btn-primary" id="btnNextPart">Next Part &rarr;</button>`}
          </div>
        </div>`;
      wireAudioPlayer(part, isLastPart);
    } else {
      passagePane.innerHTML = `
        <h3>${part.title}</h3><p>${part.passage}</p>
        <div class="passage-nav" style="margin-top:20px;display:flex;gap:10px;">
          ${partIdx > 0 ? `<button class="btn btn-ghost btn-sm" id="btnPrevPassage">&larr; Previous Passage</button>` : ""}
          ${!isLastPart ? `<button class="btn btn-primary btn-sm" id="btnNextPassage">Next Passage &rarr;</button>` : ""}
        </div>`;
      const prevBtn = document.getElementById("btnPrevPassage");
      const nextBtn = document.getElementById("btnNextPassage");
      if (prevBtn) prevBtn.addEventListener("click", () => renderRunnerPart(partIdx - 1));
      if (nextBtn) nextBtn.addEventListener("click", () => renderRunnerPart(partIdx + 1));
    }

    const qPane = document.getElementById("runnerQuestionsPane");
    qPane.innerHTML = "";
    part.questions.forEach((q, i) => qPane.appendChild(renderQuestionBlock(q, i)));
    renderNavBubbles(part.questions);
    updateSubmitGate();
  }

  function wireAudioPlayer(part, isLastPart) {
    const audioEl = document.getElementById("listeningAudioEl");
    const playBtn = document.getElementById("audioPlayBtn");
    const statusEl = document.getElementById("audioStatus");
    const nextWrap = document.getElementById("nextPartWrap");

    audioEl.addEventListener("contextmenu", (e) => e.preventDefault());

    // Defensive anti-seek: audio has no visible scrub bar, but block programmatic/keyboard seeking too.
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
      statusEl.textContent = "&#9654; Playing…".replace("&#9654;", "▶");
    });
    audioEl.addEventListener("ended", () => {
      statusEl.textContent = "✓ Finished playing";
      onMediaReady();
    });
    audioEl.addEventListener("error", () => {
      statusEl.style.display = "block";
      statusEl.textContent = `⚠ Audio file not found at ${part.audio} — add it to assets/audio/ in the repo.`;
      playBtn.style.display = "none";
      onMediaReady(); // don't let a missing file block the exam
    });

    const btnNextPart = document.getElementById("btnNextPart");
    if (btnNextPart) btnNextPart.addEventListener("click", () => renderRunnerPart(runner.partIndex + 1));
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
      session.listeningScore = scoreSection(exam.listening, session.listeningAnswers);
      saveSession(session);
      startSection("reading");
    } else {
      session.readingScore = scoreSection(exam.reading, session.readingAnswers);
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
