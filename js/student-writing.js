document.addEventListener("DOMContentLoaded", function () {
  const session = getSession();
  if (!session) { window.location.href = "student-login.html"; return; }

  document.getElementById("writingCandidateName").textContent = session.studentName;
  const exam = getExams()[session.examId];
  let timerSeconds = 0, timerHandle = null, currentTask = 1;

  showTask(1);

  function showTask(taskNum) {
    currentTask = taskNum;
    document.getElementById("writingTaskLabel").textContent = "Task " + taskNum;
    const promptPane = document.getElementById("writingPromptPane");
    const area = document.getElementById("writingAnswerArea");
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

  document.getElementById("writingAnswerArea").addEventListener("input", updateWordCount);
  function updateWordCount() {
    const text = document.getElementById("writingAnswerArea").value.trim();
    document.getElementById("wordCountNum").textContent = text ? text.split(/\s+/).length : 0;
  }

  document.getElementById("btnSubmitWritingTask").addEventListener("click", submitTask);

  function submitTask() {
    clearTimer();
    const text = document.getElementById("writingAnswerArea").value;
    if (currentTask === 1) {
      session.writingTask1 = text;
      saveSession(session);
      showTask(2);
    } else {
      session.writingTask2 = text;
      session.submittedAt = new Date().toISOString();
      session.listeningBand = rawToBand(session.listeningScore.correct);
      session.readingBand = rawToBand(session.readingScore.correct);
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
