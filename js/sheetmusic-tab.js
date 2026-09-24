// Wires up the "Sheet Music" tab: browses folders and lists Guitar
// Pro/MusicXML files from server.py's read-only /api/sheetmusic API, and
// renders the selected one with alphaTab (js/alphaTab.min.js) -- a real
// music notation engine, so beaming, stem direction and spacing come from a
// mature, well-tested renderer rather than anything hand-built here.
//
// The song dropdown doubles as a tiny folder browser: picking a folder
// re-lists that folder's contents instead of loading anything, so nothing
// ever auto-plays -- you always explicitly pick the song file you want.
//
// Playback is a fixed YouTube-style bar at the bottom of the page (#player-bar)
// rather than alphaTab's own cursor/click-to-seek UI -- there's no reliable,
// fully-automatic way to map the tab's own (often wrong/flat) tempo onto a
// real recording's actual timing without either manual per-song calibration
// or real audio analysis, so this app doesn't try to pretend otherwise.
// Instead, pressing play starts the song and the page scroll position
// together and lets you follow along by ear, same as reading from a paper
// chart. The page scrolls in occasional "page flips" rather than
// continuously (see followRatio/snapToRatio/computeLayout below), assuming
// bar N falls at N/totalBars through the song and using alphaTab's real
// rendered bar positions to know how many bars fit on screen at the current
// zoom/window size -- not tied to an exact beat-for-beat cursor.
//
// If a song folder has a "url" file (see server.py), the real official
// recording is downloaded via yt-dlp on first play and played directly
// through a plain <audio> element (independent of alphaTab entirely) --
// otherwise playback falls back to alphaTab's own synthesized soundfont
// player. Either way, the same progress bar and scroll-sync logic apply.
//
// An optional metronome (bottom bar checkbox) can click along using the
// song's own tempo (read from the score, assumed constant for the whole
// song -- see songBpm) -- much simpler than the cursor problem above since
// it's just a fixed click grid from beat 0, not something that has to track
// a real recording's actual timing.

