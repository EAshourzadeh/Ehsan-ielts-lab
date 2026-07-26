document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("btnAdminSubmit").addEventListener("click", submit);
  document.getElementById("adminPassInput").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

  function submit() {
    const email = document.getElementById("adminEmailInput").value.trim();
    const pass = document.getElementById("adminPassInput").value;
    const errBox = document.getElementById("adminLoginError");
    const btn = document.getElementById("btnAdminSubmit");
    if (!email || !pass) { errBox.textContent = "Enter your email and password."; return; }

    errBox.textContent = "";
    btn.disabled = true; btn.textContent = "Signing in...";

    auth.signInWithEmailAndPassword(email, pass)
      .then(async credential => {
        const teacherRecord = await db.collection("teachers").doc(credential.user.uid).get();
        if (!teacherRecord.exists || teacherRecord.data().active === false) {
          await auth.signOut();
          throw { code: "auth/not-a-teacher" };
        }
        window.location.href = "teacher-dashboard.html";
      })
      .catch((err) => {
        btn.disabled = false; btn.textContent = "Sign In";
        errBox.textContent = friendlyAuthError(err);
      });
  }

  function friendlyAuthError(err) {
    switch (err.code) {
      case "auth/invalid-email": return "That email address doesn't look right.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential": return "Incorrect email or password.";
      case "auth/too-many-requests": return "Too many attempts — please wait a moment and try again.";
      case "auth/not-a-teacher": return "This account is not registered as an active teacher.";
      default: return "Sign-in failed: " + err.message;
    }
  }
});
