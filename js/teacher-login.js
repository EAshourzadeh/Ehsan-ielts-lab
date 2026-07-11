document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("btnAdminSubmit").addEventListener("click", submit);
  document.getElementById("adminPassInput").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

  function submit() {
    const val = document.getElementById("adminPassInput").value;
    if (val === ADMIN_PASSWORD) {
      sessionStorage.setItem(SS_ADMIN_AUTH, "1");
      window.location.href = "teacher-dashboard.html";
    } else {
      document.getElementById("adminLoginError").textContent = "Incorrect password.";
    }
  }
});
