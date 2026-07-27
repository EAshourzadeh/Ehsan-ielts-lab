document.addEventListener("DOMContentLoaded", function () {
  const session = getSession();
  if (!session) { window.location.href = "student-login.html"; return; }
  document.getElementById("introExamName").textContent = session.examName;
  document.getElementById("btnStartExam").addEventListener("click", () => {
    session.examActive = true;
    saveSession(session);
    window.location.href = "student-exam.html";
  });
});
