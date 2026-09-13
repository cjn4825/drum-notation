// Renders the real VexFlow staff notation for one exercise, reflecting its
// current (possibly user-edited) state.

function renderNotation(VF, doc, container, exercise) {
  container.innerHTML = "";

  var MEASURE_WIDTH = 170;
  var FIRST_MEASURE_EXTRA = 70; // room for clef + time signature
  var totalWidth = exercise.measures.length * MEASURE_WIDTH + FIRST_MEASURE_EXTRA + 20;

  var elId = exercise.id + "_svg";
  var target = doc.createElement("div");
  target.id = elId;
  container.appendChild(target);

  var f = new VF.Factory({ renderer: { elementId: elId, width: totalWidth, height: 130 } });
  var ctx = f.getContext();

  function buildStaveNote(cell) {
    if (!cell) return f.StaveNote({ keys: ["b/4"], duration: "4r" });

    var inst = INSTRUMENTS_BY_ID[cell.inst];
    var noteheadCode = cell.variant === "ghost" ? "g" : inst.notehead;
    var keyStr = inst.key + "/" + noteheadCode;
    var note = f.StaveNote({ keys: [keyStr], duration: "4" });

    if (cell.variant === "accent") {
      note.addModifier(new VF.Articulation("a>").setPosition(VF.Modifier.Position.ABOVE), 0);
    } else if (cell.variant === "open") {
      note.addModifier(new VF.Articulation(PICT_OPEN).setPosition(VF.Modifier.Position.ABOVE), 0);
    }

    if (cell.flam) {
      var grace = f.GraceNote({ keys: [keyStr], duration: "8", slash: true });
      note.addModifier(f.GraceNoteGroup({ notes: [grace] }), 0);
    }

    return note;
  }

  var x = 10;
  exercise.measures.forEach(function (measure, mi) {
    var staveWidth = MEASURE_WIDTH + (mi === 0 ? FIRST_MEASURE_EXTRA : 0);
    var stave = f.Stave({ x: x, y: 20, width: staveWidth });
    if (mi === 0) {
      stave.addClef("percussion");
      stave.addTimeSignature("4/4");
    }
    stave.setContext(ctx).drawWithStyle();

    var staveNotes = measure.map(buildStaveNote);
    var voice = f.Voice().setStrict(false).addTickables(staveNotes);
    f.Formatter().joinVoices([voice]).formatToStave([voice], stave);
    voice.setContext(ctx).drawWithStyle();

    x += staveWidth;
  });
}

if (typeof module !== "undefined") module.exports = renderNotation;
