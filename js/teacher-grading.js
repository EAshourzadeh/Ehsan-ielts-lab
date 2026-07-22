document.addEventListener("DOMContentLoaded", function () {
  requireAdminAuth(() => {
    document.getElementById("btnLogout").addEventListener("click", logoutAdmin);

    const bandsList = ["9", "8.5", "8", "7.5", "7", "6.5", "6", "5.5", "5", "4.5", "4", "3.5", "3", "2.5", "2"];

    let liveResults = {};   // latest snapshot from Firestore
    let localEdits = {};    // { resultId: { writingBand, speakingBand, writingFeedback } } not yet submitted
    let hasUnsavedChanges = false;

    function merged(id) {
      return Object.assign({}, liveResults[id], localEdits[id] || {});
    }

    listenResults(results => {
      liveResults = results;
      renderGradingList();
    });

    function renderGradingList() {
      const wrap = document.getElementById("gradingList");
      const ids = Object.keys(liveResults);
      if (ids.length === 0) { wrap.innerHTML = `<p class="muted">No submissions yet. Results appear here automatically once students finish their exam.</p>`; return; }

      wrap.innerHTML = "";
      ids.forEach(id => {
        const r = merged(id);
        const isComplete = r.writingBand !== undefined && r.speakingBand !== undefined;
        const overallBand = isComplete ? (Math.round(((r.listeningBand + r.readingBand + r.writingBand + r.speakingBand) / 4) * 2) / 2).toFixed(1) : null;

        const card = document.createElement("div");
        card.className = "grading-card";
        card.innerHTML = `
          <h4>${r.studentName}</h4>
          <div class="muted small">${r.examName} &middot; L ${r.listeningBand} / R ${r.readingBand}${overallBand ? ` / Overall ${overallBand}` : " / Pending Teacher Grades"}</div>
          <label style="font-weight:600;font-size:0.85rem;margin-top:14px;display:block;">Task 1 Response</label>
          <div class="grading-essay">${(r.writingTask1 || "(blank)")}</div>
          <label style="font-weight:600;font-size:0.85rem;">Task 2 Response</label>
          <div class="grading-essay">${(r.writingTask2 || "(blank)")}</div>
          <div class="grading-controls">
            <label style="font-weight:600;font-size:0.85rem;">Writing Band:</label>
            <select data-grade-band="${id}">
              <option value="">—</option>
              ${bandsList.map(b => `<option value="${b}" ${String(r.writingBand) === b ? "selected" : ""}>${b}</option>`).join("")}
            </select>

            <label style="font-weight:600;font-size:0.85rem;margin-left:14px;">Speaking Band:</label>
            <select data-grade-speaking="${id}">
              <option value="">—</option>
              ${bandsList.map(b => `<option value="${b}" ${String(r.speakingBand) === b ? "selected" : ""}>${b}</option>`).join("")}
            </select>

            <input type="text" class="text-input" style="flex:1;min-width:180px;margin-left:14px;" placeholder="Feedback comment (optional)" value="${r.writingFeedback || ""}" data-grade-feedback="${id}">
            <button class="btn btn-primary btn-sm" style="margin-left:auto;" data-generate-result="${id}" ${!isComplete ? "disabled title='Assign both Writing and Speaking bands first'" : ""}>Generate Final Report</button>
          </div>`;
        wrap.appendChild(card);
      });

      wrap.querySelectorAll("[data-grade-band]").forEach(sel => sel.addEventListener("change", e => {
        const id = e.target.dataset.gradeBand;
        localEdits[id] = localEdits[id] || {};
        localEdits[id].writingBand = e.target.value === "" ? undefined : parseFloat(e.target.value);
        hasUnsavedChanges = true;
        renderGradingList();
      }));

      wrap.querySelectorAll("[data-grade-speaking]").forEach(sel => sel.addEventListener("change", e => {
        const id = e.target.dataset.gradeSpeaking;
        localEdits[id] = localEdits[id] || {};
        localEdits[id].speakingBand = e.target.value === "" ? undefined : parseFloat(e.target.value);
        hasUnsavedChanges = true;
        renderGradingList();
      }));

      wrap.querySelectorAll("[data-grade-feedback]").forEach(inp => inp.addEventListener("input", e => {
        const id = e.target.dataset.gradeFeedback;
        localEdits[id] = localEdits[id] || {};
        localEdits[id].writingFeedback = e.target.value;
        hasUnsavedChanges = true;
      }));

      wrap.querySelectorAll("[data-generate-result]").forEach(btn => btn.addEventListener("click", async e => {
        const id = e.target.dataset.generateResult;
        e.target.disabled = true; e.target.textContent = "Saving...";
        await flushEdit(id);
        generateResultReport(merged(id));
        e.target.disabled = false; e.target.textContent = "Generate Final Report";
      }));
    }

    async function flushEdit(id) {
      const edit = localEdits[id];
      if (!edit) return;
      await updateResult(id, edit);
      delete localEdits[id];
    }

    document.getElementById("btnSubmitGrades").addEventListener("click", async () => {
      const btn = document.getElementById("btnSubmitGrades");
      const ids = Object.keys(localEdits);
      if (ids.length === 0) { return; }
      btn.disabled = true; btn.textContent = "Saving...";
      await Promise.all(ids.map(id => flushEdit(id)));
      btn.disabled = false; btn.textContent = "Submit Grades";
      hasUnsavedChanges = false;
      const msg = document.getElementById("gradingSaveMsg");
      msg.textContent = "Grades saved ✓";
      setTimeout(() => { msg.textContent = ""; }, 2500);
    });

    window.addEventListener("beforeunload", (e) => {
      if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = ""; }
    });
  });
});
