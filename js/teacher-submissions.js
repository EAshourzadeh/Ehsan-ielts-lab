document.addEventListener("DOMContentLoaded", function () {
  requireAdminAuth();
  document.getElementById("btnLogout").addEventListener("click", () => sessionStorage.removeItem(SS_ADMIN_AUTH));

  document.getElementById("importResultsInput").addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    const results = getResults();
    let loaded = 0;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          const resultId = `${data.studentName}__${data.examId}__${data.submittedAt}`;
          results[resultId] = data;
        } catch (err) {
          alert(`Could not parse ${file.name}: not valid JSON.`);
        }
        loaded++;
        if (loaded === files.length) { saveResults(results); renderImportedList(); }
      };
      reader.readAsText(file);
    });
  });

  function renderImportedList() {
    const results = getResults();
    const wrap = document.getElementById("importedList");
    wrap.innerHTML = "";
    Object.entries(results).forEach(([id, r]) => {
      const writingDone = r.writingBand !== undefined;
      const card = document.createElement("div");
      card.className = "exam-card";
      card.innerHTML = `
        <div>
          <div class="exam-card-name">${r.studentName} — ${r.examName}</div>
          <div class="exam-card-meta">L: ${r.listeningBand} &middot; R: ${r.readingBand} &middot; W: ${writingDone ? r.writingBand : "not graded"} &middot; submitted ${new Date(r.submittedAt).toLocaleString()}</div>
        </div>
        <button class="btn btn-danger btn-sm" data-imp-del="${id}">Remove</button>`;
      wrap.appendChild(card);
    });
    wrap.querySelectorAll("[data-imp-del]").forEach(btn => btn.addEventListener("click", e => {
      const results = getResults(); delete results[e.target.dataset.impDel]; saveResults(results);
      renderImportedList();
    }));
  }
  renderImportedList();
});
