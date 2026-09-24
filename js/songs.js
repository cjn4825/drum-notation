// Client for server.py's read-only sheet-music (Guitar Pro/MusicXML song)
// file API. sheetmusic/ can contain nested folders, so list() is per-folder
// (pass a relative path, or omit for the top level) rather than one flat
// listing.

var Songs = (function () {
  function list(dir) {
    var query = dir ? ("?dir=" + encodeURIComponent(dir)) : "";
    return fetch("/api/sheetmusic" + query).then(function (r) {
      if (!r.ok) throw new Error("Could not list songs (status " + r.status + ")");
      return r.json(); // { folders: [...], files: [...] }
    });
  }

  // relPath: "/"-separated path relative to sheetmusic/, e.g. "Album/song.gp5"
  function load(relPath) {
    var url = "/api/sheetmusic/" + relPath.split("/").map(encodeURIComponent).join("/");
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("Could not load " + relPath + " (status " + r.status + ")");
      return r.arrayBuffer();
    });
  }

  function audioUrl(relPath) {
    return "/api/sheetmusic/" + relPath.split("/").map(encodeURIComponent).join("/") + "/audio";
  }

  // Checks whether the official audio for a song has already been
  // downloaded. Resolves to { available: true, bytes } if so, or
  // { available: false, hasUrl } otherwise -- hasUrl says whether a
  // download is even possible (a "url" file exists next to the song).
  function getAudio(relPath) {
    return fetch(audioUrl(relPath)).then(function (r) {
      if (r.ok) {
        return r.arrayBuffer().then(function (bytes) {
          return { available: true, bytes: bytes };
        });
      }
      if (r.status === 404) {
        return r.json().then(function (body) {
          return { available: false, hasUrl: !!body.hasUrl };
        });
      }
      throw new Error("Could not check audio status (status " + r.status + ")");
    });
  }

  // Triggers a server-side yt-dlp download of the song's official audio
  // (see server.py); resolves once the download finishes and the audio is
  // ready to fetch via getAudio(), or rejects with a readable error message.
  function downloadAudio(relPath) {
    return fetch(audioUrl(relPath), { method: "POST" }).then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok || !body.ok) throw new Error(body.error || ("status " + r.status));
        return body;
      });
    });
  }

  return {
    list: list,
    load: load,
    getAudio: getAudio,
    downloadAudio: downloadAudio,
  };
})();

if (typeof module !== "undefined") module.exports = Songs;
