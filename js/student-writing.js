document.addEventListener("DOMContentLoaded", async function () {
  const session = getSession();
  if (!session) { window.location.href = "student-login.html"; return; }

  document.getElementById("writingCandidateName").textContent = session.studentName;
  const exams = await getExams();
  const exam = exams[session.examId];
  let timerSeconds = 0, timerHandle = null, currentTask = 1;

  /* ---------- Block copy / cut / paste / right-click on the answer box ---------- */
  const area = document.getElementById("writingAnswerArea");
  ["copy", "cut", "paste", "contextmenu"].forEach(evt => {
    area.addEventListener(evt, (e) => e.preventDefault());
  });
  area.addEventListener("drop", (e) => e.preventDefault()); // block dragging text in from elsewhere

  showTask(1);

  function showTask(taskNum) {
    currentTask = taskNum;
    document.getElementById("writingTaskLabel").textContent = "Task " + taskNum;
    const promptPane = document.getElementById("writingPromptPane");
    area.value = "";
    updateWordCount();
    if (taskNum === 1) {
      promptPane.innerHTML = `<h3>Task 1</h3><p>${exam.writing.task1Prompt}</p>` + (exam.writing.task1Image ? `<img src="${exam.writing.task1Image}" style="max-width:100%;border-radius:8px;margin-top:10px;" alt="Task 1 chart">` : "");
      timerSeconds = SECTION_TIMES.writingTask1;
    } else {
      promptPane.innerHTML = `<h3>Task 2</h3><p>${exam.writing.task2Prompt}</p>`;
      timerSeconds = SECTION_TIMES.writingTask2;
    }
    startTimer();
  }

  area.addEventListener("input", updateWordCount);
  function updateWordCount() {
    const text = area.value.trim();
    document.getElementById("wordCountNum").textContent = text ? text.split(/\s+/).length : 0;
  }

  const submitBtn = document.getElementById("btnSubmitWritingTask");
  submitBtn.addEventListener("click", submitTask);

  async function submitTask() {
    clearTimer();
    const text = area.value;
    if (currentTask === 1) {
      session.writingTask1 = text;
      saveSession(session);
      showTask(2);
    } else {
      submitBtn.disabled = true; submitBtn.textContent = "Submitting...";
      session.writingTask2 = text;
      session.submittedAt = new Date().toISOString();
      session.listeningBand = rawToBand(session.listeningScore.correct);
      session.readingBand = rawToBand(session.readingScore.correct);
      const resultId = generateResultId();
      session.resultId = resultId;
      await createResult(resultId, session);
      saveSession(session);
      window.location.href = "student-results.html";
    }
  }

  function startTimer() {
    clearTimer();
    const el = document.getElementById("writingTimer");
    const tick = () => {
      const m = Math.floor(timerSeconds / 60).toString().padStart(2, "0");
      const s = (timerSeconds % 60).toString().padStart(2, "0");
      el.textContent = `${m}:${s}`;
      el.classList.toggle("urgent", timerSeconds <= 300);
      if (timerSeconds <= 0) { clearTimer(); submitTask(); return; }
      timerSeconds--;
    };
    tick();
    timerHandle = setInterval(tick, 1000);
  }
  function clearTimer() { if (timerHandle) clearInterval(timerHandle); timerHandle = null; }
});
