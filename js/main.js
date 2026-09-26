(function () {
  function currentBpm() {
    return parseInt(document.getElementById("bpm-input").value, 10) || 80;
  }

  // --- Tabs ---
  // The metronome panel is fixed/global (see #metronome-panel in CSS) and
  // stays visible across every tab, so switching tabs only needs to swap
  // which panel is shown -- it doesn't touch the metronome at all.
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
      Metronome.stop();
    } else {
      Metronome.start(currentBpm());
    }
    metronomeToggle.textContent = Metronome.isRunning() ? "Stop" : "Start";
    metronomeToggle.classList.toggle("active", Metronome.isRunning());
  });

  bpmInput.addEventListener("change", function () {
    Metronome.setBpm(currentBpm());
  });

  accentCheckbox.addEventListener("change", function () {
    Metronome.setAccentEnabled(accentCheckbox.checked);
  });
})();
