document.addEventListener("DOMContentLoaded", function () {
  requireAdminAuth(() => {
    document.getElementById("btnLogout").addEventListener("click", logoutAdmin);

    document.getElementById("btnNewExam").addEventListener("click", async () => {
      const name = prompt("Name this exam:");
      if (!name) return;
      const id = "exam-" + Date.now();
      await saveExam({ id, name, listening: [], reading: [], writing: { task1Prompt: "", task1Image: "", task2Prompt: "" } });
      renderExamList();
    });

    async function renderExamList() {
      const wrap = document.getElementById("examList");
      wrap.innerHTML = `<p class="muted">Loading exams…</p>`;
      const exams = await getExams();
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
      wrap.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
        if (!confirm("Delete this exam permanently?")) return;
        await deleteExam(b.dataset.del);
        renderExamList();
      }));
    }
    renderExamList();
  });
});