(function () {
  var songSelect = document.getElementById("song-select");
  var songRoot = document.getElementById("song-root");
  var songWarnings = document.getElementById("song-warnings");
  var songAudioStatus = document.getElementById("song-audio-status");

  var playerBar = document.getElementById("player-bar");
  var playToggle = document.getElementById("player-play-toggle");
  var progressTrack = document.getElementById("player-progress-track");
  var progressFill = document.getElementById("player-progress-fill");
  var timeCurrentEl = document.getElementById("player-time-current");
  var timeTotalEl = document.getElementById("player-time-total");
  var metronomeCheckbox = document.getElementById("player-metronome-toggle");

  var currentDir = ""; // "" = sheetmusic/ root; otherwise a "/"-separated relative path
  var api = null; // lazily created on first real song pick, then reused for every later one

  var currentRelPath = null;
  var currentScore = null;
  var totalBars = 0;

  var audioSyncAttempted = false; // per-song: only check/download audio once, on the first Play press
  var loadId = 0; // guards against a slow download resolving after the user has since switched songs

  var realAudioEl = null; // the <audio> element for a downloaded official recording, when one exists
  var usingRealAudio = false;
  var isPlaying = false;
  var isSeeking = false; // true while the user is dragging the progress bar
  var lastDurationSeconds = 0; // last known song length, for converting a seek ratio to a synth-fallback time position
  var lastCurrentSeconds = 0; // last known playback position, for phase-aligning the song metronome

  var songBpm = 120; // read from the score on load (see scoreLoaded) -- assumed constant across the whole song
  var songMetronomeEnabled = false;

  function parentOf(dir) {
    var idx = dir.lastIndexOf("/");
    return idx === -1 ? "" : dir.substring(0, idx);
  }

  function joinPath(dir, name) {
    return dir ? dir + "/" + name : name;
  }

  function formatClock(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    var totalSeconds = Math.floor(seconds);
    var minutes = Math.floor(totalSeconds / 60);
    var secs = totalSeconds % 60;
    return minutes + ":" + (secs < 10 ? "0" : "") + secs;
  }

  // Only ever used before alphaTab has taken over #song-root -- once ensureApi()
  // has run, #song-root's DOM belongs to alphaTab and must not be wiped again
  // (that's what #song-warnings below is for instead).
  function showPlaceholder(message, isError) {
    songRoot.innerHTML = "";
    var p = document.createElement("p");
    p.className = "grid-hint";
    if (isError) p.style.color = "#c0392b";
    p.textContent = message;
    songRoot.appendChild(p);
  }

  function showWarning(message) {
    songWarnings.innerHTML = "";
    var p = document.createElement("p");
    p.className = "grid-hint";
    p.style.color = "#c0392b";
    p.textContent = message;
    songWarnings.appendChild(p);
  }

  function showAudioStatus(message) {
    songAudioStatus.innerHTML = "";
    var p = document.createElement("p");
    p.className = "grid-hint";
    p.textContent = message;
    songAudioStatus.appendChild(p);
  }

  function clearAudioStatus() {
    songAudioStatus.innerHTML = "";
  }

  function maxScroll() {
    return Math.max(0, document.body.scrollHeight - window.innerHeight);
  }

  // Absolute (document-scroll) Y position of each bar's rendered line, and
  // the bar index each "page" (one viewport height) starts at -- both
  // recomputed from alphaTab's own real layout (api.boundsLookup) whenever
  // rendering finishes, so this automatically adapts to the actual zoom
  // level/font size/window width instead of assuming anything about how
  // many bars fit on screen. Time is mapped to bars by raw position
  // (bar i is assumed to fall at i/totalBars through the song) rather than
  // weighted by note density -- note density turned out to be a bad proxy
  // for real time (e.g. a long, sparse, drums-silent intro would map to
  // only a tiny sliver of "weighted" position despite taking a big chunk of
  // the song's actual duration, causing huge jumps when seeking).
  var barDocY = null; // barDocY[i] = absolute doc Y of bar i's line
  var pageStarts = null; // sorted bar indices where a new page begins, pageStarts[0] === 0
  var currentPageIndex = 0;

  function computeLayout() {
    if (!api || !api.boundsLookup || totalBars === 0) {
      barDocY = null;
      pageStarts = null;
      return;
    }
    var rootTop = songRoot.getBoundingClientRect().top + window.scrollY;
    barDocY = new Array(totalBars);
    for (var i = 0; i < totalBars; i++) {
      var mb = api.boundsLookup.findMasterBarByIndex(i);
      barDocY[i] = mb ? rootTop + mb.realBounds.y : (i > 0 ? barDocY[i - 1] : rootTop);
    }
    var vh = window.innerHeight;
    pageStarts = [0];
    var pageTop = barDocY[0];
    for (var j = 1; j < totalBars; j++) {
      if (barDocY[j] >= pageTop + vh) {
        pageStarts.push(j);
        pageTop = barDocY[j];
      }
    }
  }

  function barIndexForRatio(r) {
    if (totalBars === 0) return 0;
    return Math.min(totalBars - 1, Math.max(0, Math.round(Math.min(1, Math.max(0, r)) * (totalBars - 1))));
  }

  // Largest page-start index at or before barIdx, via binary search.
  function pageIndexForBar(barIdx) {
    var lo = 0, hi = pageStarts.length - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (pageStarts[mid] <= barIdx) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  function scrollToPage(pageIdx, smooth) {
    currentPageIndex = pageIdx;
    var y = Math.min(barDocY[pageStarts[pageIdx]], maxScroll());
    window.scrollTo({ top: y, behavior: smooth ? "smooth" : "auto" });
  }

  // Jumps immediately to the page containing ratio r -- used when the
  // position should be exactly right right away (a manual seek, a
  // freshly-rendered song), not caught up to gradually.
  function snapToRatio(r) {
    if (!pageStarts) { window.scrollTo({ top: 0, behavior: "auto" }); return; }
    scrollToPage(pageIndexForBar(barIndexForRatio(r)), false);
  }

  // Called on every playback tick during normal forward playback. Rather
  // than continuously re-scrolling to chase the exact estimated position
  // (which reads as constant, jittery drift), this only moves at all once
  // the estimated bar has moved into a different page than what's on
  // screen -- an occasional "page flip" instead of continuous scrolling.
  function followRatio(r) {
    if (!pageStarts) return;
    var p = pageIndexForBar(barIndexForRatio(r));
    if (p !== currentPageIndex) scrollToPage(p, true);
  }

  function updateProgressUI(currentSeconds, durationSeconds) {
    var r = durationSeconds > 0 ? currentSeconds / durationSeconds : 0;
    progressFill.style.width = (r * 100) + "%";
    timeCurrentEl.textContent = formatClock(currentSeconds);
    timeTotalEl.textContent = durationSeconds > 0 ? formatClock(durationSeconds) : "--:--";
  }

  function onPlaybackTick(currentSeconds, durationSeconds) {
    lastDurationSeconds = durationSeconds;
    lastCurrentSeconds = currentSeconds;
    updateProgressUI(currentSeconds, durationSeconds);
    if (!isSeeking) followRatio(durationSeconds > 0 ? currentSeconds / durationSeconds : 0);
  }

  function startSongMetronomeAt(elapsedSeconds) {
    Metronome.setAccentEnabled(false);
    Metronome.startAt(songBpm, elapsedSeconds);
  }

  function setPlayingUI(playing) {
    isPlaying = playing;
    playToggle.innerHTML = playing ? "&#10074;&#10074;" : "&#9654;";
    playToggle.classList.toggle("active", playing);
    if (songMetronomeEnabled) {
      if (playing) startSongMetronomeAt(lastCurrentSeconds);
      else Metronome.stop();
    }
  }

  function stopPlayback() {
    if (realAudioEl) realAudioEl.pause();
    if (api) api.stop();
    setPlayingUI(false);
  }

  // Wires a real downloaded/cached audio recording up as its own plain
  // <audio> element, entirely independent of alphaTab's player -- there's
  // no attempt at beat-for-beat calibration between the two, just starting
  // them together (see the play button handler).
  function setupRealAudio(bytes) {
    if (realAudioEl) {
      realAudioEl.pause();
      try { URL.revokeObjectURL(realAudioEl.src); } catch (e) { /* ignore */ }
    }
    var thisRelPath = currentRelPath;
    realAudioEl = new Audio();
    realAudioEl.src = URL.createObjectURL(new Blob([bytes]));
    usingRealAudio = true;

    realAudioEl.addEventListener("timeupdate", function () {
      if (usingRealAudio && currentRelPath === thisRelPath) {
        onPlaybackTick(realAudioEl.currentTime, realAudioEl.duration || 0);
      }
    });
    realAudioEl.addEventListener("ended", function () {
      if (usingRealAudio && currentRelPath === thisRelPath) setPlayingUI(false);
    });

    return new Promise(function (resolve) {
      realAudioEl.addEventListener("loadedmetadata", function once() { resolve(); }, { once: true });
      realAudioEl.addEventListener("error", function () { resolve(); }, { once: true });
    });
  }

  // Runs once per song, on the first Play press: uses already-downloaded
  // official audio if present, downloads it if a "url" file exists but the
  // audio doesn't yet, or just leaves synthesized playback alone if no
  // audio source is configured for this song at all.
  function ensureAudioSynced() {
    if (audioSyncAttempted) return Promise.resolve();
    audioSyncAttempted = true;

    var relPath = currentRelPath;
    var thisLoadId = loadId;

    return Songs.getAudio(relPath)
      .then(function (result) {
        if (loadId !== thisLoadId) return;
        if (result.available) return setupRealAudio(result.bytes);
        if (!result.hasUrl) return; // no audio source configured for this song -- normal, not an error

        showAudioStatus("Downloading official audio…");
        return Songs.downloadAudio(relPath)
          .then(function () { return Songs.getAudio(relPath); })
          .then(function (result2) {
            if (loadId !== thisLoadId) return;
            clearAudioStatus();
            if (result2.available) return setupRealAudio(result2.bytes);
          })
          .catch(function (err) {
            if (loadId !== thisLoadId) return;
            clearAudioStatus();
            showWarning("Could not download official audio, using default sound instead: " + err.message);
          });
      })
      .catch(function () {
        // status check itself failed (e.g. server unreachable) -- not fatal, just keep synthesized playback
      });
  }

  function ensureApi() {
    if (api) return api;
    songRoot.innerHTML = "";

    api = new window.alphaTab.AlphaTabApi(songRoot, {
      core: {
        fontDirectory: "js/alphatab-font/",
      },
      player: {
        playerMode: window.alphaTab.PlayerMode.EnabledAutomatic,
        soundFont: "js/alphatab-soundfont/sonivox.sf3",
        // No cursor, no click-to-seek: there's no reliable way to map the
        // tab's own tempo onto a real recording's actual timing, so this
        // app doesn't offer precise position-jumping at all (see the file
        // header comment) -- just the coarse scroll-along progress bar.
        enableCursor: false,
        enableUserInteraction: false,
        scrollMode: window.alphaTab.ScrollMode.Off,
      },
      display: {
        resources: {
          staffLineColor: "#a89984",
          barSeparatorColor: "#a89984",
          barNumberColor: "#a89984",
          mainGlyphColor: "#ebdbb2",
          secondaryGlyphColor: "rgba(235, 219, 178, 0.4)",
          scoreInfoColor: "#ebdbb2",
        },
      },
    });

    api.error.on(function (err) {
      playerBar.style.display = "none";
      showWarning("Could not read this file: " + (err && err.message ? err.message : err));
    });

    api.scoreLoaded.on(function (score) {
      currentScore = score;
      songWarnings.innerHTML = "";
      clearAudioStatus();
      totalBars = score.masterBars.length;
      barDocY = null;
      pageStarts = null;
      currentPageIndex = 0;
      songBpm = score.tempo || 120; // assumed constant across the whole song -- see the song metronome comment above
      songMetronomeEnabled = false;
      metronomeCheckbox.checked = false;
      Metronome.stop();
      window.scrollTo(0, 0);
      setPlayingUI(false);
      updateProgressUI(0, 0);
      playerBar.style.display = "flex";

      // Full-song Guitar Pro files usually have one track per instrument
      // (guitar, bass, drums, ...); this app only cares about the drum
      // part, so render just that track instead of alphaTab's default
      // (the first track in the file, typically a melodic instrument).
      var drumTrack = score.tracks.find(function (t) { return t.isPercussion; });
      if (drumTrack) {
        api.renderTracks([drumTrack]);
      } else {
        showWarning("No percussion/drum track found in this file -- showing the default track instead.");
      }
    });

    // Fires after the initial render and again after any relayout (e.g. the
    // window/zoom changing) -- recomputes real bar positions/page
    // boundaries from the fresh layout and re-snaps to wherever playback
    // currently is, so a resize or zoom change can't leave the page
    // showing a position that no longer matches the actual bar layout.
    api.renderFinished.on(function () {
      computeLayout();
      var r = lastDurationSeconds > 0 ? lastCurrentSeconds / lastDurationSeconds : 0;
      snapToRatio(r);
    });

    api.playerPositionChanged.on(function (e) {
      if (!usingRealAudio) onPlaybackTick(e.currentTime / 1000, e.endTime / 1000);
    });

    api.playerStateChanged.on(function (e) {
      if (!usingRealAudio) setPlayingUI(e.state === window.alphaTab.synth.PlayerState.Playing);
    });

    return api;
  }

  function loadSong(relPath) {
    loadId += 1;
    currentRelPath = relPath;
    audioSyncAttempted = false;
    usingRealAudio = false;
    if (realAudioEl) {
      realAudioEl.pause();
      try { URL.revokeObjectURL(realAudioEl.src); } catch (e) { /* ignore */ }
      realAudioEl = null;
    }
    songMetronomeEnabled = false;
    metronomeCheckbox.checked = false;
    Metronome.stop();
    setPlayingUI(false);
    updateProgressUI(0, 0);
    songWarnings.innerHTML = "";
    clearAudioStatus();
    playerBar.style.display = "none";
    var displayName = relPath.split("/").pop();

    Songs.load(relPath)
      .then(function (buf) {
        var theApi = ensureApi();
        theApi.stop();
        var ok = theApi.load(new Uint8Array(buf));
        if (!ok) {
          showWarning("Could not read " + displayName + ": unrecognized file format.");
        }
      })
      .catch(function (err) {
        showWarning("Could not load " + displayName + ": " + err.message);
      });
  }

  playToggle.addEventListener("click", function () {
    if (isPlaying) {
      if (usingRealAudio) realAudioEl.pause();
      else api.playPause();
      setPlayingUI(false);
      return;
    }
    if (audioSyncAttempted) {
      if (usingRealAudio) { realAudioEl.play(); setPlayingUI(true); }
      else api.playPause();
      return;
    }
    playToggle.disabled = true;
    ensureAudioSynced().then(function () {
      playToggle.disabled = false;
      if (usingRealAudio) { realAudioEl.play(); setPlayingUI(true); }
      else api.playPause();
    });
  });

  function seekToRatio(r) {
    r = Math.min(1, Math.max(0, r));
    var duration = usingRealAudio ? (realAudioEl ? realAudioEl.duration || 0 : 0) : lastDurationSeconds;
    var targetSeconds = r * duration;

    // With the metronome on, a seek has to land exactly on a beat boundary
    // (always rounding down to the beat at-or-before the click) so the click
    // grid stays phase-locked to the song's own beat 0 instead of restarting
    // from an arbitrary offset -- see startSongMetronomeAt.
    if (songMetronomeEnabled && songBpm > 0 && duration > 0) {
      var secondsPerBeat = 60 / songBpm;
      targetSeconds = Math.floor(targetSeconds / secondsPerBeat) * secondsPerBeat;
      r = targetSeconds / duration;
    }

    if (usingRealAudio && realAudioEl) {
      realAudioEl.currentTime = targetSeconds;
    } else if (api && api.player) {
      api.player.timePosition = targetSeconds * 1000;
    }
    lastCurrentSeconds = targetSeconds;
    updateProgressUI(targetSeconds, duration);
    snapToRatio(r);

    if (songMetronomeEnabled && isPlaying) startSongMetronomeAt(targetSeconds);
  }

  function ratioFromClientX(clientX) {
    var rect = progressTrack.getBoundingClientRect();
    return (clientX - rect.left) / rect.width;
  }

  progressTrack.addEventListener("mousedown", function (e) {
    isSeeking = true;
    seekToRatio(ratioFromClientX(e.clientX));
    function onMove(ev) { seekToRatio(ratioFromClientX(ev.clientX)); }
    function onUp() {
      isSeeking = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });

  progressTrack.addEventListener("touchstart", function (e) {
    isSeeking = true;
    seekToRatio(ratioFromClientX(e.touches[0].clientX));
  });
  progressTrack.addEventListener("touchmove", function (e) {
    seekToRatio(ratioFromClientX(e.touches[0].clientX));
  });
  progressTrack.addEventListener("touchend", function () {
    isSeeking = false;
  });

  metronomeCheckbox.addEventListener("change", function () {
    songMetronomeEnabled = metronomeCheckbox.checked;
    if (songMetronomeEnabled && isPlaying) startSongMetronomeAt(lastCurrentSeconds);
    else Metronome.stop();
  });

  // Safety net alongside api.renderFinished above -- alphaTab re-renders on
  // its own when the container is resized, but a bare browser zoom (which
  // changes window.innerHeight without alphaTab necessarily re-laying out)
  // should still recompute page boundaries against the new viewport size.
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      computeLayout();
      var r = lastDurationSeconds > 0 ? lastCurrentSeconds / lastDurationSeconds : 0;
      snapToRatio(r);
    }, 200);
  });

  // Leaving the Sheet Music tab pauses playback and hides the player bar;
  // coming back shows it again if a song is already loaded.
  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (btn.dataset.tab === "sheetmusic") {
        if (currentScore) playerBar.style.display = "flex";
      } else {
        stopPlayback();
        songMetronomeEnabled = false;
        metronomeCheckbox.checked = false;
        Metronome.stop();
        playerBar.style.display = "none";
      }
    });
  });

  function refreshDropdown() {
    Songs.list(currentDir)
      .then(function (result) {
        songSelect.innerHTML = "";

        var placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = currentDir ? "-- pick a song in " + currentDir + " --" : "-- pick a song --";
        songSelect.appendChild(placeholder);

        if (currentDir) {
          var up = document.createElement("option");
          up.value = "up:";
          up.textContent = "⬆ .. (up)";
          songSelect.appendChild(up);
        }

        result.folders.forEach(function (name) {
          var opt = document.createElement("option");
          opt.value = "dir:" + joinPath(currentDir, name);
          opt.textContent = "📁 " + name;
          songSelect.appendChild(opt);
        });

        result.files.forEach(function (name) {
          var opt = document.createElement("option");
          opt.value = "file:" + joinPath(currentDir, name);
          opt.textContent = name;
          songSelect.appendChild(opt);
        });

        songSelect.value = "";
        songSelect.disabled = false;

        if (!api) {
          if (!result.folders.length && !result.files.length) {
            showPlaceholder(
              currentDir
                ? "No songs or folders in " + currentDir + "."
                : "Drop a Guitar Pro (.gp3/.gp4/.gp5/.gpx) or MusicXML file (or a folder of them) into the " +
                  "sheetmusic/ folder on disk, then reload this page.",
              false
            );
          } else {
            showPlaceholder("Pick a song from the dropdown above.", false);
          }
        }
      })
      .catch(function (err) {
        showPlaceholder(
          "Could not reach the practice-file server (" + err.message + "). " +
          "Start it with: python3 server.py -- then reload this page.",
          true
        );
      });
  }

  songSelect.addEventListener("change", function () {
    var value = songSelect.value;
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
      loadSong(value.slice(5));
    }
  });

  refreshDropdown();
})();
