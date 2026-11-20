// Runs before first paint so a dark-mode user never sees a white flash. An external file because the CSP forbids
// inline scripts.
(function () {
  var stored = null;
  try {
    stored = localStorage.getItem("loud:theme");
  } catch (_) {}
  var dark =
    stored === "dark" || (stored !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
})();
