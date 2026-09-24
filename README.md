# Drum-Notation
Simple, local drum notation builder for playing drums while reading sheet music.

## How to use

### Method 1: Docker

Build the image.

```bash
# be in the drum-notation dir
# or just specify the cloned dir
docker build -t drum-notation .
```

Run the image with these arguments:

```bash
docker run -d --name drum-notation \
  -p 8000:8000 \
  -v "$(pwd)/routines:/app/routines" \
  -v "$(pwd)/sheetmusic:/app/sheetmusic" \
  --user "$(id -u):$(id -g)" \
  drum-notation
```

If the container is stopped without a restart policy or docker Compose use:

```bash
docker start drum-notation
```

But it's better to automate this with the above mentioned methods plus of more.

### Method 2: No Docker

Just start the Python-based http server with this on the server.

```bash
python3 ~/drum-notation/server.py
```

Once confirmed working, open localhost port 8000 in a browser.

Everything works with just that -- server.py is pure standard library. The one optional exception is the Sheet
Music tab's official-audio download feature (see below), which additionally needs:

```bash
pip install yt-dlp
```

...and `ffmpeg` available on your `PATH` (e.g. `apt install ffmpeg` / `brew install ffmpeg`). Without these,
everything else still works -- that one feature just returns a clear error instead of downloading audio.

## Practice Files
* Practice Files are saved in the routines folder
* You can freely create valid files in the dir (No spaces or slashes and need to end in .txt)
* As long as you click the save button, any changes are saved on the host in both install methods

## Sheet Music (songs)
* The "Sheet Music" tab reads Guitar Pro (`.gp3`/`.gp4`/`.gp5`/`.gpx`/`.gp`) and MusicXML (`.musicxml`/`.mxl`)
  files from the `sheetmusic/` folder -- drop files in there (or in subfolders, e.g. one per album/artist --
  nesting is unlimited) and reload the page. This is read-only from the app (no save/edit, just pick and play).
* The song dropdown doubles as a folder browser: picking a 📁 folder just lists what's inside it, it never
  auto-plays anything -- you always explicitly pick a song file before it loads.
* Rendering and notation layout (beaming, stems, spacing) are handled by [alphaTab](https://www.alphatab.net/)
  (MPL-2.0), a real music notation/tab rendering engine, rather than anything hand-built in this app -- it's
  vendored fully offline (`js/alphaTab.min.js` plus a bundled font and a General MIDI soundfont under
  `js/alphatab-font/`/`js/alphatab-soundfont/`), no account or network access needed at runtime.
* Playback is a fixed, YouTube-style bar at the bottom of the page (play/pause plus a click/drag-to-seek
  progress track) instead of a notation cursor. There's no reliable way to map a tab's own tempo onto a real
  recording's actual timing without either manual per-song calibration or real audio analysis, so this app
  doesn't pretend to offer an exact, beat-for-beat cursor -- press play and follow along by ear, the same way
  you'd read from a paper chart. The page does scroll along at a rate that roughly tracks progress through the
  song (weighted by note density per bar, so a sparse intro doesn't scroll past too fast relative to a busy
  section), just not tied to an exact position.
* Where to get files: Guitar Pro tabs (including drum transcriptions) are widely available on tab sites --
  search for a song plus "guitar pro" or "gp5". These are typically someone's transcription rather than
  official sheet music, so expect the usual fan-transcription accuracy caveats.

## Official song audio (optional)
* Each song gets its own folder (e.g. `sheetmusic/Artist/Song Name/song.gp5`). Add a plain-text file named
  `url` (no extension) in that same folder, containing one link to a video to pull the audio from, and the
  Sheet Music tab will play the *real* recording (through a plain audio player, independent of alphaTab)
  instead of the synthesized soundfont playback.
* The download happens the first time you press play for that song (you'll see "Downloading official
  audio…"), using [yt-dlp](https://github.com/yt-dlp/yt-dlp) on the server; the result is cached as `audio.mp3`
  next to the song, so it only downloads once. Needs `yt-dlp` + `ffmpeg` on the server (already included in
  the Docker image; see "No Docker" above otherwise) -- without them, or with no `url` file at all, songs just
  play with the normal synthesized sound, same as before.
* This is meant for personal practice use with audio you have the right to use that way -- it downloads to
  your own machine and nowhere else.

## Future Features/Ideas
* Build out the practice section to look nicer than a simple text doc look
* Maybe build this out more to be a full learning platform for drums for free

## Disclaimer
* Work in progress
* Also mostly vibe-coded since I don't care to learn the JavaScript/CSS/HTML stack in depth. Focusing on the deployment and future CI/CD part
