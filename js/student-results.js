document.addEventListener("DOMContentLoaded", function () {
  const session = getSession();
  if (!session || !session.submittedAt) { window.location.href = "student-login.html"; return; }

  const chipsWrap = document.getElementById("prelimScores");
  chipsWrap.innerHTML = `
    <div class="score-chip"><div class="band-num">${session.listeningBand}</div><div class="band-label">Listening</div></div>
    <div class="score-chip"><div class="band-num">${session.readingBand}</div><div class="band-label">Reading</div></div>
    <div class="score-chip"><div class="band-num">—</div><div class="band-label">Writing (pending)</div></div>`;

  // Session's job is done — clear it so a stray back-navigation can't resubmit or overwrite it.
  clearSession();
});
