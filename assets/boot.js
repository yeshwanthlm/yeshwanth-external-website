/* Runs first, in <head>: applies the saved theme/accent before paint (no flash).
   Lives in a file, not inline, so the Content-Security-Policy can forbid inline scripts. */
(function () {
  try {
    var d = document.documentElement, t = localStorage.getItem("ylm-theme"), a = localStorage.getItem("ylm-accent");
    if (t) d.dataset.theme = t;
    if (a) d.dataset.accent = a;
  } catch (e) { /* storage blocked: defaults apply */ }
  document.addEventListener("DOMContentLoaded", function () {
    var p = document.getElementById("p"); // 404 page: show the missing path
    if (p && document.body.classList.contains("page-404")) p.textContent = location.pathname;
  });
})();
