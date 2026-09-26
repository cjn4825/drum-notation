// Client for server.py's read-only books (PDF) file API. books/ can contain
// nested folders, so list() is per-folder (pass a relative path, or omit
// for the top level) rather than one flat listing.

var Books = (function () {
  function list(dir) {
    var query = dir ? ("?dir=" + encodeURIComponent(dir)) : "";
    return fetch("/api/books" + query).then(function (r) {
      if (!r.ok) throw new Error("Could not list books (status " + r.status + ")");
      return r.json(); // { folders: [...], files: [...] }
    });
  }

  // relPath: "/"-separated path relative to books/, e.g. "Method Books/stick_control.pdf"
  function url(relPath) {
    return "/api/books/" + relPath.split("/").map(encodeURIComponent).join("/");
  }

  return {
    list: list,
    url: url,
  };
})();

if (typeof module !== "undefined") module.exports = Books;
