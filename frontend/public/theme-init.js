// Apply the color scheme before first paint to avoid a flash. Honors a saved
// preference; defaults to dark. Kept in its own file (not inline in index.html)
// so the Content-Security-Policy can forbid inline scripts outright.
(function () {
  var scheme = 'dark';
  try {
    var stored = localStorage.getItem('mantine-color-scheme-value');
    if (stored === 'light' || stored === 'dark') scheme = stored;
  } catch (e) {
    /* storage blocked — keep the default */
  }
  document.documentElement.setAttribute('data-mantine-color-scheme', scheme);
})();
