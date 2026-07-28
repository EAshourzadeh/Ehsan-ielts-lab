document.addEventListener("DOMContentLoaded", init);

async function init() {
  clearSession();
  const usernameInput = document.getElementById("studentUsernameInput");
  const passwordInput = document.getElementById("studentPasswordInput");
  const select = document.getElementById("examSelect");
  const button = document.getElementById("btnStudentSubmit");
  const errorBox = document.getElementById("studentLoginError");

  select.innerHTML = `<option>Loading exams…</option>`;
  let exams = {};
  try {
    exams = await getExams();
    if (!Object.keys(exams).length) throw new Error("No exams are currently available.");
    select.innerHTML = Object.values(exams)
      .map(exam => `<option value="${escapeHtml(exam.id)}">${escapeHtml(exam.name)}</option>`)
      .join("");
  } catch (error) {
    errorBox.textContent = "Could not load the available exams. Please try again.";
    button.disabled = true;
  }

  async function submit() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!validStudentUsername(username) || !validStudentPassword(password)) {
      errorBox.textContent = "Enter your seven-digit username and six-character password.";
      return;
    }
    button.disabled = true;
    button.textContent = "Signing in…";
    errorBox.textContent = "";
    try {
      const credential = await auth.signInWithEmailAndPassword(studentEmail(username), studentFirebasePassword(password));
      const profileSnapshot = await db.collection("students").doc(credential.user.uid).get();
      const profile = profileSnapshot.exists ? profileSnapshot.data() : null;
      if (!profile || profile.username !== username || profile.active === false) {
        await auth.signOut();
        throw new Error(profile && profile.active === false ? "This account is disabled. Ask your teacher for help." : "Student profile not found.");
      }
      const exam = exams[select.value];
      saveSession({
        studentUid: credential.user.uid,
        studentUsername: username,
        studentName: profile.realName,
        examId: exam.id,
        examName: exam.name,
        listeningAnswers: {},
        readingAnswers: {},
        writingTask1: "",
        writingTask2: "",
        listeningScore: null,
        readingScore: null,
        submittedAt: null
      });
      window.location.href = "student-intro.html";
    } catch (error) {
      button.disabled = false;
      button.textContent = "Sign in and continue";
      errorBox.textContent = error.code === "auth/invalid-credential"
        ? "Incorrect username or password."
        : (error.message || "Sign-in failed.");
    }
  }

  button.addEventListener("click", submit);
  passwordInput.addEventListener("keydown", event => { if (event.key === "Enter") submit(); });
}
