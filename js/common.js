/* =========================================================
   EHSAN IELTS Mock Test — js/common.js
   Loaded on every page (after firebase-init.js).
   Firestore collections:
     exams   -> one document per exam, doc id = exam.id
     results -> one document per student submission
   ========================================================= */

const SS_SESSION = "ielts_current_session";

const SECTION_TIMES = { listening: 30 * 60, reading: 60 * 60, writingTask1: 20 * 60, writingTask2: 40 * 60 };

const BAND_TABLE = [
  [39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5],
  [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [0, 2]
];
function rawToBand(correct) {
  for (const [min, band] of BAND_TABLE) if (correct >= min) return band;
  return 2;
}

/* ---------- Sample exam (seeded into Firestore once, if the exams collection is empty) ---------- */
function sampleExam() {
  return {
    id: "sample-exam-1",
    name: "Sample Academic Mock Test 1",
    listening: [
      {
        title: "Part 1 — Library Registration",
        audio: "assets/audio/sample-part1.mp3",
        questions: [
          { id: "l1", type: "fill", text: "", answer: "Harrington" },
          { id: "l2", type: "fill", text: "", answer: "15" },
          { id: "l3", type: "mc", text: "The library closes at:", options: ["8pm", "9pm", "10pm"], answer: "9pm" }
        ],
        questionGroups: [{
          id: "l1g1",
          label: "<p>Questions 1 and 2</p><p>Complete the notes below. Write <strong>ONE WORD AND/OR A NUMBER</strong> for each answer.</p>",
          questionIds: ["l1", "l2", "l3"],
          contentBlocks: [{
            id: "l1block1",
            type: "notes",
            title: "Library Registration",
            sections: [{ heading: "", rows: ["The student's surname is spelled {{q:l1}}", "The library card fee is $ {{q:l2}}"] }]
          }]
        }]
      },
      {
        title: "Part 2 — Campus Tour",
        audio: "assets/audio/sample-part2.mp3",
        questions: [
          { id: "l4", type: "multi", text: "Which TWO facilities are mentioned in the tour? (choose two)", options: ["Science building", "Swimming pool", "Cafeteria", "Bookstore"], answer: ["Science building", "Cafeteria"] },
          { id: "l5", type: "fill", text: 'Tours run every <span class="ielts-answer-slot" data-slot-id="l5-slot" data-slot-size="short"></span> minutes.', answer: "45" }
        ]
      },
      {
        title: "Part 3 — Group Project Discussion",
        audio: "assets/audio/sample-part3.mp3",
        questions: [
          { id: "l6", type: "mc", text: "The students agree to meet next on:", options: ["Monday", "Wednesday", "Friday"], answer: "Wednesday" }
        ]
      },
      {
        title: "Part 4 — Lecture on Renewable Energy",
        audio: "assets/audio/sample-part4.mp3",
        questions: [
          { id: "l7", type: "fill", text: "Solar panel efficiency has improved by ______ percent.", answer: "20" }
        ]
      }
    ],
    reading: [
      {
        title: "Passage 1 — The History of Tea",
        passage: "Tea has been consumed for thousands of years, with its origins traced back to ancient China. Legend attributes its discovery to Emperor Shen Nung around 2737 BCE, when tea leaves are said to have blown into his pot of boiling water. By the Tang Dynasty, tea had become a staple of Chinese culture, and its cultivation spread across Asia over subsequent centuries. European traders introduced tea to the West in the 17th century, and it quickly became fashionable among the British aristocracy before eventually becoming a national drink.",
        questions: [
          { id: "r1", type: "tfng", text: "Tea was first discovered in Japan.", options: ["True", "False", "Not Given"], answer: "False" },
          { id: "r2", type: "fill", text: "Tea became fashionable among the British aristocracy in the ______ century.", answer: "17th" },
          { id: "r3", type: "mc", text: "According to legend, tea was discovered by:", options: ["A trader", "An emperor", "A farmer"], answer: "An emperor" }
        ]
      }
    ],
    writing: {
      task1Prompt: "The chart below shows the percentage of households with internet access in three countries between 2000 and 2020. Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.",
      task1Image: "",
      task2Prompt: "Some people believe that unpaid community service should be a compulsory part of high school education. To what extent do you agree or disagree? Give reasons for your answer and include any relevant examples from your own knowledge or experience. Write at least 250 words."
    }
  };
}

/* ---------- Firestore: exams ---------- */
async function getExams() {
  const snap = await db.collection("exams").get();
  if (snap.empty) {
    if (!auth.currentUser || isStudentAccount(auth.currentUser)) return {};
    const sample = sampleExam();
    await db.collection("exams").doc(sample.id).set(sample);
    return { [sample.id]: sample };
  }
  const exams = {};
  snap.forEach(doc => { exams[doc.id] = doc.data(); });
  return exams;
}
async function saveExam(exam) {
  await db.collection("exams").doc(exam.id).set(exam);
}
async function deleteExam(examId) {
  await db.collection("exams").doc(examId).delete();
}

/* ---------- Firestore: results ---------- */
function generateResultId() { return db.collection("results").doc().id; }
async function createResult(resultId, resultData) {
  await db.collection("results").doc(resultId).set(resultData);
}
async function updateResult(resultId, patch) {
  await db.collection("results").doc(resultId).update(patch);
}
function listenResults(callback) {
  // Live listener: fires immediately with current data, then again on every change.
  // Returns an unsubscribe function.
  return db.collection("results").orderBy("submittedAt", "desc").onSnapshot(snap => {
    const results = {};
    snap.forEach(doc => { results[doc.id] = doc.data(); });
    callback(results);
  });
}

/* ---------- Cross-page student session (sessionStorage; per-device, per-tab; not the database) ---------- */
function getSession() { return JSON.parse(sessionStorage.getItem(SS_SESSION) || "null"); }
function saveSession(s) { sessionStorage.setItem(SS_SESSION, JSON.stringify(s)); }
function clearSession() { sessionStorage.removeItem(SS_SESSION); }

function studentEmail(username) {
  return `student-${String(username || "").trim()}@students.ehsan.app`;
}
function studentFirebasePassword(code) {
  return `${String(code || "")}#IELTS`;
}
function isStudentAccount(user) {
  return Boolean(user && /@students\.ehsan\.app$/i.test(user.email || ""));
}
function validStudentUsername(value) { return /^\d{7}$/.test(String(value || "")); }
function validStudentPassword(value) {
  const text = String(value || "");
  return text.length === 6 && /[a-z]/i.test(text) && /\d/.test(text);
}

/* ---------- Admin auth guard ----------
   Call at top of every teacher-*.html page (except teacher-login.html).
   Runs onReady(user) once Firebase confirms the signed-in teacher;
   redirects to login if nobody is signed in. */
function requireAdminAuth(onReady) {
  auth.onAuthStateChanged(async user => {
    if (!user) {
      window.location.href = "teacher-login.html";
    } else if (isStudentAccount(user)) {
      auth.signOut().finally(() => { window.location.href = "teacher-login.html"; });
    } else {
      try {
        const teacherRecord = await db.collection("teachers").doc(user.uid).get();
        if (!teacherRecord.exists || teacherRecord.data().active === false) {
          await auth.signOut();
          window.location.href = "teacher-login.html?unauthorized=1";
        } else if (typeof onReady === "function") {
          onReady(user);
        }
      } catch (error) {
        console.error("Teacher authorization check failed", error);
        window.location.href = "teacher-login.html?unauthorized=1";
      }
    }
  });
}
function logoutAdmin() {
  auth.signOut().then(() => { window.location.href = "index.html"; });
}

function createExamGuard() {
  let released = false;
  history.pushState({ examGuard: true }, "", location.href);
  const onPopState = () => {
    if (released) return;
    history.pushState({ examGuard: true }, "", location.href);
  };
  const onBeforeUnload = event => {
    if (released) return;
    event.preventDefault();
    event.returnValue = "";
  };
  window.addEventListener("popstate", onPopState);
  window.addEventListener("beforeunload", onBeforeUnload);
  return {
    release() {
      released = true;
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
    }
  };
}

/* ---------- Scoring ---------- */
/* ---------- Scoring weight: how many numbered question slots an item occupies.
   Labels are instructional text, not questions, so they occupy none.
   A multiple-answer ("choose TWO") question occupies as many slots as it has
   correct answers (defaulting to 2, matching real IELTS convention). ---------- */
function questionScoreWeight(question) {
  if (!question || question.type === "label") return 0;
  if (question.type === "fill" && Array.isArray(question.blankAnswers) && question.blankAnswers.length) {
    return question.blankAnswers.length;
  }
  if (question.type === "multi") {
    const count = Array.isArray(question.answer) ? question.answer.length : 0;
    return count > 0 ? count : 2;
  }
  return 1;
}

function scoreSection(parts, answers) {
  let total = 0, correct = 0;
  (parts || []).forEach(part => (part.questions || []).forEach(question => {
    const weight = questionScoreWeight(question);
    if (weight <= 0) return; // labels are not scored
    total += weight;
    if (question.type === "multi") {
      const given = Array.isArray(answers[question.id]) ? answers[question.id] : [];
      const key = Array.isArray(question.answer) ? question.answer : [];
      const matched = given.filter(value => key.includes(value)).length;
      correct += Math.min(matched, weight);
    } else if (question.type === "fill" && Array.isArray(question.blankAnswers) && question.blankAnswers.length) {
      const givenValues = Array.isArray(answers[question.id]) ? answers[question.id] : [answers[question.id]];
      question.blankAnswers.forEach((answerKey, index) => {
        const given = (givenValues[index] || "").toString().trim().toLowerCase();
        const accepted = Array.isArray(answerKey)
          ? answerKey
          : String(answerKey || "").split("|").map(value => value.trim()).filter(Boolean);
        if (given && accepted.some(key => given === (key || "").toString().trim().toLowerCase())) correct += 1;
      });
    } else {
      const given = (answers[question.id] || "").toString().trim().toLowerCase();
      // question.answer may be a single string OR an array of accepted alternatives
      // (teachers enter "10 | ten" in the builder to accept either spelling).
      const accepted = Array.isArray(question.answer) ? question.answer : [question.answer];
      const isMatch = given.length > 0 && accepted.some(key => given === (key || "").toString().trim().toLowerCase());
      if (isMatch) correct += 1;
    }
  }));
  return { correct, total };
}

/* =========================================================
   Rich content: inline answer blanks + IELTS content blocks
   Shared between the Exam Builder (authoring/preview) and the
   student exam runner (real, scored rendering).
   ========================================================= */

const TFNG_OPTIONS = ["True", "False", "Not Given"];
const YNNG_OPTIONS = ["Yes", "No", "Not Given"];

function stripHtml(value) {
  const node = document.createElement("div");
  node.innerHTML = String(value || "");
  return (node.textContent || "").trim();
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

function generateSlotId() {
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* Registers a custom Quill embed so a blank can live inline inside rich text —
   e.g. "The cost is £ [blank] including one disk." Call once, after Quill loads,
   before creating any Quill editor that should support inline blanks. */
function registerAnswerSlotBlot() {
  if (typeof Quill === "undefined") return;
  if (Quill.imports && Quill.imports["formats/answerSlot"]) return; // already registered
  const Embed = Quill.import("blots/embed");
  class AnswerSlotBlot extends Embed {
    static create(value = {}) {
      const node = super.create();
      node.setAttribute("contenteditable", "false");
      node.dataset.slotId = value.id || generateSlotId();
      node.dataset.slotSize = value.size || "medium";
      node.textContent = "▭▭▭";
      return node;
    }
    static value(node) {
      return { id: node.dataset.slotId, size: node.dataset.slotSize };
    }
  }
  AnswerSlotBlot.blotName = "answerSlot";
  AnswerSlotBlot.tagName = "SPAN";
  AnswerSlotBlot.className = "ielts-answer-slot";
  Quill.register(AnswerSlotBlot, true);
}

/* Renders one real inline answer input. `value` is whatever the student has
   typed so far (or "" in the builder's preview / not started yet). */
function slotInputHtml(question, slotId, size, value, disabled, blankIndex) {
  const safeValue = String(value || "").replace(/"/g, "&quot;");
  const indexAttribute = Number.isInteger(blankIndex) ? ` data-blank-index="${blankIndex}"` : "";
  return `<input type="text" class="ielts-inline-answer size-${size || "medium"}" data-question-id="${question.id}" data-slot-id="${slotId}"${indexAttribute} value="${safeValue}" placeholder="Your answer" autocomplete="off" ${disabled ? "disabled" : ""}>`;
}

/* Converts every <span class="ielts-answer-slot"> embedded in a question's rich
   text into a real input tied to that question. A legacy fill question with no
   embedded slot is left untouched — the caller adds a fallback input instead. */
function hydrateInlineSlots(html, question, value, disabled) {
  const wrap = document.createElement("div");
  wrap.innerHTML = String(html || "");
  wrap.querySelectorAll(".ielts-answer-slot").forEach((slot, index) => {
    const slotId = slot.dataset.slotId || `${question.id}-slot-${index + 1}`;
    const size = slot.dataset.slotSize || "medium";
    const slotValue = Array.isArray(value) ? (value[index] || "") : (index === 0 ? value : "");
    slot.outerHTML = slotInputHtml(question, slotId, size, slotValue, disabled, index);
  });
  return wrap.innerHTML;
}

function hasInlineSlot(html) {
  return /class="ielts-answer-slot"/.test(String(html || ""));
}

/* ---------- IELTS content blocks: Notes card / Table / Option bank / Flow chart / Instruction key ----------
   These are layout wrappers a teacher can add to a question group, matching real
   Cambridge test formats. A block's rows/cells/steps are plain text and may embed
   {{q:<questionId>}} tokens — each token renders as a real inline answer input
   tied to that question (the same underlying scored question as everywhere else;
   the block just controls where and how it's displayed). */

function renderTemplateText(text, answersById, disabled) {
  const safe = escapeHtml(String(text || ""));
  return safe.replace(/\{\{q:([a-zA-Z0-9_-]+)\}\}/g, (match, questionId) => {
    const value = answersById ? answersById[questionId] : "";
    return slotInputHtml({ id: questionId }, `${questionId}-inline`, "medium", value, disabled);
  });
}

function renderInstructionKey(block) {
  const rows = block.preset === "ynng"
    ? [["YES", "agrees with the writer's claims"], ["NO", "contradicts the writer's claims"], ["NOT GIVEN", "there is no information about this"]]
    : [["TRUE", "agrees with the information"], ["FALSE", "contradicts the information"], ["NOT GIVEN", "there is no information on this"]];
  return `<section class="ielts-block instruction-key">${rows.map(([label, meaning]) => `<p><strong>${label}</strong><span>${meaning}</span></p>`).join("")}</section>`;
}

function renderContentBlock(block, answersById, disabled) {
  if (!block) return "";
  if (block.type === "notes") {
    return `<section class="ielts-block notes-card">
      ${block.title ? `<h3>${escapeHtml(block.title)}</h3>` : ""}
      ${(block.sections || []).map(section => `
        <div class="notes-section">
          ${section.heading ? `<h4>${escapeHtml(section.heading)}</h4>` : ""}
          <ul>${(section.rows || []).map(row => `<li>${renderTemplateText(row, answersById, disabled)}</li>`).join("")}</ul>
        </div>`).join("")}
    </section>`;
  }
  if (block.type === "table") {
    return `<section class="ielts-block table-block">
      ${block.title ? `<h3>${escapeHtml(block.title)}</h3>` : ""}
      <div class="table-scroll"><table><tbody>
        ${(block.rows || []).map((row, rowIndex) => `<tr>${(row || []).map(cell => {
          const isHeader = rowIndex === 0 && block.headerRow;
          const tag = isHeader ? "th" : "td";
          return `<${tag}>${renderTemplateText(cell, answersById, disabled)}</${tag}>`;
        }).join("")}</tr>`).join("")}
      </tbody></table></div>
    </section>`;
  }
  if (block.type === "optionBank") {
    return `<section class="ielts-block option-bank">
      ${block.title ? `<h3>${escapeHtml(block.title)}</h3>` : ""}
      <div class="option-bank-grid">${(block.options || []).map((option, index) => `<p><strong>${String.fromCharCode(65 + index)}</strong><span>${escapeHtml(option)}</span></p>`).join("")}</div>
    </section>`;
  }
  if (block.type === "flow") {
    const steps = block.steps || [];
    return `<section class="ielts-block flow-block">
      ${block.title ? `<h3>${escapeHtml(block.title)}</h3>` : ""}
      <div class="flow-list">${steps.map((step, index) => `<div class="flow-step">${renderTemplateText(step, answersById, disabled)}</div>${index < steps.length - 1 ? `<div class="flow-arrow" aria-hidden="true">&darr;</div>` : ""}`).join("")}</div>
    </section>`;
  }
  if (block.type === "instructionKey") return renderInstructionKey(block);
  return "";
}

/* Finds every {{q:<id>}} token across a content block's text fields, in reading
   order. Used to keep a block's embedded blanks in sync with real backing
   questions as a teacher edits the block in the builder. */
function contentBlockTokenIds(block) {
  const ids = [];
  const scan = text => {
    String(text || "").replace(/\{\{q:([a-zA-Z0-9_-]+)\}\}/g, (match, id) => { ids.push(id); return match; });
  };
  if (!block) return ids;
  if (block.type === "notes") (block.sections || []).forEach(section => (section.rows || []).forEach(scan));
  if (block.type === "table") (block.rows || []).forEach(row => (row || []).forEach(scan));
  if (block.type === "flow") (block.steps || []).forEach(scan);
  return ids;
}

// A question referenced inside a content block (e.g. a Notes card blank) is
// displayed there, not as a second, separate standalone question card/block.
function contentBlocksConsumedIds(contentBlocks) {
  const ids = new Set();
  (contentBlocks || []).forEach(block => contentBlockTokenIds(block).forEach(id => ids.add(id)));
  return ids;
}

/* ---------- Generate final formatted result report (teacher, after grading) ---------- */
function generateResultReport(r) {
  const isComplete = r.writingBand !== undefined && r.speakingBand !== undefined;
  const overall = isComplete
    ? (Math.round(((r.listeningBand + r.readingBand + r.writingBand + r.speakingBand) / 4) * 2) / 2).toFixed(1)
    : "Pending";

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>IELTS Result — ${r.studentName}</title>
  <style>
    body{font-family:'IBM Plex Sans',Arial,sans-serif;background:#EDF0F2;color:#1B2A41;padding:50px;}
    .sheet{max-width:640px;margin:0 auto;background:#FAFAF9;border:1px solid #D6DCE1;border-radius:14px;padding:44px;}
    h1{font-family:Georgia,serif;font-size:1.6rem;margin:0 0 6px;}
    .meta{color:#4C5C70;margin-bottom:28px;font-size:0.9rem;}
    table{width:100%;border-collapse:collapse;margin-bottom:24px;}
    td,th{padding:12px 10px;border-bottom:1px solid #D6DCE1;text-align:left;}
    .band{font-family:'Courier New',monospace;font-weight:700;color:#2E6B66;font-size:1.1rem;}
    .overall{background:#1B2A41;color:#fff;border-radius:10px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;margin-top:10px;}
    .overall .band{color:#fff;font-size:1.5rem;}
    .feedback{margin-top:24px;padding:16px;background:#EDF0F2;border-radius:8px;font-size:0.92rem;line-height:1.6;}
  </style></head><body>
  <div class="sheet">
    <h1>IELTS Mock Test Result</h1>
    <div class="meta">${r.studentName} &middot; ${r.examName} &middot; Submitted ${new Date(r.submittedAt).toLocaleDateString()}</div>
    <table>
      <tr><th>Section</th><th>Band</th></tr>
      <tr><td>Listening</td><td class="band">${r.listeningBand}</td></tr>
      <tr><td>Reading</td><td class="band">${r.readingBand}</td></tr>
      <tr><td>Writing</td><td class="band">${r.writingBand !== undefined ? r.writingBand : "Not yet graded"}</td></tr>
      <tr><td>Speaking</td><td class="band">${r.speakingBand !== undefined ? r.speakingBand : "Not yet graded"}</td></tr>
    </table>
    <div class="overall"><span>Overall Band</span><span class="band">${overall}</span></div>
    ${r.writingFeedback ? `<div class="feedback"><strong>Teacher feedback:</strong><br>${r.writingFeedback}</div>` : ""}
  </div>
  </body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `IELTS_FinalResult_${r.studentName.replace(/\s+/g, "_")}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
