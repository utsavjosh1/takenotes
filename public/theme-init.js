// Theme pre-paint: runs synchronously before first render so the correct
// theme applies without a flash. External file (not inline) so the
// `script-src 'self'` Content Security Policy holds with no hashes.
try {
  var s = JSON.parse(localStorage.getItem("takenotes.settings") || "{}");
  var t = s.theme || "system";
  var dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
} catch {
  document.documentElement.dataset.theme = "dark";
}
