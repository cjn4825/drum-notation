// Practice-cursor "playhead" that follows the notation in time, driven by
// the same audio clock as Metronome's click (so it can never drift apart
// from the sound the way a separate setInterval/rAF-only timer would).
//
// Split into two parts:
//  - pure timeline/position math (buildTimeline, cursorXAtElapsedBeats),
//    which is plain data-in/data-out and easy to test on its own
//  - SequencerPlayer, the requestAnimationFrame-driven glue that reads
//    Metronome's clock each frame and moves one cursor element

// Flattens an exercise's measures into an ordered list of note events, each
// carrying its cumulative onset time in beats. Quarter notes only for now
// (every cell is 1 beat) -- once the notation supports mixed durations,
// only this function needs to change (read cell.duration instead of the
// hardcoded 1) for the cursor to automatically speed up/slow down through
// 8th/16th-note passages, since everything downstream works in beats, not
// a fixed per-cell step.
function buildTimeline(exercise) {
  var events = [];
  var onsetBeats = 0;
  exercise.measures.forEach(function (measure) {
    measure.forEach(function () {
      var beats = 1;
      events.push({ onsetBeats: onsetBeats, beats: beats });
      onsetBeats += beats;
    });
  });
  return { events: events, totalBeats: onsetBeats };
}

// positions: array parallel to events (one {x} per event), in exercise order.
// elapsedBeats can be any non-negative number; it wraps modulo totalBeats so
// playback loops seamlessly. Returns a pixel X, linearly interpolated
// between the current note's position and the next note's position across
// the current note's duration -- this is what makes the motion continuous
// ("follows the bar") instead of jumping discretely from note to note.
function cursorXAtElapsedBeats(events, positions, totalBeats, elapsedBeats) {
  if (!events.length || totalBeats <= 0) return positions.length ? positions[0].x : 0;

  var b = elapsedBeats % totalBeats;
  if (b < 0) b += totalBeats;

  var i = 0;
  while (i < events.length - 1 && events[i + 1].onsetBeats <= b) i++;

  var cur = events[i];
  var curX = positions[i].x;
  var nextX = i + 1 < positions.length ? positions[i + 1].x : curX;
  var frac = cur.beats > 0 ? (b - cur.onsetBeats) / cur.beats : 0;
  frac = Math.max(0, Math.min(1, frac));
  return curX + (nextX - curX) * frac;
}

var SequencerPlayer = (function () {
  var activeExerciseId = null;
  var rafId = null;
  var timeline = null;
  var positions = null;
  var cursorEl = null;

  function frame() {
    var audioCtx = Metronome.getAudioContext();
    var bpm = Metronome.getBpm();
    var elapsedSec = audioCtx.currentTime - Metronome.getStartTime();
    var elapsedBeats = elapsedSec * (bpm / 60);
    var x = cursorXAtElapsedBeats(timeline.events, positions, timeline.totalBeats, elapsedBeats);
    if (cursorEl) cursorEl.style.transform = "translateX(" + x + "px)";
    rafId = window.requestAnimationFrame(frame);
  }

  // exercise: the exercise data object (used to build the note timeline)
  // notePositions: the array returned by renderNotation (per-note pixel X)
  // cursorElement: the DOM node to move
  // bpm: tempo to play at (shared with the global metronome click)
  function start(exerciseId, exercise, notePositions, cursorElement, bpm) {
    stop();

    timeline = buildTimeline(exercise);
    positions = notePositions;
    cursorEl = cursorElement;
    activeExerciseId = exerciseId;
    if (cursorEl) cursorEl.style.display = "block";

    Metronome.stop(); // guarantee a fresh beat-0 reference for this exercise's timeline
    Metronome.start(bpm);
    rafId = window.requestAnimationFrame(frame);
  }

  function stop() {
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = null;
    if (cursorEl) cursorEl.style.display = "none";
    cursorEl = null;
    activeExerciseId = null;
    Metronome.stop();
  }

  function getActiveExerciseId() {
    return activeExerciseId;
  }

  return { start: start, stop: stop, getActiveExerciseId: getActiveExerciseId };
})();

if (typeof module !== "undefined") {
  module.exports = { buildTimeline: buildTimeline, cursorXAtElapsedBeats: cursorXAtElapsedBeats, SequencerPlayer: SequencerPlayer };
}
