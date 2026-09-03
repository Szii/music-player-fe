(function () {
  var lang = 'en';
  try { lang = localStorage.getItem('app.language') || 'en'; } catch (e) { /* private mode */ }

  window.__i18n = {
    lang: lang,
    // Never rejects: on any failure the loader falls back to its own request.
    data: fetch('i18n/' + lang + '.json')
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; }),
  };
})();
