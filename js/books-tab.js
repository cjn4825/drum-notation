// Wires up the "Books" tab: browses folders and lists PDFs from server.py's
// read-only /api/books API, and displays the selected one in an <iframe>
// pointed straight at its file URL -- the browser's own native PDF viewer
// renders it, so scroll/zoom/search/print all just work like opening the
// PDF directly, instead of anything hand-built here.
//
// The book dropdown doubles as a tiny folder browser: picking a folder
// re-lists that folder's contents instead of loading anything, so nothing
// ever loads until you explicitly pick a file (same pattern the old Sheet
// Music tab used for browsing sheetmusic/).

(function () {
  var bookSelect = document.getElementById("book-select");
  var bookWarnings = document.getElementById("book-warnings");
  var bookViewer = document.getElementById("book-viewer");

  var currentDir = ""; // "" = books/ root; otherwise a "/"-separated relative path

  function parentOf(dir) {
    var idx = dir.lastIndexOf("/");
    return idx === -1 ? "" : dir.substring(0, idx);
  }

  function joinPath(dir, name) {
    return dir ? dir + "/" + name : name;
  }

  function showWarning(message) {
    bookWarnings.innerHTML = "";
    var p = document.createElement("p");
    p.className = "grid-hint";
    p.style.color = "#c0392b";
    p.textContent = message;
    bookWarnings.appendChild(p);
  }

  function clearWarnings() {
    bookWarnings.innerHTML = "";
  }

  function loadBook(relPath) {
    clearWarnings();
    bookViewer.src = Books.url(relPath);
  }

  function refreshDropdown() {
    Books.list(currentDir)
      .then(function (result) {
        bookSelect.innerHTML = "";

        var placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = currentDir ? "-- pick a book in " + currentDir + " --" : "-- pick a book --";
        bookSelect.appendChild(placeholder);

        if (currentDir) {
          var up = document.createElement("option");
          up.value = "up:";
          up.textContent = "⬆ .. (up)";
          bookSelect.appendChild(up);
        }

        result.folders.forEach(function (name) {
          var opt = document.createElement("option");
          opt.value = "dir:" + joinPath(currentDir, name);
          opt.textContent = "📁 " + name;
          bookSelect.appendChild(opt);
        });

        result.files.forEach(function (name) {
          var opt = document.createElement("option");
          opt.value = "file:" + joinPath(currentDir, name);
          opt.textContent = name;
          bookSelect.appendChild(opt);
        });

        bookSelect.value = "";
        bookSelect.disabled = false;

        if (!result.folders.length && !result.files.length) {
          showWarning(
            currentDir
              ? "No books or folders in " + currentDir + "."
              : "Drop a PDF (or a folder of them) into the books/ folder on disk, then reload this page."
          );
        }
      })
      .catch(function (err) {
        showWarning(
          "Could not reach the practice-file server (" + err.message + "). " +
          "Start it with: python3 server.py -- then reload this page."
        );
      });
  }

  bookSelect.addEventListener("change", function () {
    var value = bookSelect.value;
    if (!value) return;

    if (value === "up:") {
      currentDir = parentOf(currentDir);
      refreshDropdown();
      return;
    }
    if (value.indexOf("dir:") === 0) {
      currentDir = value.slice(4);
      refreshDropdown();
      return;
    }
    if (value.indexOf("file:") === 0) {
      loadBook(value.slice(5));
    }
  });

  refreshDropdown();
})();
