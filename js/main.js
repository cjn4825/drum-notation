(function () {
  var editMode = false;
  var root = document.getElementById("workbook-root");
  var editBtn = document.getElementById("edit-mode-toggle");
  var exercisePlaybackRefs = []; // [{ id, btn, cursorEl }] rebuilt each renderAll()

  function currentBpm() {
    return parseInt(document.getElementById("bpm-input").value, 10) || 80;
  }

  function renderAll() {
    SequencerPlayer.stop(); // any edit invalidates the currently-playing timeline/positions
    root.innerHTML = "";
    exercisePlaybackRefs = [];

    State.getExercises().forEach(function (exercise) {
      var wrap = document.createElement("div");
      wrap.className = "exercise";
      root.appendChild(wrap); // attach before rendering: VexFlow looks up its target element by ID in the live document

      var h3 = document.createElement("h3");
      h3.textContent = exercise.title;
      wrap.appendChild(h3);

      var controls = document.createElement("div");
      controls.className = "exercise-controls";
      var playBtn = document.createElement("button");
      playBtn.className = "ex-play-toggle";
      playBtn.textContent = "Start";
      controls.appendChild(playBtn);
      wrap.appendChild(controls);

      var notationDiv = document.createElement("div");
      notationDiv.className = "staff-wrap";
      wrap.appendChild(notationDiv);
      var layout = renderNotation(window.VexFlow, document, notationDiv, exercise);

      var cursorEl = document.createElement("div");
      cursorEl.className = "practice-cursor";
      cursorEl.style.display = "none";
      notationDiv.appendChild(cursorEl);

      playBtn.addEventListener("click", function () {
        if (SequencerPlayer.getActiveExerciseId() === exercise.id) {
          SequencerPlayer.stop();
        } else {
          SequencerPlayer.start(exercise.id, exercise, layout.notePositions, cursorEl, currentBpm());
        }
        syncPlaybackButtons();
      });

      exercisePlaybackRefs.push({ id: exercise.id, btn: playBtn, cursorEl: cursorEl });

      if (editMode) {
        var gridDiv = document.createElement("div");
        gridDiv.className = "grid-wrap";
        wrap.appendChild(gridDiv);
        renderGrid(document, gridDiv, exercise, renderAll);
      }
    });

    syncPlaybackButtons();
  }

  // Only one thing can drive the shared metronome clock at a time (either
  // the plain global click, or one exercise's click+cursor together) --
  // this keeps every button's label in sync with whichever is active,
  // without tearing down/rebuilding the notation itself.
  function syncPlaybackButtons() {
    var activeId = SequencerPlayer.getActiveExerciseId();
    exercisePlaybackRefs.forEach(function (ref) {
      var isActive = ref.id === activeId;
      ref.btn.textContent = isActive ? "Stop" : "Start";
      ref.btn.classList.toggle("active", isActive);
    });

    var metronomeToggle = document.getElementById("metronome-toggle");
    var running = Metronome.isRunning();
    metronomeToggle.textContent = running ? "Stop" : "Start";
    metronomeToggle.classList.toggle("active", running);
  }

  editBtn.addEventListener("click", function () {
    editMode = !editMode;
    editBtn.textContent = editMode ? "Exit Edit Mode" : "Edit Mode";
    editBtn.classList.toggle("active", editMode);
    document.body.classList.toggle("edit-mode-on", editMode);
    renderAll();
  });

  renderAll();

  // --- Tabs ---
  var tabButtons = document.querySelectorAll(".tab-btn");
  var tabPanels = document.querySelectorAll(".tab-panel");
  tabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      tabButtons.forEach(function (b) { b.classList.remove("active"); });
      tabPanels.forEach(function (p) { p.classList.remove("active"); });
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  // --- Warmup notepad: backed by real .txt files via server.py's API ---
  var warmupEditor = document.getElementById("warmup-editor");
  var warmupSave = document.getElementById("warmup-save");
  var warmupRevert = document.getElementById("warmup-revert");
  var changeFileBtn = document.getElementById("change-file-btn");
  var routineSelect = document.getElementById("routine-select");
  var currentLabel = document.getElementById("routine-current-label");
  var warmupHint = document.getElementById("warmup-hint");

  var currentRoutineName = null;

  function loadRoutine(name) {
    return Routines.load(name).then(function (text) {
      currentRoutineName = name;
      warmupEditor.value = text;
      warmupEditor.disabled = false;
      currentLabel.textContent = "Editing: " + name;
    });
  }

  function initRoutines() {
    Routines.list()
      .then(function (names) {
        routineSelect.innerHTML = "";
        names.forEach(function (name) {
          var opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          routineSelect.appendChild(opt);
        });
        if (!names.length) {
          warmupEditor.value = "";
          warmupEditor.disabled = true;
          currentLabel.textContent = "No .txt files found in routines/";
          return;
        }
        var toLoad = names.indexOf("daily-practice.txt") !== -1 ? "daily-practice.txt" : names[0];
        routineSelect.value = toLoad;
        return loadRoutine(toLoad);
      })
      .catch(function (err) {
        warmupEditor.value = "";
        warmupEditor.disabled = true;
        currentLabel.textContent = "";
        warmupHint.textContent =
          "Could not reach the practice-file server (" + err.message + "). " +
          "Start it with: python3 server.py -- then reload this page.";
        warmupHint.style.color = "#c0392b";
      });
  }

  changeFileBtn.addEventListener("click", function () {
    routineSelect.style.display = routineSelect.style.display === "none" ? "inline-block" : "none";
  });

  routineSelect.addEventListener("change", function () {
    loadRoutine(routineSelect.value).then(function () {
      routineSelect.style.display = "none";
    });
  });

  warmupSave.addEventListener("click", function () {
    if (!currentRoutineName) return;
    Routines.save(currentRoutineName, warmupEditor.value)
      .then(function () {
        warmupSave.textContent = "Saved";
        setTimeout(function () { warmupSave.textContent = "Save"; }, 1200);
      })
      .catch(function () {
        warmupSave.textContent = "Save failed";
        setTimeout(function () { warmupSave.textContent = "Save"; }, 1500);
      });
  });

  warmupRevert.addEventListener("click", function () {
    if (currentRoutineName) loadRoutine(currentRoutineName);
  });

  initRoutines();

  // --- Metronome ---
  var bpmInput = document.getElementById("bpm-input");
  var metronomeToggle = document.getElementById("metronome-toggle");
  var accentCheckbox = document.getElementById("accent-checkbox");
  var beatIndicator = document.getElementById("beat-indicator");

  Metronome.setOnBeat(function (beatIndexInMeasure) {
    beatIndicator.classList.remove("pulse", "pulse-accent");
    void beatIndicator.offsetWidth; // force reflow so the animation restarts even on consecutive beats
    var accentThisBeat = accentCheckbox.checked && beatIndexInMeasure === 0;
    beatIndicator.classList.add(accentThisBeat ? "pulse-accent" : "pulse");
  });

  metronomeToggle.addEventListener("click", function () {
    if (Metronome.isRunning()) {
      SequencerPlayer.stop(); // the global button is the plain click; stop covers either mode
    } else {
      SequencerPlayer.stop(); // starting the plain click always takes over from any exercise playback
      Metronome.start(currentBpm());
    }
    syncPlaybackButtons();
  });

  bpmInput.addEventListener("change", function () {
    Metronome.setBpm(currentBpm());
  });

  accentCheckbox.addEventListener("change", function () {
    Metronome.setAccentEnabled(accentCheckbox.checked);
  });
})();
