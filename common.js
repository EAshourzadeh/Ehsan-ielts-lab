/* =========================================================
   EHSAN IELTS Mock Test — js/common.js
   Loaded on every page. Holds shared constants + storage helpers.
   ========================================================= */

const ADMIN_PASSWORD = "Ehsan2026";
const LS_EXAMS = "ielts_exams";
const LS_RESULTS = "ielts_results";
const LS_SETTINGS = "ielts_settings";
const SS_SESSION = "ielts_current_session";
const SS_ADMIN_AUTH = "ielts_admin_authed";

const SECTION_TIMES = { listening: 30 * 60, reading: 60 * 60, writingTask1: 20 * 60, writingTask2: 40 * 60 };

const BAND_TABLE = [
  [39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5],
  [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [0, 2]
];
function rawToBand(correct) {
  for (const [min, band] of BAND_TABLE) if (correct >= min) return band;
  return 2;
}

/* ---------- Sample exam ---------- */
function sampleExam() {
  return {
    id: "sample-exam-1",
    name: "Sample Academic Mock Test 1",
    listening: [
      {
        title: "Part 1 — Library Registration",
        audio: "assets/audio/sample-part1.mp3",
        questions: [
          { id: "l1", type: "fill", text: "The student's surname is spelled ______.", answer: "Harrington" },
          { id: "l2", type: "fill", text: "The library card fee is $______.", answer: "15" },
          { id: "l3", type: "mc", text: "The library closes at:", options: ["8pm", "9pm", "10pm"], answer: "9pm" }
        ]
      },
      {
        title: "Part 2 — Campus Tour",
        audio: "assets/audio/sample-part2.mp3",
        questions: [
          { id: "l4", type: "multi", text: "Which TWO facilities are mentioned in the tour? (choose two)", options: ["Science building", "Swimming pool", "Cafeteria", "Bookstore"], answer: ["Science building", "Cafeteria"] },
          { id: "l5", type: "fill", text: "Tours run every ______ minutes.", answer: "45" }
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

/* ---------- Storage helpers ---------- */
function getExams() {
  let e = JSON.parse(localStorage.getItem(LS_EXAMS) || "null");
  if (!e) {
    e = { "sample-exam-1": sampleExam() };
    localStorage.setItem(LS_EXAMS, JSON.stringify(e));
  }
  return e;
}
function saveExams(exams) { localStorage.setItem(LS_EXAMS, JSON.stringify(exams)); }
function getResults() { return JSON.parse(localStorage.getItem(LS_RESULTS) || "{}"); }
function saveResults(r) { localStorage.setItem(LS_RESULTS, JSON.stringify(r)); }
function getSettings() { return JSON.parse(localStorage.getItem(LS_SETTINGS) || "{}"); }
function saveSettings(s) { localStorage.setItem(LS_SETTINGS, JSON.stringify(s)); }

/* ---------- Cross-page student session (sessionStorage; survives page navigation, clears on tab close) ---------- */
function getSession() { return JSON.parse(sessionStorage.getItem(SS_SESSION) || "null"); }
function saveSession(s) { sessionStorage.setItem(SS_SESSION, JSON.stringify(s)); }
function clearSession() { sessionStorage.removeItem(SS_SESSION); }

/* ---------- Admin auth guard: call at top of every teacher-*.html page except teacher-login.html ---------- */
function requireAdminAuth() {
  if (sessionStorage.getItem(SS_ADMIN_AUTH) !== "1") {
    window.location.href = "teacher-login.html";
  }
}

/* ---------- Scoring (used by student-writing.html / student-exam.html at finish time) ---------- */
function scoreSection(parts, answers) {
  let total = 0, correct = 0;
  parts.forEach(part => part.questions.forEach(q => {
    total++;
    if (q.type === "multi") {
      const given = Array.isArray(answers[q.id]) ? [...answers[q.id]].sort() : [];
      const key = [...(q.answer || [])].sort();
      if (given.length === key.length && given.every((v, i) => v === key[i])) correct++;
    } else {
      const given = (answers[q.id] || "").toString().trim().toLowerCase();
      const key = (q.answer || "").toString().trim().toLowerCase();
      if (given && given === key) correct++;
    }
  }));
  return { correct, total };
}

/* ---------- Downloadable JSON results file ---------- */
function downloadResultsFile(session) {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = session.studentName.replace(/\s+/g, "_");
  a.href = url;
  a.download = `IELTS_Result_${safeName}_${session.examId}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- Generate final formatted result report (teacher, after grading) ---------- */
function generateResultReport(r) {
  const overall = r.writingBand !== undefined
    ? (Math.round(((r.listeningBand + r.readingBand + r.writingBand) / 3) * 2) / 2).toFixed(1)
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
    <div class="meta">${r.studentName} &middot; ${r.examName} &middot; submitted ${new Date(r.submittedAt).toLocaleString()}</div>
    <table>
      <tr><th>Section</th><th>Band</th></tr>
      <tr><td>Listening</td><td class="band">${r.listeningBand}</td></tr>
      <tr><td>Reading</td><td class="band">${r.readingBand}</td></tr>
      <tr><td>Writing</td><td class="band">${r.writingBand !== undefined ? r.writingBand : "Not yet graded"}</td></tr>
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
