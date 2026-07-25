document.addEventListener("DOMContentLoaded", function () {
  requireAdminAuth(() => {
    document.getElementById("btnLogout").addEventListener("click", logoutAdmin);

    listenResults(results => {
      const wrap = document.getElementById("importedList");
      const entries = Object.entries(results);
      if (entries.length === 0) { wrap.innerHTML = `<p class="muted">No submissions yet.</p>`; return; }
      wrap.innerHTML = "";
      entries.forEach(([id, r]) => {
        const writingDone = r.writingBand !== undefined;
        const speakingDone = r.speakingBand !== undefined;
        const card = document.createElement("div");
        card.className = "exam-card";
        card.innerHTML = `
          <div>
            <div class="exam-card-name">${r.studentName} — ${r.examName}</div>
            <div class="exam-card-meta">L: ${r.listeningBand} &middot; R: ${r.readingBand} &middot; W: ${writingDone ? r.writingBand : "not graded"} &middot; S: ${speakingDone ? r.speakingBand : "not graded"} &middot; submitted ${r.submittedAt ? new Date(r.submittedAt).toLocaleString() : "—"}</div>
          </div>`;
        wrap.appendChild(card);
      });
    });
  });
});
