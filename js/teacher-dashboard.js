document.addEventListener("DOMContentLoaded", function () {
  requireAdminAuth();

  document.getElementById("btnLogout").addEventListener("click", () => sessionStorage.removeItem(SS_ADMIN_AUTH));

  const emailInput = document.getElementById("teacherEmailInput");
  emailInput.value = getSettings().teacherEmail || "";
  document.getElementById("btnSaveEmail").addEventListener("click", () => {
    const settings = getSettings();
    settings.teacherEmail = emailInput.value.trim();
    saveSettings(settings);
    const msg = document.getElementById("emailSaveMsg");
    msg.textContent = "Saved ✓";
    setTimeout(() => { msg.textContent = ""; }, 2500);
  });

  document.getElementById("btnNewExam").addEventListener("click", () => {
    const name = prompt("Name this exam:");
    if (!name) return;
    const id = "exam-" + Date.now();
    const exams = getExams();
    exams[id] = { id, name, listening: [], reading: [], writing: { task1Prompt: "", task1Image: "", task2Prompt: "" } };
    saveExams(exams);
    renderExamList();
  });

  function renderExamList() {
    const exams = getExams();
    const wrap = document.getElementById("examList");
    wrap.innerHTML = "";
    Object.values(exams).forEach(ex => {
      const lCount = ex.listening.reduce((n, p) => n + p.questions.length, 0);
      const rCount = ex.reading.reduce((n, p) => n + p.questions.length, 0);
      const card = document.createElement("div");
      card.className = "exam-card";
      card.innerHTML = `
        <div>
          <div class="exam-card-name">${ex.name}</div>
          <div class="exam-card-meta">${lCount} listening q &middot; ${rCount} reading q &middot; ${ex.listening.length} audio parts</div>
        </div>
        <div class="exam-card-actions">
          <a class="btn btn-ghost btn-sm" href="teacher-builder.html?exam=${encodeURIComponent(ex.id)}">Edit</a>
          <button class="btn btn-danger btn-sm" data-del="${ex.id}">Delete</button>
        </div>`;
      wrap.appendChild(card);
    });
    wrap.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => {
      if (!confirm("Delete this exam permanently?")) return;
      const exams = getExams(); delete exams[b.dataset.del]; saveExams(exams);
      renderExamList();
    }));
  }
  renderExamList();
});
