document.addEventListener("DOMContentLoaded", function () {
  requireAdminAuth(() => {
    document.getElementById("btnLogout").addEventListener("click", logoutAdmin);

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function escapeAttribute(value) {
      return escapeHtml(value).replace(/`/g, "&#096;");
    }

    function createExamId() {
      return `exam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    document.getElementById("btnNewExam").addEventListener("click", async () => {
      const name = prompt("Name this exam:");
      if (!name || !name.trim()) return;
      const id = createExamId();
      await saveExam({
        id,
        name: name.trim(),
        listening: [],
        reading: [],
        writing: { task1Prompt: "", task1Image: "", task2Prompt: "" }
      });
      renderExamList();
    });

    async function duplicateExam(sourceExam, button) {
      const defaultName = `${sourceExam.name || "Untitled Exam"} (Copy)`;
      const name = prompt("Name the duplicated exam:", defaultName);
      if (!name || !name.trim()) return;

      button.disabled = true;
      const originalLabel = button.textContent;
      button.textContent = "Duplicating…";

      try {
        const duplicate = JSON.parse(JSON.stringify(sourceExam));
        duplicate.id = createExamId();
        duplicate.name = name.trim();
        await saveExam(duplicate);
        await renderExamList();
      } catch (error) {
        console.error("Could not duplicate exam", error);
        alert("The exam could not be duplicated. Please try again.");
        button.disabled = false;
        button.textContent = originalLabel;
      }
    }

    async function renderExamList() {
      const wrap = document.getElementById("examList");
      wrap.innerHTML = `<p class="muted">Loading exams…</p>`;
      const exams = await getExams();
      wrap.innerHTML = "";

      Object.values(exams).forEach(exam => {
        const listeningParts = Array.isArray(exam.listening) ? exam.listening : [];
        const readingParts = Array.isArray(exam.reading) ? exam.reading : [];
        const listeningCount = listeningParts.reduce((total, part) => total + (Array.isArray(part.questions) ? part.questions.length : 0), 0);
        const readingCount = readingParts.reduce((total, part) => total + (Array.isArray(part.questions) ? part.questions.length : 0), 0);
        const card = document.createElement("div");
        card.className = "exam-card";
        card.innerHTML = `
          <div>
            <div class="exam-card-name">${escapeHtml(exam.name || "Untitled Exam")}</div>
            <div class="exam-card-meta">${listeningCount} listening q &middot; ${readingCount} reading q &middot; ${listeningParts.length} audio parts</div>
          </div>
          <div class="exam-card-actions">
            <a class="btn btn-ghost btn-sm" href="teacher-builder.html?exam=${encodeURIComponent(exam.id)}">Edit</a>
            <button type="button" class="btn btn-ghost btn-sm" data-duplicate="${escapeAttribute(exam.id)}">Duplicate</button>
            <button type="button" class="btn btn-danger btn-sm" data-del="${escapeAttribute(exam.id)}">Delete</button>
          </div>`;
        wrap.appendChild(card);
      });

      wrap.querySelectorAll("[data-duplicate]").forEach(button => {
        button.addEventListener("click", () => {
          const sourceExam = exams[button.dataset.duplicate];
          if (sourceExam) duplicateExam(sourceExam, button);
        });
      });

      wrap.querySelectorAll("[data-del]").forEach(button => button.addEventListener("click", async () => {
        if (!confirm("Delete this exam permanently?")) return;
        await deleteExam(button.dataset.del);
        renderExamList();
      }));
    }

    renderExamList();
  });
});
