document.addEventListener("DOMContentLoaded", function () {
  const session = getSession();
  if (!session || !session.submittedAt) { window.location.href = "student-login.html"; return; }

  const chipsWrap = document.getElementById("prelimScores");
  // Upgraded UI: Shows all 4 skills. Uses a special 'pending' class for ungraded sections.
  chipsWrap.innerHTML = `
    <div class="score-chip"><div class="band-num">${session.listeningBand}</div><div class="band-label">Listening</div></div>
    <div class="score-chip"><div class="band-num">${session.readingBand}</div><div class="band-label">Reading</div></div>
    <div class="score-chip pending"><div class="band-num">⏳</div><div class="band-label">Writing (Pending)</div></div>
    <div class="score-chip pending"><div class="band-num">🎤</div><div class="band-label">Speaking (Pending)</div></div>`;

  downloadNow();
  document.getElementById("btnDownloadAgain").addEventListener("click", downloadNow);

  const teacherEmail = (getSettings().teacherEmail || "").trim();
  if (teacherEmail) {
    document.getElementById("emailBlock").style.display = "block";
    document.getElementById("teacherEmailDisplay").textContent = teacherEmail;
    document.getElementById("resultsExplainer").textContent = "Your preliminary results file has downloaded. Use the button below to email it to your teacher so they can grade your Writing task and schedule your Speaking assessment.";
    
    document.getElementById("btnEmailTeacher").addEventListener("click", () => {
      const subject = encodeURIComponent(`IELTS Result — ${session.studentName} — ${session.examName}`);
      const body = encodeURIComponent(
        `Hi,\n\nI have completed the IELTS mock test "${session.examName}".\n\n` +
        `Preliminary Scores:\nListening Band: ${session.listeningBand}\nReading Band: ${session.readingBand}\n\n` +
        `Please find my results file (downloaded as IELTS_Result_${session.studentName.replace(/\s+/g, "_")}_${session.examId}.json) attached so my Writing can be reviewed.\n\n` +
        `Thanks,\n${session.studentName}`
      );
      window.location.href = `mailto:${teacherEmail}?subject=${subject}&body=${body}`;
    });
  }

  function downloadNow() { downloadResultsFile(session); }

  clearSession();
});