document.addEventListener("DOMContentLoaded", function () {
  requireAdminAuth(async () => {
    document.getElementById("btnLogout").addEventListener("click", logoutAdmin);

    const bandsList = ["9", "8.5", "8", "7.5", "7", "6.5", "6", "5.5", "5", "4.5", "4", "3.5", "3", "2.5", "2"];
    const exams = await getExams();

    let liveResults = {};
    let localEdits = {};
    let selectedId = null;
    let searchTerm = "";
    let statusFilter = "all";
    let hasUnsavedChanges = false;

    const wrap = document.getElementById("gradingList");
    wrap.innerHTML = `
      <div class="grading-workspace">
        <aside class="grading-index-panel">
          <div class="grading-index-tools">
            <label class="grading-search-label" for="gradingSearch">Find a submission</label>
            <input id="gradingSearch" class="text-input" type="search" placeholder="Student or exam name">
            <div class="grading-filter-group" role="group" aria-label="Submission status">
              <button type="button" class="grading-filter active" data-grade-filter="all">All</button>
              <button type="button" class="grading-filter" data-grade-filter="pending">Pending</button>
              <button type="button" class="grading-filter" data-grade-filter="complete">Complete</button>
            </div>
          </div>
          <div id="gradingSubmissionCount" class="muted small grading-submission-count"></div>
          <div id="gradingIndexList" class="grading-index-list"></div>
        </aside>
        <section id="gradingDetail" class="grading-detail-panel" aria-live="polite"></section>
      </div>`;

    const searchInput = document.getElementById("gradingSearch");
    searchInput.addEventListener("input", event => {
      searchTerm = event.target.value.trim().toLocaleLowerCase();
      renderIndex();
    });

    wrap.querySelectorAll("[data-grade-filter]").forEach(button => {
      button.addEventListener("click", () => {
        statusFilter = button.dataset.gradeFilter;
        wrap.querySelectorAll("[data-grade-filter]").forEach(item => item.classList.toggle("active", item === button));
        renderIndex();
      });
    });

    listenResults(results => {
      liveResults = results;
      const ids = Object.keys(liveResults);
      if (!selectedId || !liveResults[selectedId]) selectedId = ids[0] || null;
      renderIndex();
    });

    function merged(id) {
      return Object.assign({}, liveResults[id] || {}, localEdits[id] || {});
    }

    function isAssignedBand(value) {
      return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
    }

    function hasCompleteGrades(result) {
      return isAssignedBand(result.writingBand) && isAssignedBand(result.speakingBand);
    }

    function calculateOverall(result) {
      if (!hasCompleteGrades(result)) return null;
      const average = (
        Number(result.listeningBand) +
        Number(result.readingBand) +
        Number(result.writingBand) +
        Number(result.speakingBand)
      ) / 4;
      return (Math.round(average * 2) / 2).toFixed(1);
    }

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

    function normalizeAnswer(value) {
      return String(value ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .toLocaleLowerCase();
    }

    function answerStatus(question, givenAnswer) {
      const isBlank = Array.isArray(givenAnswer)
        ? givenAnswer.length === 0
        : normalizeAnswer(givenAnswer).length === 0;
      if (isBlank) return "blank";

      if (question.type === "multi") {
        const given = (Array.isArray(givenAnswer) ? givenAnswer : [])
          .map(normalizeAnswer)
          .filter(Boolean)
          .sort();
        const key = (Array.isArray(question.answer) ? question.answer : [])
          .map(normalizeAnswer)
          .filter(Boolean)
          .sort();
        return given.length === key.length && given.every((value, index) => value === key[index]) ? "correct" : "wrong";
      }

      const given = normalizeAnswer(givenAnswer);
      const accepted = Array.isArray(question.answer) ? question.answer : [question.answer];
      return accepted.some(answer => normalizeAnswer(answer) === given) ? "correct" : "wrong";
    }

    function scoreObjectiveSection(parts, answers) {
      let correct = 0;
      let total = 0;
      (parts || []).forEach(part => {
        (part.questions || []).forEach(question => {
          total += 1;
          if (answerStatus(question, (answers || {})[question.id]) === "correct") correct += 1;
        });
      });
      return { correct, total };
    }

    function objectiveBand(score) {
      if (!score || !score.total) return { band: rawToBand(0), equivalentRaw40: 0 };
      const equivalentRaw40 = Math.max(0, Math.min(40, Math.round((score.correct / score.total) * 40)));
      return { band: rawToBand(equivalentRaw40), equivalentRaw40 };
    }

    function recalculatedObjectiveResult(result, exam) {
      if (!exam) return null;
      const listeningScore = scoreObjectiveSection(exam.listening || [], result.listeningAnswers || {});
      const readingScore = scoreObjectiveSection(exam.reading || [], result.readingAnswers || {});
      const listening = objectiveBand(listeningScore);
      const reading = objectiveBand(readingScore);
      return {
        listeningScore,
        readingScore,
        listeningBand: listening.band,
        readingBand: reading.band,
        listeningEquivalentRaw40: listening.equivalentRaw40,
        readingEquivalentRaw40: reading.equivalentRaw40,
        scoringVersion: 2
      };
    }

    function objectiveScoresDiffer(result, recalculated) {
      if (!recalculated) return false;
      return !result.listeningScore || !result.readingScore ||
        Number(result.listeningScore.correct) !== recalculated.listeningScore.correct ||
        Number(result.listeningScore.total) !== recalculated.listeningScore.total ||
        Number(result.readingScore.correct) !== recalculated.readingScore.correct ||
        Number(result.readingScore.total) !== recalculated.readingScore.total ||
        Number(result.listeningBand) !== recalculated.listeningBand ||
        Number(result.readingBand) !== recalculated.readingBand;
    }

    function displayAnswer(value, blankLabel = "Blank") {
      if (Array.isArray(value)) return value.length ? value.map(escapeHtml).join(", ") : `<span class="answer-empty">${blankLabel}</span>`;
      const text = String(value ?? "").trim();
      return text ? escapeHtml(text) : `<span class="answer-empty">${blankLabel}</span>`;
    }

    function formatDate(value) {
      if (!value) return "Unknown date";
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
    }

    function wordCount(value) {
      const text = String(value || "").trim();
      return text ? text.split(/\s+/).length : 0;
    }

    function filteredIds() {
      return Object.keys(liveResults).filter(id => {
        const result = merged(id);
        const complete = hasCompleteGrades(result);
        const matchesStatus = statusFilter === "all" || (statusFilter === "complete" ? complete : !complete);
        const haystack = `${result.studentName || ""} ${result.examName || ""}`.toLocaleLowerCase();
        return matchesStatus && (!searchTerm || haystack.includes(searchTerm));
      });
    }

    function renderIndex() {
      const list = document.getElementById("gradingIndexList");
      const count = document.getElementById("gradingSubmissionCount");
      const ids = filteredIds();
      count.textContent = `${ids.length} submission${ids.length === 1 ? "" : "s"}`;

      if (!ids.length) {
        list.innerHTML = `<div class="grading-empty-list">No submissions match this view.</div>`;
        selectedId = null;
        renderDetail();
        return;
      }

      if (!selectedId || !ids.includes(selectedId)) selectedId = ids[0];

      list.innerHTML = ids.map(id => {
        const result = merged(id);
        const complete = hasCompleteGrades(result);
        return `
          <button type="button" class="grading-index-item ${selectedId === id ? "selected" : ""}" data-select-result="${escapeAttribute(id)}">
            <span class="grading-index-row">
              <strong>${escapeHtml(result.studentName || "Unnamed student")}</strong>
              <span class="status-dot ${complete ? "complete" : "pending"}" title="${complete ? "Complete" : "Pending grades"}"></span>
            </span>
            <span class="grading-index-exam">${escapeHtml(result.examName || "Unknown exam")}</span>
            <span class="grading-index-scores">L ${escapeHtml(result.listeningBand ?? "—")} · R ${escapeHtml(result.readingBand ?? "—")} · ${complete ? `Overall ${calculateOverall(result)}` : "Pending"}</span>
            <span class="grading-index-date">${escapeHtml(formatDate(result.submittedAt))}</span>
          </button>`;
      }).join("");

      list.querySelectorAll("[data-select-result]").forEach(button => {
        button.addEventListener("click", () => {
          selectedId = button.dataset.selectResult;
          renderIndex();
        });
      });

      renderDetail();
    }

    function renderAnswerReview(title, parts, answers) {
      if (!Array.isArray(parts) || !parts.length) {
        return `<div class="answer-review-unavailable">Question data is unavailable for this exam.</div>`;
      }

      const rows = [];
      const counts = { correct: 0, wrong: 0, blank: 0 };
      let questionNumber = 0;

      parts.forEach((part, partIndex) => {
        (part.questions || []).forEach(question => {
          questionNumber += 1;
          const given = (answers || {})[question.id];
          const status = answerStatus(question, given);
          counts[status] += 1;
          rows.push(`
            <tr>
              <td class="answer-number">${questionNumber}</td>
              <td>
                <div class="answer-question">${escapeHtml(question.text || `Question ${questionNumber}`)}</div>
                <div class="answer-part-label">${escapeHtml(part.title || `${title} ${partIndex + 1}`)}</div>
              </td>
              <td class="answer-value">${displayAnswer(given)}</td>
              <td class="answer-value correct-key">${displayAnswer(question.answer, "No key")}</td>
              <td><span class="answer-status ${status}">${status}</span></td>
            </tr>`);
        });
      });

      return `
        <div class="answer-review-summary">
          <span class="answer-count correct">${counts.correct} correct</span>
          <span class="answer-count wrong">${counts.wrong} wrong</span>
          <span class="answer-count blank">${counts.blank} blank</span>
        </div>
        <div class="answer-table-wrap">
          <table class="answer-review-table">
            <thead><tr><th>#</th><th>Question</th><th>Student answer</th><th>Correct answer</th><th>Status</th></tr></thead>
            <tbody>${rows.join("")}</tbody>
          </table>
        </div>`;
    }

    function renderDetail() {
      const detail = document.getElementById("gradingDetail");
      if (!selectedId || !liveResults[selectedId]) {
        detail.innerHTML = `<div class="grading-detail-empty"><h3>Select a submission</h3><p class="muted">Choose a student from the list to review answers and assign grades.</p></div>`;
        return;
      }

      const result = merged(selectedId);
      const exam = exams[result.examId];
      const overall = calculateOverall(result);
      const complete = hasCompleteGrades(result);
      const listeningRaw = result.listeningScore ? `${result.listeningScore.correct}/${result.listeningScore.total}` : "—";
      const readingRaw = result.readingScore ? `${result.readingScore.correct}/${result.readingScore.total}` : "—";
      const recalculated = recalculatedObjectiveResult(result, exam);
      const needsScoreCorrection = objectiveScoresDiffer(result, recalculated);

      detail.innerHTML = `
        <header class="grading-detail-header">
          <div>
            <div class="grading-eyebrow">${escapeHtml(result.examName || "Exam submission")}</div>
            <h2>${escapeHtml(result.studentName || "Unnamed student")}</h2>
            <div class="muted small">Submitted ${escapeHtml(formatDate(result.submittedAt))}</div>
          </div>
          <span class="grading-state-badge ${complete ? "complete" : "pending"}">${complete ? "Graded" : "Needs grading"}</span>
        </header>

        ${needsScoreCorrection ? `
          <div class="score-correction-note">
            <div><strong>Objective score mismatch detected</strong><span>The stored result differs from the answers currently saved for this exam.</span></div>
            <button type="button" class="btn btn-ghost btn-sm" data-recalculate-objective="${escapeAttribute(selectedId)}">Apply corrected scores</button>
          </div>` : ""}

        <div class="grading-score-grid">
          <div class="grading-score-card"><span>Listening</span><strong>${escapeHtml(result.listeningBand ?? "—")}</strong><small>${escapeHtml(listeningRaw)} correct</small></div>
          <div class="grading-score-card"><span>Reading</span><strong>${escapeHtml(result.readingBand ?? "—")}</strong><small>${escapeHtml(readingRaw)} correct</small></div>
          <div class="grading-score-card"><span>Writing</span><strong>${escapeHtml(result.writingBand ?? "—")}</strong><small>Teacher grade</small></div>
          <div class="grading-score-card"><span>Speaking</span><strong>${escapeHtml(result.speakingBand ?? "—")}</strong><small>Teacher grade</small></div>
          <div class="grading-score-card overall"><span>Overall</span><strong>${overall || "—"}</strong><small>${overall ? "Final band" : "Pending"}</small></div>
        </div>

        <details class="grading-section" open>
          <summary><span>Objective answers</span><small>Student response, answer key, and status</small></summary>
          <div class="grading-section-body answer-review-sections">
            <details class="answer-review-section" open>
              <summary>Listening answers</summary>
              ${renderAnswerReview("Listening", exam && exam.listening, result.listeningAnswers)}
            </details>
            <details class="answer-review-section">
              <summary>Reading answers</summary>
              ${renderAnswerReview("Reading", exam && exam.reading, result.readingAnswers)}
            </details>
          </div>
        </details>

        <details class="grading-section" open>
          <summary><span>Writing responses</span><small>Read and assess both tasks</small></summary>
          <div class="grading-section-body writing-review-grid">
            <article class="writing-response-card">
              <header><strong>Task 1</strong><span>${wordCount(result.writingTask1)} words</span></header>
              <div class="grading-essay">${escapeHtml(result.writingTask1 || "(blank)")}</div>
            </article>
            <article class="writing-response-card">
              <header><strong>Task 2</strong><span>${wordCount(result.writingTask2)} words</span></header>
              <div class="grading-essay">${escapeHtml(result.writingTask2 || "(blank)")}</div>
            </article>
          </div>
        </details>

        <section class="grading-section grading-form-section">
          <div class="grading-form-heading">
            <div><h3>Teacher grades</h3><p class="muted small">Changes remain local until submitted or previewed.</p></div>
          </div>
          <div class="grading-form-grid">
            <label>Writing band
              <select class="text-input" data-grade-band="${escapeAttribute(selectedId)}">
                <option value="">—</option>
                ${bandsList.map(band => `<option value="${band}" ${String(result.writingBand) === band ? "selected" : ""}>${band}</option>`).join("")}
              </select>
            </label>
            <label>Speaking band
              <select class="text-input" data-grade-speaking="${escapeAttribute(selectedId)}">
                <option value="">—</option>
                ${bandsList.map(band => `<option value="${band}" ${String(result.speakingBand) === band ? "selected" : ""}>${band}</option>`).join("")}
              </select>
            </label>
            <label class="grading-feedback-label">Feedback
              <textarea class="text-input" rows="4" placeholder="Feedback comment (optional)" data-grade-feedback="${escapeAttribute(selectedId)}">${escapeHtml(result.writingFeedback || "")}</textarea>
            </label>
          </div>
          <div class="grading-detail-actions">
            <button type="button" class="btn btn-ghost" data-save-result="${escapeAttribute(selectedId)}">Save this submission</button>
            <button type="button" class="btn btn-primary" data-preview-result="${escapeAttribute(selectedId)}" ${complete ? "" : "disabled title=\"Assign both Writing and Speaking bands first\""}>Preview final report</button>
          </div>
        </section>`;

      bindDetailEvents();
    }

    function setLocalEdit(id, field, value) {
      localEdits[id] = localEdits[id] || {};
      localEdits[id][field] = value;
      hasUnsavedChanges = true;
    }

    function bindDetailEvents() {
      const detail = document.getElementById("gradingDetail");
      const writingSelect = detail.querySelector("[data-grade-band]");
      const speakingSelect = detail.querySelector("[data-grade-speaking]");
      const feedback = detail.querySelector("[data-grade-feedback]");
      const saveButton = detail.querySelector("[data-save-result]");
      const previewButton = detail.querySelector("[data-preview-result]");
      const recalculateButton = detail.querySelector("[data-recalculate-objective]");

      writingSelect.addEventListener("change", event => {
        setLocalEdit(event.target.dataset.gradeBand, "writingBand", event.target.value === "" ? null : Number(event.target.value));
        renderIndex();
      });

      speakingSelect.addEventListener("change", event => {
        setLocalEdit(event.target.dataset.gradeSpeaking, "speakingBand", event.target.value === "" ? null : Number(event.target.value));
        renderIndex();
      });

      feedback.addEventListener("input", event => {
        setLocalEdit(event.target.dataset.gradeFeedback, "writingFeedback", event.target.value);
      });

      saveButton.addEventListener("click", async event => {
        const id = event.target.dataset.saveResult;
        event.target.disabled = true;
        event.target.textContent = "Saving…";
        await flushEdit(id);
        event.target.textContent = "Saved ✓";
        setTimeout(() => renderIndex(), 900);
      });

      if (recalculateButton) {
        recalculateButton.addEventListener("click", async event => {
          const id = event.target.dataset.recalculateObjective;
          const result = merged(id);
          const exam = exams[result.examId];
          const corrected = recalculatedObjectiveResult(result, exam);
          if (!corrected) return;
          event.target.disabled = true;
          event.target.textContent = "Updating…";
          await updateResult(id, corrected);
          liveResults[id] = Object.assign({}, liveResults[id], corrected);
          renderIndex();
        });
      }

      if (previewButton) {
        previewButton.addEventListener("click", event => previewResult(event.target.dataset.previewResult));
      }
    }

    async function flushEdit(id) {
      const edit = localEdits[id];
      if (!edit) return;
      const patch = Object.assign({}, edit);
      await updateResult(id, patch);
      liveResults[id] = Object.assign({}, liveResults[id], patch);
      delete localEdits[id];
      hasUnsavedChanges = Object.keys(localEdits).length > 0;
    }

    document.getElementById("btnSubmitGrades").addEventListener("click", async () => {
      const button = document.getElementById("btnSubmitGrades");
      const ids = Object.keys(localEdits);
      if (!ids.length) {
        const message = document.getElementById("gradingSaveMsg");
        message.textContent = "No unsaved grade changes";
        setTimeout(() => { message.textContent = ""; }, 1800);
        return;
      }

      button.disabled = true;
      button.textContent = "Saving…";
      await Promise.all(ids.map(flushEdit));
      button.disabled = false;
      button.textContent = "Submit Grades";
      hasUnsavedChanges = false;

      const message = document.getElementById("gradingSaveMsg");
      message.textContent = "Grades saved ✓";
      setTimeout(() => { message.textContent = ""; }, 2500);
      renderIndex();
    });

    function safeFileName(name) {
      return String(name || "student").trim().replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "") || "student";
    }

    function reportStyles() {
      return `
        :root{font-family:Inter,Arial,sans-serif;color:#172033;background:#f3f6fb}*{box-sizing:border-box}
        body{margin:0;background:#f3f6fb;color:#172033}.report-page{max-width:860px;margin:40px auto;background:#fff;border-radius:18px;box-shadow:0 18px 55px rgba(20,35,65,.12);overflow:hidden}
        .report-hero{padding:38px 44px;background:#14213d;color:#fff}.report-kicker{font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.7}.report-hero h1{margin:8px 0 6px;font-size:34px}.report-meta{opacity:.78}
        .report-body{padding:36px 44px}.report-table{width:100%;border-collapse:collapse;margin:0 0 28px}.report-table th,.report-table td{padding:14px 16px;border-bottom:1px solid #e7ebf2;text-align:left}.report-table th{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#667085}.report-table td:last-child{font-weight:700;font-size:18px}
        .overall{display:flex;align-items:center;justify-content:space-between;padding:22px 24px;border-radius:14px;background:#eef4ff;margin-bottom:28px}.overall strong{font-size:36px;color:#1d4ed8}.feedback{padding:22px 24px;border:1px solid #e3e8f1;border-radius:14px}.feedback h2{margin-top:0;font-size:18px}.feedback p{white-space:pre-wrap;line-height:1.65;margin-bottom:0}.report-footer{padding:18px 44px;background:#f8fafc;color:#667085;font-size:12px}
        .preview-toolbar{position:sticky;top:0;z-index:5;display:flex;justify-content:flex-end;gap:10px;padding:12px 20px;background:rgba(255,255,255,.94);border-bottom:1px solid #e3e8f1;backdrop-filter:blur(10px)}.preview-toolbar a,.preview-toolbar button{font:inherit;border:0;border-radius:8px;padding:10px 15px;cursor:pointer;text-decoration:none}.preview-toolbar a{background:#1d4ed8;color:#fff}.preview-toolbar button{background:#e8edf5;color:#172033}
        @media(max-width:700px){.report-page{margin:0;border-radius:0}.report-hero,.report-body,.report-footer{padding-left:22px;padding-right:22px}}
        @media print{body{background:#fff}.preview-toolbar{display:none}.report-page{margin:0;box-shadow:none;max-width:none}}
      `;
    }

    function reportBody(result) {
      const overall = calculateOverall(result) || "Pending";
      const submitted = result.submittedAt ? new Date(result.submittedAt).toLocaleDateString() : "Unknown date";
      const listeningRaw = result.listeningScore ? `${result.listeningScore.correct}/${result.listeningScore.total}` : "—";
      const readingRaw = result.readingScore ? `${result.readingScore.correct}/${result.readingScore.total}` : "—";
      return `
        <main class="report-page">
          <header class="report-hero">
            <div class="report-kicker">IELTS Mock Test Result</div>
            <h1>${escapeHtml(result.studentName || "Student")}</h1>
            <div class="report-meta">${escapeHtml(result.examName || "Exam")} · Submitted ${escapeHtml(submitted)}</div>
          </header>
          <div class="report-body">
            <table class="report-table">
              <thead><tr><th>Section</th><th>Raw score</th><th>Band</th></tr></thead>
              <tbody>
                <tr><td>Listening</td><td>${escapeHtml(listeningRaw)}</td><td>${escapeHtml(result.listeningBand ?? "—")}</td></tr>
                <tr><td>Reading</td><td>${escapeHtml(readingRaw)}</td><td>${escapeHtml(result.readingBand ?? "—")}</td></tr>
                <tr><td>Writing</td><td>Teacher graded</td><td>${escapeHtml(result.writingBand ?? "Not graded")}</td></tr>
                <tr><td>Speaking</td><td>Teacher graded</td><td>${escapeHtml(result.speakingBand ?? "Not graded")}</td></tr>
              </tbody>
            </table>
            <div class="overall"><span>Overall Band</span><strong>${escapeHtml(overall)}</strong></div>
            ${result.writingFeedback ? `<section class="feedback"><h2>Teacher feedback</h2><p>${escapeHtml(result.writingFeedback)}</p></section>` : ""}
          </div>
          <footer class="report-footer">Generated by EHSAN IELTS</footer>
        </main>`;
    }

    function buildReportDocument(result, preview) {
      return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>IELTS Result — ${escapeHtml(result.studentName || "Student")}</title><style>${reportStyles()}</style></head>
<body>${preview ? `<div class="preview-toolbar"><button id="printReport" type="button">Print</button><a id="downloadReport" href="#">Download HTML</a></div>` : ""}${reportBody(result)}</body></html>`;
    }

    async function previewResult(id) {
      const previewWindow = window.open("", "_blank");
      if (!previewWindow) {
        alert("The report preview was blocked by the browser. Allow pop-ups for this site and try again.");
        return;
      }

      previewWindow.document.write("<!doctype html><title>Preparing report…</title><p style='font-family:sans-serif;padding:30px'>Preparing report…</p>");
      await flushEdit(id);
      const result = merged(id);
      const cleanDocument = buildReportDocument(result, false);
      const previewDocument = buildReportDocument(result, true);

      previewWindow.document.open();
      previewWindow.document.write(previewDocument);
      previewWindow.document.close();

      const blobUrl = previewWindow.URL.createObjectURL(new Blob([cleanDocument], { type: "text/html;charset=utf-8" }));
      const downloadLink = previewWindow.document.getElementById("downloadReport");
      downloadLink.href = blobUrl;
      downloadLink.download = `IELTS_FinalResult_${safeFileName(result.studentName)}.html`;
      previewWindow.document.getElementById("printReport").addEventListener("click", () => previewWindow.print());
      previewWindow.addEventListener("beforeunload", () => previewWindow.URL.revokeObjectURL(blobUrl), { once: true });

      renderIndex();
    }

    window.addEventListener("beforeunload", event => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
  });
});
