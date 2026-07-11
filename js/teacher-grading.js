document.addEventListener("DOMContentLoaded", function () {
  requireAdminAuth();
  document.getElementById("btnLogout").addEventListener("click", () => sessionStorage.removeItem(SS_ADMIN_AUTH));

  let workingResults = getResults(); // in-memory; persisted in bulk on Submit Grades, or individually on Generate Result

  function renderGradingList() {
    const wrap = document.getElementById("gradingList");
    wrap.innerHTML = "";
    const entries = Object.entries(workingResults);
    if (entries.length === 0) { wrap.innerHTML = `<p class="muted">No submissions imported yet. Go to Submissions to import student result files.</p>`; return; }

    entries.forEach(([id, r]) => {
      const overallBand = r.writingBand !== undefined ? (Math.round(((r.listeningBand + r.readingBand + r.writingBand) / 3) * 2) / 2).toFixed(1) : null;
      const card = document.createElement("div");
      card.className = "grading-card";
      card.innerHTML = `
        <h4>${r.studentName}</h4>
        <div class="muted small">${r.examName} &middot; L ${r.listeningBand} / R ${r.readingBand}${overallBand ? ` / Overall ${overallBand}` : ""}</div>
        <label style="font-weight:600;font-size:0.85rem;margin-top:14px;display:block;">Task 1 Response</label>
        <div class="grading-essay">${(r.writingTask1 || "(blank)")}</div>
        <label style="font-weight:600;font-size:0.85rem;">Task 2 Response</label>
        <div class="grading-essay">${(r.writingTask2 || "(blank)")}</div>
        <div class="grading-controls">
          <label style="font-weight:600;font-size:0.85rem;">Writing Band:</label>
          <select data-grade-band="${id}">
            <option value="">—</option>
            ${["9","8.5","8","7.5","7","6.5","6","5.5","5","4.5","4","3.5","3","2.5","2"].map(b => `<option value="${b}" ${String(r.writingBand) === b ? "selected" : ""}>${b}</option>`).join("")}
          </select>
          <input type="text" class="text-input" style="flex:1;min-width:180px;" placeholder="Feedback comment (optional)" value="${r.writingFeedback || ""}" data-grade-feedback="${id}">
          <button class="btn btn-ghost btn-sm" data-generate-result="${id}" ${r.writingBand === undefined ? "disabled title='Assign a Writing band first'" : ""}>Generate Result</button>
        </div>`;
      wrap.appendChild(card);
    });

    wrap.querySelectorAll("[data-grade-band]").forEach(sel => sel.addEventListener("change", e => {
      workingResults[e.target.dataset.gradeBand].writingBand = e.target.value === "" ? undefined : parseFloat(e.target.value);
      renderGradingList();
    }));
    wrap.querySelectorAll("[data-grade-feedback]").forEach(inp => inp.addEventListener("input", e => {
      workingResults[e.target.dataset.gradeFeedback].writingFeedback = e.target.value;
    }));
    wrap.querySelectorAll("[data-generate-result]").forEach(btn => btn.addEventListener("click", e => {
      const id = e.target.dataset.generateResult;
      saveResults(workingResults); // ensure this grade is persisted before generating
      generateResultReport(workingResults[id]);
    }));
  }

  document.getElementById("btnSubmitGrades").addEventListener("click", () => {
    saveResults(workingResults);
    const msg = document.getElementById("gradingSaveMsg");
    msg.textContent = "Grades saved ✓";
    setTimeout(() => { msg.textContent = ""; }, 2500);
  });

  renderGradingList();
});
