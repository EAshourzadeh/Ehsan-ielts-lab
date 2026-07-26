document.addEventListener("DOMContentLoaded", () => requireAdminAuth(initStudentAccounts));

function initStudentAccounts() {
  document.getElementById("btnLogout").addEventListener("click", logoutAdmin);
  const message = document.getElementById("accountMessage");
  const list = document.getElementById("studentAccountList");

  function showMessage(text, error = false) {
    message.textContent = text;
    message.style.color = error ? "var(--danger)" : "var(--color-success-700)";
  }

  function secondaryAuth() {
    const name = "student-account-manager";
    const app = firebase.apps.find(item => item.name === name) || firebase.initializeApp(firebaseConfig, name);
    return app.auth();
  }

  async function renderStudents() {
    const snapshot = await db.collection("students").orderBy("realName").get();
    if (snapshot.empty) {
      list.innerHTML = `<p class="muted">No student accounts yet.</p>`;
      return;
    }
    list.innerHTML = "";
    snapshot.forEach(documentSnapshot => {
      const student = documentSnapshot.data();
      const card = document.createElement("div");
      card.className = "exam-card";
      card.innerHTML = `
        <div><div class="exam-card-name"></div><div class="exam-card-meta">Username: <span></span> · <strong>${student.active === false ? "Disabled" : "Active"}</strong></div></div>
        <div class="exam-card-actions">
          <button class="btn btn-ghost btn-sm" data-action="rename">Edit name</button>
          <button class="btn btn-ghost btn-sm" data-action="password">Change password</button>
          <button class="btn btn-ghost btn-sm" data-action="toggle">${student.active === false ? "Enable" : "Disable"}</button>
        </div>`;
      card.querySelector(".exam-card-name").textContent = student.realName || "Unnamed student";
      card.querySelector(".exam-card-meta span").textContent = student.username || "";
      card.querySelector('[data-action="rename"]').addEventListener("click", async () => {
        const realName = prompt("Student real name:", student.realName || "");
        if (!realName || !realName.trim()) return;
        await documentSnapshot.ref.update({ realName: realName.trim(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        await renderStudents();
      });
      card.querySelector('[data-action="toggle"]').addEventListener("click", async () => {
        await documentSnapshot.ref.update({ active: student.active === false, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        await renderStudents();
      });
      card.querySelector('[data-action="password"]').addEventListener("click", async () => {
        const currentCode = prompt("Enter the student’s current 5-character password:");
        if (currentCode === null) return;
        const newCode = prompt("Enter the new 5-character password (letters and numbers):");
        if (newCode === null) return;
        if (!validStudentPassword(currentCode) || !validStudentPassword(newCode)) {
          showMessage("Both passwords must be five characters and contain a letter and a number.", true);
          return;
        }
        const managedAuth = secondaryAuth();
        try {
          const credential = await managedAuth.signInWithEmailAndPassword(studentEmail(student.username), studentFirebasePassword(currentCode));
          await credential.user.updatePassword(studentFirebasePassword(newCode));
          await managedAuth.signOut();
          await documentSnapshot.ref.update({ passwordUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
          showMessage(`Password for ${student.username} changed.`);
        } catch (error) {
          await managedAuth.signOut().catch(() => {});
          showMessage(error.code === "auth/invalid-credential" ? "The current password is incorrect." : `Could not change password: ${error.message}`, true);
        }
      });
      list.appendChild(card);
    });
  }

  document.getElementById("btnCreateStudent").addEventListener("click", async () => {
    const realName = document.getElementById("studentRealName").value.trim();
    const username = document.getElementById("studentUsername").value.trim();
    const password = document.getElementById("studentPassword").value;
    if (!realName) return showMessage("Enter the student’s real name.", true);
    if (!validStudentUsername(username)) return showMessage("Username must be exactly five digits.", true);
    if (!validStudentPassword(password)) return showMessage("Password must be five characters and contain a letter and a number.", true);

    const button = document.getElementById("btnCreateStudent");
    button.disabled = true;
    showMessage("Creating account…");
    let managedAuth;
    try {
      managedAuth = secondaryAuth();
      const credential = await managedAuth.createUserWithEmailAndPassword(studentEmail(username), studentFirebasePassword(password));
      await db.collection("students").doc(credential.user.uid).set({
        uid: credential.user.uid,
        username,
        realName,
        active: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await managedAuth.signOut();
      document.getElementById("studentRealName").value = "";
      document.getElementById("studentUsername").value = "";
      document.getElementById("studentPassword").value = "";
      showMessage(`Account ${username} created.`);
      await renderStudents();
    } catch (error) {
      if (managedAuth) await managedAuth.signOut().catch(() => {});
      showMessage(error.code === "auth/email-already-in-use" ? "That username already exists." : `Could not create account: ${error.message}`, true);
    } finally {
      button.disabled = false;
    }
  });

  renderStudents().catch(error => showMessage(`Could not load accounts: ${error.message}`, true));
}
