// Client for server.py's tiny practice-routine file API.

var Routines = (function () {
  function list() {
    return fetch("/api/routines").then(function (r) {
      if (!r.ok) throw new Error("Could not list routines (status " + r.status + ")");
      return r.json();
    });
  }

  function load(name) {
    return fetch("/api/routines/" + encodeURIComponent(name)).then(function (r) {
      if (!r.ok) throw new Error("Could not load " + name + " (status " + r.status + ")");
      return r.text();
    });
  }

  function save(name, text) {
    return fetch("/api/routines/" + encodeURIComponent(name), {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: text,
    }).then(function (r) {
      if (!r.ok) throw new Error("Could not save " + name + " (status " + r.status + ")");
      return r.json();
    });
  }

  return { list: list, load: load, save: save };
})();

if (typeof module !== "undefined") module.exports = Routines;
