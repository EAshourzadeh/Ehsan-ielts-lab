document.addEventListener("DOMContentLoaded", init);
window.addEventListener("pageshow", init); // also fires on back/forward-cache restores, so the name field can't reappear pre-filled

function init() {
  const nameInput = document.getElementById("studentNameInput");
  nameInput.value = ""; // always start blank, per-student

  const sel = document.getElementById("examSelect");
  sel.innerHTML = "";
  Object.values(getExams()).forEach(ex => {
    const opt = document.createElement("option");
    opt.value = ex.id; opt.textContent = ex.name;
    sel.appendChild(opt);
  });

  const btn = document.getElementById("btnStudentSubmit");
  const errBox = document.getElementById("studentLoginError");
  btn.onclick = () => {
    const name = nameInput.value.trim();
    const examId = sel.value;
    if (!name) { errBox.textContent = "Please enter your name."; return; }
    const exam = getExams()[examId];
    saveSession({
      studentName: name, examId, examName: exam.name,
      listeningAnswers: {}, readingAnswers: {},
      writingTask1: "", writingTask2: "",
      listeningScore: null, readingScore: null,
      submittedAt: null
    });
    window.location.href = "student-intro.html";
  };
}
