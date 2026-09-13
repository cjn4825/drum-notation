// Metronome using the standard Web Audio "lookahead scheduler" pattern
// (schedules audio events slightly ahead of time against the audio clock,
// rather than relying on setInterval/setTimeout directly for playback --
// setInterval alone drifts and jitters, which matters for a practice tool).
//
// Default click is a single, unaccented tone. Accenting beat 1 is available
// as an opt-in (see setAccentEnabled) rather than the default: for reading/
// timing practice, leaning on an audible downbeat accent becomes a crutch --
// it's a real, deliberate *advanced* technique (used to practice with the
// click intentionally displaced off the downbeat), not a beginner default.

var Metronome = (function () {
  var audioCtx = null;
  var isRunning = false;
  var bpm = 80;
  var beatsPerMeasure = 4;
  var accentEnabled = false;
  var nextNoteTime = 0.0;
  var playStartTime = 0.0; // audioCtx time at which beatCount 0 was scheduled
  var beatCount = 0;
  var lookaheadMs = 25.0;
  var scheduleAheadSec = 0.1;
  var timerId = null;
  var onBeat = null; // optional callback(beatIndexInMeasure) for a visual pulse

  function scheduleClick(beatNumber, time) {
    var isAccent = accentEnabled && beatNumber % beatsPerMeasure === 0;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();

    osc.frequency.value = isAccent ? 1600 : 1000;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(isAccent ? 0.6 : 0.4, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + 0.06);

    if (onBeat) {
      var delayMs = Math.max(0, (time - audioCtx.currentTime) * 1000);
      setTimeout(function () {
        onBeat(beatNumber % beatsPerMeasure);
      }, delayMs);
    }
  }

  function advanceNote() {
    var secondsPerBeat = 60.0 / bpm;
    nextNoteTime += secondsPerBeat;
    beatCount++;
  }

  function scheduler() {
    while (nextNoteTime < audioCtx.currentTime + scheduleAheadSec) {
      scheduleClick(beatCount, nextNoteTime);
      advanceNote();
    }
    timerId = setTimeout(scheduler, lookaheadMs);
  }

  function ensureContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function start(startBpm) {
    if (isRunning) return;
    if (startBpm) bpm = startBpm;
    ensureContext();

    isRunning = true;
    beatCount = 0;
    nextNoteTime = audioCtx.currentTime + 0.05;
    playStartTime = nextNoteTime;
    scheduler();
  }

  function stop() {
    isRunning = false;
    if (timerId) clearTimeout(timerId);
    timerId = null;
  }

  function setBpm(newBpm) {
    bpm = newBpm;
  }

  function getBpm() {
    return bpm;
  }

  function setAccentEnabled(enabled) {
    accentEnabled = !!enabled;
  }

  function setOnBeat(cb) {
    onBeat = cb;
  }

  function getIsRunning() {
    return isRunning;
  }

  // Needed by the practice-cursor sequencer so its visual timing is derived
  // from the exact same clock driving the audible click (no separate timer
  // drifting relative to it).
  function getAudioContext() {
    return ensureContext();
  }

  function getStartTime() {
    return playStartTime;
  }

  return {
    start: start,
    stop: stop,
    setBpm: setBpm,
    getBpm: getBpm,
    setAccentEnabled: setAccentEnabled,
    setOnBeat: setOnBeat,
    isRunning: getIsRunning,
    getAudioContext: getAudioContext,
    getStartTime: getStartTime,
  };
})();

if (typeof module !== "undefined") module.exports = Metronome;
