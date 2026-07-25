document.addEventListener("DOMContentLoaded", function () {
  requireAdminAuth(() => {
    ensureBuilderStylesheet();
    document.getElementById("btnLogout").addEventListener("click", logoutAdmin);

    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get("exam");

    let workingExam = null;
    let hasUnsavedChanges = false;
    let listeningGroupQuills = {};
    let listeningLabelQuills = {};
    let readingPassageQuills = {};
    let readingIntroQuills = {};
    let readingGroupQuills = {};
    let readingLabelQuills = {};

    const GROUP_LABEL_PLACEHOLDER = [
      "Questions 1 - 10",
      "Complete the notes below.",
      "Write ONE WORD AND / OR A NUMBER for each answer."
    ].join("\n");

    const READING_INTRO_PLACEHOLDER =
      "You should spend about 20 minutes on Questions 1-13, which are based on Reading Passage 1 below.";

    const RICH_TOOLBAR = [
      [{ header: [2, 3, false] }],
      ["bold", "italic", "underline"],
      [{ list: "ordered" }, { list: "bullet" }],
      [{ align: [] }],
      ["blockquote", "link", "image"],
      ["clean"]
    ];

    function ensureBuilderStylesheet() {
      if (document.querySelector('link[data-exam-content-editors="1"]')) return;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "css/exam-content-editors.css";
      link.dataset.examContentEditors = "1";
      document.head.appendChild(link);
    }

    function markDirty() {
      hasUnsavedChanges = true;
    }

    function escapeAttribute(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    function cleanRichHtml(html) {
      const value = String(html || "").trim();
      return value === "<p><br></p>" ? "" : value;
    }

    function createRichEditor(element, html, placeholder, onChange) {
      const quill = new Quill(element, {
        theme: "snow",
        placeholder,
        modules: {
          toolbar: {
            container: RICH_TOOLBAR,
            handlers: {
              image: function () {
                const url = window.prompt(
                  "Enter a repository asset path or public image URL (for example: assets/images/map.png):"
                );
                if (!url) return;
                const trimmed = url.trim();
                if (/^data:/i.test(trimmed)) {
                  alert("Embedded base64 images are not supported. Add the image to the repository and enter its path instead.");
                  return;
                }
                const range = this.quill.getSelection(true);
                const insertAt = range ? range.index : Math.max(0, this.quill.getLength() - 1);
                this.quill.insertEmbed(insertAt, "image", trimmed, "user");
                this.quill.setSelection(insertAt + 1, 0, "silent");
              }
            }
          }
        }
      });
      // Quill applies height: 100% to the target container. In builder cards,
      // that can make the editor resolve against the card height and overlap
      // the question controls below it. Pin each editor to an intentional
      // viewport and let the editable surface scroll internally.
      const editorHeight = element.classList.contains("passage-rich-editor")
        ? 360
        : element.classList.contains("label-block-editor")
          ? 110
          : element.classList.contains("compact-rich-editor")
            ? 120
            : element.classList.contains("question-label-editor")
              ? 150
              : 140;
      element.style.setProperty("height", `${editorHeight}px`, "important");
      element.style.setProperty("min-height", `${editorHeight}px`, "important");
      element.style.setProperty("max-height", `${editorHeight}px`, "important");
      quill.root.style.setProperty("height", "100%", "important");
      quill.root.style.setProperty("min-height", "0", "important");
      quill.root.style.setProperty("overflow-y", "auto", "important");

      quill.root.innerHTML = html || "";
      quill.on("text-change", () => {
        markDirty();
        if (onChange) onChange(quill);
      });
      return quill;
    }

    const task1Quill = createRichEditor(
      document.getElementById("writingTask1Prompt"),
      "",
      "Enter the Task 1 prompt. You may add a repository-hosted chart or diagram with the image button."
    );
    const task2Quill = createRichEditor(
      document.getElementById("writingTask2Prompt"),
      "",
      "Enter the Task 2 essay prompt."
    );

    function makeId(prefix) {
      return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function ensureQuestionId(question, prefix) {
      if (!question.id) question.id = makeId(prefix);
      return question.id;
    }

    const TFNG_OPTIONS = ["True", "False", "Not Given"];

    function optionLetter(index) {
      return String.fromCharCode(65 + index);
    }

    function normalizeComparable(value) {
      return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
    }

    function parseLegacyOptions(value) {
      if (Array.isArray(value)) return value.map(option => String(option ?? ""));
      if (typeof value !== "string") return [];
      return value.split(/\r?\n|,/).map(option => option.trim()).filter(Boolean);
    }

    function canonicalTfngAnswer(value) {
      const normalized = normalizeComparable(value).replace(/[\/\-]/g, " ");
      if (["true", "t"].includes(normalized)) return "True";
      if (["false", "f"].includes(normalized)) return "False";
      if (["not given", "notgiven", "ng", "n g"].includes(normalized)) return "Not Given";
      return "";
    }

    function resolveChoiceReference(options, value) {
      const normalized = normalizeComparable(value);
      if (!normalized) return "";
      const exact = options.find(option => normalizeComparable(option) === normalized);
      if (exact !== undefined) return exact;
      if (/^[a-z]$/i.test(String(value).trim())) {
        const index = String(value).trim().toUpperCase().charCodeAt(0) - 65;
        if (index >= 0 && index < options.length) return options[index];
      }
      return String(value).trim();
    }

    function normalizeQuestionAnswerModel(question) {
      if (!question || question.type === "label") return;

      if (question.type === "tfng") {
        question.options = [...TFNG_OPTIONS];
        question.answer = canonicalTfngAnswer(question.answer);
        return;
      }

      if (question.type === "mc" || question.type === "multi") {
        const defaultOptionCount = question.type === "multi" ? 4 : 3;
        const options = parseLegacyOptions(question.options);
        if (!options.length) {
          while (options.length < defaultOptionCount) options.push("");
        }
        question.options = options;

        const rawAnswers = Array.isArray(question.answer)
          ? question.answer
          : question.type === "multi"
            ? String(question.answer || "").split(/[,|]/)
            : [question.answer];
        const mapped = rawAnswers
          .map(value => resolveChoiceReference(options, value))
          .filter(value => normalizeComparable(value));
        const unique = mapped.filter((value, index, list) =>
          list.findIndex(item => normalizeComparable(item) === normalizeComparable(value)) === index
        );
        question.answer = question.type === "multi" ? unique : (unique[0] || "");
        return;
      }

      delete question.options;
      if (Array.isArray(question.answer)) {
        question.answer = question.answer.map(value => String(value ?? "").trim()).filter(Boolean);
      } else {
        question.answer = String(question.answer ?? "");
      }
    }

    function initializeQuestionType(question, nextType) {
      const previousOptions = parseLegacyOptions(question.options);
      question.type = nextType;

      if (nextType === "tfng") {
        question.options = [...TFNG_OPTIONS];
        question.answer = "";
      } else if (nextType === "mc" || nextType === "multi") {
        const minimumOptions = nextType === "multi" ? 4 : 3;
        question.options = previousOptions.length ? previousOptions : [];
        while (question.options.length < minimumOptions) question.options.push("");
        question.answer = nextType === "multi" ? [] : "";
      } else {
        delete question.options;
        question.answer = "";
      }
    }

    function choiceOptionIsCorrect(question, optionIndex) {
      const option = (question.options || [])[optionIndex] || "";
      if (!normalizeComparable(option)) return false;
      if (question.type === "multi") {
        return (Array.isArray(question.answer) ? question.answer : [])
          .some(answer => normalizeComparable(answer) === normalizeComparable(option));
      }
      return normalizeComparable(question.answer) === normalizeComparable(option);
    }

    function setChoiceOptionText(question, optionIndex, nextValue) {
      const previousValue = question.options[optionIndex] || "";
      question.options[optionIndex] = nextValue;

      if (question.type === "multi") {
        const answers = Array.isArray(question.answer) ? question.answer : [];
        question.answer = answers
          .map(answer => normalizeComparable(answer) === normalizeComparable(previousValue) ? nextValue : answer)
          .filter(answer => normalizeComparable(answer));
      } else if (normalizeComparable(previousValue) && normalizeComparable(question.answer) === normalizeComparable(previousValue)) {
        question.answer = normalizeComparable(nextValue) ? nextValue : "";
      }
    }

    function questionAnswerErrors(question) {
      if (!question || question.type === "label" || question.type === "fill") return [];
      if (question.type === "tfng") {
        return TFNG_OPTIONS.includes(question.answer) ? [] : ["Select True, False, or Not Given as the correct answer."];
      }

      const options = Array.isArray(question.options) ? question.options : [];
      const nonEmpty = options.filter(option => normalizeComparable(option));
      const errors = [];
      const minimum = question.type === "multi" ? 3 : 2;
      if (nonEmpty.length < minimum) errors.push(`Add at least ${minimum} non-empty options.`);
      if (options.some(option => !normalizeComparable(option))) errors.push("Complete or remove every blank option.");
      const normalizedOptions = nonEmpty.map(normalizeComparable);
      if (new Set(normalizedOptions).size !== normalizedOptions.length) errors.push("Option text must be unique.");

      if (question.type === "mc") {
        const answer = normalizeComparable(question.answer);
        if (!answer) errors.push("Select one correct option.");
        else if (!normalizedOptions.includes(answer)) errors.push("The selected answer no longer matches an option.");
      } else {
        const answers = Array.isArray(question.answer) ? question.answer : [];
        const normalizedAnswers = answers.map(normalizeComparable).filter(Boolean);
        if (normalizedAnswers.length < 2) errors.push("Select at least two correct options.");
        if (normalizedAnswers.some(answer => !normalizedOptions.includes(answer))) {
          errors.push("Every correct answer must match an option.");
        }
        if (nonEmpty.length > 0 && normalizedAnswers.length >= nonEmpty.length) {
          errors.push("Leave at least one distractor option unselected.");
        }
      }
      return [...new Set(errors)];
    }

    function answerStatusMarkup(question, questionIndex) {
      const errors = questionAnswerErrors(question);
      if (!errors.length) {
        return `<div class="answer-key-feedback is-complete" data-answer-validation="${questionIndex}">
          <span class="answer-key-status">✓ Answer key complete</span>
        </div>`;
      }
      return `<div class="answer-key-feedback is-incomplete" data-answer-validation="${questionIndex}">
        <span class="answer-key-status">Answer key needs attention</span>
        <ul>${errors.map(error => `<li>${error}</li>`).join("")}</ul>
      </div>`;
    }

    function updateAnswerStatus(container, questionIndex, question) {
      const current = container.querySelector(`[data-answer-validation="${questionIndex}"]`);
      if (!current) return;
      const scratch = document.createElement("div");
      scratch.innerHTML = answerStatusMarkup(question, questionIndex);
      current.replaceWith(scratch.firstElementChild);
      const row = container.querySelector(`[data-question-index="${questionIndex}"]`);
      if (row) row.classList.toggle("has-answer-errors", questionAnswerErrors(question).length > 0);
    }

    function collectAnswerKeyErrors() {
      const errors = [];
      [
        { key: "listening", label: "Listening" },
        { key: "reading", label: "Reading" }
      ].forEach(section => {
        (workingExam[section.key] || []).forEach((part, partIndex) => {
          (part.questions || []).forEach((question, questionIndex) => {
            questionAnswerErrors(question).forEach(message => {
              errors.push({
                section: section.key,
                sectionLabel: section.label,
                partIndex,
                questionIndex,
                questionId: question.id,
                partTitle: part.title || `${section.label} ${partIndex + 1}`,
                message
              });
            });
          });
        });
      });
      return errors;
    }

    function focusAnswerKeyError(error) {
      const tabId = error.section === "listening" ? "btabListening" : "btabReading";
      const tab = document.querySelector(`[data-btab="${tabId}"]`);
      if (tab) tab.click();
      const row = Array.from(document.querySelectorAll("[data-question-id]"))
        .find(element => element.dataset.questionId === error.questionId);
      if (!row) return;
      row.classList.add("answer-error-focus");
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => row.classList.remove("answer-error-focus"), 1800);
    }

    function normalizeQuestionGroups(part, prefix) {
      part.questions = Array.isArray(part.questions) ? part.questions : [];
      part.questions.forEach(question => {
        ensureQuestionId(question, `${prefix}q`);
        normalizeQuestionAnswerModel(question);
      });

      const questionById = new Map(part.questions.map(question => [question.id, question]));
      const usedIds = new Set();
      let groups = Array.isArray(part.questionGroups) ? part.questionGroups : [];

      groups = groups.map(group => {
        const ids = Array.isArray(group.questionIds) ? group.questionIds : [];
        const validIds = ids.filter(id => {
          if (!questionById.has(id) || usedIds.has(id)) return false;
          usedIds.add(id);
          return true;
        });
        return {
          id: group.id || makeId(`${prefix}g`),
          label: group.label || "",
          questionIds: validIds
        };
      });

      if (!groups.length) {
        groups = [{
          id: makeId(`${prefix}g`),
          label: part.questionLabel || part.instructions || "",
          questionIds: []
        }];
      }

      const unassigned = part.questions
        .map(question => question.id)
        .filter(id => !usedIds.has(id));
      groups[groups.length - 1].questionIds.push(...unassigned);
      part.questionGroups = groups;
      syncPartQuestionOrder(part);
      delete part.questionLabel;
      delete part.instructions;
    }

    function syncPartQuestionOrder(part) {
      const byId = new Map((part.questions || []).map(question => [question.id, question]));
      const ordered = [];
      const seen = new Set();

      (part.questionGroups || []).forEach(group => {
        group.questionIds = (group.questionIds || []).filter(id => {
          if (!byId.has(id) || seen.has(id)) return false;
          seen.add(id);
          ordered.push(byId.get(id));
          return true;
        });
      });

      (part.questions || []).forEach(question => {
        if (!seen.has(question.id)) {
          seen.add(question.id);
          ordered.push(question);
          if (part.questionGroups && part.questionGroups.length) {
            part.questionGroups[part.questionGroups.length - 1].questionIds.push(question.id);
          }
        }
      });

      part.questions = ordered;
    }

    function normalizeExamStructure() {
      workingExam.listening = Array.isArray(workingExam.listening) ? workingExam.listening : [];
      workingExam.reading = Array.isArray(workingExam.reading) ? workingExam.reading : [];
      workingExam.writing = workingExam.writing || {};

      workingExam.listening.forEach((part, index) => normalizeQuestionGroups(part, `l${index + 1}`));
      workingExam.reading.forEach((part, index) => normalizeQuestionGroups(part, `r${index + 1}`));
    }

    function questionWeight(question) {
      if (!question || question.type === "label") return 0;
      if (question.type === "multi") {
        const count = Array.isArray(question.answer) ? question.answer.length : 0;
        return count > 0 ? count : 2;
      }
      return 1;
    }

    function sectionQuestionNumber(parts, partIndex, questionIndex) {
      let count = 0;
      for (let index = 0; index < partIndex; index += 1) {
        count += (parts[index].questions || []).reduce((sum, question) => sum + questionWeight(question), 0);
      }
      const currentQuestions = parts[partIndex].questions || [];
      for (let index = 0; index < questionIndex; index += 1) {
        count += questionWeight(currentQuestions[index]);
      }
      return count + 1;
    }

    function questionRangeText(parts, partIndex, group) {
      const part = parts[partIndex];
      const indexById = new Map((part.questions || []).map((question, index) => [question.id, index]));
      const numbers = [];
      (group.questionIds || []).forEach(id => {
        if (!indexById.has(id)) return;
        const questionIndex = indexById.get(id);
        const question = part.questions[questionIndex];
        const weight = questionWeight(question);
        if (weight <= 0) return; // labels contribute no question numbers
        const start = sectionQuestionNumber(parts, partIndex, questionIndex);
        for (let offset = 0; offset < weight; offset += 1) numbers.push(start + offset);
      });

      if (!numbers.length) return "No questions yet";
      if (numbers.length === 1) return `Question ${numbers[0]}`;
      const first = numbers[0];
      const last = numbers[numbers.length - 1];
      if (numbers.length === 2 && last === first + 1) return `Questions ${first} and ${last}`;
      return `Questions ${first} - ${last}`;
    }

    function questionsForGroup(part, group) {
      const byId = new Map((part.questions || []).map(question => [question.id, question]));
      return (group.questionIds || []).map(id => byId.get(id)).filter(Boolean);
    }

    function removeQuestion(part, group, questionId) {
      part.questions = (part.questions || []).filter(question => question.id !== questionId);
      (part.questionGroups || []).forEach(item => {
        item.questionIds = (item.questionIds || []).filter(id => id !== questionId);
      });
      group.questionIds = (group.questionIds || []).filter(id => id !== questionId);
      syncPartQuestionOrder(part);
    }

    function removeQuestionGroup(part, groupIndex) {
      if (!part.questionGroups || part.questionGroups.length <= 1) {
        alert("Each part or passage needs at least one question group.");
        return false;
      }
      const removed = part.questionGroups[groupIndex];
      const targetIndex = groupIndex > 0 ? groupIndex - 1 : 1;
      const target = part.questionGroups[targetIndex];
      target.questionIds = groupIndex > 0
        ? [...(target.questionIds || []), ...(removed.questionIds || [])]
        : [...(removed.questionIds || []), ...(target.questionIds || [])];
      part.questionGroups.splice(groupIndex, 1);
      syncPartQuestionOrder(part);
      return true;
    }

    function flushListeningGroupQuills() {
      Object.keys(listeningGroupQuills).forEach(key => {
        const meta = listeningGroupQuills[key];
        const part = workingExam.listening[meta.partIndex];
        const group = part && (part.questionGroups || []).find(item => item.id === meta.groupId);
        if (group) group.label = cleanRichHtml(meta.quill.root.innerHTML);
      });
      Object.keys(listeningLabelQuills).forEach(key => {
        const meta = listeningLabelQuills[key];
        const part = workingExam.listening[meta.partIndex];
        const question = part && (part.questions || []).find(item => item.id === meta.questionId);
        if (question) question.text = cleanRichHtml(meta.quill.root.innerHTML);
      });
      workingExam.listening.forEach(syncPartQuestionOrder);
    }

    function flushReadingQuills() {
      Object.keys(readingPassageQuills).forEach(key => {
        const part = workingExam.reading[+key];
        if (part) part.passage = cleanRichHtml(readingPassageQuills[key].root.innerHTML);
      });
      Object.keys(readingIntroQuills).forEach(key => {
        const part = workingExam.reading[+key];
        if (part) part.intro = cleanRichHtml(readingIntroQuills[key].root.innerHTML);
      });
      Object.keys(readingGroupQuills).forEach(key => {
        const meta = readingGroupQuills[key];
        const part = workingExam.reading[meta.partIndex];
        const group = part && (part.questionGroups || []).find(item => item.id === meta.groupId);
        if (group) group.label = cleanRichHtml(meta.quill.root.innerHTML);
      });
      Object.keys(readingLabelQuills).forEach(key => {
        const meta = readingLabelQuills[key];
        const part = workingExam.reading[meta.partIndex];
        const question = part && (part.questions || []).find(item => item.id === meta.questionId);
        if (question) question.text = cleanRichHtml(meta.quill.root.innerHTML);
      });
      workingExam.reading.forEach(syncPartQuestionOrder);
    }

    function resetListeningQuills() {
      listeningGroupQuills = {};
      listeningLabelQuills = {};
    }

    function resetReadingQuills() {
      readingPassageQuills = {};
      readingIntroQuills = {};
      readingGroupQuills = {};
      readingLabelQuills = {};
    }

    async function populateExamSelect() {
      const select = document.getElementById("builderExamSelect");
      select.innerHTML = `<option>Loading…</option>`;
      const exams = await getExams();
      select.innerHTML = "";
      Object.values(exams).forEach(exam => {
        const option = document.createElement("option");
        option.value = exam.id;
        option.textContent = exam.name;
        select.appendChild(option);
      });
      const startId = requestedId && exams[requestedId] ? requestedId : select.value;
      select.value = startId;
      loadExam(exams[startId]);
    }

    document.getElementById("builderExamSelect").addEventListener("change", async event => {
      if (hasUnsavedChanges && !confirm("Discard unsaved changes for this exam?")) {
        event.target.value = workingExam.id;
        return;
      }
      const exams = await getExams();
      loadExam(exams[event.target.value]);
    });

    function loadExam(exam) {
      if (!exam) return;
      workingExam = JSON.parse(JSON.stringify(exam));
      hasUnsavedChanges = false;
      resetListeningQuills();
      resetReadingQuills();
      normalizeExamStructure();
      renderListeningBuilder();
      renderReadingBuilder();
      task1Quill.root.innerHTML = workingExam.writing.task1Prompt || "";
      document.getElementById("writingTask1Image").value = workingExam.writing.task1Image || "";
      task2Quill.root.innerHTML = workingExam.writing.task2Prompt || "";
    }

    document.querySelectorAll(".builder-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".builder-tab").forEach(item => item.classList.remove("active"));
        document.querySelectorAll(".builder-tab-pane").forEach(pane => pane.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById(tab.dataset.btab).classList.add("active");
      });
    });

    function updateVisibleQuestionRanges(section) {
      const parts = section === "listening" ? workingExam.listening : workingExam.reading;
      document.querySelectorAll(`[data-range-section="${section}"]`).forEach(chip => {
        const partIndex = Number(chip.dataset.rangePart);
        const part = parts[partIndex];
        const group = part && (part.questionGroups || []).find(item => item.id === chip.dataset.rangeGroup);
        if (part && group) chip.textContent = questionRangeText(parts, partIndex, group);
      });
    }

    function renderQuestionGroup(options) {
      const {
        card,
        section,
        parts,
        part,
        partIndex,
        group,
        groupIndex,
        refresh
      } = options;
      const rangeText = questionRangeText(parts, partIndex, group);
      const groupCard = document.createElement("section");
      groupCard.className = "question-group-editor-card";
      groupCard.innerHTML = `
        <div class="question-group-editor-head">
          <div>
            <strong>Question Group ${groupIndex + 1}</strong>
            <span class="question-range-chip" data-range-section="${section}" data-range-part="${partIndex}" data-range-group="${group.id}">${rangeText}</span>
          </div>
          <button class="btn btn-danger btn-sm" type="button" data-remove-group="${group.id}">Remove Group</button>
        </div>
        <label class="builder-field-label">Question label / instructions</label>
        <p class="muted small builder-help">The question range is calculated automatically. Format the task directions here; use the image button for maps, diagrams, or table screenshots stored in the repository.</p>
        <div class="rich-editor question-label-editor" data-group-editor="${group.id}"></div>
        <div data-group-questions="${group.id}"></div>
        <div class="builder-add-row">
          <button class="btn btn-ghost btn-sm" type="button" data-add-group-question="${group.id}">+ Add Question to This Group</button>
          <button class="btn btn-ghost btn-sm" type="button" data-add-group-label="${group.id}">+ Add Label / Text Block</button>
        </div>`;
      card.appendChild(groupCard);

      const editorElement = groupCard.querySelector(`[data-group-editor="${group.id}"]`);
      const groupPlaceholder = rangeText === "No questions yet"
        ? GROUP_LABEL_PLACEHOLDER
        : [
            rangeText,
            "Complete the notes below.",
            "Write ONE WORD AND / OR A NUMBER for each answer."
          ].join("\n");
      const editor = createRichEditor(editorElement, group.label || "", groupPlaceholder);
      const key = `${partIndex}:${group.id}`;
      const target = { quill: editor, partIndex, groupId: group.id };
      if (section === "listening") listeningGroupQuills[key] = target;
      else readingGroupQuills[key] = target;

      const questionContainer = groupCard.querySelector(`[data-group-questions="${group.id}"]`);
      renderQuestionEditors(questionContainer, questionsForGroup(part, group), {
        section,
        partIndex,
        onWeightChange: () => updateVisibleQuestionRanges(section),
        onDelete: question => {
          removeQuestion(part, group, question.id);
          markDirty();
          refresh();
        },
        onMoveUp: question => {
          const position = group.questionIds.indexOf(question.id);
          if (position <= 0) return;
          [group.questionIds[position - 1], group.questionIds[position]] =
            [group.questionIds[position], group.questionIds[position - 1]];
          syncPartQuestionOrder(part);
          markDirty();
          refresh();
        },
        onMoveDown: question => {
          const position = group.questionIds.indexOf(question.id);
          if (position === -1 || position >= group.questionIds.length - 1) return;
          [group.questionIds[position], group.questionIds[position + 1]] =
            [group.questionIds[position + 1], group.questionIds[position]];
          syncPartQuestionOrder(part);
          markDirty();
          refresh();
        }
      });

      groupCard.querySelector(`[data-add-group-question="${group.id}"]`).addEventListener("click", () => {
        const question = { id: makeId(section === "listening" ? "lq" : "rq"), type: "fill", text: "", answer: "" };
        part.questions.push(question);
        group.questionIds.push(question.id);
        syncPartQuestionOrder(part);
        markDirty();
        refresh();
      });

      groupCard.querySelector(`[data-add-group-label="${group.id}"]`).addEventListener("click", () => {
        const label = { id: makeId(section === "listening" ? "ll" : "rl"), type: "label", text: "" };
        part.questions.push(label);
        group.questionIds.push(label.id);
        syncPartQuestionOrder(part);
        markDirty();
        refresh();
      });

      groupCard.querySelector(`[data-remove-group="${group.id}"]`).addEventListener("click", () => {
        if (!confirm("Remove this question group? Its questions will be kept and moved into the adjacent group.")) return;
        if (removeQuestionGroup(part, groupIndex)) {
          markDirty();
          refresh();
        }
      });
    }

    function refreshListeningBuilder() {
      flushListeningGroupQuills();
      resetListeningQuills();
      renderListeningBuilder();
    }

    function renderListeningBuilder() {
      const wrap = document.getElementById("listeningPartsList");
      wrap.innerHTML = "";

      workingExam.listening.forEach((part, partIndex) => {
        normalizeQuestionGroups(part, `l${partIndex + 1}`);
        const card = document.createElement("div");
        card.className = "builder-part-card enhanced-builder-card";
        card.innerHTML = `
          <div class="builder-part-head">
            <input type="text" class="text-input" style="width:auto;flex:1;margin-right:10px;" value="${escapeAttribute(part.title)}" data-lp-title="${partIndex}">
            <button class="btn btn-danger btn-sm" type="button" data-lp-del="${partIndex}">Remove Part</button>
          </div>
          <label class="builder-field-label">MP3 filename/path</label>
          <p class="muted small builder-help">Keep the audio in <code>assets/audio/</code> and enter its repository path.</p>
          <input type="text" class="text-input" value="${escapeAttribute(part.audio)}" data-lp-audio="${partIndex}" placeholder="assets/audio/part1.mp3">
          <div class="question-groups-wrap" data-lp-groups="${partIndex}"></div>
          <button class="btn btn-ghost btn-sm" type="button" data-lp-add-group="${partIndex}">+ Add Question Group</button>`;
        wrap.appendChild(card);

        const groupWrap = card.querySelector(`[data-lp-groups="${partIndex}"]`);
        part.questionGroups.forEach((group, groupIndex) => {
          renderQuestionGroup({
            card: groupWrap,
            section: "listening",
            parts: workingExam.listening,
            part,
            partIndex,
            group,
            groupIndex,
            refresh: refreshListeningBuilder
          });
        });
      });

      wrap.querySelectorAll("[data-lp-title]").forEach(input => input.addEventListener("input", event => {
        workingExam.listening[+event.target.dataset.lpTitle].title = event.target.value;
        markDirty();
      }));
      wrap.querySelectorAll("[data-lp-audio]").forEach(input => input.addEventListener("input", event => {
        workingExam.listening[+event.target.dataset.lpAudio].audio = event.target.value;
        markDirty();
      }));
      wrap.querySelectorAll("[data-lp-del]").forEach(button => button.addEventListener("click", event => {
        flushListeningGroupQuills();
        workingExam.listening.splice(+event.target.dataset.lpDel, 1);
        resetListeningQuills();
        markDirty();
        renderListeningBuilder();
      }));
      wrap.querySelectorAll("[data-lp-add-group]").forEach(button => button.addEventListener("click", event => {
        const part = workingExam.listening[+event.target.dataset.lpAddGroup];
        part.questionGroups.push({ id: makeId("lg"), label: "", questionIds: [] });
        markDirty();
        refreshListeningBuilder();
      }));
    }

    document.getElementById("btnAddListeningPart").addEventListener("click", () => {
      if (workingExam.listening.length >= 4) {
        alert("Maximum 4 listening parts.");
        return;
      }
      flushListeningGroupQuills();
      const partNumber = workingExam.listening.length + 1;
      workingExam.listening.push({
        title: `Part ${partNumber}`,
        audio: "",
        questions: [],
        questionGroups: [{ id: makeId("lg"), label: "", questionIds: [] }]
      });
      resetListeningQuills();
      markDirty();
      renderListeningBuilder();
    });

    function refreshReadingBuilder() {
      flushReadingQuills();
      resetReadingQuills();
      renderReadingBuilder();
    }

    function renderReadingBuilder() {
      const wrap = document.getElementById("readingPassagesList");
      wrap.innerHTML = "";

      workingExam.reading.forEach((part, partIndex) => {
        normalizeQuestionGroups(part, `r${partIndex + 1}`);
        const card = document.createElement("div");
        card.className = "builder-part-card enhanced-builder-card";
        card.innerHTML = `
          <div class="builder-part-head">
            <input type="text" class="text-input" style="width:auto;flex:1;margin-right:10px;" value="${escapeAttribute(part.title)}" data-rp-title="${partIndex}">
            <button class="btn btn-danger btn-sm" type="button" data-rp-del="${partIndex}">Remove Passage</button>
          </div>
          <label class="builder-field-label">Passage introduction / timing note</label>
          <div class="rich-editor compact-rich-editor" data-rp-intro="${partIndex}"></div>
          <label class="builder-field-label">Passage text</label>
          <p class="muted small builder-help">Use headings, lists, links, and repository-hosted images. Pasted tables are styled responsively in the student view.</p>
          <div class="rich-editor passage-rich-editor" data-rp-passage="${partIndex}"></div>
          <div class="question-groups-wrap" data-rp-groups="${partIndex}"></div>
          <button class="btn btn-ghost btn-sm" type="button" data-rp-add-group="${partIndex}">+ Add Question Group</button>`;
        wrap.appendChild(card);

        readingIntroQuills[partIndex] = createRichEditor(
          card.querySelector(`[data-rp-intro="${partIndex}"]`),
          part.intro || "",
          READING_INTRO_PLACEHOLDER
        );
        readingPassageQuills[partIndex] = createRichEditor(
          card.querySelector(`[data-rp-passage="${partIndex}"]`),
          part.passage || "",
          "Paste or type the reading passage here."
        );

        const groupWrap = card.querySelector(`[data-rp-groups="${partIndex}"]`);
        part.questionGroups.forEach((group, groupIndex) => {
          renderQuestionGroup({
            card: groupWrap,
            section: "reading",
            parts: workingExam.reading,
            part,
            partIndex,
            group,
            groupIndex,
            refresh: refreshReadingBuilder
          });
        });
      });

      wrap.querySelectorAll("[data-rp-title]").forEach(input => input.addEventListener("input", event => {
        workingExam.reading[+event.target.dataset.rpTitle].title = event.target.value;
        markDirty();
      }));
      wrap.querySelectorAll("[data-rp-del]").forEach(button => button.addEventListener("click", event => {
        flushReadingQuills();
        workingExam.reading.splice(+event.target.dataset.rpDel, 1);
        resetReadingQuills();
        markDirty();
        renderReadingBuilder();
      }));
      wrap.querySelectorAll("[data-rp-add-group]").forEach(button => button.addEventListener("click", event => {
        const part = workingExam.reading[+event.target.dataset.rpAddGroup];
        part.questionGroups.push({ id: makeId("rg"), label: "", questionIds: [] });
        markDirty();
        refreshReadingBuilder();
      }));
    }

    document.getElementById("btnAddReadingPassage").addEventListener("click", () => {
      if (workingExam.reading.length >= 3) {
        alert("Maximum 3 reading passages.");
        return;
      }
      flushReadingQuills();
      const passageNumber = workingExam.reading.length + 1;
      workingExam.reading.push({
        title: `Passage ${passageNumber}`,
        intro: "",
        passage: "",
        questions: [],
        questionGroups: [{ id: makeId("rg"), label: "", questionIds: [] }]
      });
      resetReadingQuills();
      markDirty();
      renderReadingBuilder();
    });

    function renderQuestionEditors(container, questions, config = {}) {
      container.innerHTML = "";
      questions.forEach((question, questionIndex) => {
        normalizeQuestionAnswerModel(question);

        if (question.type === "label") {
          const row = document.createElement("div");
          row.className = "builder-question-row enhanced-question-row label-question-row";
          row.dataset.questionId = question.id;
          row.dataset.questionIndex = questionIndex;
          row.innerHTML = `
            <div style="flex:1;">
              <label class="builder-field-label" style="margin-top:0;">Label / text block (not a question — not scored)</label>
              <div class="rich-editor label-block-editor" data-label-editor="${question.id}"></div>
            </div>
            <div class="row-actions">
              <button class="btn btn-ghost btn-sm row-move" type="button" data-q-up="${questionIndex}" ${questionIndex === 0 ? "disabled" : ""} title="Move up">&uarr;</button>
              <button class="btn btn-ghost btn-sm row-move" type="button" data-q-down="${questionIndex}" ${questionIndex === questions.length - 1 ? "disabled" : ""} title="Move down">&darr;</button>
              <button class="btn btn-danger btn-sm" type="button" data-q-del="${questionIndex}">✕</button>
            </div>`;
          container.appendChild(row);
          return;
        }

        const isMultipleChoice = question.type === "mc";
        const isMultipleAnswer = question.type === "multi";
        const isTfng = question.type === "tfng";
        const multiWeight = isMultipleAnswer ? questionWeight(question) : 0;
        let answerEditor = "";

        if (isMultipleChoice || isMultipleAnswer) {
          const selectionType = isMultipleAnswer ? "checkbox" : "radio";
          const instruction = isMultipleAnswer
            ? "Tick every correct option. Each selected correct option becomes one numbered IELTS answer."
            : "Choose exactly one correct option.";
          const optionRows = (question.options || []).map((option, optionIndex) => {
            const optionReady = normalizeComparable(option);
            return `
              <div class="choice-option-editor-row">
                <label class="correct-option-toggle" title="Mark option ${optionLetter(optionIndex)} as correct">
                  <input type="${selectionType}" name="correct-${question.id}" data-q-correct="${questionIndex}" data-option-index="${optionIndex}" ${choiceOptionIsCorrect(question, optionIndex) ? "checked" : ""} ${optionReady ? "" : "disabled"}>
                  <span class="choice-option-letter">${optionLetter(optionIndex)}</span>
                </label>
                <input type="text" class="text-input choice-option-input" placeholder="Option ${optionLetter(optionIndex)}" value="${escapeAttribute(option)}" data-q-option="${questionIndex}" data-option-index="${optionIndex}" data-previous-weight="${questionWeight(question)}">
                <button class="btn btn-ghost btn-sm choice-option-remove" type="button" data-q-option-remove="${questionIndex}" data-option-index="${optionIndex}" aria-label="Remove option ${optionLetter(optionIndex)}">Remove</button>
              </div>`;
          }).join("");
          answerEditor = `
            <div class="answer-key-panel">
              <div class="answer-key-panel-head">
                <div>
                  <strong>Options and correct answer${isMultipleAnswer ? "s" : ""}</strong>
                  <p>${instruction}</p>
                </div>
                ${isMultipleAnswer ? `<span class="multi-weight-pill" data-multi-weight="${questionIndex}">${multiWeight} answer slots</span>` : ""}
              </div>
              <div class="choice-option-editor-list">${optionRows}</div>
              <button class="btn btn-ghost btn-sm" type="button" data-q-option-add="${questionIndex}">+ Add option</button>
            </div>`;
        } else if (isTfng) {
          answerEditor = `
            <div class="answer-key-panel tfng-answer-panel">
              <div class="answer-key-panel-head">
                <div>
                  <strong>Correct answer</strong>
                  <p>The student options are fixed and displayed in this order.</p>
                </div>
              </div>
              <div class="tfng-answer-grid">
                ${TFNG_OPTIONS.map(option => `
                  <label class="tfng-answer-choice ${question.answer === option ? "is-selected" : ""}">
                    <input type="radio" name="tfng-${question.id}" value="${option}" data-q-tfng="${questionIndex}" ${question.answer === option ? "checked" : ""}>
                    <span>${option}</span>
                  </label>`).join("")}
              </div>
            </div>`;
        } else {
          const answerValue = Array.isArray(question.answer) ? question.answer.join(" | ") : (question.answer || "");
          answerEditor = `
            <div class="answer-key-panel fill-answer-panel">
              <label class="builder-field-label" style="margin-top:0;">Accepted answer${Array.isArray(question.answer) && question.answer.length > 1 ? "s" : ""}</label>
              <input type="text" class="text-input" placeholder="Correct answer; use | between accepted alternatives" value="${escapeAttribute(answerValue)}" data-q-ans="${questionIndex}">
              <p class="muted small answer-help">Example: <code>10 | ten</code> accepts either spelling. Matching ignores capitalization and surrounding spaces.</p>
            </div>`;
        }

        const errors = questionAnswerErrors(question);
        const row = document.createElement("div");
        row.className = `builder-question-row enhanced-question-row question-authoring-card${errors.length ? " has-answer-errors" : ""}`;
        row.dataset.questionId = question.id;
        row.dataset.questionIndex = questionIndex;
        row.innerHTML = `
          <div class="question-authoring-main">
            <div class="question-authoring-toolbar">
              <select data-q-type="${questionIndex}" aria-label="Question type">
                <option value="fill" ${question.type === "fill" ? "selected" : ""}>Fill in the blank</option>
                <option value="mc" ${isMultipleChoice ? "selected" : ""}>Multiple choice — one answer</option>
                <option value="multi" ${isMultipleAnswer ? "selected" : ""}>Multiple choice — several answers</option>
                <option value="tfng" ${isTfng ? "selected" : ""}>True / False / Not Given</option>
              </select>
              ${isMultipleAnswer ? `<span class="muted small multi-weight-hint">Numbering uses ${multiWeight} answer slots</span>` : ""}
            </div>
            <label class="builder-field-label">Question text</label>
            <input type="text" class="text-input" placeholder="Question text" value="${escapeAttribute(question.text)}" data-q-text="${questionIndex}">
            ${answerEditor}
            ${answerStatusMarkup(question, questionIndex)}
          </div>
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm row-move" type="button" data-q-up="${questionIndex}" ${questionIndex === 0 ? "disabled" : ""} title="Move up">&uarr;</button>
            <button class="btn btn-ghost btn-sm row-move" type="button" data-q-down="${questionIndex}" ${questionIndex === questions.length - 1 ? "disabled" : ""} title="Move down">&darr;</button>
            <button class="btn btn-danger btn-sm" type="button" data-q-del="${questionIndex}">✕</button>
          </div>`;
        container.appendChild(row);
      });

      container.querySelectorAll("[data-label-editor]").forEach(element => {
        const questionId = element.dataset.labelEditor;
        const question = questions.find(item => item.id === questionId);
        if (!question) return;
        const quill = createRichEditor(
          element,
          question.text || "",
          "Enter instructional text or a sub-heading — this will not be scored (e.g. \"Typical jobs\")."
        );
        const map = config.section === "listening" ? listeningLabelQuills : readingLabelQuills;
        map[questionId] = { quill, partIndex: config.partIndex, questionId };
      });

      container.querySelectorAll("[data-q-type]").forEach(select => select.addEventListener("change", event => {
        const questionIndex = Number(event.target.dataset.qType);
        const question = questions[questionIndex];
        const previousWeight = questionWeight(question);
        initializeQuestionType(question, event.target.value);
        markDirty();
        renderQuestionEditors(container, questions, config);
        if (previousWeight !== questionWeight(question) && config.onWeightChange) config.onWeightChange();
      }));

      container.querySelectorAll("[data-q-text]").forEach(input => input.addEventListener("input", event => {
        questions[Number(event.target.dataset.qText)].text = event.target.value;
        markDirty();
      }));

      container.querySelectorAll("[data-q-option]").forEach(input => {
        input.addEventListener("input", event => {
          const questionIndex = Number(event.target.dataset.qOption);
          const optionIndex = Number(event.target.dataset.optionIndex);
          const question = questions[questionIndex];
          setChoiceOptionText(question, optionIndex, event.target.value);
          const toggle = event.target.closest(".choice-option-editor-row").querySelector("[data-q-correct]");
          if (toggle) {
            toggle.disabled = !normalizeComparable(event.target.value);
            toggle.checked = choiceOptionIsCorrect(question, optionIndex);
          }
          markDirty();
          updateAnswerStatus(container, questionIndex, question);
        });
        input.addEventListener("change", event => {
          const question = questions[Number(event.target.dataset.qOption)];
          const previousWeight = Number(event.target.dataset.previousWeight || 1);
          if (previousWeight !== questionWeight(question) && config.onWeightChange) config.onWeightChange();
          event.target.dataset.previousWeight = questionWeight(question);
        });
      });

      container.querySelectorAll("[data-q-correct]").forEach(input => input.addEventListener("change", event => {
        const questionIndex = Number(event.target.dataset.qCorrect);
        const optionIndex = Number(event.target.dataset.optionIndex);
        const question = questions[questionIndex];
        const option = question.options[optionIndex] || "";
        if (!normalizeComparable(option)) return;
        const previousWeight = questionWeight(question);

        if (question.type === "multi") {
          const answers = Array.isArray(question.answer) ? [...question.answer] : [];
          const existingIndex = answers.findIndex(answer => normalizeComparable(answer) === normalizeComparable(option));
          if (event.target.checked && existingIndex === -1) answers.push(option);
          if (!event.target.checked && existingIndex >= 0) answers.splice(existingIndex, 1);
          question.answer = answers;
        } else {
          question.answer = option;
        }

        markDirty();
        updateAnswerStatus(container, questionIndex, question);
        const weightPill = container.querySelector(`[data-multi-weight="${questionIndex}"]`);
        if (weightPill) weightPill.textContent = `${questionWeight(question)} answer slots`;
        const toolbarHint = container.querySelector(`[data-question-index="${questionIndex}"] .multi-weight-hint`);
        if (toolbarHint) toolbarHint.textContent = `Numbering uses ${questionWeight(question)} answer slots`;
        if (previousWeight !== questionWeight(question) && config.onWeightChange) config.onWeightChange();
      }));

      container.querySelectorAll("[data-q-tfng]").forEach(input => input.addEventListener("change", event => {
        const questionIndex = Number(event.target.dataset.qTfng);
        const question = questions[questionIndex];
        question.answer = event.target.value;
        container.querySelectorAll(`[data-q-tfng="${questionIndex}"]`).forEach(choice => {
          choice.closest(".tfng-answer-choice").classList.toggle("is-selected", choice.checked);
        });
        markDirty();
        updateAnswerStatus(container, questionIndex, question);
      }));

      container.querySelectorAll("[data-q-option-add]").forEach(button => button.addEventListener("click", event => {
        const questionIndex = Number(event.target.dataset.qOptionAdd);
        questions[questionIndex].options.push("");
        markDirty();
        renderQuestionEditors(container, questions, config);
      }));

      container.querySelectorAll("[data-q-option-remove]").forEach(button => button.addEventListener("click", event => {
        const questionIndex = Number(event.target.dataset.qOptionRemove);
        const optionIndex = Number(event.target.dataset.optionIndex);
        const question = questions[questionIndex];
        const previousWeight = questionWeight(question);
        const removed = question.options[optionIndex] || "";
        question.options.splice(optionIndex, 1);
        if (question.type === "multi") {
          question.answer = (Array.isArray(question.answer) ? question.answer : [])
            .filter(answer => normalizeComparable(answer) !== normalizeComparable(removed));
        } else if (normalizeComparable(question.answer) === normalizeComparable(removed)) {
          question.answer = "";
        }
        markDirty();
        renderQuestionEditors(container, questions, config);
        if (previousWeight !== questionWeight(question) && config.onWeightChange) config.onWeightChange();
      }));

      container.querySelectorAll("[data-q-ans]").forEach(input => input.addEventListener("input", event => {
        const question = questions[Number(event.target.dataset.qAns)];
        const alternatives = event.target.value.split("|").map(value => value.trim()).filter(Boolean);
        question.answer = alternatives.length > 1 ? alternatives : (alternatives[0] || "");
        markDirty();
      }));

      container.querySelectorAll("[data-q-up]").forEach(button => button.addEventListener("click", event => {
        const question = questions[Number(event.target.dataset.qUp)];
        if (config.onMoveUp) config.onMoveUp(question);
      }));
      container.querySelectorAll("[data-q-down]").forEach(button => button.addEventListener("click", event => {
        const question = questions[Number(event.target.dataset.qDown)];
        if (config.onMoveDown) config.onMoveDown(question);
      }));
      container.querySelectorAll("[data-q-del]").forEach(button => button.addEventListener("click", event => {
        const question = questions[Number(event.target.dataset.qDel)];
        if (config.onDelete) config.onDelete(question);
      }));
    }

    document.getElementById("writingTask1Image").addEventListener("input", markDirty);

    document.getElementById("btnSubmitExam").addEventListener("click", async () => {
      flushListeningGroupQuills();
      flushReadingQuills();
      workingExam.writing = {
        task1Prompt: cleanRichHtml(task1Quill.root.innerHTML),
        task1Image: document.getElementById("writingTask1Image").value,
        task2Prompt: cleanRichHtml(task2Quill.root.innerHTML)
      };
      workingExam.builderSchemaVersion = 3;

      const answerKeyErrors = collectAnswerKeyErrors();
      if (answerKeyErrors.length) {
        const firstItems = answerKeyErrors.slice(0, 8).map(error =>
          `• ${error.sectionLabel} — ${error.partTitle}: ${error.message}`
        );
        const remaining = answerKeyErrors.length > firstItems.length
          ? `\n…and ${answerKeyErrors.length - firstItems.length} more issue${answerKeyErrors.length - firstItems.length === 1 ? "" : "s"}.`
          : "";
        alert(`Please complete the answer keys before saving:\n\n${firstItems.join("\n")}${remaining}`);
        focusAnswerKeyError(answerKeyErrors[0]);
        return;
      }

      const button = document.getElementById("btnSubmitExam");
      button.disabled = true;
      button.textContent = "Saving...";
      try {
        await saveExam(workingExam);
        hasUnsavedChanges = false;
        const message = document.getElementById("builderSaveMsg");
        message.textContent = "Exam saved ✓";
        setTimeout(() => { message.textContent = ""; }, 2500);
      } catch (error) {
        console.error(error);
        alert("The exam could not be saved. Please check your connection and try again.");
      } finally {
        button.disabled = false;
        button.textContent = "Submit Exam";
      }
    });

    window.addEventListener("beforeunload", event => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = "";
      }
    });

    populateExamSelect();
  });
});
