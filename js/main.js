(function () {
  var editMode = false;
  var root = document.getElementById("workbook-root");
  var editBtn = document.getElementById("edit-mode-toggle");

  function renderAll() {
    root.innerHTML = "";
    State.getExercises().forEach(function (exercise) {
      var wrap = document.createElement("div");
      wrap.className = "exercise";
      root.appendChild(wrap); // attach before rendering: VexFlow looks up its target element by ID in the live document

      var h3 = document.createElement("h3");
      h3.textContent = exercise.title;
      wrap.appendChild(h3);

      var notationDiv = document.createElement("div");
      notationDiv.className = "staff-wrap";
      wrap.appendChild(notationDiv);
      renderNotation(window.VexFlow, document, notationDiv, exercise);

      if (editMode) {
        var gridDiv = document.createElement("div");
        gridDiv.className = "grid-wrap";
        wrap.appendChild(gridDiv);
        renderGrid(document, gridDiv, exercise, renderAll);
      }
    });
  }

  editBtn.addEventListener("click", function () {
    editMode = !editMode;
    editBtn.textContent = editMode ? "Exit Edit Mode" : "Edit Mode";
    editBtn.classList.toggle("active", editMode);
    document.body.classList.toggle("edit-mode-on", editMode);
    renderAll();
  });

  renderAll();
})();
