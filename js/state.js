// Exercise data model + localStorage persistence.
//
// Each exercise: { id, title, measures: [ [cell, cell, cell, cell], ... ] }
// Each cell is either null (rest) or { inst: "SN", variant: "normal", flam: false }.
// Quarter notes only for now (4 cells per measure) -- combining rhythms/instruments is future work.

var STORAGE_KEY = "drum-notation-state-v1";

function defaultCell(inst) {
  return { inst: inst, variant: "normal", flam: false };
}

function quarterExercise(id, title, inst) {
  return {
    id: id,
    title: title,
    measures: [
      [defaultCell(inst), null, defaultCell(inst), null],
      [null, defaultCell(inst), null, defaultCell(inst)],
      [defaultCell(inst), defaultCell(inst), null, defaultCell(inst)],
      [defaultCell(inst), defaultCell(inst), defaultCell(inst), defaultCell(inst)],
    ],
  };
}

function defaultExercises() {
  return [
    quarterExercise("ex_bd", "1. Bass Drum", "BD"),
    quarterExercise("ex_sn", "2. Snare Drum", "SN"),
    quarterExercise("ex_hh", "3. Hi-Hat", "HH"),
    quarterExercise("ex_rd", "4. Ride Cymbal", "RD"),
    quarterExercise("ex_t1", "5. High Rack Tom", "T1"),
    quarterExercise("ex_t2", "6. Mid Rack Tom", "T2"),
    quarterExercise("ex_ft", "7. Floor Tom", "FT"),
    quarterExercise("ex_cr1", "8. Crash 1", "CR1"),
    quarterExercise("ex_cr2", "9. Crash 2", "CR2"),
  ];
}

var State = (function () {
  var exercises = load() || defaultExercises();

  function load() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(exercises));
    } catch (e) {
      /* ignore (e.g. localStorage unavailable) */
    }
  }

  function getExercises() {
    return exercises;
  }

  function resetExercise(exerciseId) {
    var defaults = defaultExercises();
    var idx = exercises.findIndex(function (e) { return e.id === exerciseId; });
    var def = defaults.find(function (e) { return e.id === exerciseId; });
    if (idx !== -1 && def) {
      exercises[idx] = def;
      save();
    }
  }

  function resetAll() {
    exercises = defaultExercises();
    save();
  }

  // Cycle a cell: empty -> first variant -> next variant -> ... -> empty (removed)
  function cycleCell(exerciseId, measureIdx, beatIdx, instId) {
    var exercise = exercises.find(function (e) { return e.id === exerciseId; });
    if (!exercise) return;
    var cell = exercise.measures[measureIdx][beatIdx];
    var inst = INSTRUMENTS_BY_ID[instId];

    if (!cell || cell.inst !== instId) {
      // empty, or occupied by a different instrument: place this instrument's first variant
      exercise.measures[measureIdx][beatIdx] = { inst: instId, variant: inst.variants[0], flam: false };
    } else {
      var idx = inst.variants.indexOf(cell.variant);
      if (idx === inst.variants.length - 1) {
        exercise.measures[measureIdx][beatIdx] = null; // wrap back to empty
      } else {
        exercise.measures[measureIdx][beatIdx] = { inst: instId, variant: inst.variants[idx + 1], flam: cell.flam };
      }
    }
    save();
  }

  function toggleFlam(exerciseId, measureIdx, beatIdx, instId) {
    var exercise = exercises.find(function (e) { return e.id === exerciseId; });
    if (!exercise) return;
    var cell = exercise.measures[measureIdx][beatIdx];
    if (!cell || cell.inst !== instId) return; // only meaningful on a filled cell for this instrument
    cell.flam = !cell.flam;
    save();
  }

  function clearCell(exerciseId, measureIdx, beatIdx) {
    var exercise = exercises.find(function (e) { return e.id === exerciseId; });
    if (!exercise) return;
    exercise.measures[measureIdx][beatIdx] = null;
    save();
  }

  return {
    getExercises: getExercises,
    cycleCell: cycleCell,
    toggleFlam: toggleFlam,
    clearCell: clearCell,
    resetExercise: resetExercise,
    resetAll: resetAll,
  };
})();

if (typeof module !== "undefined") {
  module.exports = { State: State, defaultExercises: defaultExercises, STORAGE_KEY: STORAGE_KEY };
}
