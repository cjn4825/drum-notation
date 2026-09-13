// Renders the real VexFlow staff notation for one exercise, reflecting its
// current (possibly user-edited) state.
//
// Returns layout info the practice-cursor (sequencer.js) needs to draw a
// playhead line in the same pixel coordinate space as the rendered SVG:
// each note's absolute X position, in exercise order, plus the SVG's
// overall width/height.

// Gruvbox (dark, medium contrast) -- https://github.com/morhetz/gruvbox
var GB_FG1 = "#ebdbb2"; // notes/rests
var GB_FG4 = "#a89984"; // stave lines, barlines, clef, time signature

function renderNotation(VF, doc, container, exercise) {
  container.innerHTML = "";

  var MEASURE_WIDTH = 170;
  var FIRST_MEASURE_EXTRA = 70; // room for clef + time signature
  var totalWidth = exercise.measures.length * MEASURE_WIDTH + FIRST_MEASURE_EXTRA + 20;
  var totalHeight = 130;

  var elId = exercise.id + "_svg";
  var target = doc.createElement("div");
  target.id = elId;
  container.appendChild(target);

  var f = new VF.Factory({ renderer: { elementId: elId, width: totalWidth, height: totalHeight } });
  var ctx = f.getContext();

  function buildStaveNote(cell) {
    var note;
    if (!cell) {
      note = f.StaveNote({ keys: ["b/4"], duration: "4r" });
    } else {
      var inst = INSTRUMENTS_BY_ID[cell.inst];
      var noteheadCode = cell.variant === "ghost" ? "g" : inst.notehead;
      var keyStr = inst.key + "/" + noteheadCode;
      note = f.StaveNote({ keys: [keyStr], duration: "4" });

      if (cell.variant === "accent") {
        note.addModifier(new VF.Articulation("a>").setPosition(VF.Modifier.Position.ABOVE), 0);
      } else if (cell.variant === "open") {
        note.addModifier(new VF.Articulation(PICT_OPEN).setPosition(VF.Modifier.Position.ABOVE), 0);
      }

      if (cell.flam) {
        var grace = f.GraceNote({ keys: [keyStr], duration: "8", slash: true });
        note.addModifier(f.GraceNoteGroup({ notes: [grace] }), 0);
      }
    }

    note.setStyle({ fillStyle: GB_FG1, strokeStyle: GB_FG1 });
    return note;
  }

  var notePositions = [];
  var x = 10;
  exercise.measures.forEach(function (measure, mi) {
    var staveWidth = MEASURE_WIDTH + (mi === 0 ? FIRST_MEASURE_EXTRA : 0);
    var stave = f.Stave({ x: x, y: 20, width: staveWidth });
    if (mi === 0) {
      stave.addClef("percussion");
      stave.addTimeSignature("4/4");
    }
    stave.setStyle({ fillStyle: GB_FG4, strokeStyle: GB_FG4 });
    stave.setContext(ctx).drawWithStyle();

    var staveNotes = measure.map(buildStaveNote);
    var voice = f.Voice().setStrict(false).addTickables(staveNotes);
    f.Formatter().joinVoices([voice]).formatToStave([voice], stave);
    voice.setContext(ctx).drawWithStyle();

    staveNotes.forEach(function (note) {
      notePositions.push({ x: note.getAbsoluteX() });
    });

    x += staveWidth;
  });

  // Safety net: anything that doesn't respond to setStyle (e.g. articulation
  // glyphs) still inherits fill/stroke from the root <svg>, which VexFlow
  // otherwise defaults to black.
  var svgEl = target.querySelector("svg");
  if (svgEl) {
    svgEl.setAttribute("fill", GB_FG1);
    svgEl.setAttribute("stroke", GB_FG1);
  }

  return { width: totalWidth, height: totalHeight, notePositions: notePositions };
}

if (typeof module !== "undefined") module.exports = renderNotation;
