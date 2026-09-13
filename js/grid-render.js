// Renders the editable click-grid for one exercise (only shown in edit mode).
// Rows = instruments (top-to-bottom pitch order), columns = beats.
// Click: cycle variant (empty -> normal -> ... -> empty).
// Shift+click: toggle flam on a filled cell.
// Right-click: clear the cell immediately.

function renderGrid(doc, container, exercise, onChange) {
  container.innerHTML = "";

  var table = doc.createElement("table");
  table.className = "edit-grid";

  var beatsPerMeasure = exercise.measures[0].length;

  INSTRUMENTS.forEach(function (inst) {
    var row = doc.createElement("tr");

    var labelCell = doc.createElement("th");
    labelCell.textContent = inst.label;
    row.appendChild(labelCell);

    exercise.measures.forEach(function (measure, mi) {
      measure.forEach(function (cell, bi) {
        var td = doc.createElement("td");
        td.className = "grid-cell";
        if (bi === 0 && mi > 0) td.classList.add("measure-start");

        var filled = cell && cell.inst === inst.id;
        if (filled) {
          td.classList.add("filled");
          td.textContent = VARIANT_LABEL[cell.variant] || "?";
          if (cell.flam) td.classList.add("flam");
        }

        td.addEventListener("click", function (evt) {
          if (evt.shiftKey) {
            State.toggleFlam(exercise.id, mi, bi, inst.id);
          } else {
            State.cycleCell(exercise.id, mi, bi, inst.id);
          }
          onChange();
        });

        td.addEventListener("contextmenu", function (evt) {
          evt.preventDefault();
          State.clearCell(exercise.id, mi, bi);
          onChange();
        });

        row.appendChild(td);
      });
    });

    table.appendChild(row);
  });

  container.appendChild(table);

  var hint = doc.createElement("p");
  hint.className = "grid-hint";
  hint.textContent =
    "Click a cell to cycle through: normal → " +
    "accent/ghost/open (depending on instrument) → empty. " +
    "Shift+click a filled cell to toggle a flam. Right-click to clear.";
  container.appendChild(hint);

  var resetBtn = doc.createElement("button");
  resetBtn.className = "reset-btn";
  resetBtn.textContent = "Reset this exercise to default";
  resetBtn.addEventListener("click", function () {
    State.resetExercise(exercise.id);
    onChange();
  });
  container.appendChild(resetBtn);
}

if (typeof module !== "undefined") module.exports = renderGrid;
