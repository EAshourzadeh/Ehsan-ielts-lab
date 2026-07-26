document.addEventListener("DOMContentLoaded", function () {
  const session = getSession();
  if (!session) { window.location.href = "student-login.html"; return; }
  document.getElementById("introExamName").textContent = session.examName;
  document.getElementById("btnStartExam").addEventListener("click", async () => {
    const message = document.getElementById("fullscreenMessage");
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      session.examActive = true;
      saveSession(session);
      window.location.href = "student-exam.html";
    } catch (error) {
      message.textContent = "Fullscreen permission is required to start. Allow fullscreen and try again.";
    }
  });
});
